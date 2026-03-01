"""
Workflow Nodes

The WorkflowNodes class wires together the planner, executor, and step-complete
graph nodes. Routing functions and supporting utilities live in sibling modules:

    workflow/llm.py      — shared LLM singletons
    workflow/artifacts.py — artifact & search-result extraction
    workflow/context.py  — conversation summary + prompt-context helpers
    workflow/routing.py  — graph edge routing functions
    workflow/prompts.py  — system prompt templates
"""

import json
import logging
import re
import time
from typing import Optional, TYPE_CHECKING

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.prebuilt import ToolNode

from chat.schemas import (
    IntegrationInfo,
    WorkflowPlan,
    WorkflowPlanOutput,
    WorkflowState,
    WorkflowStep,
)
from chat.workflow.artifacts import (
    extract_artifacts_from_step,
    extract_search_results_from_messages,
)
from chat.workflow.context import (
    build_conversation_summary,
    format_artifacts_context,
    format_integration_context,
)
from chat.workflow.llm import get_executor_llm, get_planner_llm
from chat.workflow.prompts import EXECUTOR_SYSTEM_PROMPT, PLANNER_SYSTEM_PROMPT

# Re-export routing symbols so graph.py can import them from here (single source)
from chat.workflow.routing import (  # noqa: F401
    route_after_smart_router,
    route_after_tools,
    route_to_executor,
    should_continue,
    should_execute_next_step,
)

if TYPE_CHECKING:
    from chat.integrations.registry import IntegrationRegistry

logger = logging.getLogger(__name__)


class WorkflowNodes:
    """Nodes for the dynamic workflow graph with LLM-driven HITL."""

    def __init__(
        self, tools: list[BaseTool] = None, registry: "IntegrationRegistry" = None
    ):
        self.tools = tools or []
        self.registry = registry
        self.planner_llm = get_planner_llm()
        self.executor_llm = get_executor_llm()
        self.executor_with_tools = (
            self.executor_llm.bind_tools(self.tools)
            if self.tools
            else self.executor_llm
        )
        self.tool_node = (
            ToolNode(self.tools, handle_tool_errors=True) if self.tools else None
        )

    # ------------------------------------------------------------------
    # Smart Router
    # ------------------------------------------------------------------

    async def smart_router_node(self, state: WorkflowState) -> dict:
        """
        Route request to appropriate integrations before the planner.
        Binds only the tools needed for this request.
        """
        from chat.integrations.registry import classify_integrations

        messages = state["messages"]
        user_request = next(
            (
                msg.content
                for msg in reversed(messages)
                if isinstance(msg, HumanMessage)
            ),
            "",
        )

        if not self.registry:
            logger.warning("No registry available, using all tools")
            return {
                "loaded_integrations": [],
                "executor_bound_tools": [t.name for t in self.tools],
                "total_tool_count": len(self.tools),
                "initial_integrations": [],
                "incremental_load_events": [],
            }

        integrations = await classify_integrations(user_request, self.registry)
        integrations = self._inject_artifact_integrations(
            integrations, state, user_request
        )

        # Pre-flight auth check: detect unauthenticated integrations before planning
        # connected_integrations is a per-request list of integration IDs whose cookies are present
        connected_set = set(state.get("connected_integrations") or [])

        unauthenticated = []
        for name in integrations:
            config = self.registry.get_integration_config(name)
            if not (config and config.requires_auth and config.mcp_server):
                continue

            # Convert integration name to kebab-case ID (e.g. "google_docs" → "google-docs")
            connect_id = name.replace("_", "-")
            if connect_id not in connected_set:
                unauthenticated.append(
                    {
                        "mcp_server": config.mcp_server,
                        "display_name": config.display_name,  # e.g. "Google Docs", "Notion"
                        "icon": config.icon,
                        "connect_id": connect_id,  # e.g. "google-docs" → oauth/google-docs
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
                    if (cfg := self.registry.get_integration_config(n))
                ],
                "executor_bound_tools": [],
                "total_tool_count": 0,
                "initial_integrations": integrations,
                "incremental_load_events": [],
            }

        tools = self.registry.get_toolset(integrations)
        loaded_integrations = [
            IntegrationInfo(
                name=name,
                display_name=cfg.display_name,
                tools_count=len(self.registry._tools_by_integration.get(name, [])),
                icon=cfg.icon,
            )
            for name in integrations
            if (cfg := self.registry.get_integration_config(name))
        ]

        self.tools = tools
        self.executor_with_tools = (
            self.executor_llm.bind_tools(tools) if tools else self.executor_llm
        )
        self.tool_node = ToolNode(tools, handle_tool_errors=True) if tools else None

        logger.info(
            f"Smart router: bound {len(tools)} tools from {len(integrations)} integrations"
        )
        return {
            "loaded_integrations": loaded_integrations,
            "executor_bound_tools": [t.name for t in tools],
            "total_tool_count": len(tools),
            "initial_integrations": integrations,
            "incremental_load_events": [],
        }

    def _inject_artifact_integrations(
        self, integrations: list, state: WorkflowState, user_request: str
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
            if name in integrations or not self.registry.get_integration_config(name):
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
                logger.info(
                    f"Smart router: auto-included '{name}' (referenced in request)"
                )
            else:
                logger.debug(f"Smart router: skipped '{name}' (not referenced)")

        return integrations

    # ------------------------------------------------------------------
    # Planner
    # ------------------------------------------------------------------

    async def planner_node(self, state: WorkflowState) -> dict:
        """Create a step-by-step plan with HITL flags using structured LLM output."""
        messages = state["messages"]
        user_request = next(
            (
                msg.content
                for msg in reversed(messages)
                if isinstance(msg, HumanMessage)
            ),
            "",
        )

        state_artifacts = state.get("artifacts", [])
        logger.info(f"[PLANNER_DIAG] Turn start — artifacts: {state_artifacts}")
        logger.info(
            f"[PLANNER_DIAG] Messages: {len(messages)}, "
            f"HumanMessages: {sum(1 for m in messages if isinstance(m, HumanMessage))}"
        )

        conversation_summary = build_conversation_summary(
            messages, artifacts=state_artifacts
        )
        logger.info(
            f"[PLANNER_DIAG] conversation_summary: "
            f"{conversation_summary[:500] if conversation_summary else 'None'}"
        )

        initial_integrations = state.get("initial_integrations") or []
        artifacts_context = format_artifacts_context(state_artifacts)
        logger.info(
            f"[PLANNER_DIAG] artifacts_context: "
            f"{artifacts_context[:500] if artifacts_context else 'EMPTY'}"
        )

        integration_hints = (
            self.registry.get_hints(initial_integrations, "planner")
            if self.registry and initial_integrations
            else ""
        )

        system_prompt = PLANNER_SYSTEM_PROMPT.format(
            conversation_context=f"\n{conversation_summary}\n"
            if conversation_summary
            else "",
            integration_context=format_integration_context(initial_integrations),
            artifacts_context=artifacts_context,
            integration_hints=integration_hints,
        )

        plan_output: WorkflowPlanOutput = await self.planner_llm.ainvoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"Create a plan for: {user_request}"),
            ]
        )
        logger.debug(f"Plan: {len(plan_output.steps)} steps")

        workflow_steps = [
            WorkflowStep(
                step_number=i + 1,
                description=step.description,
                requires_human_approval=step.requires_human_approval,
                approval_reason=step.approval_reason,
                status="pending",
            )
            for i, step in enumerate(plan_output.steps)
        ]

        plan = WorkflowPlan(
            original_request=user_request,
            thinking=plan_output.thinking,
            steps=workflow_steps,
        )

        plan_msg = "📋 **Workflow Plan Created**\n\n"
        plan_msg += f"Original request: {user_request}\n\n**Steps:**\n"
        for step in workflow_steps:
            icon = "🔐" if step.requires_human_approval else "✅"
            plan_msg += f"{step.step_number}. {icon} {step.description}\n"
        plan_msg += "\n---\nStarting execution...\n"

        return {
            "messages": [AIMessage(content=plan_msg)],
            "plan": plan,
            "current_step_index": 0,
            "conversation_summary": conversation_summary,
        }

    # ------------------------------------------------------------------
    # Executor (auto)
    # ------------------------------------------------------------------

    async def executor_node(self, state: WorkflowState) -> dict:
        """
        Execute the current step automatically.
        Re-entered after ToolNode for multi-hop tool calling.
        """
        plan = state["plan"]
        current_index = state["current_step_index"]

        if not plan or current_index >= len(plan.steps):
            return {"messages": [AIMessage(content="Workflow complete!")]}

        current_step = plan.steps[current_index]

        if state.get("_executor_chat") and isinstance(
            state["messages"][-1], ToolMessage
        ):
            return await self._continue_after_tools(state)

        current_step.status = "in_progress"
        initial_integrations = state.get("initial_integrations", [])
        step_artifacts = state.get("artifacts", [])
        previous_results = self._get_previous_results(
            plan, current_index, artifacts=step_artifacts
        )
        incremental_load_events = state.get("incremental_load_events", [])

        start_time = time.time()
        try:
            response, executor_chat = await self._start_step_execution(
                current_step,
                plan,
                previous_results,
                state.get("conversation_summary", ""),
                initial_integrations,
                artifacts=step_artifacts,
            )
        except Exception as e:
            (
                response,
                executor_chat,
                initial_integrations,
                incremental_load_events,
            ) = await self._try_incremental_load(
                e,
                state,
                current_step,
                plan,
                previous_results,
                initial_integrations,
                step_artifacts,
                incremental_load_events,
            )

        current_step.thinking_duration_ms = int((time.time() - start_time) * 1000)

        result: dict = {
            "messages": [response],
            "_executor_chat": executor_chat,
            "_step_tool_calls": 0,
            "plan": plan,
        }
        if incremental_load_events:
            result["incremental_load_events"] = incremental_load_events
            result["initial_integrations"] = initial_integrations
        return result

    # ------------------------------------------------------------------
    # Executor with approval
    # ------------------------------------------------------------------

    async def executor_with_approval_node(self, state: WorkflowState) -> dict:
        """
        Handle steps that require human approval (state-based HITL).

        Flow:
        1. First entry  → run LLM for preview, set awaiting_approval=True, graph pauses
        2. Resume       → replay or re-run the step with the user's decision
        3. After tools  → continue multi-hop tool calling
        """
        plan = state["plan"]
        current_index = state["current_step_index"]

        if not plan or current_index >= len(plan.steps):
            return {"messages": [AIMessage(content="Workflow complete!")]}

        current_step = plan.steps[current_index]

        if state.get("_executor_chat") and isinstance(
            state["messages"][-1], ToolMessage
        ):
            return await self._continue_after_tools(state)

        approval_decision = state.get("approval_decision")
        if approval_decision:
            return await self._handle_approval_decision(
                state, plan, current_step, approval_decision
            )

        # First entry: generate tool-call preview then pause
        return await self._request_approval(state, plan, current_step)

    async def _handle_approval_decision(
        self, state, plan, current_step, approval_decision
    ) -> dict:
        action = approval_decision.get("action", "approve")

        if action == "skip":
            current_step.status = "skipped"
            current_step.result = "Skipped by user"
            return {
                "messages": [
                    AIMessage(content=f"Step {current_step.step_number} skipped.")
                ],
                "plan": plan,
                "awaiting_approval": False,
                "approval_step_info": None,
                "approval_decision": None,
                "_executor_chat": None,
                "_step_tool_calls": 0,
                "_pending_tool_calls_message": None,
            }

        current_step.status = "in_progress"
        pending_msg_data = state.get("_pending_tool_calls_message")

        if pending_msg_data:
            from langchain_core.messages import messages_from_dict

            ai_message = messages_from_dict([pending_msg_data])[0]
            if action == "edit":
                ai_message = self._apply_edited_args(
                    ai_message, approval_decision.get("content", {})
                )
            return {
                "messages": [ai_message],
                "_executor_chat": state.get("_executor_chat") or [],
                "_step_tool_calls": 0,
                "plan": plan,
                "awaiting_approval": False,
                "approval_step_info": None,
                "approval_decision": None,
                "_pending_tool_calls_message": None,
            }

        # Fallback: re-run from scratch
        step_artifacts = state.get("artifacts", [])
        previous_results = self._get_previous_results(
            plan, state["current_step_index"], artifacts=step_artifacts
        )
        kwargs = dict(
            step=current_step,
            plan=plan,
            previous_results=previous_results,
            conversation_summary=state.get("conversation_summary", ""),
            initial_integrations=state.get("initial_integrations", []),
            artifacts=step_artifacts,
        )
        if action == "edit":
            kwargs["approved_content"] = approval_decision.get("content", {})
        response, executor_chat = await self._start_step_execution(**kwargs)

        return {
            "messages": [response],
            "_executor_chat": executor_chat,
            "_step_tool_calls": 0,
            "plan": plan,
            "awaiting_approval": False,
            "approval_step_info": None,
            "approval_decision": None,
            "_pending_tool_calls_message": None,
        }

    async def _request_approval(self, state, plan, current_step) -> dict:
        """Run LLM to generate tool-call preview, then pause for human approval."""
        current_step.status = "awaiting_approval"
        step_artifacts = state.get("artifacts", [])
        previous_results = self._get_previous_results(
            plan, state["current_step_index"], artifacts=step_artifacts
        )
        tool_calls_preview = []
        pending_message = None
        executor_chat = None

        try:
            start_time = time.time()
            response, executor_chat = await self._start_step_execution(
                current_step,
                plan,
                previous_results,
                state.get("conversation_summary", ""),
                state.get("initial_integrations", []),
                artifacts=step_artifacts,
            )
            current_step.thinking_duration_ms = int((time.time() - start_time) * 1000)

            if hasattr(response, "tool_calls") and response.tool_calls:
                for tc in response.tool_calls:
                    tool_name = tc.get("name", "")
                    tool_calls_preview.append(
                        {
                            "id": tc.get("id", ""),
                            "tool_name": tool_name,
                            "integration": self._resolve_tool_integration(tool_name),
                            "arguments": tc.get("args", {}),
                        }
                    )

                from langchain_core.messages import message_to_dict

                pending_message = message_to_dict(response)

                # Enrich spreadsheet preview with sheet/column structure
                for idx, tc_preview in enumerate(tool_calls_preview):
                    if tc_preview["tool_name"] == "create_spreadsheet":
                        args = tc_preview.get("arguments", {})
                        if not (
                            args.get("sheets")
                            or args.get("headers")
                            or args.get("columns")
                        ):
                            try:
                                structure = await self._generate_spreadsheet_structure(
                                    current_step, previous_results
                                )
                                enriched = dict(args)
                                if not enriched.get("title"):
                                    enriched["title"] = structure.get("title", "")
                                enriched["sheets"] = structure.get("sheets", [])
                                tool_calls_preview[idx] = {
                                    **tc_preview,
                                    "arguments": enriched,
                                }
                            except Exception as e:
                                logger.warning(f"Spreadsheet enrichment failed: {e}")
                        break

        except Exception as e:
            logger.warning(
                f"Failed to generate preview for step {current_step.step_number}: {e}"
            )

        return {
            "plan": plan,
            "awaiting_approval": True,
            "approval_step_info": {
                "type": "approval_required",
                "step_number": current_step.step_number,
                "description": current_step.description,
                "reason": current_step.approval_reason,
                "actions": ["approve", "edit", "skip"],
                "tool_calls": tool_calls_preview,
            },
            "_executor_chat": executor_chat,
            "_step_tool_calls": 0,
            "_pending_tool_calls_message": pending_message,
        }

    # ------------------------------------------------------------------
    # Step complete
    # ------------------------------------------------------------------

    async def step_complete_node(self, state: WorkflowState) -> dict:
        """Mark the current step done, extract artifacts, advance to next step."""
        plan = state["plan"]
        current_index = state["current_step_index"]
        messages = state["messages"]

        if not plan or current_index >= len(plan.steps):
            return {}

        last_message = ""
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and msg.content:
                if isinstance(msg.content, list):
                    last_message = "\n".join(
                        item["text"]
                        if isinstance(item, dict) and "text" in item
                        else str(item)
                        for item in msg.content
                    )
                else:
                    last_message = str(msg.content)
                break

        current_step = plan.steps[current_index]
        current_step.status = "completed"
        current_step.result = last_message[:2000] or "Step completed"

        if "search" in current_step.description.lower():
            search_results = extract_search_results_from_messages(messages)
            if search_results:
                current_step.search_results = search_results

        turn_number = sum(1 for m in messages if isinstance(m, HumanMessage))
        msg_types = [
            (
                type(m).__name__,
                (m.content[:100] if hasattr(m, "content") and m.content else ""),
            )
            for m in messages[-10:]
        ]
        logger.info(
            f"[ARTIFACT_DIAG] step_complete step={current_step.step_number}, "
            f"total_msgs={len(messages)}, last_10_types={msg_types}"
        )
        logger.info(f"[ARTIFACT_DIAG] existing artifacts: {state.get('artifacts', [])}")

        new_artifacts = extract_artifacts_from_step(
            messages, step_number=current_step.step_number, turn_number=turn_number
        )
        logger.info(f"[ARTIFACT_DIAG] new_artifacts: {new_artifacts}")

        next_index = current_index + 1

        if next_index >= len(plan.steps):
            plan.is_complete = True
            summary = f"✅ **Workflow Complete!**\n\nCompleted all {len(plan.steps)} steps for: {plan.original_request}\n\n**Results:**\n"
            for step in plan.steps:
                icon = (
                    "✓"
                    if step.status == "completed"
                    else "⏭️"
                    if step.status == "skipped"
                    else "?"
                )
                summary += f"{step.step_number}. {icon} {step.description}\n   → {(step.result or 'N/A')[:100]}...\n\n"
            plan.final_summary = summary
            return {
                "messages": [AIMessage(content=summary)],
                "plan": plan,
                "current_step_index": next_index,
                "artifacts": new_artifacts,
                "_executor_chat": None,
                "_step_tool_calls": 0,
            }

        next_step = plan.steps[next_index]
        return {
            "messages": [
                AIMessage(
                    content=f"✓ Step {current_index + 1} complete. Moving to step {next_index + 1}: {next_step.description}\n"
                )
            ],
            "plan": plan,
            "current_step_index": next_index,
            "artifacts": new_artifacts,
            "_executor_chat": None,
            "_step_tool_calls": 0,
        }

    def get_tool_node(self) -> ToolNode:
        return self.tool_node

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _try_incremental_load(
        self,
        exc,
        state,
        current_step,
        plan,
        previous_results,
        initial_integrations,
        step_artifacts,
        incremental_load_events,
    ):
        """Attempt to load a missing integration when a tool is not found."""
        error_msg = str(exc).lower()
        if not (
            self.registry
            and "tool" in error_msg
            and ("not found" in error_msg or "unknown" in error_msg)
        ):
            raise exc

        missing_tool = self._extract_tool_name_from_error(str(exc))
        if not missing_tool:
            raise exc

        missing_integration = self.registry.get_integration_for_tool(missing_tool)
        if not missing_integration or missing_integration in initial_integrations:
            raise ValueError(f"Tool '{missing_tool}' not available in any integration")

        logger.warning(
            "Incremental loading triggered",
            extra={
                "request": state["messages"][-1].content[:100]
                if state["messages"]
                else "",
                "initially_classified": initial_integrations,
                "missing_integration": missing_integration,
                "missing_tool": missing_tool,
            },
        )

        new_tools = self.registry.get_toolset([missing_integration])
        self.tools.extend(new_tools)
        self.executor_with_tools = self.executor_llm.bind_tools(self.tools)
        self.tool_node = ToolNode(self.tools, handle_tool_errors=True)

        cfg = self.registry.get_integration_config(missing_integration)
        incremental_load_events.append(
            {
                "integration": missing_integration,
                "display_name": cfg.display_name if cfg else missing_integration,
                "tools_added": len(new_tools),
                "triggered_by_tool": missing_tool,
            }
        )

        response, executor_chat = await self._start_step_execution(
            current_step,
            plan,
            previous_results,
            state.get("conversation_summary", ""),
            initial_integrations,
            artifacts=step_artifacts,
        )
        return (
            response,
            executor_chat,
            [*initial_integrations, missing_integration],
            incremental_load_events,
        )

    def _extract_tool_name_from_error(self, error: str) -> Optional[str]:
        for pattern in [
            r"tool\s+['\"]([^'\"]+)['\"]",
            r"unknown\s+tool\s+['\"]?(\w+)['\"]?",
            r"tool\s+(\w+)\s+not\s+found",
        ]:
            m = re.search(pattern, error, re.IGNORECASE)
            if m:
                return m.group(1)
        return None

    def _resolve_tool_integration(self, tool_name: str) -> str:
        if self.registry:
            integration = self.registry.get_integration_for_tool(tool_name)
            if integration:
                return integration
        name = tool_name.lower()
        if "gmail" in name:
            return "gmail"
        if "doc" in name:
            return "google_docs"
        if "sheet" in name or "spreadsheet" in name:
            return "google_sheets"
        if "slide" in name or "presentation" in name:
            return "google_slides"
        if "calendar" in name or "event" in name:
            return "google_calendar"
        if "drive" in name:
            return "google_drive"
        if "notion" in name:
            return "notion"
        if "slack" in name:
            return "slack"
        if "github" in name:
            return "github"
        if "linear" in name:
            return "linear"
        if "vercel" in name:
            return "vercel"
        if "supabase" in name:
            return "supabase"
        if "sentry" in name:
            return "sentry"
        if "search" in name or "tavily" in name:
            return "web_search"
        return name

    def _apply_edited_args(
        self, ai_message: AIMessage, edited_content: dict
    ) -> AIMessage:
        """Merge user-edited arguments into an AIMessage's tool_calls."""
        if not getattr(ai_message, "tool_calls", None):
            return ai_message

        edits_by_id = (
            {tc["id"]: tc["arguments"] for tc in edited_content["tool_calls"]}
            if "tool_calls" in edited_content
            else None
        )
        applied = False
        new_tool_calls = []
        for tc in ai_message.tool_calls:
            new_tc = dict(tc)
            if edits_by_id:
                if edited := edits_by_id.get(tc.get("id")):
                    new_tc["args"] = {**tc.get("args", {}), **edited}
            elif not applied:
                new_tc["args"] = {**tc.get("args", {}), **edited_content}
                applied = True
            new_tool_calls.append(new_tc)

        return AIMessage(
            content=ai_message.content, tool_calls=new_tool_calls, id=ai_message.id
        )

    def _get_previous_results(
        self, plan: WorkflowPlan, current_index: int, artifacts: list[dict] = None
    ) -> str:
        parts = []
        for step in plan.steps[:current_index]:
            if step.result:
                parts.append(f"Step {step.step_number}: {step.result}")
                if artifacts:
                    step_artifacts = [
                        a for a in artifacts if a.get("step_number") == step.step_number
                    ]
                    if step_artifacts:
                        parts.append(
                            "  ↳ EXACT RESOURCE IDs (authoritative — use these, not IDs from text above):"
                        )
                        for a in step_artifacts:
                            line = f"    [{a.get('type', 'resource')}] {a.get('name', 'Untitled')}"
                            if a.get("id"):
                                line += f" — ID: {a['id']}"
                            if a.get("url"):
                                line += f" — URL: {a['url']}"
                            parts.append(line)
        return "\n".join(parts) if parts else "None yet - this is the first step."

    async def _generate_spreadsheet_structure(
        self, step: WorkflowStep, previous_results: str
    ) -> dict:
        """Generate sheet/column structure for the approval preview (lightweight LLM call)."""
        prompt = (
            f"A workflow step will create a Google Spreadsheet.\n\n"
            f"STEP: {step.description}\n\nPREVIOUS STEPS:\n{previous_results}\n\n"
            "Respond with JSON only — no markdown fences. Schema:\n"
            '{"title": "...", "sheets": [{"name": "...", "columns": [{"name": "...", "type": "text|number|date|boolean|currency|percentage"}]}]}\n\n'
            "Infer title and columns from the step description. Use 'text' for strings, 'number' for numerics, 'currency' for prices, 'date' for dates."
        )
        response = await self.executor_llm.ainvoke(
            [
                SystemMessage(
                    content="You are a planning assistant. Respond with valid JSON only."
                ),
                HumanMessage(content=prompt),
            ]
        )
        try:
            content = response.content
            if "```" in content:
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            return json.loads(content.strip())
        except Exception:
            return {
                "title": step.description,
                "sheets": [{"name": "Sheet1", "columns": []}],
            }

    async def _start_step_execution(
        self,
        step: WorkflowStep,
        plan: WorkflowPlan,
        previous_results: str,
        conversation_summary: str = "",
        initial_integrations: list[str] | None = None,
        approved_content: dict = None,
        artifacts: list[dict] = None,
    ) -> tuple:
        """Build the executor conversation and invoke the LLM."""
        system_prompt = EXECUTOR_SYSTEM_PROMPT.format(
            conversation_context=f"\nCONVERSATION HISTORY:\n{conversation_summary}\n"
            if conversation_summary
            else "",
            integration_context=format_integration_context(initial_integrations),
            artifacts_context=format_artifacts_context(artifacts or []),
            integration_hints=(
                self.registry.get_hints(initial_integrations, "executor")
                if self.registry and initial_integrations
                else ""
            ),
            current_step=step.description,
            step_number=step.step_number,
            total_steps=len(plan.steps),
            previous_results=previous_results,
        )

        human_content = f"Execute step {step.step_number}: {step.description}"
        if approved_content:
            content_str = (
                json.dumps(approved_content, indent=2)
                if isinstance(approved_content, dict)
                else str(approved_content)
            )
            human_content += f"\n\nUse this approved content:\n{content_str}"

        executor_chat = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_content),
        ]
        response = await self.executor_with_tools.ainvoke(executor_chat)
        executor_chat.append(response)
        return response, executor_chat

    async def _continue_after_tools(self, state: WorkflowState) -> dict:
        """Continue the executor conversation after ToolNode results (multi-hop)."""
        executor_chat = list(state["_executor_chat"])
        new_tool_msgs = []
        for msg in reversed(state["messages"]):
            if isinstance(msg, ToolMessage):
                new_tool_msgs.insert(0, msg)
            else:
                break

        executor_chat.extend(new_tool_msgs)
        response = await self.executor_with_tools.ainvoke(executor_chat)
        executor_chat.append(response)

        return {
            "messages": [response],
            "_executor_chat": executor_chat,
            "_step_tool_calls": state.get("_step_tool_calls", 0) + len(new_tool_msgs),
            "plan": state["plan"],
        }
