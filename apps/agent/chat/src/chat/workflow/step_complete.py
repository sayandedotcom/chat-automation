"""
Step-complete node logic.

Marks the current step done, extracts artifacts, and advances to the next step.
"""

import logging

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from chat.schemas import WorkflowState
from chat.workflow.artifacts import (
    extract_artifacts_from_step,
    extract_email_results_from_messages,
    extract_search_results_from_messages,
)

logger = logging.getLogger(__name__)


async def run_step_complete(state: WorkflowState, *, registry=None) -> dict:
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
    current_step.result = last_message or "Step completed"
    current_step.status = "completed"

    # Populate tools_used from ToolMessage names in this step's messages
    tool_names = []
    for msg in messages:
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None):
            if msg.name not in tool_names:
                tool_names.append(msg.name)
    if tool_names:
        current_step.tools_used = tool_names

    # Always try to extract search results (not just when "search" is in the description)
    search_results = extract_search_results_from_messages(messages)
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
    email_results = extract_email_results_from_messages(messages)
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
