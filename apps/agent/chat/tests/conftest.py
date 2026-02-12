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
                "best",
                "top",
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
            "identity_keywords": [],
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
            "identity_keywords": ["gmail", "email", "mail"],
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
            "identity_keywords": ["google doc", "google docs", "gdoc", "gdocs"],
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
            "identity_keywords": ["google calendar", "calendar"],
        },
        "google_drive": {
            "keywords": [
                "drive",
                "file",
                "files",
                "upload",
                "download",
                "folder",
                "folders",
                "share",
            ],
            "phrases": [
                "upload a file",
                "share the document",
                "find files in drive",
            ],
            "request_patterns": [
                r"\b(drive|file|upload|download|folder)\b",
            ],
            "description": "File management via Google Drive",
            "identity_keywords": ["google drive", "gdrive"],
        },
        "notion": {
            "keywords": [
                "notion",
                "page",
                "pages",
                "note",
                "notes",
                "database",
                "workspace",
                "wiki",
                "knowledge",
                "kanban",
                "board",
                "task",
                "tasks",
                "project",
                "projects",
            ],
            "phrases": [
                "create a Notion page",
                "search in Notion",
                "organize in Notion",
            ],
            "request_patterns": [
                r"\b(create|add|make)\b.*\b(page|note|doc|database)\b",
            ],
            "description": "Workspace and knowledge management via Notion",
            "identity_keywords": ["notion"],
        },
    }


@pytest.fixture
def classifier(test_config):
    """Initialized classifier with test config."""
    from chat.classifier import IntegrationClassifier

    clf = IntegrationClassifier()
    clf.build_index(test_config)
    return clf
