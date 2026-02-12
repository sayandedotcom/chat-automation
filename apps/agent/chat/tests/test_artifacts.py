"""
Tests for the structured artifact memory system.

Covers:
- Artifact model serialization
- Extraction per integration (Google Docs, Gmail, Notion, Calendar, Drive, Sheets, Slides)
- Fallback URL extraction from AIMessage content
- Conversation summary rendering with/without artifacts
- format_artifacts_context output
- Integration hints loading via registry
- State backward compatibility (missing artifacts key)
"""

import json
import pytest
from unittest.mock import patch, MagicMock
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from chat.schemas import Artifact
from chat.nodes import (
    extract_artifacts_from_step,
    build_conversation_summary,
    format_artifacts_context,
    _find_field_recursive,
    _extract_name_from_data,
    _classify_url_type,
)


# ────────────────────────────────────────────────────────────────────────────
# Artifact Model Tests
# ────────────────────────────────────────────────────────────────────────────
class TestArtifactModel:
    """Test the Artifact Pydantic model."""

    def test_basic_creation(self):
        a = Artifact(
            type="document",
            name="My Doc",
            url="https://docs.google.com/document/d/abc123/edit",
            id="abc123",
            integration="google_docs",
            step_number=1,
        )
        assert a.type == "document"
        assert a.name == "My Doc"
        assert a.url == "https://docs.google.com/document/d/abc123/edit"
        assert a.id == "abc123"
        assert a.integration == "google_docs"
        assert a.step_number == 1
        assert a.turn_number == 1  # default
        assert a.metadata == {}  # default

    def test_optional_fields(self):
        a = Artifact(
            type="email",
            name="Sent email",
            integration="gmail",
            step_number=2,
        )
        assert a.url is None
        assert a.id is None
        assert a.metadata == {}

    def test_model_dump_roundtrip(self):
        a = Artifact(
            type="document",
            name="Research Doc",
            url="https://docs.google.com/document/d/xyz/edit",
            id="xyz",
            integration="google_docs",
            step_number=1,
            turn_number=2,
            metadata={"word_count": 500},
        )
        d = a.model_dump()
        assert isinstance(d, dict)
        assert d["type"] == "document"
        assert d["metadata"] == {"word_count": 500}
        # Round-trip
        a2 = Artifact(**d)
        assert a2.name == a.name
        assert a2.url == a.url

    def test_metadata_default_factory(self):
        """Each Artifact should get its own metadata dict."""
        a1 = Artifact(type="doc", name="A", integration="x", step_number=1)
        a2 = Artifact(type="doc", name="B", integration="x", step_number=2)
        a1.metadata["key"] = "val"
        assert "key" not in a2.metadata


# ────────────────────────────────────────────────────────────────────────────
# Helper Function Tests
# ────────────────────────────────────────────────────────────────────────────
class TestHelpers:
    def test_find_field_recursive_flat(self):
        assert _find_field_recursive({"documentId": "abc"}, "documentId") == "abc"

    def test_find_field_recursive_nested(self):
        data = {"result": {"inner": {"documentId": "deep_id"}}}
        assert _find_field_recursive(data, "documentId") == "deep_id"

    def test_find_field_recursive_missing(self):
        assert _find_field_recursive({"foo": "bar"}, "documentId") is None

    def test_find_field_recursive_empty_string(self):
        assert _find_field_recursive({"documentId": ""}, "documentId") is None

    def test_extract_name_from_data_title(self):
        assert _extract_name_from_data({"title": "My Title"}) == "My Title"

    def test_extract_name_from_data_name(self):
        assert _extract_name_from_data({"name": "File Name"}) == "File Name"

    def test_extract_name_from_data_fallback(self):
        assert _extract_name_from_data({"foo": "bar"}) == "Untitled"

    def test_classify_url_type_google_docs(self):
        assert _classify_url_type("https://docs.google.com/document/d/abc/edit") == "document"

    def test_classify_url_type_sheets(self):
        assert _classify_url_type("https://docs.google.com/spreadsheets/d/abc/edit") == "spreadsheet"

    def test_classify_url_type_slides(self):
        assert _classify_url_type("https://docs.google.com/presentation/d/abc/edit") == "presentation"

    def test_classify_url_type_drive(self):
        assert _classify_url_type("https://drive.google.com/file/d/abc") == "file"

    def test_classify_url_type_notion(self):
        assert _classify_url_type("https://www.notion.so/page-abc123") == "page"

    def test_classify_url_type_unknown(self):
        assert _classify_url_type("https://example.com/foo") is None


# ────────────────────────────────────────────────────────────────────────────
# Extraction Tests Per Integration
# ────────────────────────────────────────────────────────────────────────────
class TestExtractionGoogleDocs:
    """Test artifact extraction from Google Docs tool messages."""

    def test_extract_from_create_doc_response(self):
        tool_msg = ToolMessage(
            content=json.dumps({
                "documentId": "1qEHwE6WAj7ltPCU_RmRkwkr0ofjglg_3GIBzaLQN0wM",
                "title": "Best Front-End Frameworks Research",
            }),
            tool_call_id="tc_1",
        )
        messages = [tool_msg]
        artifacts = extract_artifacts_from_step(
            messages, step_number=1, integration_hint="google_docs"
        )
        assert len(artifacts) == 1
        a = artifacts[0]
        assert a["type"] == "document"
        assert a["id"] == "1qEHwE6WAj7ltPCU_RmRkwkr0ofjglg_3GIBzaLQN0wM"
        assert a["name"] == "Best Front-End Frameworks Research"
        assert "docs.google.com/document/d/1qEHwE6WAj7ltPCU" in a["url"]
        assert a["integration"] == "google_docs"

    def test_extract_nested_document_id(self):
        tool_msg = ToolMessage(
            content=json.dumps({
                "result": {"documentId": "nested_id_123", "title": "Nested Doc"}
            }),
            tool_call_id="tc_2",
        )
        artifacts = extract_artifacts_from_step(
            [tool_msg], step_number=2, integration_hint="google_docs"
        )
        assert len(artifacts) == 1
        assert artifacts[0]["id"] == "nested_id_123"


class TestExtractionGmail:
    """Test artifact extraction from Gmail tool messages."""

    def test_extract_sent_email(self):
        ai_msg = AIMessage(
            content="I'll send the email now.",
            tool_calls=[{
                "name": "send_gmail_message",
                "args": {"to": "test@example.com", "subject": "Research Doc"},
                "id": "tc_1",
            }],
        )
        tool_msg = ToolMessage(
            content=json.dumps({"id": "msg_abc123", "threadId": "thread_xyz"}),
            tool_call_id="tc_1",
        )
        artifacts = extract_artifacts_from_step(
            [ai_msg, tool_msg], step_number=2, integration_hint="gmail"
        )
        assert len(artifacts) == 1
        a = artifacts[0]
        assert a["type"] == "email"
        assert a["id"] == "msg_abc123"
        assert a["integration"] == "gmail"
        assert a["metadata"]["to"] == "test@example.com"
        assert a["metadata"]["subject"] == "Research Doc"


class TestExtractionNotion:
    """Test artifact extraction from Notion tool messages."""

    def test_extract_created_page(self):
        tool_msg = ToolMessage(
            content=json.dumps({
                "id": "page-uuid-123",
                "url": "https://www.notion.so/My-Page-abc123",
                "properties": {"title": [{"text": {"content": "My Notion Page"}}]},
            }),
            tool_call_id="tc_1",
        )
        artifacts = extract_artifacts_from_step(
            [tool_msg], step_number=1, integration_hint="notion"
        )
        assert len(artifacts) == 1
        a = artifacts[0]
        assert a["type"] == "page"
        assert a["id"] == "page-uuid-123"
        assert a["url"] == "https://www.notion.so/My-Page-abc123"


class TestExtractionGoogleCalendar:
    def test_extract_created_event(self):
        tool_msg = ToolMessage(
            content=json.dumps({
                "id": "event_abc",
                "htmlLink": "https://calendar.google.com/calendar/event?eid=abc",
                "summary": "Team Standup",
            }),
            tool_call_id="tc_1",
        )
        artifacts = extract_artifacts_from_step(
            [tool_msg], step_number=1, integration_hint="google_calendar"
        )
        assert len(artifacts) == 1
        a = artifacts[0]
        assert a["type"] == "event"
        assert a["id"] == "event_abc"
        assert "calendar.google.com" in a["url"]
        assert a["name"] == "Team Standup"


class TestExtractionGoogleDrive:
    def test_extract_uploaded_file(self):
        tool_msg = ToolMessage(
            content=json.dumps({
                "id": "file_xyz",
                "webViewLink": "https://drive.google.com/file/d/file_xyz/view",
                "name": "uploaded.pdf",
            }),
            tool_call_id="tc_1",
        )
        artifacts = extract_artifacts_from_step(
            [tool_msg], step_number=1, integration_hint="google_drive"
        )
        assert len(artifacts) == 1
        a = artifacts[0]
        assert a["type"] == "file"
        assert a["url"] == "https://drive.google.com/file/d/file_xyz/view"


class TestExtractionGoogleSheets:
    def test_extract_created_spreadsheet(self):
        tool_msg = ToolMessage(
            content=json.dumps({
                "spreadsheetId": "sheet_123",
                "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/sheet_123/edit",
                "title": "Budget 2025",
            }),
            tool_call_id="tc_1",
        )
        artifacts = extract_artifacts_from_step(
            [tool_msg], step_number=1, integration_hint="google_sheets"
        )
        assert len(artifacts) == 1
        a = artifacts[0]
        assert a["type"] == "spreadsheet"
        assert a["id"] == "sheet_123"
        assert "spreadsheets/d/sheet_123" in a["url"]


class TestExtractionGoogleSlides:
    def test_extract_created_presentation(self):
        tool_msg = ToolMessage(
            content=json.dumps({
                "presentationId": "pres_456",
                "title": "Q1 Review",
            }),
            tool_call_id="tc_1",
        )
        artifacts = extract_artifacts_from_step(
            [tool_msg], step_number=1, integration_hint="google_slides"
        )
        assert len(artifacts) == 1
        a = artifacts[0]
        assert a["type"] == "presentation"
        assert a["id"] == "pres_456"
        assert "presentation/d/pres_456" in a["url"]


# ────────────────────────────────────────────────────────────────────────────
# Multi-Integration Extraction (regression: messages from multiple steps)
# ────────────────────────────────────────────────────────────────────────────
class TestMultiIntegrationExtraction:
    """Ensure extraction works when messages contain tool calls from multiple integrations."""

    def test_google_doc_found_despite_tavily_messages(self):
        """Core regression: web search + create_doc in same message list."""
        # Step 1: tavily search messages
        tavily_ai = AIMessage(
            content="I'll search for frameworks.",
            tool_calls=[{"name": "tavily_search", "args": {"query": "best frameworks"}, "id": "tc_1"}],
        )
        tavily_result = ToolMessage(
            content=json.dumps({"results": [{"url": "https://example.com", "title": "Frameworks"}]}),
            tool_call_id="tc_1",
        )
        search_summary = AIMessage(content="Found several frameworks: React, Vue, etc.")

        # Step 2: create_doc messages
        doc_ai = AIMessage(
            content="Creating the document now.",
            tool_calls=[{"name": "create_doc", "args": {"title": "Research"}, "id": "tc_2"}],
        )
        doc_result = ToolMessage(
            content=json.dumps({
                "documentId": "1qEHwE6WAj7ltPCU_RmRkwkr0ofjglg_3GIBzaLQN0wM",
                "title": "Best Frameworks Research",
            }),
            tool_call_id="tc_2",
        )
        doc_summary = AIMessage(
            content="Created document: https://docs.google.com/document/d/1qEHwE6WAj7ltPCU_RmRkwkr0ofjglg_3GIBzaLQN0wM/edit"
        )

        # All messages together (no integration_hint — simulates real step_complete_node)
        all_messages = [tavily_ai, tavily_result, search_summary, doc_ai, doc_result, doc_summary]
        artifacts = extract_artifacts_from_step(all_messages, step_number=2)

        assert len(artifacts) >= 1
        doc_artifacts = [a for a in artifacts if a["type"] == "document"]
        assert len(doc_artifacts) == 1
        assert doc_artifacts[0]["id"] == "1qEHwE6WAj7ltPCU_RmRkwkr0ofjglg_3GIBzaLQN0wM"
        assert doc_artifacts[0]["integration"] == "google_docs"

    def test_notion_page_found_with_generic_id(self):
        """Notion uses generic 'id' + confirming 'url' field."""
        tool_msg = ToolMessage(
            content=json.dumps({
                "id": "page-uuid-456",
                "url": "https://notion.so/My-Page",
                "properties": {"title": [{"text": {"content": "My Page"}}]},
            }),
            tool_call_id="tc_1",
        )
        # No integration hint — auto-detection via confirming URL field
        artifacts = extract_artifacts_from_step([tool_msg], step_number=1)
        assert len(artifacts) == 1
        assert artifacts[0]["type"] == "page"
        assert artifacts[0]["id"] == "page-uuid-456"

    def test_mcp_list_content_google_doc_plain_text(self):
        """Real MCP format: ToolMessage.content is a list of content blocks with plain text (not JSON).
        This is the exact format the Google Workspace MCP server returns.
        """
        # Actual format from production logs
        tool_msg = ToolMessage(
            content=[
                {
                    "type": "text",
                    "text": "Created Google Doc 'Best Full Stack Frameworks Research' "
                            "(ID: 19_CA-TaVyXrdp7x1evfxr2od8oALoA6gvm5pqn1nXU0) for testuser@gmail.com. "
                            "Link: https://docs.google.com/document/d/19_CA-TaVyXrdp7x1evfxr2od8oALoA6gvm5pqn1nXU0/edit",
                    "id": "lc_7c880eb4-591e-4435-a202-5a435afb4a32",
                }
            ],
            tool_call_id="tc_2",
        )
        artifacts = extract_artifacts_from_step([tool_msg], step_number=2)
        assert len(artifacts) == 1
        assert artifacts[0]["type"] == "document"
        assert artifacts[0]["id"] == "19_CA-TaVyXrdp7x1evfxr2od8oALoA6gvm5pqn1nXU0"
        assert "docs.google.com/document/d/19_CA-TaVyXrdp7x1evfxr2od8oALoA6gvm5pqn1nXU0" in artifacts[0]["url"]
        assert artifacts[0]["name"] == "Best Full Stack Frameworks Research"
        assert artifacts[0]["integration"] == "google_docs"

    def test_mcp_list_content_with_tavily_search_results(self):
        """MCP Tavily returns list content blocks too — should NOT produce artifacts from search results."""
        tavily_tool_msg = ToolMessage(
            content=[
                {
                    "type": "text",
                    "text": "Detailed Results:\n\nTitle: Top Frameworks\nURL: https://example.com/frameworks\nContent: ...",
                    "id": "lc_abc123",
                }
            ],
            tool_call_id="tc_1",
        )
        # No artifact because it's just search results text (no doc URL pattern)
        artifacts = extract_artifacts_from_step([tavily_tool_msg], step_number=1)
        assert artifacts == []

    def test_mcp_list_content_mixed_with_json(self):
        """Messages with both MCP list-content (tavily) and JSON (create doc) ToolMessages."""
        tavily_msg = ToolMessage(
            content=[{"type": "text", "text": "Search results: Title: React...", "id": "lc_1"}],
            tool_call_id="tc_1",
        )
        doc_msg = ToolMessage(
            content=[{
                "type": "text",
                "text": "Created Google Doc 'Research' (ID: abc_123_def) for user@test.com. "
                        "Link: https://docs.google.com/document/d/abc_123_def/edit",
                "id": "lc_2",
            }],
            tool_call_id="tc_2",
        )
        all_msgs = [tavily_msg, doc_msg]
        artifacts = extract_artifacts_from_step(all_msgs, step_number=2)
        assert len(artifacts) == 1
        assert artifacts[0]["id"] == "abc_123_def"
        assert artifacts[0]["integration"] == "google_docs"

    def test_generic_id_without_confirming_field_ignored(self):
        """A ToolMessage with just 'id' but no confirming URL should NOT produce artifact."""
        tool_msg = ToolMessage(
            content=json.dumps({"id": "random_123", "status": "ok"}),
            tool_call_id="tc_1",
        )
        artifacts = extract_artifacts_from_step([tool_msg], step_number=1)
        assert artifacts == []


# ────────────────────────────────────────────────────────────────────────────
# Fallback URL Extraction
# ────────────────────────────────────────────────────────────────────────────
class TestFallbackURLExtraction:
    """Test URL-based artifact extraction when no structured JSON is available."""

    def test_fallback_extracts_google_doc_url(self):
        ai_msg = AIMessage(
            content="Created document: https://docs.google.com/document/d/abc123/edit"
        )
        artifacts = extract_artifacts_from_step(
            [ai_msg], step_number=1, integration_hint="google_docs"
        )
        assert len(artifacts) == 1
        assert artifacts[0]["type"] == "document"
        assert artifacts[0]["url"] == "https://docs.google.com/document/d/abc123/edit"

    def test_fallback_classifies_notion_url(self):
        ai_msg = AIMessage(
            content="Page created: https://www.notion.so/My-Page-abc123"
        )
        artifacts = extract_artifacts_from_step(
            [ai_msg], step_number=1, integration_hint="notion"
        )
        assert len(artifacts) == 1
        assert artifacts[0]["type"] == "page"

    def test_no_artifacts_from_plain_text(self):
        ai_msg = AIMessage(content="I searched for information about React.")
        artifacts = extract_artifacts_from_step(
            [ai_msg], step_number=1, integration_hint="web_search"
        )
        assert artifacts == []

    def test_no_duplicate_artifacts(self):
        """Same ID should not produce duplicate artifacts."""
        tool_msg1 = ToolMessage(
            content=json.dumps({"documentId": "same_id", "title": "Doc"}),
            tool_call_id="tc_1",
        )
        tool_msg2 = ToolMessage(
            content=json.dumps({"documentId": "same_id", "title": "Doc"}),
            tool_call_id="tc_2",
        )
        artifacts = extract_artifacts_from_step(
            [tool_msg1, tool_msg2], step_number=1, integration_hint="google_docs"
        )
        assert len(artifacts) == 1


# ────────────────────────────────────────────────────────────────────────────
# Conversation Summary Tests
# ────────────────────────────────────────────────────────────────────────────
class TestConversationSummary:
    """Test build_conversation_summary with and without artifacts."""

    def test_returns_none_for_single_turn(self):
        messages = [HumanMessage(content="hello")]
        assert build_conversation_summary(messages) is None

    def test_returns_none_for_single_turn_with_artifacts(self):
        messages = [HumanMessage(content="hello")]
        artifacts = [{"type": "document", "name": "Doc", "turn_number": 1}]
        assert build_conversation_summary(messages, artifacts=artifacts) is None

    def test_with_structured_artifacts(self):
        messages = [
            HumanMessage(content="Create a Google Doc about frameworks"),
            AIMessage(content="Workflow Complete! Created the document."),
            HumanMessage(content="Mail it to test@example.com"),
        ]
        artifacts = [{
            "type": "document",
            "name": "Frameworks Research",
            "url": "https://docs.google.com/document/d/abc123/edit",
            "id": "abc123",
            "integration": "google_docs",
            "step_number": 1,
            "turn_number": 1,
            "metadata": {},
        }]
        summary = build_conversation_summary(messages, artifacts=artifacts)
        assert summary is not None
        assert "ARTIFACTS CREATED:" in summary
        assert '[document] "Frameworks Research"' in summary
        assert "URL: https://docs.google.com/document/d/abc123/edit" in summary
        assert "ID: abc123" in summary

    def test_fallback_url_extraction_without_artifacts(self):
        """When no artifacts provided, falls back to URL regex."""
        messages = [
            HumanMessage(content="Create a doc"),
            AIMessage(content="Created: https://docs.google.com/document/d/old123/edit"),
            HumanMessage(content="Now mail it"),
        ]
        summary = build_conversation_summary(messages, artifacts=[])
        assert summary is not None
        assert "Artifacts/URLs:" in summary
        assert "docs.google.com/document/d/old123/edit" in summary

    def test_backward_compat_no_artifacts_param(self):
        """Calling without artifacts parameter still works (backward compat)."""
        messages = [
            HumanMessage(content="First request"),
            AIMessage(content="Done with first."),
            HumanMessage(content="Second request"),
        ]
        summary = build_conversation_summary(messages)
        assert summary is not None
        assert "Turn 1" in summary

    def test_artifacts_metadata_rendered(self):
        messages = [
            HumanMessage(content="Send email"),
            AIMessage(content="Workflow Complete! Email sent."),
            HumanMessage(content="Now do something else"),
        ]
        artifacts = [{
            "type": "email",
            "name": "Sent email",
            "url": None,
            "id": "msg_123",
            "integration": "gmail",
            "step_number": 1,
            "turn_number": 1,
            "metadata": {"to": "user@example.com", "subject": "Hello"},
        }]
        summary = build_conversation_summary(messages, artifacts=artifacts)
        assert "to: user@example.com" in summary
        assert "subject: Hello" in summary


# ────────────────────────────────────────────────────────────────────────────
# Prompt Formatting Tests
# ────────────────────────────────────────────────────────────────────────────
class TestFormatArtifactsContext:
    """Test format_artifacts_context output."""

    def test_empty_artifacts(self):
        assert format_artifacts_context([]) == ""

    def test_single_artifact(self):
        artifacts = [{
            "type": "document",
            "name": "My Doc",
            "url": "https://docs.google.com/document/d/abc/edit",
            "id": "abc",
            "integration": "google_docs",
            "step_number": 1,
            "turn_number": 1,
            "metadata": {},
        }]
        result = format_artifacts_context(artifacts)
        assert "AVAILABLE ARTIFACTS" in result
        assert '[document] "My Doc"' in result
        assert "URL: https://docs.google.com/document/d/abc/edit" in result
        assert "ID: abc" in result
        assert "step 1, turn 1" in result

    def test_multiple_artifacts(self):
        artifacts = [
            {
                "type": "document", "name": "Doc 1",
                "url": "https://url1", "id": "id1",
                "integration": "google_docs", "step_number": 1, "turn_number": 1,
                "metadata": {},
            },
            {
                "type": "email", "name": "Sent email",
                "url": None, "id": "msg1",
                "integration": "gmail", "step_number": 2, "turn_number": 1,
                "metadata": {"to": "user@test.com"},
            },
        ]
        result = format_artifacts_context(artifacts)
        assert '[document] "Doc 1"' in result
        assert '[email] "Sent email"' in result
        assert "to: user@test.com" in result

    def test_no_url_no_id(self):
        artifacts = [{
            "type": "email", "name": "Draft",
            "url": None, "id": None,
            "integration": "gmail", "step_number": 1, "turn_number": 1,
            "metadata": {},
        }]
        result = format_artifacts_context(artifacts)
        assert "URL:" not in result
        assert "ID:" not in result


# ────────────────────────────────────────────────────────────────────────────
# Hints Loading Tests
# ────────────────────────────────────────────────────────────────────────────
class TestHintsLoading:
    """Test IntegrationRegistry.get_hints()."""

    def test_get_planner_hints(self):
        from chat.integration_registry import IntegrationConfig, IntegrationRegistry

        registry = IntegrationRegistry()
        registry._integrations["gmail"] = IntegrationConfig("gmail", {
            "planner_hints": "GMAIL: Use artifact title as subject.",
            "executor_hints": "GMAIL: Use send_gmail_message.",
        })
        registry._integrations["google_docs"] = IntegrationConfig("google_docs", {
            "planner_hints": "GOOGLE DOCS: Include title in step.",
            "executor_hints": "",
        })

        result = registry.get_hints(["gmail", "google_docs"], "planner")
        assert "INTEGRATION-SPECIFIC GUIDELINES" in result
        assert "GMAIL: Use artifact title as subject." in result
        assert "GOOGLE DOCS: Include title in step." in result

    def test_get_executor_hints(self):
        from chat.integration_registry import IntegrationConfig, IntegrationRegistry

        registry = IntegrationRegistry()
        registry._integrations["gmail"] = IntegrationConfig("gmail", {
            "planner_hints": "",
            "executor_hints": "GMAIL: Use send_gmail_message.",
        })

        result = registry.get_hints(["gmail"], "executor")
        assert "GMAIL: Use send_gmail_message." in result

    def test_empty_hints_for_unconfigured(self):
        from chat.integration_registry import IntegrationRegistry

        registry = IntegrationRegistry()
        result = registry.get_hints(["nonexistent"], "planner")
        assert result == ""

    def test_empty_hints_when_all_blank(self):
        from chat.integration_registry import IntegrationConfig, IntegrationRegistry

        registry = IntegrationRegistry()
        registry._integrations["web_search"] = IntegrationConfig("web_search", {
            "planner_hints": "",
            "executor_hints": "",
        })
        result = registry.get_hints(["web_search"], "planner")
        assert result == ""


# ────────────────────────────────────────────────────────────────────────────
# State Backward Compatibility
# ────────────────────────────────────────────────────────────────────────────
class TestStateBackwardCompat:
    """Ensure code handles state dicts without artifacts key."""

    def test_extract_with_no_tool_messages(self):
        """Empty messages should produce empty artifacts."""
        assert extract_artifacts_from_step([], step_number=1) == []

    def test_extract_with_non_json_tool_message(self):
        """Non-JSON ToolMessage content should be skipped gracefully."""
        tool_msg = ToolMessage(content="Just plain text", tool_call_id="tc_1")
        assert extract_artifacts_from_step([tool_msg], step_number=1) == []

    def test_extract_with_malformed_json(self):
        """Malformed JSON should be skipped gracefully."""
        tool_msg = ToolMessage(content="{bad json", tool_call_id="tc_1")
        assert extract_artifacts_from_step([tool_msg], step_number=1) == []

    def test_summary_with_none_artifacts(self):
        """build_conversation_summary with artifacts=None should work."""
        messages = [
            HumanMessage(content="First"),
            AIMessage(content="Done."),
            HumanMessage(content="Second"),
        ]
        summary = build_conversation_summary(messages, artifacts=None)
        assert summary is not None


# ────────────────────────────────────────────────────────────────────────────
# add_artifacts Reducer Tests
# ────────────────────────────────────────────────────────────────────────────
class TestAddArtifactsReducer:
    """Test the add_artifacts reducer that prevents overwrite across turns."""

    def test_empty_plus_empty(self):
        from chat.schemas import add_artifacts
        assert add_artifacts([], []) == []

    def test_existing_plus_empty(self):
        """Passing artifacts=[] in initial_state should NOT overwrite existing."""
        from chat.schemas import add_artifacts
        existing = [{"type": "document", "id": "abc"}]
        assert add_artifacts(existing, []) == existing

    def test_empty_plus_new(self):
        from chat.schemas import add_artifacts
        new = [{"type": "document", "id": "xyz"}]
        assert add_artifacts([], new) == new

    def test_accumulates_across_turns(self):
        from chat.schemas import add_artifacts
        turn1 = [{"type": "document", "id": "doc1"}]
        turn2 = [{"type": "email", "id": "msg1"}]
        result = add_artifacts(turn1, turn2)
        assert len(result) == 2
        assert result[0]["id"] == "doc1"
        assert result[1]["id"] == "msg1"

    def test_handles_none_existing(self):
        from chat.schemas import add_artifacts
        new = [{"type": "document", "id": "abc"}]
        assert add_artifacts(None, new) == new

    def test_handles_none_new(self):
        from chat.schemas import add_artifacts
        existing = [{"type": "document", "id": "abc"}]
        assert add_artifacts(existing, None) == existing
