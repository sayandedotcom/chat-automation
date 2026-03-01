"""
Tests for workflow/routing.py — pure routing functions.

No mocks needed; all functions are pure state dict → literal string.
"""

from langchain_core.messages import AIMessage

from chat.workflow.routing import (
    route_after_smart_router,
    route_to_executor,
    should_continue,
    route_after_tools,
    should_execute_next_step,
    MAX_TOOL_CALLS_PER_STEP,
)
from chat.schemas import WorkflowPlan, WorkflowStep


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_step(requires_approval: bool = False, step_number: int = 1) -> WorkflowStep:
    return WorkflowStep(
        step_number=step_number,
        description="Do something",
        requires_human_approval=requires_approval,
    )


def make_plan(steps=None, is_complete: bool = False) -> WorkflowPlan:
    if steps is None:
        steps = [make_step()]
    return WorkflowPlan(
        original_request="test request", steps=steps, is_complete=is_complete
    )


def make_ai_msg_with_tool_calls() -> AIMessage:
    """Return an AIMessage with a non-empty tool_calls list."""
    return AIMessage(
        content="",
        tool_calls=[
            {"name": "some_tool", "args": {}, "id": "call_abc", "type": "tool_call"}
        ],
    )


# ---------------------------------------------------------------------------
# TestRouteAfterSmartRouter
# ---------------------------------------------------------------------------


class TestRouteAfterSmartRouter:
    def test_no_auth_required_routes_to_planner(self):
        """State without auth_required_integrations routes to planner."""
        assert route_after_smart_router({}) == "planner"

    def test_auth_required_routes_to_end(self):
        """Non-empty auth_required_integrations routes to end."""
        state = {"auth_required_integrations": [{"name": "google_docs"}]}
        assert route_after_smart_router(state) == "end"

    def test_empty_auth_list_routes_to_planner(self):
        """Empty list is falsy so routes to planner."""
        state = {"auth_required_integrations": []}
        assert route_after_smart_router(state) == "planner"

    def test_none_auth_routes_to_planner(self):
        """Explicit None value routes to planner."""
        state = {"auth_required_integrations": None}
        assert route_after_smart_router(state) == "planner"


# ---------------------------------------------------------------------------
# TestRouteToExecutor
# ---------------------------------------------------------------------------


class TestRouteToExecutor:
    def test_no_plan_routes_to_end(self):
        """Missing plan routes to end."""
        assert route_to_executor({}) == "end"

    def test_index_at_end_routes_to_end(self):
        """current_index == len(steps) routes to end."""
        plan = make_plan(steps=[make_step()])
        state = {"plan": plan, "current_step_index": 1}
        assert route_to_executor(state) == "end"

    def test_index_beyond_end_routes_to_end(self):
        """current_index > len(steps) routes to end."""
        plan = make_plan(steps=[make_step()])
        state = {"plan": plan, "current_step_index": 5}
        assert route_to_executor(state) == "end"

    def test_step_needs_approval_routes_to_executor_with_approval(self):
        """Step with requires_human_approval=True routes to executor_with_approval."""
        plan = make_plan(steps=[make_step(requires_approval=True)])
        state = {"plan": plan, "current_step_index": 0}
        assert route_to_executor(state) == "executor_with_approval"

    def test_step_no_approval_routes_to_executor(self):
        """Step without approval requirement routes to executor."""
        plan = make_plan(steps=[make_step(requires_approval=False)])
        state = {"plan": plan, "current_step_index": 0}
        assert route_to_executor(state) == "executor"

    def test_empty_steps_routes_to_end(self):
        """Plan with no steps routes to end."""
        plan = make_plan(steps=[])
        state = {"plan": plan, "current_step_index": 0}
        assert route_to_executor(state) == "end"


# ---------------------------------------------------------------------------
# TestShouldContinue
# ---------------------------------------------------------------------------


class TestShouldContinue:
    def test_awaiting_approval_routes_to_end(self):
        """awaiting_approval=True routes to end regardless of messages."""
        state = {"awaiting_approval": True, "messages": []}
        assert should_continue(state) == "end"

    def test_no_messages_routes_to_step_complete(self):
        """Empty messages list routes to step_complete."""
        state = {"awaiting_approval": False, "messages": []}
        assert should_continue(state) == "step_complete"

    def test_message_with_tool_calls_routes_to_tools(self):
        """Last message with tool_calls routes to tools."""
        state = {
            "awaiting_approval": False,
            "messages": [make_ai_msg_with_tool_calls()],
            "_step_tool_calls": 0,
        }
        assert should_continue(state) == "tools"

    def test_message_without_tool_calls_routes_to_step_complete(self):
        """Last message with no tool_calls routes to step_complete."""
        state = {"awaiting_approval": False, "messages": [AIMessage(content="Done")]}
        assert should_continue(state) == "step_complete"

    def test_tool_calls_at_limit_routes_to_step_complete(self):
        """_step_tool_calls at MAX_TOOL_CALLS_PER_STEP routes to step_complete."""
        state = {
            "awaiting_approval": False,
            "messages": [make_ai_msg_with_tool_calls()],
            "_step_tool_calls": MAX_TOOL_CALLS_PER_STEP,
        }
        assert should_continue(state) == "step_complete"

    def test_tool_calls_below_limit_routes_to_tools(self):
        """_step_tool_calls one below MAX_TOOL_CALLS_PER_STEP still routes to tools."""
        state = {
            "awaiting_approval": False,
            "messages": [make_ai_msg_with_tool_calls()],
            "_step_tool_calls": MAX_TOOL_CALLS_PER_STEP - 1,
        }
        assert should_continue(state) == "tools"

    def test_empty_tool_calls_list_routes_to_step_complete(self):
        """Last AIMessage with empty tool_calls list routes to step_complete."""
        state = {
            "awaiting_approval": False,
            "messages": [AIMessage(content="All done here")],
        }
        assert should_continue(state) == "step_complete"


# ---------------------------------------------------------------------------
# TestRouteAfterTools
# ---------------------------------------------------------------------------


class TestRouteAfterTools:
    def test_no_plan_defaults_to_executor(self):
        """No plan falls through to executor."""
        assert route_after_tools({}) == "executor"

    def test_step_needs_approval_routes_to_executor_with_approval(self):
        """Step with requires_human_approval=True routes to executor_with_approval."""
        plan = make_plan(steps=[make_step(requires_approval=True)])
        state = {"plan": plan, "current_step_index": 0}
        assert route_after_tools(state) == "executor_with_approval"

    def test_step_no_approval_routes_to_executor(self):
        """Step without approval requirement routes to executor."""
        plan = make_plan(steps=[make_step(requires_approval=False)])
        state = {"plan": plan, "current_step_index": 0}
        assert route_after_tools(state) == "executor"

    def test_index_out_of_bounds_defaults_to_executor(self):
        """Out-of-bounds index fails the bounds check and falls through to executor."""
        plan = make_plan(steps=[make_step()])
        state = {"plan": plan, "current_step_index": 99}
        assert route_after_tools(state) == "executor"


# ---------------------------------------------------------------------------
# TestShouldExecuteNextStep
# ---------------------------------------------------------------------------


class TestShouldExecuteNextStep:
    def test_no_plan_routes_to_end(self):
        """No plan routes to end."""
        assert should_execute_next_step({}) == "end"

    def test_plan_complete_routes_to_end(self):
        """plan.is_complete=True routes to end."""
        plan = make_plan(steps=[make_step()], is_complete=True)
        state = {"plan": plan, "current_step_index": 0}
        assert should_execute_next_step(state) == "end"

    def test_index_at_end_routes_to_end(self):
        """current_index >= len(steps) routes to end."""
        plan = make_plan(steps=[make_step()])
        state = {"plan": plan, "current_step_index": 1}
        assert should_execute_next_step(state) == "end"

    def test_next_step_needs_approval(self):
        """Step with requires_human_approval=True routes to executor_with_approval."""
        plan = make_plan(steps=[make_step(requires_approval=True)])
        state = {"plan": plan, "current_step_index": 0}
        assert should_execute_next_step(state) == "executor_with_approval"

    def test_next_step_no_approval(self):
        """Step without approval requirement routes to executor."""
        plan = make_plan(steps=[make_step(requires_approval=False)])
        state = {"plan": plan, "current_step_index": 0}
        assert should_execute_next_step(state) == "executor"
