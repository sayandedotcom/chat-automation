"""
Tests for HITL (Human-in-the-Loop) approval flow.

Covers:
- handle_approval_decision: skip, approve (with/without pending msg), edit (with/without pending msg)
- request_approval: sets awaiting_approval, generates tool preview, enriches spreadsheet
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from langchain_core.messages import AIMessage, message_to_dict

from chat.schemas import WorkflowPlan, WorkflowStep
from chat.workflow.executor.nodes import handle_approval_decision, request_approval


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_step(step_number: int = 1, requires_approval: bool = True) -> WorkflowStep:
    return WorkflowStep(
        step_number=step_number,
        description="Send an email",
        requires_human_approval=requires_approval,
        approval_reason="Sends data externally",
    )


def make_plan(steps=None) -> WorkflowPlan:
    if steps is None:
        steps = [make_step()]
    return WorkflowPlan(original_request="Send email", steps=steps)


def make_ai_with_tool_calls(tool_id: str = "call_1") -> AIMessage:
    return AIMessage(
        content="",
        id="msg_abc",
        tool_calls=[
            {
                "name": "send_gmail",
                "args": {"to": "alice@example.com", "subject": "Hello", "body": "Hi"},
                "id": tool_id,
                "type": "tool_call",
            }
        ],
    )


# ---------------------------------------------------------------------------
# handle_approval_decision
# ---------------------------------------------------------------------------


class TestHandleApprovalDecision:
    @pytest.fixture
    def fns(self):
        """Return only the keyword-arg functions (no helper keys)."""
        fake_ai = AIMessage(content="Re-executed!")
        fake_chat = [MagicMock(), fake_ai]
        return {
            "get_previous_results_fn": MagicMock(return_value="step 1 results"),
            "apply_edited_args_fn": MagicMock(side_effect=lambda msg, content: msg),
            "start_step_execution_fn": AsyncMock(return_value=(fake_ai, fake_chat)),
            # stored separately so tests can inspect it
            "_fake_ai": fake_ai,
        }

    def _call_fns(self, fns: dict) -> dict:
        """Return only the keys that are valid keyword args for handle_approval_decision."""
        return {k: v for k, v in fns.items() if not k.startswith("_")}

    # --- skip ---

    @pytest.mark.asyncio
    async def test_skip_marks_step_skipped(self, fns):
        """skip action marks step as skipped and clears approval state."""
        plan = make_plan()
        step = plan.steps[0]
        state = {"artifacts": [], "current_step_index": 0, "conversation_summary": ""}
        decision = {"action": "skip"}

        result = await handle_approval_decision(
            state, plan, step, decision, **self._call_fns(fns)
        )

        assert step.status == "skipped"
        assert step.result == "Skipped by user"
        assert result["awaiting_approval"] is False
        assert result["approval_decision"] is None
        assert result["_executor_chat"] is None
        assert result["_step_tool_calls"] == 0

    @pytest.mark.asyncio
    async def test_skip_does_not_call_start_execution(self, fns):
        """skip action short-circuits without calling LLM."""
        plan = make_plan()
        step = plan.steps[0]
        state = {"artifacts": [], "current_step_index": 0, "conversation_summary": ""}

        await handle_approval_decision(
            state, plan, step, {"action": "skip"}, **self._call_fns(fns)
        )

        fns["start_step_execution_fn"].assert_not_awaited()

    # --- approve with pending message ---

    @pytest.mark.asyncio
    async def test_approve_with_pending_msg_re_executes_stored_tool_calls(self, fns):
        """approve with _pending_tool_calls_message re-uses stored AIMessage instead of re-running LLM."""
        plan = make_plan()
        step = plan.steps[0]
        ai_msg = make_ai_with_tool_calls()
        pending = message_to_dict(ai_msg)

        state = {
            "artifacts": [],
            "current_step_index": 0,
            "conversation_summary": "",
            "_pending_tool_calls_message": pending,
            "_executor_chat": [],
        }

        result = await handle_approval_decision(
            state, plan, step, {"action": "approve"}, **self._call_fns(fns)
        )

        # Should NOT call start_step_execution_fn since pending msg exists
        fns["start_step_execution_fn"].assert_not_awaited()
        assert result["awaiting_approval"] is False
        assert result["_pending_tool_calls_message"] is None
        assert result["_step_tool_calls"] == 0

    @pytest.mark.asyncio
    async def test_approve_without_pending_msg_reruns_llm(self, fns):
        """approve without _pending_tool_calls_message falls back to full re-execution."""
        plan = make_plan()
        step = plan.steps[0]
        state = {
            "artifacts": [],
            "current_step_index": 0,
            "conversation_summary": "",
            "_pending_tool_calls_message": None,
            "initial_integrations": [],
        }

        result = await handle_approval_decision(
            state, plan, step, {"action": "approve"}, **self._call_fns(fns)
        )

        fns["start_step_execution_fn"].assert_awaited_once()
        assert result["awaiting_approval"] is False

    # --- edit with pending message ---

    @pytest.mark.asyncio
    async def test_edit_with_pending_msg_applies_edits(self, fns):
        """edit action with pending msg calls apply_edited_args_fn then uses that message."""
        plan = make_plan()
        step = plan.steps[0]
        ai_msg = make_ai_with_tool_calls()
        pending = message_to_dict(ai_msg)
        edited_content = {
            "tool_calls": [{"id": "call_1", "arguments": {"subject": "Updated"}}]
        }

        state = {
            "artifacts": [],
            "current_step_index": 0,
            "conversation_summary": "",
            "_pending_tool_calls_message": pending,
            "_executor_chat": [],
        }

        result = await handle_approval_decision(
            state,
            plan,
            step,
            {"action": "edit", "content": edited_content},
            **self._call_fns(fns),
        )

        fns["apply_edited_args_fn"].assert_called_once()
        fns["start_step_execution_fn"].assert_not_awaited()
        assert result["awaiting_approval"] is False

    @pytest.mark.asyncio
    async def test_edit_without_pending_msg_passes_content_to_start_execution(
        self, fns
    ):
        """edit without pending msg calls start_step_execution_fn with approved_content kwarg."""
        plan = make_plan()
        step = plan.steps[0]
        edited_content = {"subject": "New subject"}

        state = {
            "artifacts": [],
            "current_step_index": 0,
            "conversation_summary": "",
            "_pending_tool_calls_message": None,
            "initial_integrations": [],
        }

        result = await handle_approval_decision(
            state,
            plan,
            step,
            {"action": "edit", "content": edited_content},
            **self._call_fns(fns),
        )

        fns["start_step_execution_fn"].assert_awaited_once()
        call_kwargs = fns["start_step_execution_fn"].call_args.kwargs
        assert call_kwargs.get("approved_content") == edited_content
        assert result["awaiting_approval"] is False

    # --- state clearing ---

    @pytest.mark.asyncio
    async def test_approve_clears_all_approval_state_fields(self, fns):
        """Approval resets all HITL state fields."""
        plan = make_plan()
        step = plan.steps[0]
        ai_msg = make_ai_with_tool_calls()
        pending = message_to_dict(ai_msg)

        state = {
            "artifacts": [],
            "current_step_index": 0,
            "conversation_summary": "",
            "_pending_tool_calls_message": pending,
            "_executor_chat": [MagicMock()],
        }

        result = await handle_approval_decision(
            state, plan, step, {"action": "approve"}, **self._call_fns(fns)
        )

        assert result["awaiting_approval"] is False
        assert result["approval_step_info"] is None
        assert result["approval_decision"] is None
        assert result["_pending_tool_calls_message"] is None


# ---------------------------------------------------------------------------
# request_approval
# ---------------------------------------------------------------------------


class TestRequestApproval:
    @pytest.fixture
    def fns(self):
        """Return only the keyword-arg functions (no helper keys)."""
        ai_msg = make_ai_with_tool_calls()
        fake_chat = [MagicMock(), ai_msg]
        return {
            "get_previous_results_fn": MagicMock(return_value=""),
            "resolve_tool_integration_fn": MagicMock(return_value="gmail"),
            "generate_spreadsheet_structure_fn": AsyncMock(
                return_value={
                    "title": "Sheet",
                    "sheets": [{"name": "Sheet1", "columns": []}],
                }
            ),
            "start_step_execution_fn": AsyncMock(return_value=(ai_msg, fake_chat)),
            # stored separately so tests can inspect it
            "_ai_msg": ai_msg,
        }

    def _call_fns(self, fns: dict) -> dict:
        """Return only the keys that are valid keyword args for request_approval."""
        return {k: v for k, v in fns.items() if not k.startswith("_")}

    def _base_state(self) -> dict:
        return {
            "artifacts": [],
            "current_step_index": 0,
            "conversation_summary": "",
            "initial_integrations": [],
        }

    @pytest.mark.asyncio
    async def test_sets_awaiting_approval_true(self, fns):
        """request_approval always sets awaiting_approval=True."""
        plan = make_plan()
        step = plan.steps[0]

        result = await request_approval(
            _state := self._base_state(), plan, step, **self._call_fns(fns)
        )

        assert result["awaiting_approval"] is True

    @pytest.mark.asyncio
    async def test_sets_step_status_to_awaiting_approval(self, fns):
        """Step status is set to awaiting_approval before LLM call."""
        plan = make_plan()
        step = plan.steps[0]

        await request_approval(self._base_state(), plan, step, **self._call_fns(fns))

        assert step.status == "awaiting_approval"

    @pytest.mark.asyncio
    async def test_tool_calls_are_included_in_approval_step_info(self, fns):
        """approval_step_info contains tool_calls extracted from LLM response."""
        plan = make_plan()
        step = plan.steps[0]

        result = await request_approval(
            self._base_state(), plan, step, **self._call_fns(fns)
        )

        info = result["approval_step_info"]
        assert info["type"] == "approval_required"
        assert info["step_number"] == step.step_number
        assert len(info["tool_calls"]) == 1
        assert info["tool_calls"][0]["tool_name"] == "send_gmail"
        assert info["tool_calls"][0]["integration"] == "gmail"

    @pytest.mark.asyncio
    async def test_pending_tool_calls_message_is_serialized(self, fns):
        """_pending_tool_calls_message is stored as a dict (for checkpointer serialization)."""
        plan = make_plan()
        step = plan.steps[0]

        result = await request_approval(
            self._base_state(), plan, step, **self._call_fns(fns)
        )

        assert isinstance(result["_pending_tool_calls_message"], dict)

    @pytest.mark.asyncio
    async def test_approval_step_info_includes_actions_list(self, fns):
        """approval_step_info always includes approve/edit/skip actions."""
        plan = make_plan()
        step = plan.steps[0]

        result = await request_approval(
            self._base_state(), plan, step, **self._call_fns(fns)
        )

        assert set(result["approval_step_info"]["actions"]) == {
            "approve",
            "edit",
            "skip",
        }

    @pytest.mark.asyncio
    async def test_no_tool_calls_from_llm_yields_empty_tool_preview(self, fns):
        """If LLM returns no tool_calls, tool preview is empty but awaiting_approval is still True."""
        plan = make_plan()
        step = plan.steps[0]
        ai_no_tools = AIMessage(content="I'll just write the email.", tool_calls=[])
        fake_chat = [MagicMock(), ai_no_tools]
        fns["start_step_execution_fn"].return_value = (ai_no_tools, fake_chat)

        result = await request_approval(
            self._base_state(), plan, step, **self._call_fns(fns)
        )

        assert result["awaiting_approval"] is True
        assert result["approval_step_info"]["tool_calls"] == []
        assert result["_pending_tool_calls_message"] is None

    @pytest.mark.asyncio
    async def test_spreadsheet_enrichment_called_for_create_spreadsheet(self, fns):
        """create_spreadsheet tool calls without sheets/headers trigger enrichment."""
        step = WorkflowStep(
            step_number=1,
            description="Create a spreadsheet",
            requires_human_approval=True,
            approval_reason="Creates a spreadsheet",
        )
        ai_sheet = AIMessage(
            content="",
            id="msg_sheet",
            tool_calls=[
                {
                    "name": "create_spreadsheet",
                    "args": {"title": "My Sheet"},
                    "id": "call_s",
                    "type": "tool_call",
                }
            ],
        )
        fake_chat = [MagicMock(), ai_sheet]
        fns["start_step_execution_fn"].return_value = (ai_sheet, fake_chat)
        fns["resolve_tool_integration_fn"].return_value = "google_sheets"

        plan_with_sheet = WorkflowPlan(
            original_request="create spreadsheet", steps=[step]
        )
        result = await request_approval(
            self._base_state(), plan_with_sheet, step, **self._call_fns(fns)
        )

        fns["generate_spreadsheet_structure_fn"].assert_awaited_once()
        tool_call_preview = result["approval_step_info"]["tool_calls"][0]
        assert "sheets" in tool_call_preview["arguments"]

    @pytest.mark.asyncio
    async def test_spreadsheet_enrichment_skipped_if_sheets_already_present(self, fns):
        """create_spreadsheet tool calls that already have sheets skip enrichment."""
        step = WorkflowStep(
            step_number=1,
            description="Create a spreadsheet",
            requires_human_approval=True,
            approval_reason="Creates a spreadsheet",
        )
        ai_sheet = AIMessage(
            content="",
            id="msg_sheet",
            tool_calls=[
                {
                    "name": "create_spreadsheet",
                    "args": {
                        "title": "My Sheet",
                        "sheets": [{"name": "Sheet1", "columns": []}],
                    },
                    "id": "call_s",
                    "type": "tool_call",
                }
            ],
        )
        fake_chat = [MagicMock(), ai_sheet]
        fns["start_step_execution_fn"].return_value = (ai_sheet, fake_chat)
        fns["resolve_tool_integration_fn"].return_value = "google_sheets"

        plan_with_sheet = WorkflowPlan(
            original_request="create spreadsheet", steps=[step]
        )
        await request_approval(
            self._base_state(), plan_with_sheet, step, **self._call_fns(fns)
        )

        fns["generate_spreadsheet_structure_fn"].assert_not_awaited()

    @pytest.mark.asyncio
    async def test_llm_exception_still_returns_awaiting_approval(self, fns):
        """If start_step_execution_fn raises, request_approval still returns awaiting_approval=True with empty preview."""
        plan = make_plan()
        step = plan.steps[0]
        fns["start_step_execution_fn"].side_effect = Exception("LLM unavailable")

        result = await request_approval(
            self._base_state(), plan, step, **self._call_fns(fns)
        )

        assert result["awaiting_approval"] is True
        assert result["approval_step_info"]["tool_calls"] == []
