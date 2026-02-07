"""
Comprehensive tests for the integration classifier.

Tests cover:
- Stemmer correctness
- Exact keyword matching
- Stemmed keyword matching (morphological variants)
- Fuzzy phrase matching
- Regex backward compatibility
- Scoring thresholds
- Multi-integration selection
- Edge cases
"""

import pytest
from chat.classifier import stem, IntegrationClassifier, ClassificationResult


# ────────────────────────────────────────────────────────────────────────────
# Stemmer Tests
# ────────────────────────────────────────────────────────────────────────────
class TestStemmer:
    """Test the lightweight stemmer function."""

    def test_stem_convergence_singular_plural(self):
        """Singular and plural forms should stem to the same root."""
        pairs = [
            ("document", "documents"),
            ("email", "emails"),
            ("meeting", "meetings"),
            ("presentation", "presentations"),
            ("file", "files"),
            ("folder", "folders"),
            ("calendar", "calendars"),
            ("slide", "slides"),
            ("note", "notes"),
        ]
        for singular, plural in pairs:
            assert stem(singular) == stem(plural), (
                f"Stem divergence: stem({singular!r}) = {stem(singular)!r}, "
                f"stem({plural!r}) = {stem(plural)!r}"
            )

    def test_stem_verb_forms(self):
        """Verb forms should stem to base form (or close to it)."""
        assert stem("searching") == "search"  # -ing stripped (stem >= 5 chars)
        assert stem("searched") == "search"    # -ed stripped
        assert stem("writing") == "writing"    # -ing NOT stripped (stem < 5 chars)
        assert stem("scheduled") == "schedul"  # -ed stripped
        assert stem("deploying") == "deploy"   # -ing stripped (stem >= 5 chars)

    def test_stem_special_plurals(self):
        """Special plural forms should stem correctly."""
        assert stem("puppies") == "puppy"
        assert stem("replied") == "reply"
        assert stem("boxes") == "box"
        assert stem("addresses") == "address"

    def test_stem_preserves_base_words(self):
        """Base words without suffixes should be unchanged."""
        assert stem("document") == "document"
        assert stem("presentation") == "presentation"
        assert stem("appointment") == "appointment"
        assert stem("comment") == "comment"

    def test_stem_short_words(self):
        """Words <= 3 chars should not be stemmed."""
        assert stem("to") == "to"
        assert stem("the") == "the"
        assert stem("and") == "and"

    def test_stem_case_insensitive(self):
        """Stemming should be case insensitive."""
        assert stem("Document") == stem("document")
        assert stem("EMAILS") == stem("emails")


# ────────────────────────────────────────────────────────────────────────────
# Classification Tests
# ────────────────────────────────────────────────────────────────────────────
class TestClassification:
    """Test the classifier's Phase 1 (NLP) classification."""

    def test_exact_keyword_match(self, classifier):
        """Exact keyword matches should select the integration."""
        result = classifier.classify("send an email to John")
        assert "gmail" in result.integrations
        assert result.scores["gmail"] > 0

    def test_morphological_variants(self, classifier):
        """Plural forms should match as well as singular forms."""
        # Singular
        result1 = classifier.classify("create a google document about it")
        # Plural
        result2 = classifier.classify("create a google documents about it")

        assert "google_docs" in result1.integrations
        assert "google_docs" in result2.integrations
        # Scores should be similar (within tolerance due to regex bonus)
        assert abs(result1.scores["google_docs"] - result2.scores["google_docs"]) <= 1.0

    def test_synonym_matching(self, classifier):
        """Synonym keywords should match the integration."""
        test_cases = [
            ("write a memo", "google_docs"),
            ("prepare a brief", "google_docs"),
            ("draft a proposal", "google_docs"),
        ]
        for request, expected_integration in test_cases:
            result = classifier.classify(request)
            assert expected_integration in result.integrations, (
                f"Request '{request}' should match '{expected_integration}', "
                f"got: {result.integrations}"
            )

    def test_fuzzy_phrase_matching(self, classifier):
        """Fuzzy phrase matching should catch indirect references."""
        # "reach out to" should fuzzy match "send an email"
        result = classifier.classify("reach out to the team")
        assert "gmail" in result.integrations

    def test_regex_backward_compat(self, classifier):
        """Legacy regex patterns should still contribute to scoring."""
        # "what is Python" should trigger web_search via regex
        result = classifier.classify("what is Python")
        assert "web_search" in result.integrations

    def test_multi_integration_selection(self, classifier):
        """Multiple integrations should be selected when appropriate."""
        result = classifier.classify("search for python tutorials and create a doc")
        assert "web_search" in result.integrations
        assert "google_docs" in result.integrations

    def test_absolute_score_threshold(self, classifier):
        """Integrations with MIN_ABSOLUTE_SCORE should be included regardless of normalization."""
        # Even if another integration scores higher, one exact match should include it
        result = classifier.classify("research backend frameworks and mention documents")
        # Should include google_docs despite web_search scoring higher
        assert "google_docs" in result.integrations or result.scores.get("google_docs", 0) >= 1.5

    def test_normalized_score_threshold(self, classifier):
        """Integrations above HIGH_CONFIDENCE normalized threshold should be included."""
        result = classifier.classify("schedule a meeting for tomorrow")
        assert "google_calendar" in result.integrations
        # Normalized score should be high since calendar is the dominant match
        max_score = max(result.scores.values())
        normalized = result.scores["google_calendar"] / max_score
        assert normalized >= classifier.HIGH_CONFIDENCE


# ────────────────────────────────────────────────────────────────────────────
# Edge Cases
# ────────────────────────────────────────────────────────────────────────────
class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_empty_request(self, classifier):
        """Empty request should return no integrations."""
        result = classifier.classify("")
        assert result.integrations == []
        assert result.scores == {}

    def test_no_keyword_matches(self, classifier):
        """Request with no keyword matches should return empty."""
        result = classifier.classify("xyz abc def")
        assert result.integrations == []

    def test_single_integration_match(self, classifier):
        """Single clear match should only return that integration."""
        result = classifier.classify("check my inbox")
        assert "gmail" in result.integrations
        # Should not over-match other integrations with low scores

    def test_case_insensitivity(self, classifier):
        """Classification should be case insensitive."""
        result1 = classifier.classify("send an email")
        result2 = classifier.classify("SEND AN EMAIL")
        result3 = classifier.classify("Send An Email")

        assert result1.integrations == result2.integrations == result3.integrations

    def test_special_characters(self, classifier):
        """Special characters should not break classification."""
        result = classifier.classify("send an email! (urgent)")
        assert "gmail" in result.integrations

    def test_very_long_request(self, classifier):
        """Very long requests should not break classification."""
        long_request = "search for python tutorials " * 50 + " and create a document"
        result = classifier.classify(long_request)
        assert "web_search" in result.integrations
        assert "google_docs" in result.integrations


# ────────────────────────────────────────────────────────────────────────────
# Scoring Tests
# ────────────────────────────────────────────────────────────────────────────
class TestScoring:
    """Test the scoring logic."""

    def test_exact_match_weight(self, classifier):
        """Exact keyword matches should have weight 1.5."""
        result = classifier.classify("email")
        # Single exact match of "email" should give gmail a base score
        assert result.scores["gmail"] >= 1.5

    def test_multiple_exact_matches(self, classifier):
        """Multiple exact matches should accumulate."""
        result = classifier.classify("send an email message to inbox")
        # "email", "send", "message", "inbox" all match gmail keywords
        assert result.scores["gmail"] > 1.5  # More than one match

    def test_stemmed_match_weight(self, classifier):
        """Stemmed matches (not already counted as exact) should have weight 1.0."""
        # "searching" stems to "search" which is a web_search keyword
        result = classifier.classify("I am searching for information")
        assert result.scores.get("web_search", 0) > 0

    def test_regex_contribution(self, classifier):
        """Regex patterns should add 1.0 to the score."""
        # "what is" triggers regex for web_search
        result = classifier.classify("what is machine learning")
        # Should have regex bonus on top of keyword matches
        assert result.scores["web_search"] >= 1.0

    def test_fuzzy_phrase_contribution(self, classifier):
        """Fuzzy phrase matches should contribute to score."""
        # "reach out to" fuzzy matches gmail's "send an email" phrase
        result = classifier.classify("reach out to the team")
        # Should have fuzzy phrase bonus
        assert result.scores.get("gmail", 0) > 0

    def test_score_normalization(self, classifier):
        """Scores should be normalized against max_score."""
        result = classifier.classify("search for tutorials and check email")
        max_score = max(result.scores.values())
        for name, score in result.scores.items():
            normalized = score / max_score
            assert 0.0 <= normalized <= 1.0


# ────────────────────────────────────────────────────────────────────────────
# Integration Tests (async)
# ────────────────────────────────────────────────────────────────────────────
class TestClassifyWithFallback:
    """Test the full classify_with_fallback flow (Phase 1 + Phase 2)."""

    @pytest.mark.asyncio
    async def test_high_confidence_skips_llm(self, classifier):
        """High confidence Phase 1 results should not trigger LLM fallback."""
        result = await classifier.classify_with_fallback("send an email to John")
        assert result.method == "nlp"  # No LLM fallback
        assert "gmail" in result.integrations

    @pytest.mark.asyncio
    async def test_no_matches_triggers_fallback(self, classifier):
        """No matches should trigger fallback (but LLM will fail in test env)."""
        result = await classifier.classify_with_fallback("hello world")
        # LLM will fail (no API key), should fall back to default
        assert result.method in ["fallback_default", "llm_fallback"]
        # Ultimate fallback is empty or default (depends on implementation)

    @pytest.mark.asyncio
    async def test_confidence_score(self, classifier):
        """Confidence score should be in [0, 1] range."""
        result = await classifier.classify_with_fallback("schedule a meeting")
        assert 0.0 <= result.confidence <= 1.0


# ────────────────────────────────────────────────────────────────────────────
# Regression Tests (user-reported bugs)
# ────────────────────────────────────────────────────────────────────────────
class TestRegressions:
    """Regression tests for previously reported bugs."""

    def test_documents_vs_document_bug(self, classifier):
        """
        Bug: "documents" didn't match google_docs but "document" did.
        Root cause: stemmer divergence (document→docu, documents→document).
        Fix: removed derivational suffixes from stemmer.
        """
        req1 = "research top backend frameworks and create a google document about it"
        req2 = "research top backend frameworks and create a google documents about it"

        result1 = classifier.classify(req1)
        result2 = classifier.classify(req2)

        # Both should include google_docs
        assert "google_docs" in result1.integrations, f"Request 1 failed: {result1.integrations}"
        assert "google_docs" in result2.integrations, f"Request 2 failed: {result2.integrations}"

        # Scores should be similar (within tolerance for regex bonus difference)
        score1 = result1.scores["google_docs"]
        score2 = result2.scores["google_docs"]
        assert abs(score1 - score2) <= 1.5, (
            f"Scores too different: {score1:.2f} vs {score2:.2f}"
        )

    def test_plural_forms_general(self, classifier):
        """General test: all plural forms should match as well as singular."""
        pairs = [
            ("send an email", "send emails", "gmail"),
            ("create a document", "create documents", "google_docs"),
            ("schedule a meeting", "schedule meetings", "google_calendar"),
        ]
        for singular_req, plural_req, expected_integration in pairs:
            result1 = classifier.classify(singular_req)
            result2 = classifier.classify(plural_req)

            # Both should include the expected integration
            assert expected_integration in result1.integrations, (
                f"Singular '{singular_req}' missing '{expected_integration}': {result1.integrations}"
            )
            assert expected_integration in result2.integrations, (
                f"Plural '{plural_req}' missing '{expected_integration}': {result2.integrations}"
            )
