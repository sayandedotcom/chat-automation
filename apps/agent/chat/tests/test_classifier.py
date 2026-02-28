"""
Tests for the LLM-based integration classifier.

Tests cover:
- Index building and metadata storage
- classify_with_fallback delegates to LLM
- Fallback to web_search when LLM fails
- Response parsing (JSON, markdown fences)
- Invalid integration names filtered out
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from chat.integrations.classifier import IntegrationClassifier


# ────────────────────────────────────────────────────────────────────────────
# Index Building Tests
# ────────────────────────────────────────────────────────────────────────────
class TestBuildIndex:
    """Test that build_index correctly stores integration metadata."""

    def test_build_index_stores_all_integrations(self, classifier):
        assert classifier.is_initialized
        assert len(classifier._indexes) == 6

    def test_build_index_stores_description(self, classifier):
        assert classifier._indexes["gmail"].description == "Email operations via Gmail"

    def test_build_index_stores_identity_keywords(self, classifier):
        assert "gmail" in classifier._indexes["gmail"].identity_keywords
        assert "notion" in classifier._indexes["notion"].identity_keywords

    def test_build_index_lowercases_identity_keywords(self):
        clf = IntegrationClassifier()
        clf.build_index(
            {
                "test": {
                    "description": "Test",
                    "identity_keywords": ["GitHub", "JIRA"],
                }
            }
        )
        assert clf._indexes["test"].identity_keywords == ["github", "jira"]

    def test_build_index_empty_config(self):
        clf = IntegrationClassifier()
        clf.build_index({})
        assert clf.is_initialized
        assert len(clf._indexes) == 0

    def test_build_index_missing_fields_defaults(self):
        clf = IntegrationClassifier()
        clf.build_index({"minimal": {}})
        idx = clf._indexes["minimal"]
        assert idx.name == "minimal"
        assert idx.description == "minimal"
        assert idx.identity_keywords == []


# ────────────────────────────────────────────────────────────────────────────
# LLM Classification Tests
# ────────────────────────────────────────────────────────────────────────────
class TestClassifyWithFallback:
    """Test classify_with_fallback with mocked LLM responses."""

    @pytest.mark.asyncio
    async def test_returns_llm_result(self, classifier):
        """Successful LLM classification returns integrations with method='llm'."""
        mock_response = MagicMock()
        mock_response.content = '["gmail"]'

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier.classify_with_fallback("send an email to John")
        assert result.method == "llm"
        assert "gmail" in result.integrations
        assert result.confidence == 0.9

    @pytest.mark.asyncio
    async def test_multi_integration_result(self, classifier):
        """LLM can return multiple integrations."""
        mock_response = MagicMock()
        mock_response.content = '["web_search", "google_docs"]'

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier.classify_with_fallback(
            "research Python and create a doc"
        )
        assert "web_search" in result.integrations
        assert "google_docs" in result.integrations
        assert result.method == "llm"

    @pytest.mark.asyncio
    async def test_fallback_default_on_llm_failure(self, classifier):
        """When LLM fails, returns web_search fallback."""
        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(side_effect=Exception("API error"))

        result = await classifier.classify_with_fallback("hello world")
        assert result.method == "fallback_default"
        assert result.integrations == ["web_search"]
        assert result.confidence == 0.1

    @pytest.mark.asyncio
    async def test_fallback_default_on_empty_response(self, classifier):
        """When LLM returns empty array, falls back to web_search."""
        mock_response = MagicMock()
        mock_response.content = "[]"

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier.classify_with_fallback("hello world")
        assert result.method == "fallback_default"
        assert result.integrations == ["web_search"]

    @pytest.mark.asyncio
    async def test_filters_invalid_integration_names(self, classifier):
        """Integration names not in the index are filtered out."""
        mock_response = MagicMock()
        mock_response.content = '["gmail", "nonexistent_service"]'

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier.classify_with_fallback("send an email")
        assert result.integrations == ["gmail"]
        assert "nonexistent_service" not in result.integrations

    @pytest.mark.asyncio
    async def test_all_invalid_names_triggers_fallback(self, classifier):
        """If all LLM-returned names are invalid, falls back to default."""
        mock_response = MagicMock()
        mock_response.content = '["fake_service"]'

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier.classify_with_fallback("do something")
        assert result.method == "fallback_default"

    @pytest.mark.asyncio
    async def test_scores_are_uniform(self, classifier):
        """All LLM-classified integrations get a score of 1.0."""
        mock_response = MagicMock()
        mock_response.content = '["gmail", "google_docs"]'

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier.classify_with_fallback("email a doc")
        assert result.scores == {"gmail": 1.0, "google_docs": 1.0}


# ────────────────────────────────────────────────────────────────────────────
# Response Parsing Tests
# ────────────────────────────────────────────────────────────────────────────
class TestResponseParsing:
    """Test that _llm_classify handles various LLM response formats."""

    @pytest.mark.asyncio
    async def test_parses_plain_json(self, classifier):
        """Plain JSON array response."""
        mock_response = MagicMock()
        mock_response.content = '["gmail"]'

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier._llm_classify("send email")
        assert result.integrations == ["gmail"]

    @pytest.mark.asyncio
    async def test_parses_markdown_fenced_json(self, classifier):
        """JSON wrapped in markdown code fences."""
        mock_response = MagicMock()
        mock_response.content = '```json\n["gmail", "google_docs"]\n```'

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier._llm_classify("email a doc")
        assert "gmail" in result.integrations
        assert "google_docs" in result.integrations

    @pytest.mark.asyncio
    async def test_parses_markdown_fenced_no_lang(self, classifier):
        """JSON wrapped in code fences without language tag."""
        mock_response = MagicMock()
        mock_response.content = '```\n["notion"]\n```'

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier._llm_classify("create a notion page")
        assert result.integrations == ["notion"]

    @pytest.mark.asyncio
    async def test_handles_whitespace(self, classifier):
        """Response with extra whitespace."""
        mock_response = MagicMock()
        mock_response.content = '  \n  ["gmail"]  \n  '

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier._llm_classify("send email")
        assert result.integrations == ["gmail"]

    @pytest.mark.asyncio
    async def test_handles_invalid_json(self, classifier):
        """Invalid JSON returns None."""
        mock_response = MagicMock()
        mock_response.content = "not valid json"

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier._llm_classify("send email")
        assert result is None

    @pytest.mark.asyncio
    async def test_handles_non_array_json(self, classifier):
        """Non-array JSON returns None."""
        mock_response = MagicMock()
        mock_response.content = '{"integration": "gmail"}'

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier._llm_classify("send email")
        assert result is None

    @pytest.mark.asyncio
    async def test_handles_non_string_array(self, classifier):
        """Array of non-strings returns None."""
        mock_response = MagicMock()
        mock_response.content = "[1, 2, 3]"

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await classifier._llm_classify("send email")
        assert result is None


# ────────────────────────────────────────────────────────────────────────────
# Prompt Construction Tests
# ────────────────────────────────────────────────────────────────────────────
class TestPromptConstruction:
    """Test that the LLM prompt includes integration metadata."""

    @pytest.mark.asyncio
    async def test_prompt_includes_all_integrations(self, classifier):
        """The LLM prompt should list all available integrations."""
        mock_response = MagicMock()
        mock_response.content = '["web_search"]'

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        await classifier.classify_with_fallback("test request")

        call_args = classifier._llm.ainvoke.call_args[0][0]
        prompt_text = call_args[0].content

        for name in classifier._indexes:
            assert name in prompt_text, f"Integration '{name}' missing from prompt"

    @pytest.mark.asyncio
    async def test_prompt_includes_user_request(self, classifier):
        """The LLM prompt should include the user's request."""
        mock_response = MagicMock()
        mock_response.content = '["gmail"]'

        classifier._llm = AsyncMock()
        classifier._llm.ainvoke = AsyncMock(return_value=mock_response)

        await classifier.classify_with_fallback("send an email to Alice")

        call_args = classifier._llm.ainvoke.call_args[0][0]
        prompt_text = call_args[0].content

        assert "send an email to Alice" in prompt_text
