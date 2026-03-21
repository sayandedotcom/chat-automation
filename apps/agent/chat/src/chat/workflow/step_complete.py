"""
Step-complete node logic.

Marks the current step done, extracts artifacts, and advances to the next step.
"""

import logging
import re

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from chat.schemas import WorkflowState
from chat.workflow.artifacts import (
    extract_artifacts_from_step,
    extract_email_results_from_messages,
    extract_search_results_from_messages,
)

logger = logging.getLogger(__name__)

# Boundary patterns emitted by our own code
_STEP_TRANSITION_RE = re.compile(r"^✓ Step \d+ complete\.")
_ALL_COMPLETE_RE = re.compile(r"^All \d+ steps completed\.\n?$")
_PLAN_CREATED_PREFIX = "📋 **Workflow Plan Created**"


def _scope_messages_to_current_step(messages: list) -> list:
    """Extract only messages from the current step's execution.

    Walks backward from the end, collecting messages until it hits a known
    step/turn boundary (step-transition marker, plan-created marker, all-complete
    marker, or a HumanMessage). Returns messages in forward order.
    """
    scoped: list = []
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            break
        if isinstance(msg, AIMessage) and isinstance(msg.content, str):
            c = msg.content
            if (
                c.startswith(_PLAN_CREATED_PREFIX)
                or _STEP_TRANSITION_RE.match(c)
                or _ALL_COMPLETE_RE.match(c)
            ):
                break
        scoped.append(msg)
    scoped.reverse()
    return scoped


def _build_rich_result(
    last_message: str, messages: list, current_step_index: int
) -> str:
    """Build an enriched step result that includes key tool output content.

    Combines the executor's final response with summaries of tool outputs
    so that subsequent steps have richer context via get_previous_results.
    """
    if not last_message:
        return "Step completed"

    # Collect tool output content from this step's messages
    # Walk backwards from the end to find tool results for this step
    tool_summaries = []
    char_budget = 4000  # Max chars from tool outputs to include
    chars_used = 0

    for msg in messages:
        if not isinstance(msg, ToolMessage):
            continue
        content = msg.content
        if isinstance(content, list):
            content = str(content)
        if not isinstance(content, str) or not content.strip():
            continue

        tool_name = getattr(msg, "name", "tool")
        # Skip very short tool results (just confirmations like "OK" or IDs)
        if len(content) < 50:
            continue
        # Truncate individual tool outputs
        snippet = content[:1500] if len(content) > 1500 else content
        remaining = char_budget - chars_used
        if remaining <= 0:
            break
        if len(snippet) > remaining:
            snippet = snippet[:remaining] + "..."
        tool_summaries.append(f"[{tool_name}]: {snippet}")
        chars_used += len(snippet)

    if not tool_summaries:
        return last_message

    # Combine: AI summary first, then key tool outputs for context
    combined = last_message
    combined += "\n\n--- Tool Outputs (for context) ---\n"
    combined += "\n".join(tool_summaries)
    return combined


# ---------------------------------------------------------------------------
# Identifier extraction & LLM-based summarization
# ---------------------------------------------------------------------------

# Patterns for structured data that must NOT be summarized by LLM
_URL_PATTERN = re.compile(r"https?://[^\s<>\"')\]},]+")
_EMAIL_PATTERN = re.compile(r"[\w.+%-]+@[\w-]+\.[\w.]+")

# Only summarize tool outputs exceeding this char threshold
_SUMMARIZE_THRESHOLD = 3000


def _extract_identifiers(text: str) -> tuple[list[str], str]:
    """Extract URLs and emails from text.

    Returns (identifiers, cleaned_text) where identifiers are prefixed
    strings (e.g. "URL: ...") and cleaned_text has them replaced with
    placeholders so the LLM cannot corrupt them.
    """
    identifiers: list[str] = []

    for url in _URL_PATTERN.findall(text):
        entry = f"URL: {url}"
        if entry not in identifiers:
            identifiers.append(entry)

    for email in _EMAIL_PATTERN.findall(text):
        entry = f"Email: {email}"
        if entry not in identifiers:
            identifiers.append(entry)

    # Strip URLs/emails from text so LLM can't corrupt them
    cleaned = _URL_PATTERN.sub("[URL_REMOVED]", text)
    cleaned = _EMAIL_PATTERN.sub("[EMAIL_REMOVED]", cleaned)

    return identifiers, cleaned


async def _summarize_tool_outputs(messages: list, current_step, summarizer_llm) -> str:
    """Summarize tool outputs with identifier preservation.

    Small outputs are returned verbatim (no LLM call). Large outputs are
    sent through the LLM with URLs/emails stripped out, then the extracted
    identifiers are appended verbatim at the end.
    """
    tool_outputs: list[str] = []
    original_parts: list[str] = []
    all_identifiers: list[str] = []

    for msg in messages:
        if not isinstance(msg, ToolMessage) or not msg.content:
            continue
        content = str(msg.content) if not isinstance(msg.content, str) else msg.content
        if len(content) < 50:
            continue

        tool_name = getattr(msg, "name", "tool")
        identifiers, cleaned = _extract_identifiers(content)
        all_identifiers.extend(identifiers)
        tool_outputs.append(f"[{tool_name}]:\n{cleaned}")
        original_parts.append(f"[{tool_name}]: {content}")

    if not tool_outputs:
        return ""

    combined = "\n\n".join(tool_outputs)

    # Small outputs: return original content with URLs intact (no LLM needed)
    if len(combined) < _SUMMARIZE_THRESHOLD:
        return "\n".join(original_parts)

    # Large outputs: LLM summarization with identifier stripping
    from langchain_core.messages import HumanMessage as HMsg
    from langchain_core.messages import SystemMessage

    response = await summarizer_llm.ainvoke(
        [
            SystemMessage(
                content=(
                    "You are a precise data summarizer. Extract key findings, "
                    "data points, and results. Do NOT include any URLs, links, "
                    "email addresses, or document IDs — those are tracked "
                    "separately. Focus on the substance: names, numbers, dates, "
                    "descriptions, and status information."
                )
            ),
            HMsg(
                content=(
                    f"Summarize tool outputs for step: "
                    f'"{current_step.description}"\n\n'
                    f"{combined[:25000]}"
                )
            ),
        ]
    )

    # Recombine: LLM summary + verbatim identifiers
    result = response.content
    if all_identifiers:
        unique_ids = list(dict.fromkeys(all_identifiers))  # dedupe preserving order
        result += "\n\n--- Extracted Data (verbatim) ---\n"
        result += "\n".join(unique_ids)

    return result


async def run_step_complete(
    state: WorkflowState, *, registry=None, summarizer_llm=None
) -> dict:
    """Mark the current step done, extract artifacts, advance to next step."""
    plan = state["plan"]
    current_index = state["current_step_index"]
    messages = state["messages"]

    if not plan or current_index >= len(plan.steps):
        return {}

    # Scope to current step's messages only — prevents cross-step/turn bleed
    step_messages = _scope_messages_to_current_step(messages)

    last_message = ""
    for msg in reversed(step_messages):
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
    # result: clean AI response for frontend display (no raw tool output)
    current_step.result = last_message or "Step completed"
    # executor_context: enriched with tool outputs for cross-step context passing only
    if summarizer_llm:
        summarized = await _summarize_tool_outputs(
            step_messages, current_step, summarizer_llm
        )
        if summarized:
            current_step.executor_context = (
                (last_message + "\n\n" + summarized) if last_message else summarized
            )
        else:
            current_step.executor_context = last_message or "Step completed"
    else:
        # Fallback to original truncation method
        current_step.executor_context = _build_rich_result(
            last_message, step_messages, current_index
        )
    current_step.status = "completed"

    # Populate tools_used from ToolMessage names in this step's messages
    tool_names = []
    for msg in step_messages:
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None):
            if msg.name not in tool_names:
                tool_names.append(msg.name)
    if tool_names:
        current_step.tools_used = tool_names

    # Always try to extract search results (not just when "search" is in the description)
    search_results = extract_search_results_from_messages(step_messages)
    if search_results:
        current_step.search_results = search_results
        logger.info(
            f"[SEARCH_RESULTS] step={current_step.step_number}: extracted {len(search_results)} results"
        )
    else:
        logger.info(
            f"[SEARCH_RESULTS] step={current_step.step_number}: no results extracted"
        )

    # Extract email results from Gmail tool messages
    email_results = extract_email_results_from_messages(step_messages)
    if email_results:
        current_step.email_results = email_results
        logger.info(
            f"[EMAIL_RESULTS] step={current_step.step_number}: extracted {len(email_results)} emails"
        )

    # Resolve step-level ui_component from the last tool that has a mapping
    if registry and tool_names:
        for tn in reversed(tool_names):
            ui_comp = registry.get_ui_component_for_tool(tn)
            if ui_comp:
                current_step.ui_component = ui_comp
                logger.info(
                    f"[UI_COMPONENT] step={current_step.step_number}: resolved '{ui_comp}' from tool '{tn}'"
                )
                break

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
        plan.final_summary = last_message or "Workflow complete"
        return {
            "messages": [
                AIMessage(content=f"All {len(plan.steps)} steps completed.\n")
            ],
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
