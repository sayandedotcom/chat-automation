"""
Step-complete node logic.

Marks the current step done, extracts artifacts, and advances to the next step.
"""

import logging

from langchain_core.messages import AIMessage, HumanMessage

from chat.schemas import WorkflowState
from chat.workflow.artifacts import (
    extract_artifacts_from_step,
    extract_search_results_from_messages,
)

logger = logging.getLogger(__name__)


async def run_step_complete(state: WorkflowState) -> dict:
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
