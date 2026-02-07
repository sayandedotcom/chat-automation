"""
Shared pytest fixtures for classifier tests.
"""

import pytest


@pytest.fixture
def test_config():
    """Minimal test config for classifier testing."""
    return {
        "web_search": {
            "keywords": [
                "search",
                "find",
                "research",
                "latest",
                "current",
                "compare",
            ],
            "phrases": [
                "search the web",
                "find information about",
                "what is",
            ],
            "request_patterns": [
                r"\b(search|find|research)\b",
                r"\b(what|who|when|where|why|how)\s+(is|are|was|were)\b",
            ],
            "description": "Web search and research",
        },
        "gmail": {
            "keywords": [
                "email",
                "emails",
                "mail",
                "gmail",
                "send",
                "draft",
                "inbox",
                "recipient",
                "message",
                "messages",
            ],
            "phrases": [
                "send an email",
                "check my inbox",
                "reach out to",
            ],
            "request_patterns": [
                r"\b(email|mail|gmail|send|inbox)\b",
            ],
            "description": "Email operations via Gmail",
        },
        "google_docs": {
            "keywords": [
                "doc",
                "docs",
                "document",
                "documents",
                "memo",
                "writeup",
                "write",
                "report",
                "proposal",
                "brief",
            ],
            "phrases": [
                "create a document",
                "write a report",
                "draft a memo",
            ],
            "request_patterns": [
                r"\b(doc|document|write)\b",
            ],
            "description": "Document creation and editing via Google Docs",
        },
        "google_calendar": {
            "keywords": [
                "calendar",
                "schedule",
                "meeting",
                "meetings",
                "event",
                "appointment",
                "appointments",
            ],
            "phrases": [
                "schedule a meeting",
                "check my calendar",
            ],
            "request_patterns": [
                r"\b(calendar|schedule|meeting|event)\b",
            ],
            "description": "Calendar management via Google Calendar",
        },
    }


@pytest.fixture
def classifier(test_config):
    """Initialized classifier with test config."""
    from chat.classifier import IntegrationClassifier

    clf = IntegrationClassifier()
    clf.build_index(test_config)
    return clf
