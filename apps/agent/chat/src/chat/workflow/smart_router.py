"""
Smart-router node logic.

Classifies the user request into integrations, performs auth checks,
and binds the appropriate tools before the planner runs.
"""

import logging
import re
from typing import TYPE_CHECKING

from langchain_core.messages import HumanMessage

from chat.schemas import IntegrationInfo, WorkflowState

if TYPE_CHECKING:
    from chat.integrations.registry import IntegrationRegistry

logger = logging.getLogger(__name__)


async def run_smart_router(
    state: WorkflowState,
    registry: "IntegrationRegistry | None",
    tools: list,
    executor_llm,
) -> dict:
    """Classify the request, check auth, and return state update + tool bindings.

    Returns a dict with two extra keys beyond the normal state update:
        _tools: new tool list (or None if unchanged)
        _executor_with_tools: new bound LLM (or None)
        _tool_node: new ToolNode (or None)
    The caller (WorkflowNodes) applies these mutations to self.
    """
    from chat.integrations.registry import classify_integrations

    messages = state["messages"]
    user_request = next(
        (msg.content for msg in reversed(messages) if isinstance(msg, HumanMessage)),
        "",
    )

    if not registry:
        logger.warning("No registry available, using all tools")
        return {
            "loaded_integrations": [],
            "executor_bound_tools": [t.name for t in tools],
            "total_tool_count": len(tools),
            "initial_integrations": [],
            "incremental_load_events": [],
            "_tools": None,
            "_executor_with_tools": None,
            "_tool_node": None,
        }

    integrations = await classify_integrations(user_request, registry)
    integrations = inject_artifact_integrations(
        integrations, state, user_request, registry
    )

    # Pre-flight auth check
    connected_set = set(state.get("connected_integrations") or [])

    unauthenticated = []
    for name in integrations:
        config = registry.get_integration_config(name)
        if not (config and config.requires_auth and config.mcp_server):
            continue
        connect_id = name.replace("_", "-")
        if connect_id not in connected_set:
            unauthenticated.append(
                {
                    "mcp_server": config.mcp_server,
                    "display_name": config.display_name,
                    "icon": config.icon,
                    "connect_id": connect_id,
                }
            )

    if unauthenticated:
        logger.info(
            f"Smart router: auth required for {[u['mcp_server'] for u in unauthenticated]}"
        )
        return {
            "auth_required_integrations": unauthenticated,
            "loaded_integrations": [
                IntegrationInfo(
                    name=n,
                    display_name=cfg.display_name,
                    tools_count=0,
                    icon=cfg.icon,
                )
                for n in integrations
                if (cfg := registry.get_integration_config(n))
            ],
            "executor_bound_tools": [],
            "total_tool_count": 0,
            "initial_integrations": integrations,
            "incremental_load_events": [],
            "_tools": None,
            "_executor_with_tools": None,
            "_tool_node": None,
        }

    new_tools = registry.get_toolset(integrations)

    # Guard: auth-required integration with 0 tools → treat as auth failure
    missing_tools = []
    for name in integrations:
        config = registry.get_integration_config(name)
        if not (config and config.requires_auth and config.mcp_server):
            continue
        integration_tools = registry._tools_by_integration.get(name, [])
        if not integration_tools:
            connect_id = name.replace("_", "-")
            missing_tools.append(
                {
                    "mcp_server": config.mcp_server,
                    "display_name": config.display_name,
                    "icon": config.icon,
                    "connect_id": connect_id,
                }
            )

    if missing_tools:
        logger.warning(
            f"Smart router: tools not loaded for {[m['mcp_server'] for m in missing_tools]}"
        )
        return {
            "auth_required_integrations": missing_tools,
            "loaded_integrations": [
                IntegrationInfo(
                    name=n,
                    display_name=cfg.display_name,
                    tools_count=0,
                    icon=cfg.icon,
                )
                for n in integrations
                if (cfg := registry.get_integration_config(n))
            ],
            "executor_bound_tools": [],
            "total_tool_count": 0,
            "initial_integrations": integrations,
            "incremental_load_events": [],
            "_tools": None,
            "_executor_with_tools": None,
            "_tool_node": None,
        }

    loaded_integrations = [
        IntegrationInfo(
            name=name,
            display_name=cfg.display_name,
            tools_count=len(registry._tools_by_integration.get(name, [])),
            icon=cfg.icon,
        )
        for name in integrations
        if (cfg := registry.get_integration_config(name))
    ]

    new_executor_with_tools = (
        executor_llm.bind_tools(new_tools) if new_tools else executor_llm
    )
    from langgraph.prebuilt import ToolNode
    from chat.workflow.tool_retry import retry_tool_call

    new_tool_node = (
        ToolNode(new_tools, handle_tool_errors=True, awrap_tool_call=retry_tool_call)
        if new_tools
        else None
    )

    logger.info(
        f"Smart router: bound {len(new_tools)} tools from {len(integrations)} integrations"
    )
    return {
        "loaded_integrations": loaded_integrations,
        "executor_bound_tools": [t.name for t in new_tools],
        "total_tool_count": len(new_tools),
        "initial_integrations": integrations,
        "incremental_load_events": [],
        "_tools": new_tools,
        "_executor_with_tools": new_executor_with_tools,
        "_tool_node": new_tool_node,
    }


def inject_artifact_integrations(
    integrations: list,
    state: WorkflowState,
    user_request: str,
    registry: "IntegrationRegistry",
) -> list:
    """Auto-include integrations from prior-turn artifacts when relevant."""
    artifacts = state.get("artifacts", [])
    if not artifacts:
        return integrations

    from chat.integrations.classifier import get_classifier

    classifier = get_classifier()
    request_lower = user_request.lower()

    is_continuation = bool(
        re.search(
            r"\b(similar|same|copy|duplicate|replicate|like\s+(?:that|the|this)|"
            r"based\s+on|from\s+(?:the\s+)?(?:previous|earlier|last|above))\b",
            request_lower,
        )
    )

    artifact_integrations = {
        a.get("integration") for a in artifacts if a.get("integration")
    }
    for name in artifact_integrations:
        if name in integrations or not registry.get_integration_config(name):
            continue

        if is_continuation:
            integrations.append(name)
            logger.info(f"Smart router: auto-included '{name}' (continuation)")
            continue

        referenced = False
        idx = classifier._indexes.get(name)
        if idx and any(ik in request_lower for ik in idx.identity_keywords):
            referenced = True
        if not referenced and name.replace("_", " ") in request_lower:
            referenced = True
        if not referenced:
            for a in artifacts:
                if a.get("integration") == name and a.get("name"):
                    artifact_name = a["name"].lower()
                    if len(artifact_name) > 3 and re.search(
                        r"\b" + re.escape(artifact_name) + r"\b", request_lower
                    ):
                        referenced = True
                        break

        if referenced:
            integrations.append(name)
            logger.info(f"Smart router: auto-included '{name}' (referenced in request)")
        else:
            logger.debug(f"Smart router: skipped '{name}' (not referenced)")

    return integrations
