"""
Executor helper functions.

Pure/stateless utilities used by the executor and approval nodes.
Functions that would mutate WorkflowNodes state instead return new values
for the caller to apply.
"""

import json
import logging
import re
from typing import TYPE_CHECKING

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from chat.schemas import WorkflowPlan, WorkflowStep
from langgraph.prebuilt import ToolNode

if TYPE_CHECKING:
    from chat.integrations.registry import IntegrationRegistry

logger = logging.getLogger(__name__)


def deep_parse_stringified_json(value):
    """Recursively parse JSON strings that should be objects/arrays.

    Gemini Flash sometimes double-serializes nested values, passing
    '{"object": "block", ...}' (a string) where {"object": "block", ...}
    (an object) is expected.  This walks the arg tree and parses any string
    that looks like a JSON object or array.
    """
    if isinstance(value, str):
        stripped = value.strip()
        if (stripped.startswith("{") and stripped.endswith("}")) or (
            stripped.startswith("[") and stripped.endswith("]")
        ):
            try:
                parsed = json.loads(stripped)
                # Recurse into the parsed result in case of nested stringification
                return deep_parse_stringified_json(parsed)
            except (json.JSONDecodeError, ValueError):
                return value
        return value
    if isinstance(value, dict):
        return {k: deep_parse_stringified_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [deep_parse_stringified_json(item) for item in value]
    return value


_NOTION_CHILDREN_LIMIT = 100


def split_notion_children(args: dict) -> tuple[dict, list[list]]:
    """Split children exceeding the Notion API 100-block limit.

    Returns (modified_args_with_first_batch, list_of_overflow_batches).
    Each overflow batch is a list of block objects (max 100 each).
    """
    children = args.get("children")
    if not isinstance(children, list) or len(children) <= _NOTION_CHILDREN_LIMIT:
        return args, []

    logger.info(
        "Splitting Notion children: %d blocks → %d + overflow",
        len(children),
        _NOTION_CHILDREN_LIMIT,
    )
    first_batch = children[:_NOTION_CHILDREN_LIMIT]
    remaining = children[_NOTION_CHILDREN_LIMIT:]

    overflow_batches = [
        remaining[i : i + _NOTION_CHILDREN_LIMIT]
        for i in range(0, len(remaining), _NOTION_CHILDREN_LIMIT)
    ]

    return {**args, "children": first_batch}, overflow_batches


def fix_notion_workspace_parent(args: dict) -> dict:
    """Fix common LLM mistakes with Notion workspace parent format.

    Gemini Flash often generates parent: "workspace" or
    parent: {"page_id": "workspace"} instead of the correct
    parent: {"type": "workspace", "workspace": true}.
    """
    parent = args.get("parent")
    if parent is None:
        return args
    correct = {"type": "workspace", "workspace": True}
    # Case 1: plain string "workspace"
    if parent == "workspace":
        return {**args, "parent": correct}
    if not isinstance(parent, dict):
        return args
    # Case 2: {"page_id": "workspace"} or {"type": "page_id", "page_id": "workspace"}
    if parent.get("page_id") == "workspace":
        return {**args, "parent": correct}
    # Case 3: {"type": "workspace"} but missing workspace key
    if parent.get("type") == "workspace" and "workspace" not in parent:
        return {**args, "parent": {**parent, "workspace": True}}
    return args


# Pagination fields to preserve when truncating oversized tool results.
# Covers Notion (next_cursor, has_more) and generic cursor/offset patterns.
_PAGINATION_KEYS = {
    "next_cursor",
    "has_more",
    "cursor",
    "next_page_cursor",
    "has_more_results",
    "offset",
    "total",
    "page_size",
    "next_start_cursor",
    "start_cursor",
}


def extract_pagination_metadata(content_str: str) -> str:
    """Extract pagination fields from a JSON tool result.

    Returns a compact JSON string of pagination metadata, or empty string
    if the content is not JSON or contains no pagination fields.
    """
    try:
        data = json.loads(content_str)
    except (json.JSONDecodeError, ValueError):
        return ""

    if not isinstance(data, dict):
        return ""

    pagination = {k: v for k, v in data.items() if k in _PAGINATION_KEYS}
    if not pagination:
        return ""

    return json.dumps(pagination)


def extract_tool_name_from_error(error: str) -> str | None:
    """Extract a tool name from an error message about a missing tool."""
    for pattern in [
        r"tool\s+['\"]([^'\"]+)['\"]",
        r"unknown\s+tool\s+['\"]?(\w+)['\"]?",
        r"tool\s+(\w+)\s+not\s+found",
    ]:
        m = re.search(pattern, error, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


def resolve_tool_integration(
    tool_name: str, registry: "IntegrationRegistry | None"
) -> str:
    """Map a tool name to its integration (via registry or heuristic fallback)."""
    if registry:
        integration = registry.get_integration_for_tool(tool_name)
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


def apply_edited_args(ai_message: AIMessage, edited_content: dict) -> AIMessage:
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


def get_previous_results(
    plan: WorkflowPlan, current_index: int, artifacts: list[dict] = None
) -> str:
    """Build a summary of completed steps and their artifacts."""
    parts = []
    for step in plan.steps[:current_index]:
        has_content = False
        # Use executor_context (richer, includes tool outputs) when available;
        # fall back to result (clean AI response) for display-only content
        context_text = step.executor_context or step.result
        if context_text:
            parts.append(f"Step {step.step_number}: {context_text}")
            has_content = True

        # Include artifact data only for steps that have results
        if has_content and artifacts:
            step_artifacts = [
                a for a in artifacts if a.get("step_number") == step.step_number
            ]
            if step_artifacts:
                parts.append(
                    "  ↳ EXACT RESOURCE IDs (authoritative — use these, not IDs from text above):"
                )
                for a in step_artifacts:
                    line = (
                        f"    [{a.get('type', 'resource')}] {a.get('name', 'Untitled')}"
                    )
                    if a.get("id"):
                        line += f" — ID: {a['id']}"
                    if a.get("url"):
                        line += f" — URL: {a['url']}"
                    parts.append(line)
    return "\n".join(parts) if parts else "None yet - this is the first step."


async def generate_spreadsheet_structure(
    step: WorkflowStep, previous_results: str, executor_llm
) -> dict:
    """Generate sheet/column structure for the approval preview (lightweight LLM call)."""
    prompt = (
        f"A workflow step will create a Google Spreadsheet.\n\n"
        f"STEP: {step.description}\n\nPREVIOUS STEPS:\n{previous_results}\n\n"
        "Respond with JSON only — no markdown fences. Schema:\n"
        '{"title": "...", "sheets": [{"name": "...", "columns": [{"name": "...", "type": "text|number|date|boolean|currency|percentage"}]}]}\n\n'
        "Infer title and columns from the step description. Use 'text' for strings, 'number' for numerics, 'currency' for prices, 'date' for dates."
    )
    response = await executor_llm.ainvoke(
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
    except (json.JSONDecodeError, KeyError, ValueError, IndexError) as exc:
        logger.warning("Failed to parse spreadsheet structure from LLM: %s", exc)
        return {
            "title": step.description,
            "sheets": [{"name": "Sheet1", "columns": []}],
        }


async def try_incremental_load(
    exc,
    state,
    current_step,
    plan,
    previous_results,
    initial_integrations,
    step_artifacts,
    incremental_load_events,
    *,
    registry: "IntegrationRegistry | None",
    tools: list,
    executor_llm,
    executor_with_tools,
    start_step_execution_fn,
):
    """Attempt to load a missing integration when a tool is not found.

    Returns (response, executor_chat, new_initial_integrations,
             incremental_load_events, new_tools, new_executor_with_tools, new_tool_node).
    """
    error_msg = str(exc).lower()
    if not (
        registry
        and "tool" in error_msg
        and ("not found" in error_msg or "unknown" in error_msg)
    ):
        raise exc

    missing_tool = extract_tool_name_from_error(str(exc))
    if not missing_tool:
        raise exc

    missing_integration = registry.get_integration_for_tool(missing_tool)
    if not missing_integration or missing_integration in initial_integrations:
        raise ValueError(f"Tool '{missing_tool}' not available in any integration")

    logger.warning(
        "Incremental loading triggered",
        extra={
            "request": state["messages"][-1].content[:100] if state["messages"] else "",
            "initially_classified": initial_integrations,
            "missing_integration": missing_integration,
            "missing_tool": missing_tool,
        },
    )

    new_tools_for_integration = registry.get_toolset([missing_integration])
    updated_tools = list(tools) + list(new_tools_for_integration)
    new_executor_with_tools = executor_llm.bind_tools(updated_tools)
    from chat.workflow.tool_retry import retry_tool_call

    new_tool_node = ToolNode(
        updated_tools, handle_tool_errors=True, awrap_tool_call=retry_tool_call
    )

    cfg = registry.get_integration_config(missing_integration)
    incremental_load_events = list(incremental_load_events)
    incremental_load_events.append(
        {
            "integration": missing_integration,
            "display_name": cfg.display_name if cfg else missing_integration,
            "tools_added": len(new_tools_for_integration),
            "triggered_by_tool": missing_tool,
        }
    )

    response, executor_chat = await start_step_execution_fn(
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
        updated_tools,
        new_executor_with_tools,
        new_tool_node,
    )
