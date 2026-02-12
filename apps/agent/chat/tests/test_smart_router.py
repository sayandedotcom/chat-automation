"""
Tests for artifact-aware integration injection in the smart router node.

Covers:
- No artifacts → classifier output unchanged
- Artifact integration auto-included alongside classifier result
- Duplicate prevention when classifier already selected the integration
- Unknown integration in artifact filtered out
- Multiple artifacts from different integrations all injected
- Artifact with None/missing integration safely ignored
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from langchain_core.messages import HumanMessage

from chat.nodes import WorkflowNodes
from chat.integration_registry import IntegrationConfig


def _make_registry(*known_names: str) -> MagicMock:
    """Build a mock IntegrationRegistry that knows the given integration names."""
    registry = MagicMock()

    configs = {}
    tools_by_integration = {}
    for name in known_names:
        cfg = IntegrationConfig(name, {"display_name": name.replace("_", " ").title(), "icon": "default"})
        configs[name] = cfg
        fake_tool = MagicMock()
        fake_tool.name = f"{name}_tool"
        tools_by_integration[name] = [fake_tool]

    registry.get_integration_config.side_effect = lambda n: configs.get(n)
    registry.get_toolset.side_effect = lambda names: [
        t for n in names for t in tools_by_integration.get(n, [])
    ]
    registry._tools_by_integration = tools_by_integration
    registry.get_hints.return_value = ""
    return registry


def _make_state(user_msg: str, artifacts: list[dict] | None = None) -> dict:
    """Build a minimal WorkflowState dict for testing."""
    return {
        "messages": [HumanMessage(content=user_msg)],
        "artifacts": artifacts or [],
    }


def _make_nodes(registry: MagicMock) -> WorkflowNodes:
    """Create WorkflowNodes with mocked LLMs to avoid real API calls."""
    mock_llm = MagicMock()
    mock_llm.bind_tools.return_value = MagicMock()

    nodes = WorkflowNodes(tools=[], registry=registry)
    # Replace the real LLMs with mocks so bind_tools doesn't choke on fake tools
    nodes.executor_llm = mock_llm
    nodes.executor_with_tools = mock_llm
    return nodes


@pytest.mark.asyncio
@patch("chat.nodes.ToolNode", MagicMock)
class TestSmartRouterArtifactInjection:
    """Test that smart_router_node injects integrations from prior-turn artifacts."""

    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_no_artifacts_unchanged(self, mock_classify):
        """No artifacts → classifier output passed through unchanged."""
        mock_classify.return_value = ["notion"]
        registry = _make_registry("notion")
        nodes = _make_nodes(registry)

        result = await nodes.smart_router_node(_make_state("create a notion page"))

        registry.get_toolset.assert_called_once_with(["notion"])
        assert result["initial_integrations"] == ["notion"]

    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_artifact_integration_injected(self, mock_classify):
        """Artifact with google_docs integration auto-included alongside classifier's notion."""
        mock_classify.return_value = ["notion"]
        registry = _make_registry("notion", "google_docs")
        nodes = _make_nodes(registry)

        artifacts = [{"integration": "google_docs", "type": "document", "name": "Test Doc"}]
        result = await nodes.smart_router_node(_make_state("also build a notion doc", artifacts))

        call_args = registry.get_toolset.call_args[0][0]
        assert "notion" in call_args
        assert "google_docs" in call_args

    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_no_duplicate_if_already_classified(self, mock_classify):
        """If classifier already selected google_docs, artifact injection doesn't duplicate it."""
        mock_classify.return_value = ["google_docs", "notion"]
        registry = _make_registry("google_docs", "notion")
        nodes = _make_nodes(registry)

        artifacts = [{"integration": "google_docs", "type": "document", "name": "Test Doc"}]
        result = await nodes.smart_router_node(_make_state("update the doc", artifacts))

        call_args = registry.get_toolset.call_args[0][0]
        assert call_args.count("google_docs") == 1

    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_unknown_integration_filtered_out(self, mock_classify):
        """Artifact with unknown integration name is silently ignored."""
        mock_classify.return_value = ["notion"]
        registry = _make_registry("notion")  # "unknown_service" not in registry
        nodes = _make_nodes(registry)

        artifacts = [{"integration": "unknown_service", "type": "file", "name": "X"}]
        result = await nodes.smart_router_node(_make_state("do something", artifacts))

        call_args = registry.get_toolset.call_args[0][0]
        assert "unknown_service" not in call_args
        assert call_args == ["notion"]

    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_multiple_artifact_integrations_injected(self, mock_classify):
        """Multiple artifacts from different integrations are all injected."""
        mock_classify.return_value = ["notion"]
        registry = _make_registry("notion", "google_docs", "gmail")
        nodes = _make_nodes(registry)

        artifacts = [
            {"integration": "google_docs", "type": "document", "name": "Doc"},
            {"integration": "gmail", "type": "email", "name": "Email"},
        ]
        result = await nodes.smart_router_node(_make_state("summarize everything", artifacts))

        call_args = registry.get_toolset.call_args[0][0]
        assert "notion" in call_args
        assert "google_docs" in call_args
        assert "gmail" in call_args

    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_none_integration_ignored(self, mock_classify):
        """Artifact with None or missing integration field is safely skipped."""
        mock_classify.return_value = ["notion"]
        registry = _make_registry("notion")
        nodes = _make_nodes(registry)

        artifacts = [
            {"integration": None, "type": "file", "name": "X"},
            {"type": "page", "name": "Y"},  # no integration key at all
        ]
        result = await nodes.smart_router_node(_make_state("do stuff", artifacts))

        call_args = registry.get_toolset.call_args[0][0]
        assert call_args == ["notion"]
