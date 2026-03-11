"""
Graph Routing Functions

Pure functions that determine edge transitions in the LangGraph workflow.
"""

import logging
from typing import Literal

from chat.schemas import WorkflowState

logger = logging.getLogger(__name__)

MAX_TOOL_CALLS_PER_STEP = 10  # Prevent infinite tool-call loops within a single step


def route_after_smart_router(state: WorkflowState) -> Literal["planner", "end"]:
    """Route to END if auth is missing, otherwise continue to planner."""
    if state.get("auth_required_integrations"):
        return "end"
    return "planner"


def route_to_executor(
    state: WorkflowState,
) -> Literal["executor", "executor_with_approval", "end"]:
    """
    Route to the appropriate executor based on the LLM's HITL classification.
    Called after the planner node.
    """
    plan = state.get("plan")
    current_index = state.get("current_step_index", 0)

    if not plan or current_index >= len(plan.steps):
        return "end"

    if plan.steps[current_index].requires_human_approval:
        return "executor_with_approval"
    return "executor"


def should_continue(state: WorkflowState) -> Literal["tools", "step_complete", "end"]:
    """
    Decide whether to call tools, complete the step, or end (awaiting approval).
    Called after executor and executor_with_approval nodes.
    """
    if state.get("awaiting_approval"):
        return "end"

    messages = state["messages"]
    if not messages:
        return "step_complete"

    last_message = messages[-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        if state.get("_step_tool_calls", 0) >= MAX_TOOL_CALLS_PER_STEP:
            logger.warning(
                f"Tool call limit ({MAX_TOOL_CALLS_PER_STEP}) reached, completing step"
            )
            return "step_complete"
        return "tools"

    return "step_complete"


def route_after_tools(
    state: WorkflowState,
) -> Literal["executor", "executor_with_approval"]:
    """
    After ToolNode runs, route back to the correct executor for multi-hop tool calling.
    """
    plan = state.get("plan")
    current_index = state.get("current_step_index", 0)

    if plan and 0 <= current_index < len(plan.steps):
        if plan.steps[current_index].requires_human_approval:
            return "executor_with_approval"
    return "executor"


def should_execute_next_step(
    state: WorkflowState,
) -> Literal["executor", "executor_with_approval", "end"]:
    """
    After a step completes, decide whether to run the next step or end.
    """
    plan = state.get("plan")
    current_index = state.get("current_step_index", 0)

    if not plan:
        return "end"

    if plan.is_complete:
        return "end"

    if current_index >= len(plan.steps):
        return "end"

    if plan.steps[current_index].requires_human_approval:
        return "executor_with_approval"
    return "executor"
