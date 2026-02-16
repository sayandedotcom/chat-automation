"""
Shared pytest fixtures for classifier tests.
"""

import pytest


@pytest.fixture
def test_config():
    """Minimal test config for classifier testing."""
    return {
        "web_search": {
            "description": "Web search and research",
            "identity_keywords": [],
        },
        "gmail": {
            "description": "Email operations via Gmail",
            "identity_keywords": ["gmail", "email", "mail"],
        },
        "google_docs": {
            "description": "Document creation and editing via Google Docs",
            "identity_keywords": ["google doc", "google docs", "gdoc", "gdocs"],
        },
        "google_calendar": {
            "description": "Calendar management via Google Calendar",
            "identity_keywords": ["google calendar", "calendar"],
        },
        "google_drive": {
            "description": "File management via Google Drive",
            "identity_keywords": ["google drive", "gdrive"],
        },
        "notion": {
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
