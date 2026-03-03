"""
LangGraph Studio entry point.

Exports the compiled graph for LangSmith Studio.
"""

from langgraph.graph import StateGraph, START, END

from chat.schemas import WorkflowState
from chat.workflow.nodes import WorkflowNodes
from chat.workflow.routing import (
    route_to_executor,
    should_execute_next_step,
)


def build_studio_graph():
    """Build a minimal graph for LangGraph Studio without external dependencies."""
    nodes = WorkflowNodes(tools=[], registry=None)

    workflow = StateGraph(WorkflowState)

    workflow.add_node("planner", nodes.planner_node)
    workflow.add_node("executor", nodes.executor_node)
    workflow.add_node("executor_with_approval", nodes.executor_with_approval_node)
    workflow.add_node("step_complete", nodes.step_complete_node)

    workflow.add_edge(START, "planner")

    workflow.add_conditional_edges(
        "planner",
        route_to_executor,
        {
            "executor": "executor",
            "executor_with_approval": "executor_with_approval",
            "end": END,
        },
    )

    workflow.add_edge("executor", "step_complete")
    workflow.add_edge("executor_with_approval", "step_complete")

    workflow.add_conditional_edges(
        "step_complete",
        should_execute_next_step,
        {
            "executor": "executor",
            "executor_with_approval": "executor_with_approval",
            "end": END,
        },
    )

    return workflow.compile()


graph = build_studio_graph()
