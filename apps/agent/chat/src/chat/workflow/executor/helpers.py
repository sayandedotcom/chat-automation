"""
Executor helper functions.

Pure/stateless utilities used by the executor and approval nodes.
Functions that would mutate WorkflowNodes state instead return new values
for the caller to apply.
"""

import json
import logging
import re
from typing import Optional, TYPE_CHECKING

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from chat.schemas import WorkflowPlan, WorkflowStep
from langgraph.prebuilt import ToolNode

if TYPE_CHECKING:
    from chat.integrations.registry import IntegrationRegistry

logger = logging.getLogger(__name__)


def extract_tool_name_from_error(error: str) -> Optional[str]:
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
    except Exception:
        return {
            "title": step.description,
            "sheets": [{"name": "Sheet1", "columns": []}],
        }


def synthesize_calendar_preview(step: WorkflowStep) -> list[dict] | None:
    """Synthesize a calendar tool-call preview when the LLM produces no tool calls.

    Returns a single-element list suitable for ``tool_calls_preview``, or
    ``None`` if the step description doesn't look like a calendar-create action.
    """
    desc = step.description.lower()
    is_calendar_create = "calendar" in desc and any(
        kw in desc for kw in ("create", "add", "schedule", "new event", "invite")
    )
    if not is_calendar_create:
        return None

    import re
    from datetime import datetime, timedelta

    email_matches = re.findall(r"[\w.+%-]+@[\w-]+\.[\w.]+", step.description)
    now = datetime.now()
    default_start = now.replace(hour=now.hour + 1, minute=0, second=0, microsecond=0)
    default_end = default_start + timedelta(hours=1)

    return [
        {
            "id": f"synthetic_calendar_{step.step_number}",
            "tool_name": "create_event",
            "integration": "google_calendar",
            "ui_component": "calendar_event_editor",
            "arguments": {
                "summary": "New Event",
                "calendarId": "primary",
                "start": {"dateTime": default_start.isoformat()},
                "end": {"dateTime": default_end.isoformat()},
                "attendees": [{"email": e} for e in email_matches],
            },
        }
    ]


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
    new_tool_node = ToolNode(updated_tools, handle_tool_errors=True)

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
