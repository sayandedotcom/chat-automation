"""
Tests for workflow/step_complete.py

Covers:
- run_step_complete: marks current step completed, extracts result from last AIMessage
- Advances current_step_index correctly
- Marks plan.is_complete when last step is done
- Resets executor state (_executor_chat, _step_tool_calls) after step
- Handles no plan / out-of-bounds index gracefully
"""

import pytest
from unittest.mock import patch

from langchain_core.messages import AIMessage, HumanMessage

from chat.schemas import WorkflowPlan, WorkflowStep
from chat.workflow.step_complete import run_step_complete


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_step(step_number: int = 1, description: str = "Do something") -> WorkflowStep:
    return WorkflowStep(step_number=step_number, description=description)


def make_plan(*descriptions: str) -> WorkflowPlan:
    steps = [make_step(i + 1, d) for i, d in enumerate(descriptions)]
    return WorkflowPlan(original_request="test", steps=steps)


def base_state(plan, current_index: int, messages=None) -> dict:
    return {
        "plan": plan,
        "current_step_index": current_index,
        "messages": messages or [],
        "artifacts": [],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestRunStepComplete:
    @pytest.mark.asyncio
    async def test_marks_step_completed(self):
        """Step status is set to 'completed'."""
        plan = make_plan("Search for info")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                HumanMessage(content="do it"),
                AIMessage(content="Found results."),
            ],
        )

        await run_step_complete(state)

        assert plan.steps[0].status == "completed"

    @pytest.mark.asyncio
    async def test_sets_step_result_from_last_ai_message(self):
        """Step result is set to content of last AIMessage."""
        plan = make_plan("Do something")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                HumanMessage(content="go"),
                AIMessage(content="Task completed successfully."),
            ],
        )

        await run_step_complete(state)

        assert plan.steps[0].result == "Task completed successfully."

    @pytest.mark.asyncio
    async def test_advances_current_step_index(self):
        """current_step_index increments by 1."""
        plan = make_plan("Step 1", "Step 2")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="step 1 done"),
            ],
        )

        result = await run_step_complete(state)

        assert result["current_step_index"] == 1

    @pytest.mark.asyncio
    async def test_marks_plan_complete_on_last_step(self):
        """When the last step completes, plan.is_complete is set to True."""
        plan = make_plan("Only step")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="All done!"),
            ],
        )

        await run_step_complete(state)

        assert plan.is_complete is True
        assert plan.final_summary == "All done!"

    @pytest.mark.asyncio
    async def test_not_complete_when_more_steps_remain(self):
        """plan.is_complete is NOT set when there are remaining steps."""
        plan = make_plan("Step 1", "Step 2")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="step 1 done"),
            ],
        )

        await run_step_complete(state)

        assert plan.is_complete is False

    @pytest.mark.asyncio
    async def test_resets_executor_chat_to_none(self):
        """_executor_chat is cleared after step completion."""
        plan = make_plan("Only step")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="done"),
            ],
        )

        result = await run_step_complete(state)

        assert result["_executor_chat"] is None

    @pytest.mark.asyncio
    async def test_resets_step_tool_calls_to_zero(self):
        """_step_tool_calls is reset to 0 after step completion."""
        plan = make_plan("Only step")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="done"),
            ],
        )

        result = await run_step_complete(state)

        assert result["_step_tool_calls"] == 0

    @pytest.mark.asyncio
    async def test_uses_fallback_result_when_no_ai_message(self):
        """If no AIMessage with content exists, result falls back to 'Step completed'."""
        plan = make_plan("Step 1")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                HumanMessage(content="go"),
            ],
        )

        await run_step_complete(state)

        assert plan.steps[0].result == "Step completed"

    @pytest.mark.asyncio
    async def test_no_plan_returns_empty_dict(self):
        """No plan in state → early return with empty dict."""
        state = {
            "plan": None,
            "current_step_index": 0,
            "messages": [],
            "artifacts": [],
        }

        result = await run_step_complete(state)

        assert result == {}

    @pytest.mark.asyncio
    async def test_index_beyond_plan_returns_empty_dict(self):
        """current_index >= len(steps) → early return with empty dict."""
        plan = make_plan("Step 1")
        state = base_state(plan, current_index=5, messages=[AIMessage(content="x")])

        result = await run_step_complete(state)

        assert result == {}

    @pytest.mark.asyncio
    async def test_transition_message_contains_next_step_description(self):
        """When more steps remain, transition message mentions the next step."""
        plan = make_plan("First step", "Second step")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="first done"),
            ],
        )

        result = await run_step_complete(state)

        transition_msg = result["messages"][0]
        assert "Second step" in transition_msg.content

    @pytest.mark.asyncio
    async def test_completion_message_contains_total_steps(self):
        """On final step completion, message mentions total steps count."""
        plan = make_plan("Step 1", "Step 2")
        state = base_state(
            plan,
            current_index=1,
            messages=[
                AIMessage(content="all done"),
            ],
        )

        result = await run_step_complete(state)

        completion_msg = result["messages"][0]
        assert "2" in completion_msg.content

    @pytest.mark.asyncio
    async def test_search_step_extracts_search_results(self):
        """Steps with 'search' in description trigger search results extraction."""
        plan = make_plan("Search for Python tutorials")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="Found: ..."),
            ],
        )

        with patch(
            "chat.workflow.step_complete.extract_search_results_from_messages"
        ) as mock_extract:
            mock_extract.return_value = []
            await run_step_complete(state)

        mock_extract.assert_called_once()

    @pytest.mark.asyncio
    async def test_non_search_step_skips_search_extraction(self):
        """Steps without 'search' in description do NOT trigger search results extraction."""
        plan = make_plan("Create a document")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="Doc created."),
            ],
        )

        with patch(
            "chat.workflow.step_complete.extract_search_results_from_messages"
        ) as mock_extract:
            await run_step_complete(state)

        mock_extract.assert_not_called()

    @pytest.mark.asyncio
    async def test_list_content_ai_message_is_joined(self):
        """AIMessage content that is a list of text blocks is joined with newlines."""
        plan = make_plan("Do task")
        ai_msg = AIMessage(
            content=[
                {"type": "text", "text": "Hello, "},
                {"type": "text", "text": "world!"},
            ]
        )
        state = base_state(plan, current_index=0, messages=[ai_msg])

        await run_step_complete(state)

        # step_complete joins text blocks with "\n"
        assert plan.steps[0].result == "Hello, \nworld!"
