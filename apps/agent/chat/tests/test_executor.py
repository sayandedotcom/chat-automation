"""
Tests for workflow/executor/nodes.py

Covers:
- run_executor: normal first execution, multi-hop continuation, error recovery
- run_executor_with_approval: routes to request_approval or handle_approval_decision
- continue_after_tools: counter increment, chat extension
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from chat.schemas import WorkflowPlan, WorkflowStep
from chat.workflow.executor.nodes import (
    run_executor,
    run_executor_with_approval,
    continue_after_tools,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_step(step_number: int = 1, requires_approval: bool = False) -> WorkflowStep:
    return WorkflowStep(
        step_number=step_number,
        description=f"Step {step_number}",
        requires_human_approval=requires_approval,
    )


def make_plan(steps=None) -> WorkflowPlan:
    if steps is None:
        steps = [make_step()]
    return WorkflowPlan(original_request="test request", steps=steps)


def make_tool_message(
    content: str = "result", tool_call_id: str = "call_1"
) -> ToolMessage:
    return ToolMessage(content=content, tool_call_id=tool_call_id)


def make_ai_with_tool_calls() -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[
            {"name": "some_tool", "args": {}, "id": "call_1", "type": "tool_call"}
        ],
    )


# ---------------------------------------------------------------------------
# run_executor
# ---------------------------------------------------------------------------


class TestRunExecutor:
    @pytest.fixture
    def mock_fns(self):
        fake_ai = AIMessage(content="Step done!")
        fake_chat = [_SystemMsg := MagicMock(), fake_ai]

        return {
            "continue_after_tools_fn": AsyncMock(return_value={"messages": [fake_ai]}),
            "get_previous_results_fn": MagicMock(return_value="None yet"),
            "start_step_execution_fn": AsyncMock(return_value=(fake_ai, fake_chat)),
            "try_incremental_load_fn": AsyncMock(
                return_value=(fake_ai, fake_chat, [], [], [], None, None)
            ),
            "_fake_ai": fake_ai,
        }

    @pytest.mark.asyncio
    async def test_first_execution_calls_start_step(self, mock_fns):
        """Normal first execution: no _executor_chat, calls start_step_execution_fn."""
        plan = make_plan()
        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [HumanMessage(content="Do the thing")],
            "artifacts": [],
            "initial_integrations": [],
            "conversation_summary": "",
            "incremental_load_events": [],
        }

        result = await run_executor(
            state,
            continue_after_tools_fn=mock_fns["continue_after_tools_fn"],
            get_previous_results_fn=mock_fns["get_previous_results_fn"],
            start_step_execution_fn=mock_fns["start_step_execution_fn"],
            try_incremental_load_fn=mock_fns["try_incremental_load_fn"],
        )

        mock_fns["start_step_execution_fn"].assert_awaited_once()
        mock_fns["continue_after_tools_fn"].assert_not_awaited()
        assert result["messages"] == [mock_fns["_fake_ai"]]
        assert result["_step_tool_calls"] == 0

    @pytest.mark.asyncio
    async def test_multi_hop_continuation_when_tool_message_last(self, mock_fns):
        """If _executor_chat is set AND last message is ToolMessage, delegate to continue_after_tools_fn."""
        plan = make_plan()
        tool_msg = make_tool_message()
        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [HumanMessage(content="x"), tool_msg],
            "_executor_chat": [MagicMock()],
            "artifacts": [],
            "initial_integrations": [],
            "conversation_summary": "",
            "incremental_load_events": [],
        }

        await run_executor(
            state,
            continue_after_tools_fn=mock_fns["continue_after_tools_fn"],
            get_previous_results_fn=mock_fns["get_previous_results_fn"],
            start_step_execution_fn=mock_fns["start_step_execution_fn"],
            try_incremental_load_fn=mock_fns["try_incremental_load_fn"],
        )

        mock_fns["continue_after_tools_fn"].assert_awaited_once_with(state)
        mock_fns["start_step_execution_fn"].assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_continuation_when_last_message_not_tool(self, mock_fns):
        """_executor_chat set but last message is not ToolMessage → fresh execution."""
        plan = make_plan()
        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [AIMessage(content="some prior")],
            "_executor_chat": [MagicMock()],
            "artifacts": [],
            "initial_integrations": [],
            "conversation_summary": "",
            "incremental_load_events": [],
        }

        await run_executor(
            state,
            continue_after_tools_fn=mock_fns["continue_after_tools_fn"],
            get_previous_results_fn=mock_fns["get_previous_results_fn"],
            start_step_execution_fn=mock_fns["start_step_execution_fn"],
            try_incremental_load_fn=mock_fns["try_incremental_load_fn"],
        )

        mock_fns["continue_after_tools_fn"].assert_not_awaited()
        mock_fns["start_step_execution_fn"].assert_awaited_once()

    @pytest.mark.asyncio
    async def test_no_plan_returns_workflow_complete(self, mock_fns):
        """No plan in state → immediate workflow complete message."""
        state = {
            "plan": None,
            "current_step_index": 0,
            "messages": [],
            "artifacts": [],
            "initial_integrations": [],
            "conversation_summary": "",
            "incremental_load_events": [],
        }

        result = await run_executor(
            state,
            continue_after_tools_fn=mock_fns["continue_after_tools_fn"],
            get_previous_results_fn=mock_fns["get_previous_results_fn"],
            start_step_execution_fn=mock_fns["start_step_execution_fn"],
            try_incremental_load_fn=mock_fns["try_incremental_load_fn"],
        )

        mock_fns["start_step_execution_fn"].assert_not_awaited()
        assert any("complete" in m.content.lower() for m in result["messages"])

    @pytest.mark.asyncio
    async def test_index_beyond_plan_returns_workflow_complete(self, mock_fns):
        """current_step_index >= len(steps) → immediate workflow complete."""
        plan = make_plan(steps=[make_step(1)])
        state = {
            "plan": plan,
            "current_step_index": 5,
            "messages": [],
            "artifacts": [],
            "initial_integrations": [],
            "conversation_summary": "",
            "incremental_load_events": [],
        }

        result = await run_executor(
            state,
            continue_after_tools_fn=mock_fns["continue_after_tools_fn"],
            get_previous_results_fn=mock_fns["get_previous_results_fn"],
            start_step_execution_fn=mock_fns["start_step_execution_fn"],
            try_incremental_load_fn=mock_fns["try_incremental_load_fn"],
        )

        mock_fns["start_step_execution_fn"].assert_not_awaited()
        assert result["messages"]

    @pytest.mark.asyncio
    async def test_error_recovery_calls_try_incremental_load(self, mock_fns):
        """If start_step_execution_fn raises, try_incremental_load_fn is called."""
        plan = make_plan()
        mock_fns["start_step_execution_fn"].side_effect = Exception(
            "Tool 'foo' not found"
        )
        fake_ai = AIMessage(content="Recovered!")
        fake_chat = [MagicMock(), fake_ai]
        # run_executor unpacks exactly 4 values from try_incremental_load_fn
        mock_fns["try_incremental_load_fn"].return_value = (fake_ai, fake_chat, [], [])

        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [HumanMessage(content="do thing")],
            "artifacts": [],
            "initial_integrations": [],
            "conversation_summary": "",
            "incremental_load_events": [],
        }

        result = await run_executor(
            state,
            continue_after_tools_fn=mock_fns["continue_after_tools_fn"],
            get_previous_results_fn=mock_fns["get_previous_results_fn"],
            start_step_execution_fn=mock_fns["start_step_execution_fn"],
            try_incremental_load_fn=mock_fns["try_incremental_load_fn"],
        )

        mock_fns["try_incremental_load_fn"].assert_awaited_once()
        assert result["messages"] == [fake_ai]

    @pytest.mark.asyncio
    async def test_step_status_set_to_in_progress(self, mock_fns):
        """Executor marks current step as in_progress before LLM call."""
        plan = make_plan()
        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [HumanMessage(content="go")],
            "artifacts": [],
            "initial_integrations": [],
            "conversation_summary": "",
            "incremental_load_events": [],
        }

        await run_executor(
            state,
            continue_after_tools_fn=mock_fns["continue_after_tools_fn"],
            get_previous_results_fn=mock_fns["get_previous_results_fn"],
            start_step_execution_fn=mock_fns["start_step_execution_fn"],
            try_incremental_load_fn=mock_fns["try_incremental_load_fn"],
        )

        assert plan.steps[0].status == "in_progress"

    @pytest.mark.asyncio
    async def test_incremental_load_events_included_in_result(self, mock_fns):
        """If try_incremental_load returns events, result includes them."""
        plan = make_plan()
        mock_fns["start_step_execution_fn"].side_effect = Exception(
            "Tool 'foo' not found"
        )
        fake_ai = AIMessage(content="ok")
        fake_chat = [MagicMock(), fake_ai]
        events = [
            {
                "integration": "google_docs",
                "display_name": "Google Docs",
                "tools_added": 5,
                "triggered_by_tool": "create_document",
            }
        ]
        # run_executor unpacks exactly 4 values from try_incremental_load_fn
        mock_fns["try_incremental_load_fn"].return_value = (
            fake_ai,
            fake_chat,
            ["google_docs"],
            events,
        )

        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [HumanMessage(content="go")],
            "artifacts": [],
            "initial_integrations": [],
            "conversation_summary": "",
            "incremental_load_events": [],
        }

        result = await run_executor(
            state,
            continue_after_tools_fn=mock_fns["continue_after_tools_fn"],
            get_previous_results_fn=mock_fns["get_previous_results_fn"],
            start_step_execution_fn=mock_fns["start_step_execution_fn"],
            try_incremental_load_fn=mock_fns["try_incremental_load_fn"],
        )

        assert "incremental_load_events" in result
        assert result["incremental_load_events"] == events


# ---------------------------------------------------------------------------
# run_executor_with_approval
# ---------------------------------------------------------------------------


class TestRunExecutorWithApproval:
    @pytest.fixture
    def mock_fns(self):
        return {
            "continue_after_tools_fn": AsyncMock(
                return_value={"messages": [AIMessage(content="cont")]}
            ),
            "handle_approval_decision_fn": AsyncMock(
                return_value={"awaiting_approval": False}
            ),
            "request_approval_fn": AsyncMock(return_value={"awaiting_approval": True}),
        }

    @pytest.mark.asyncio
    async def test_no_decision_calls_request_approval(self, mock_fns):
        """No approval_decision in state → request_approval_fn is called."""
        plan = make_plan(steps=[make_step(1, requires_approval=True)])
        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [HumanMessage(content="do it")],
            "approval_decision": None,
        }

        await run_executor_with_approval(state, **mock_fns)

        mock_fns["request_approval_fn"].assert_awaited_once_with(
            state, plan, plan.steps[0]
        )
        mock_fns["handle_approval_decision_fn"].assert_not_awaited()

    @pytest.mark.asyncio
    async def test_with_decision_calls_handle_approval(self, mock_fns):
        """approval_decision in state → handle_approval_decision_fn is called."""
        plan = make_plan(steps=[make_step(1, requires_approval=True)])
        decision = {"action": "approve"}
        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [HumanMessage(content="do it")],
            "approval_decision": decision,
        }

        await run_executor_with_approval(state, **mock_fns)

        mock_fns["handle_approval_decision_fn"].assert_awaited_once_with(
            state, plan, plan.steps[0], decision
        )
        mock_fns["request_approval_fn"].assert_not_awaited()

    @pytest.mark.asyncio
    async def test_tool_message_continuation_takes_priority(self, mock_fns):
        """If _executor_chat is set AND last msg is ToolMessage, continue_after_tools_fn takes priority."""
        plan = make_plan(steps=[make_step(1, requires_approval=True)])
        tool_msg = make_tool_message()
        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [HumanMessage(content="x"), tool_msg],
            "_executor_chat": [MagicMock()],
            "approval_decision": {"action": "approve"},  # should be ignored
        }

        await run_executor_with_approval(state, **mock_fns)

        mock_fns["continue_after_tools_fn"].assert_awaited_once_with(state)
        mock_fns["handle_approval_decision_fn"].assert_not_awaited()
        mock_fns["request_approval_fn"].assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_plan_returns_workflow_complete(self, mock_fns):
        """No plan → immediate completion response."""
        state = {
            "plan": None,
            "current_step_index": 0,
            "messages": [],
            "approval_decision": None,
        }

        result = await run_executor_with_approval(state, **mock_fns)

        mock_fns["request_approval_fn"].assert_not_awaited()
        mock_fns["handle_approval_decision_fn"].assert_not_awaited()
        assert result["messages"]


# ---------------------------------------------------------------------------
# continue_after_tools
# ---------------------------------------------------------------------------


class TestContinueAfterTools:
    def _make_executor(self, response: AIMessage):
        """Create a mock executor_with_tools object with astream support."""
        mock = MagicMock()
        mock._astream_calls = []

        async def _fake_astream(messages, config=None):
            mock._astream_calls.append(messages)
            yield response

        mock.astream = _fake_astream
        return mock

    @pytest.mark.asyncio
    async def test_appends_tool_messages_to_executor_chat(self):
        """Tool messages from state are appended to executor_chat before re-invoking LLM."""
        tool_msg1 = make_tool_message("r1", "call_1")
        tool_msg2 = make_tool_message("r2", "call_2")
        prior_ai = AIMessage(content="")
        executor_chat = [MagicMock(), prior_ai]

        fake_response = AIMessage(content="Final answer")
        mock_executor = self._make_executor(fake_response)

        plan = make_plan()
        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [HumanMessage("q"), tool_msg1, tool_msg2],
            "_executor_chat": executor_chat,
            "_step_tool_calls": 3,
        }

        await continue_after_tools(state, mock_executor)

        # Verify both tool messages were passed to LLM via astream
        called_chat = mock_executor._astream_calls[0]
        tool_messages_in_chat = [m for m in called_chat if isinstance(m, ToolMessage)]
        assert len(tool_messages_in_chat) == 2

    @pytest.mark.asyncio
    async def test_increments_step_tool_calls_by_tool_message_count(self):
        """_step_tool_calls is incremented by number of ToolMessages appended."""
        tool_msg1 = make_tool_message("r1", "call_1")
        tool_msg2 = make_tool_message("r2", "call_2")
        executor_chat = [MagicMock()]

        fake_response = AIMessage(content="done")
        mock_executor = self._make_executor(fake_response)

        plan = make_plan()
        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [HumanMessage("q"), tool_msg1, tool_msg2],
            "_executor_chat": executor_chat,
            "_step_tool_calls": 4,
        }

        result = await continue_after_tools(state, mock_executor)

        # Should have incremented by 2 (number of tool messages)
        assert result["_step_tool_calls"] == 6

    @pytest.mark.asyncio
    async def test_only_trailing_tool_messages_are_appended(self):
        """Only ToolMessages at the END of messages are appended (not earlier ones)."""
        old_tool = make_tool_message("old", "call_0")
        some_ai = AIMessage(content="intermediate")
        new_tool = make_tool_message("new", "call_1")
        executor_chat = [MagicMock()]

        fake_response = AIMessage(content="ok")
        mock_executor = self._make_executor(fake_response)

        plan = make_plan()
        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [old_tool, some_ai, new_tool],
            "_executor_chat": executor_chat,
            "_step_tool_calls": 0,
        }

        result = await continue_after_tools(state, mock_executor)

        # Only 1 trailing tool message should be added
        assert result["_step_tool_calls"] == 1

    @pytest.mark.asyncio
    async def test_returns_response_in_messages(self):
        """Result contains the LLM response in 'messages' key."""
        tool_msg = make_tool_message("r", "call_1")
        executor_chat = [MagicMock()]

        fake_response = AIMessage(content="Final!")
        mock_executor = self._make_executor(fake_response)

        plan = make_plan()
        state = {
            "plan": plan,
            "current_step_index": 0,
            "messages": [HumanMessage("q"), tool_msg],
            "_executor_chat": executor_chat,
            "_step_tool_calls": 0,
        }

        result = await continue_after_tools(state, mock_executor)

        assert result["messages"] == [fake_response]
        assert result["plan"] is plan
