"""
Tests for schemas.py — Pydantic models and the add_artifacts reducer.
"""

import pytest
from pydantic import ValidationError

from chat.schemas import (
    add_artifacts,
    Artifact,
    WorkflowStep,
    WorkflowPlan,
    PlannedStep,
)


# ---------------------------------------------------------------------------
# TestAddArtifactsReducer
# ---------------------------------------------------------------------------


class TestAddArtifactsReducer:
    def test_both_none_returns_empty(self):
        """add_artifacts(None, None) returns empty list."""
        assert add_artifacts(None, None) == []

    def test_existing_none_uses_new(self):
        """add_artifacts(None, [item]) returns the new list."""
        item = {"type": "document", "name": "Doc"}
        assert add_artifacts(None, [item]) == [item]

    def test_new_none_preserves_existing(self):
        """add_artifacts([item], None) returns the existing list."""
        item = {"type": "document", "name": "Doc"}
        assert add_artifacts([item], None) == [item]

    def test_both_empty(self):
        """add_artifacts([], []) returns empty list."""
        assert add_artifacts([], []) == []

    def test_appends_new_to_existing(self):
        """Existing and new items are combined in order."""
        existing = [{"name": "A"}]
        new = [{"name": "B"}]
        result = add_artifacts(existing, new)
        assert result == [{"name": "A"}, {"name": "B"}]

    def test_does_not_mutate_existing(self):
        """Original existing list is not mutated."""
        existing = [{"name": "A"}]
        new = [{"name": "B"}]
        add_artifacts(existing, new)
        assert existing == [{"name": "A"}]


# ---------------------------------------------------------------------------
# TestArtifactModel
# ---------------------------------------------------------------------------


class TestArtifactModel:
    def _base(self, **kwargs) -> dict:
        return {
            "type": "document",
            "name": "My Doc",
            "integration": "google_docs",
            "step_number": 1,
            **kwargs,
        }

    def test_required_fields(self):
        """type, name, integration, and step_number are required."""
        a = Artifact(**self._base())
        assert a.type == "document"
        assert a.name == "My Doc"
        assert a.integration == "google_docs"
        assert a.step_number == 1

    def test_optional_url_defaults_none(self):
        """url defaults to None when not provided."""
        a = Artifact(**self._base())
        assert a.url is None

    def test_optional_id_defaults_none(self):
        """id defaults to None when not provided."""
        a = Artifact(**self._base())
        assert a.id is None

    def test_default_turn_number_is_1(self):
        """turn_number defaults to 1."""
        a = Artifact(**self._base())
        assert a.turn_number == 1

    def test_metadata_defaults_empty_dict(self):
        """metadata defaults to empty dict."""
        a = Artifact(**self._base())
        assert a.metadata == {}

    def test_model_dump_round_trip(self):
        """model_dump() produces a dict that recreates an identical model."""
        a = Artifact(**self._base(url="https://example.com", id="doc-1", turn_number=2))
        dumped = a.model_dump()
        a2 = Artifact(**dumped)
        assert a == a2


# ---------------------------------------------------------------------------
# TestWorkflowStep
# ---------------------------------------------------------------------------


class TestWorkflowStep:
    def _base(self, **kwargs) -> dict:
        return {"step_number": 1, "description": "Do something", **kwargs}

    def test_required_fields(self):
        """step_number and description are required."""
        step = WorkflowStep(**self._base())
        assert step.step_number == 1
        assert step.description == "Do something"

    def test_default_status_is_pending(self):
        """status defaults to 'pending'."""
        step = WorkflowStep(**self._base())
        assert step.status == "pending"

    def test_default_approval_false(self):
        """requires_human_approval defaults to False."""
        step = WorkflowStep(**self._base())
        assert step.requires_human_approval is False

    def test_all_optional_fields_default_none_or_empty(self):
        """Optional fields default to None or empty containers."""
        step = WorkflowStep(**self._base())
        assert step.result is None
        assert step.error is None
        assert step.tools_used == []
        assert step.approval_reason is None

    def test_valid_status_values(self):
        """All valid Literal status values are accepted without error."""
        valid_statuses = (
            "pending",
            "in_progress",
            "awaiting_approval",
            "completed",
            "skipped",
            "failed",
        )
        for status in valid_statuses:
            step = WorkflowStep(**self._base(status=status))
            assert step.status == status


# ---------------------------------------------------------------------------
# TestWorkflowPlan
# ---------------------------------------------------------------------------


class TestWorkflowPlan:
    def test_required_original_request(self):
        """original_request is required and stored correctly."""
        plan = WorkflowPlan(original_request="Do the thing")
        assert plan.original_request == "Do the thing"

    def test_default_is_complete_false(self):
        """is_complete defaults to False."""
        plan = WorkflowPlan(original_request="Do the thing")
        assert plan.is_complete is False

    def test_default_empty_steps(self):
        """steps defaults to an empty list."""
        plan = WorkflowPlan(original_request="Do the thing")
        assert plan.steps == []

    def test_steps_stored(self):
        """Provided steps are stored on the plan."""
        step = WorkflowStep(step_number=1, description="Step one")
        plan = WorkflowPlan(original_request="Do the thing", steps=[step])
        assert len(plan.steps) == 1
        assert plan.steps[0].description == "Step one"

    def test_is_complete_flag(self):
        """is_complete can be explicitly set to True."""
        plan = WorkflowPlan(original_request="Do the thing", is_complete=True)
        assert plan.is_complete is True


# ---------------------------------------------------------------------------
# TestPlannedStep
# ---------------------------------------------------------------------------


class TestPlannedStep:
    def test_requires_human_approval_required(self):
        """requires_human_approval has no default — omitting it raises ValidationError."""
        with pytest.raises(ValidationError):
            PlannedStep(description="Do something", approval_reason="Just because")

    def test_approval_reason_required(self):
        """approval_reason has no default — omitting it raises ValidationError."""
        with pytest.raises(ValidationError):
            PlannedStep(description="Do something", requires_human_approval=True)

    def test_valid_planned_step(self):
        """All three required fields present — no error raised."""
        step = PlannedStep(
            description="Send the email",
            requires_human_approval=True,
            approval_reason="Sends a message to an external recipient",
        )
        assert step.requires_human_approval is True
        assert "email" in step.description
