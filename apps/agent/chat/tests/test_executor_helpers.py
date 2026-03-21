"""
Tests for workflow/executor/helpers.py

Covers:
- apply_edited_args: by-id edits, flat content, no tool_calls, partial edits
- get_previous_results: no prior steps, with results, with artifacts
- resolve_tool_integration: heuristic fallbacks, registry lookup
- extract_tool_name_from_error: pattern matching
"""

from langchain_core.messages import AIMessage

from chat.schemas import WorkflowPlan, WorkflowStep
from chat.workflow.executor.helpers import (
    apply_edited_args,
    get_previous_results,
    resolve_tool_integration,
    extract_tool_name_from_error,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_ai_with_tool_calls(
    tool_name: str = "send_gmail",
    args: dict = None,
    tool_id: str = "call_1",
) -> AIMessage:
    return AIMessage(
        content="",
        id="msg_1",
        tool_calls=[
            {
                "name": tool_name,
                "args": args or {"to": "bob@example.com", "subject": "Hi"},
                "id": tool_id,
                "type": "tool_call",
            }
        ],
    )


def make_plan_with_steps(*results: str) -> tuple[WorkflowPlan, list[WorkflowStep]]:
    steps = []
    for i, result in enumerate(results, start=1):
        step = WorkflowStep(
            step_number=i,
            description=f"Step {i}",
            status="completed" if result else "pending",
            result=result or None,
        )
        steps.append(step)
    plan = WorkflowPlan(original_request="test", steps=steps)
    return plan, steps


# ---------------------------------------------------------------------------
# apply_edited_args
# ---------------------------------------------------------------------------


class TestApplyEditedArgs:
    def test_by_id_merges_edits_into_matching_tool_call(self):
        """Edits keyed by tool call ID are merged into the matching tool call."""
        ai_msg = make_ai_with_tool_calls(
            tool_id="call_abc", args={"subject": "Old", "to": "x@y.com"}
        )
        edited = {
            "tool_calls": [{"id": "call_abc", "arguments": {"subject": "New Subject"}}]
        }

        result = apply_edited_args(ai_msg, edited)

        assert result.tool_calls[0]["args"]["subject"] == "New Subject"
        assert result.tool_calls[0]["args"]["to"] == "x@y.com"  # unchanged

    def test_by_id_ignores_unmatched_ids(self):
        """Edits for a different ID don't modify other tool calls."""
        ai_msg = make_ai_with_tool_calls(tool_id="call_1", args={"subject": "Original"})
        edited = {
            "tool_calls": [
                {"id": "call_999", "arguments": {"subject": "Should Not Apply"}}
            ]
        }

        result = apply_edited_args(ai_msg, edited)

        assert result.tool_calls[0]["args"]["subject"] == "Original"

    def test_flat_content_applied_to_first_tool_call(self):
        """When content is a flat dict (no 'tool_calls' key), it patches the first tool call."""
        ai_msg = make_ai_with_tool_calls(args={"subject": "Old", "body": "Old body"})
        edited = {"subject": "New Subject"}

        result = apply_edited_args(ai_msg, edited)

        assert result.tool_calls[0]["args"]["subject"] == "New Subject"
        assert result.tool_calls[0]["args"]["body"] == "Old body"  # unchanged

    def test_flat_content_only_applied_once(self):
        """Flat content only patches the first tool call even if multiple tool calls exist."""
        ai_msg = AIMessage(
            content="",
            id="msg",
            tool_calls=[
                {"name": "tool_a", "args": {"x": 1}, "id": "c1", "type": "tool_call"},
                {"name": "tool_b", "args": {"x": 1}, "id": "c2", "type": "tool_call"},
            ],
        )
        edited = {"x": 99}

        result = apply_edited_args(ai_msg, edited)

        assert result.tool_calls[0]["args"]["x"] == 99
        assert result.tool_calls[1]["args"]["x"] == 1  # unchanged

    def test_returns_new_ai_message_with_same_id(self):
        """Result is a new AIMessage with the same ID as the original."""
        ai_msg = make_ai_with_tool_calls()
        result = apply_edited_args(ai_msg, {"subject": "New"})

        assert isinstance(result, AIMessage)
        assert result.id == ai_msg.id

    def test_no_tool_calls_returns_original_unchanged(self):
        """If AIMessage has no tool_calls, the original is returned as-is."""
        ai_msg = AIMessage(content="plain text response", id="msg_plain")
        result = apply_edited_args(ai_msg, {"subject": "New"})

        assert result is ai_msg

    def test_multiple_tool_calls_by_id_all_patched(self):
        """Multiple tool calls can all be patched simultaneously via ID-keyed edits."""
        ai_msg = AIMessage(
            content="",
            id="msg",
            tool_calls=[
                {"name": "tool_a", "args": {"val": 1}, "id": "c1", "type": "tool_call"},
                {"name": "tool_b", "args": {"val": 2}, "id": "c2", "type": "tool_call"},
            ],
        )
        edited = {
            "tool_calls": [
                {"id": "c1", "arguments": {"val": 10}},
                {"id": "c2", "arguments": {"val": 20}},
            ]
        }

        result = apply_edited_args(ai_msg, edited)

        assert result.tool_calls[0]["args"]["val"] == 10
        assert result.tool_calls[1]["args"]["val"] == 20


# ---------------------------------------------------------------------------
# get_previous_results
# ---------------------------------------------------------------------------


class TestGetPreviousResults:
    def test_first_step_returns_none_yet_message(self):
        """current_index=0 means no prior steps → returns 'None yet' message."""
        plan, _ = make_plan_with_steps("result1")
        result = get_previous_results(plan, current_index=0)
        assert "None yet" in result

    def test_includes_results_of_completed_steps(self):
        """Results from completed steps are included in the output."""
        plan, _ = make_plan_with_steps("Search results found", "Doc created")
        result = get_previous_results(plan, current_index=2)

        assert "Search results found" in result
        assert "Doc created" in result

    def test_excludes_current_and_future_steps(self):
        """Only steps before current_index are included."""
        plan, steps = make_plan_with_steps("step1 done", "step2 done", "step3 result")
        result = get_previous_results(plan, current_index=2)

        assert "step1 done" in result
        assert "step2 done" in result
        assert "step3 result" not in result

    def test_steps_without_results_are_excluded(self):
        """Steps with no result are not included in the output."""
        plan, steps = make_plan_with_steps("", "Has result")
        result = get_previous_results(plan, current_index=2)

        assert "Step 1" not in result
        assert "Has result" in result

    def test_artifacts_included_for_steps_with_results(self):
        """Artifacts matching completed steps are included in the output."""
        plan, _ = make_plan_with_steps("Created document", "")
        artifacts = [
            {
                "type": "document",
                "name": "My Doc",
                "id": "doc_123",
                "url": "https://docs.google.com/d/doc_123",
                "step_number": 1,
            }
        ]
        result = get_previous_results(plan, current_index=1, artifacts=artifacts)

        assert "doc_123" in result
        assert "My Doc" in result

    def test_artifacts_for_other_steps_not_included(self):
        """Artifacts from non-matching step numbers are excluded."""
        plan, _ = make_plan_with_steps("Step 1 done", "Step 2 done")
        artifacts = [
            {
                "type": "document",
                "name": "Step2 Doc",
                "id": "doc_222",
                "step_number": 2,
            }
        ]
        # current_index=1 means only step 1 is "prior"
        result = get_previous_results(plan, current_index=1, artifacts=artifacts)

        assert "doc_222" not in result

    def test_no_artifacts_parameter_works(self):
        """get_previous_results works when artifacts param is not provided."""
        plan, _ = make_plan_with_steps("Result A")
        result = get_previous_results(plan, current_index=1)
        assert "Result A" in result


# ---------------------------------------------------------------------------
# resolve_tool_integration
# ---------------------------------------------------------------------------


class TestResolveToolIntegration:
    def test_gmail_heuristic(self):
        assert resolve_tool_integration("send_gmail_message", registry=None) == "gmail"

    def test_google_docs_heuristic(self):
        assert (
            resolve_tool_integration("create_document", registry=None) == "google_docs"
        )

    def test_google_sheets_heuristic(self):
        assert (
            resolve_tool_integration("create_spreadsheet", registry=None)
            == "google_sheets"
        )

    def test_google_slides_heuristic(self):
        assert (
            resolve_tool_integration("create_presentation", registry=None)
            == "google_slides"
        )

    def test_google_calendar_heuristic(self):
        assert (
            resolve_tool_integration("create_calendar_event", registry=None)
            == "google_calendar"
        )

    def test_google_drive_heuristic(self):
        assert (
            resolve_tool_integration("list_drive_files", registry=None)
            == "google_drive"
        )

    def test_notion_heuristic(self):
        assert resolve_tool_integration("create_notion_page", registry=None) == "notion"

    def test_slack_heuristic(self):
        assert resolve_tool_integration("send_slack_message", registry=None) == "slack"

    def test_github_heuristic(self):
        assert (
            resolve_tool_integration("create_github_issue", registry=None) == "github"
        )

    def test_web_search_heuristic(self):
        assert resolve_tool_integration("tavily_search", registry=None) == "web_search"

    def test_unknown_tool_returns_tool_name_lowercased(self):
        """Unknown tool names fall through and return the lowercased tool name."""
        assert resolve_tool_integration("UNKNOWN_TOOL", registry=None) == "unknown_tool"

    def test_registry_lookup_takes_priority_over_heuristic(self):
        """Registry lookup is used first; heuristic is only a fallback."""
        mock_registry = type(
            "R", (), {"get_integration_for_tool": lambda self, t: "custom_integration"}
        )()
        result = resolve_tool_integration("send_gmail_message", registry=mock_registry)
        assert result == "custom_integration"

    def test_registry_miss_falls_back_to_heuristic(self):
        """If registry returns None, heuristic fallback is used."""
        mock_registry = type(
            "R", (), {"get_integration_for_tool": lambda self, t: None}
        )()
        result = resolve_tool_integration("send_gmail_message", registry=mock_registry)
        assert result == "gmail"


# ---------------------------------------------------------------------------
# extract_tool_name_from_error
# ---------------------------------------------------------------------------


class TestExtractToolNameFromError:
    def test_extracts_tool_name_from_quoted_error(self):
        """Matches: tool 'foo_bar' not found pattern."""
        result = extract_tool_name_from_error("tool 'foo_bar' not found in registry")
        assert result == "foo_bar"

    def test_extracts_from_double_quoted_error(self):
        """Matches: tool \"foo_bar\" pattern."""
        result = extract_tool_name_from_error('tool "create_document" is unavailable')
        assert result == "create_document"

    def test_extracts_from_unknown_tool_pattern(self):
        """Matches: unknown tool foo pattern."""
        result = extract_tool_name_from_error("unknown tool send_email not registered")
        assert result == "send_email"

    def test_extracts_from_tool_name_not_found_pattern(self):
        """Matches: tool foo not found pattern."""
        result = extract_tool_name_from_error("tool create_spreadsheet not found")
        assert result == "create_spreadsheet"

    def test_returns_none_when_no_pattern_matches(self):
        """Returns None for generic errors without tool names."""
        result = extract_tool_name_from_error("connection timeout after 30 seconds")
        assert result is None

    def test_case_insensitive_matching(self):
        """Pattern matching is case-insensitive."""
        result = extract_tool_name_from_error("TOOL 'MY_TOOL' NOT FOUND")
        assert result == "MY_TOOL"

    def test_empty_error_returns_none(self):
        result = extract_tool_name_from_error("")
        assert result is None


# ---------------------------------------------------------------------------
# extract_pagination_metadata
# ---------------------------------------------------------------------------

import json
from chat.workflow.executor.helpers import extract_pagination_metadata


class TestExtractPaginationMetadata:
    def test_extracts_notion_pagination(self):
        """Extracts next_cursor and has_more from Notion-style response."""
        content = json.dumps(
            {
                "object": "list",
                "results": [{"id": "block_1"}, {"id": "block_2"}],
                "next_cursor": "abc-def-123",
                "has_more": True,
                "type": "block",
            }
        )
        result = extract_pagination_metadata(content)
        parsed = json.loads(result)
        assert parsed["next_cursor"] == "abc-def-123"
        assert parsed["has_more"] is True

    def test_returns_empty_for_non_json(self):
        assert extract_pagination_metadata("Just plain text result") == ""

    def test_returns_empty_for_json_without_pagination(self):
        content = json.dumps({"object": "page", "id": "page_123", "title": "My Page"})
        assert extract_pagination_metadata(content) == ""

    def test_returns_empty_for_json_array(self):
        content = json.dumps([{"id": "item_1"}, {"id": "item_2"}])
        assert extract_pagination_metadata(content) == ""

    def test_extracts_has_more_false(self):
        """When has_more is false, still extracts it (LLM needs to know no more pages)."""
        content = json.dumps(
            {
                "object": "list",
                "results": [],
                "next_cursor": None,
                "has_more": False,
            }
        )
        result = extract_pagination_metadata(content)
        parsed = json.loads(result)
        assert parsed["has_more"] is False
        assert parsed["next_cursor"] is None

    def test_extracts_generic_cursor_fields(self):
        content = json.dumps(
            {
                "data": [1, 2, 3],
                "cursor": "next_page_token_xyz",
                "total": 150,
                "page_size": 50,
            }
        )
        result = extract_pagination_metadata(content)
        parsed = json.loads(result)
        assert parsed["cursor"] == "next_page_token_xyz"
        assert parsed["total"] == 150

    def test_returns_empty_for_empty_string(self):
        assert extract_pagination_metadata("") == ""

    def test_returns_empty_for_malformed_json(self):
        assert extract_pagination_metadata('{"broken": true,}') == ""

    def test_excludes_non_pagination_fields(self):
        content = json.dumps(
            {
                "object": "list",
                "results": [{"id": "1"}],
                "next_cursor": "cursor_123",
                "has_more": True,
                "type": "block",
                "block": {},
            }
        )
        result = extract_pagination_metadata(content)
        parsed = json.loads(result)
        assert "object" not in parsed
        assert "results" not in parsed
        assert "type" not in parsed
        assert "block" not in parsed
