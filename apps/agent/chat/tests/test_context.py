"""
Tests for workflow/context.py — context builder functions.
"""

from langchain_core.messages import HumanMessage, AIMessage

from chat.workflow.context import (
    build_conversation_summary,
    format_integration_context,
    format_artifacts_context,
)


# ---------------------------------------------------------------------------
# TestBuildConversationSummary
# ---------------------------------------------------------------------------


class TestBuildConversationSummary:
    def test_first_turn_only_returns_none(self):
        """Single HumanMessage (first turn only) returns None."""
        messages = [HumanMessage(content="Hello, do something for me")]
        assert build_conversation_summary(messages) is None

    def test_empty_messages_returns_none(self):
        """Empty message list returns None."""
        assert build_conversation_summary([]) is None

    def test_two_turns_returns_summary(self):
        """Two HumanMessages produces a non-None string with 'PREVIOUS CONVERSATION:'."""
        messages = [
            HumanMessage(content="First request"),
            AIMessage(content="Workflow Complete: I finished the first task for you."),
            HumanMessage(content="Second request"),
        ]
        result = build_conversation_summary(messages)
        assert result is not None
        assert "PREVIOUS CONVERSATION:" in result

    def test_includes_user_request_in_summary(self):
        """Summary includes the user's request text."""
        messages = [
            HumanMessage(content="Do task A for me please"),
            AIMessage(content="Workflow Complete: I finished task A successfully."),
            HumanMessage(content="Do task B"),
        ]
        result = build_conversation_summary(messages)
        assert "Do task A for me please" in result

    def test_workflow_complete_message_prioritized(self):
        """AI message containing 'Workflow Complete' is used as the turn outcome."""
        messages = [
            HumanMessage(content="Run the workflow now"),
            AIMessage(content="Starting the process and setting things up..."),
            AIMessage(
                content="Workflow Complete: everything has been done successfully"
            ),
            HumanMessage(content="Next request"),
        ]
        result = build_conversation_summary(messages)
        assert "Workflow Complete" in result

    def test_success_detection_default(self):
        """Regular AI message without failure keywords produces [SUCCESS]."""
        messages = [
            HumanMessage(content="Do something useful"),
            AIMessage(content="Workflow Complete: the task finished without issues."),
            HumanMessage(content="Next"),
        ]
        result = build_conversation_summary(messages)
        assert "[SUCCESS]" in result

    def test_failed_detection_cannot(self):
        """'cannot' in outcome produces [FAILED]."""
        messages = [
            HumanMessage(content="Do something"),
            AIMessage(
                content="I cannot do that task because it requires permissions that are not available to me."
            ),
            HumanMessage(content="Next"),
        ]
        result = build_conversation_summary(messages)
        assert "[FAILED]" in result

    def test_failed_detection_error(self):
        """'error' in outcome produces [FAILED]."""
        messages = [
            HumanMessage(content="Do something"),
            AIMessage(
                content="There was an error completing the request and the operation could not be finished."
            ),
            HumanMessage(content="Next"),
        ]
        result = build_conversation_summary(messages)
        assert "[FAILED]" in result

    def test_failed_detection_failed_keyword(self):
        """'failed' in outcome produces [FAILED]."""
        messages = [
            HumanMessage(content="Do something"),
            AIMessage(
                content="The operation failed due to network issues and could not be completed as requested."
            ),
            HumanMessage(content="Next"),
        ]
        result = build_conversation_summary(messages)
        assert "[FAILED]" in result

    def test_failed_detection_unable(self):
        """'unable' in outcome produces [FAILED]."""
        messages = [
            HumanMessage(content="Do something"),
            AIMessage(
                content="I was unable to complete this task because the required service is not currently available."
            ),
            HumanMessage(content="Next"),
        ]
        result = build_conversation_summary(messages)
        assert "[FAILED]" in result

    def test_artifacts_rendered_in_summary(self):
        """Artifacts with matching turn_number appear in an ARTIFACTS CREATED section."""
        messages = [
            HumanMessage(content="Create a doc"),
            AIMessage(content="Workflow Complete: document has been created for you."),
            HumanMessage(content="Next"),
        ]
        artifacts = [
            {
                "type": "document",
                "name": "My Doc",
                "integration": "google_docs",
                "turn_number": 1,
                "step_number": 1,
            }
        ]
        result = build_conversation_summary(messages, artifacts)
        assert "ARTIFACTS CREATED" in result

    def test_artifact_url_shown(self):
        """Artifact with url → the URL appears in the summary."""
        messages = [
            HumanMessage(content="Create a doc"),
            AIMessage(
                content="Workflow Complete: document has been created successfully."
            ),
            HumanMessage(content="Next"),
        ]
        artifacts = [
            {
                "type": "document",
                "name": "My Doc",
                "integration": "google_docs",
                "turn_number": 1,
                "step_number": 1,
                "url": "https://docs.google.com/d/abc123",
            }
        ]
        result = build_conversation_summary(messages, artifacts)
        assert "https://docs.google.com/d/abc123" in result

    def test_artifact_id_shown(self):
        """Artifact with id → the ID appears in the summary."""
        messages = [
            HumanMessage(content="Create a doc"),
            AIMessage(
                content="Workflow Complete: document has been created successfully."
            ),
            HumanMessage(content="Next"),
        ]
        artifacts = [
            {
                "type": "document",
                "name": "My Doc",
                "integration": "google_docs",
                "turn_number": 1,
                "step_number": 1,
                "id": "doc-xyz-789",
            }
        ]
        result = build_conversation_summary(messages, artifacts)
        assert "doc-xyz-789" in result

    def test_no_artifacts_url_fallback(self):
        """No artifacts + AI message with a URL → URL extracted via fallback regex."""
        messages = [
            HumanMessage(content="Do something"),
            AIMessage(
                content="Done! Check out https://example.com/result for the details and full output."
            ),
            HumanMessage(content="Next"),
        ]
        result = build_conversation_summary(messages, artifacts=None)
        assert "https://example.com/result" in result

    def test_multi_turn_summary(self):
        """Three HumanMessages produces two turn summaries in the output."""
        messages = [
            HumanMessage(content="Turn 1 request"),
            AIMessage(content="Workflow Complete: Turn 1 task is fully done now."),
            HumanMessage(content="Turn 2 request"),
            AIMessage(content="Workflow Complete: Turn 2 task is fully done now."),
            HumanMessage(content="Turn 3 request"),
        ]
        result = build_conversation_summary(messages)
        assert "Turn 1" in result
        assert "Turn 2" in result


# ---------------------------------------------------------------------------
# TestFormatIntegrationContext
# ---------------------------------------------------------------------------


class TestFormatIntegrationContext:
    def test_none_returns_empty_string(self):
        """None input returns empty string."""
        assert format_integration_context(None) == ""

    def test_empty_list_returns_empty_string(self):
        """Empty list returns empty string."""
        assert format_integration_context([]) == ""

    def test_single_integration_in_output(self):
        """Single integration name appears in output."""
        result = format_integration_context(["gmail"])
        assert "gmail" in result

    def test_multiple_integrations_joined(self):
        """Multiple integrations are joined and both names appear in output."""
        result = format_integration_context(["gmail", "google_docs"])
        assert "gmail" in result
        assert "google_docs" in result

    def test_contains_restriction_text(self):
        """Output contains 'Use ONLY tools from these integrations' restriction text."""
        result = format_integration_context(["notion"])
        assert "Use ONLY tools from these integrations" in result


# ---------------------------------------------------------------------------
# TestFormatArtifactsContext
# ---------------------------------------------------------------------------


class TestFormatArtifactsContext:
    def _base_artifact(self, **kwargs) -> dict:
        return {
            "type": "document",
            "name": "Doc",
            "step_number": 1,
            "turn_number": 1,
            **kwargs,
        }

    def test_empty_returns_empty_string(self):
        """Empty list returns empty string."""
        assert format_artifacts_context([]) == ""

    def test_artifact_type_and_name_in_output(self):
        """Artifact type and name appear in the output."""
        result = format_artifacts_context(
            [self._base_artifact(type="spreadsheet", name="My Report")]
        )
        assert "spreadsheet" in result
        assert "My Report" in result

    def test_artifact_url_in_output(self):
        """Artifact URL appears in the output."""
        result = format_artifacts_context(
            [self._base_artifact(url="https://docs.google.com/d/abc")]
        )
        assert "https://docs.google.com/d/abc" in result

    def test_artifact_id_in_output(self):
        """Artifact ID appears in the output."""
        result = format_artifacts_context([self._base_artifact(id="doc-123")])
        assert "doc-123" in result

    def test_artifact_integration_in_output(self):
        """Artifact integration name appears in the output."""
        result = format_artifacts_context(
            [self._base_artifact(integration="google_docs")]
        )
        assert "google_docs" in result

    def test_artifact_metadata_in_output(self):
        """Artifact metadata key-value pairs appear in the output."""
        result = format_artifacts_context(
            [self._base_artifact(metadata={"recipient": "user@example.com"})]
        )
        assert "recipient" in result
        assert "user@example.com" in result

    def test_output_ends_with_newline(self):
        """Output always ends with a newline character."""
        result = format_artifacts_context([self._base_artifact()])
        assert result.endswith("\n")
