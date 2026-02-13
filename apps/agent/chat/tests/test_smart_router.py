"""
Tests for artifact-aware integration injection in the smart router node.

Covers:
- No artifacts → classifier output unchanged
- Artifact integration injected only when request references it
- Duplicate prevention when classifier already selected the integration
- Unknown integration in artifact filtered out
- Unreferenced artifact integrations NOT injected
- Artifact with None/missing integration safely ignored
- Reference by identity keyword, integration name, or artifact name
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from langchain_core.messages import HumanMessage

from chat.nodes import WorkflowNodes
from chat.schemas import WorkflowPlan, WorkflowStep
from chat.integration_registry import IntegrationConfig


# Identity keywords used in integration_config.yaml (subset needed for tests)
_IDENTITY_KEYWORDS = {
    "notion": ["notion"],
    "google_docs": ["google doc", "google docs", "gdoc", "gdocs"],
    "gmail": ["gmail", "email", "mail"],
    "google_drive": ["google drive", "gdrive"],
    "google_sheets": ["google sheet", "google sheets", "spreadsheet"],
    "google_slides": ["google slides", "presentation"],
    "google_calendar": ["google calendar", "calendar"],
}


def _make_classifier_mock(*known_names: str) -> MagicMock:
    """Build a mock classifier with identity keywords for the given integrations."""
    classifier = MagicMock()
    indexes = {}
    for name in known_names:
        idx = MagicMock()
        idx.identity_keywords = _IDENTITY_KEYWORDS.get(name, [])
        indexes[name] = idx
    classifier._indexes = indexes
    return classifier


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

    @patch("chat.classifier.get_classifier")
    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_artifact_injected_when_referenced_by_identity_keyword(self, mock_classify, mock_get_classifier):
        """Artifact integration injected when request contains its identity keyword."""
        mock_classify.return_value = ["notion"]
        mock_get_classifier.return_value = _make_classifier_mock("notion", "google_docs")
        registry = _make_registry("notion", "google_docs")
        nodes = _make_nodes(registry)

        # "google doc" identity keyword appears in "update the google doc too"
        artifacts = [{"integration": "google_docs", "type": "document", "name": "Test Doc"}]
        result = await nodes.smart_router_node(_make_state("update the google doc too", artifacts))

        call_args = registry.get_toolset.call_args[0][0]
        assert "notion" in call_args
        assert "google_docs" in call_args

    @patch("chat.classifier.get_classifier")
    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_artifact_not_injected_when_not_referenced(self, mock_classify, mock_get_classifier):
        """Artifact integration NOT injected when request doesn't reference it."""
        mock_classify.return_value = ["notion"]
        mock_get_classifier.return_value = _make_classifier_mock("notion", "google_docs")
        registry = _make_registry("notion", "google_docs")
        nodes = _make_nodes(registry)

        # Request mentions only "notion doc", no reference to google_docs
        artifacts = [{"integration": "google_docs", "type": "document", "name": "Test Doc"}]
        result = await nodes.smart_router_node(_make_state("also build a notion doc", artifacts))

        call_args = registry.get_toolset.call_args[0][0]
        assert "notion" in call_args
        assert "google_docs" not in call_args

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

    @patch("chat.classifier.get_classifier")
    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_only_referenced_artifacts_injected(self, mock_classify, mock_get_classifier):
        """When multiple artifact integrations exist, only referenced ones are injected."""
        mock_classify.return_value = ["gmail"]
        mock_get_classifier.return_value = _make_classifier_mock("gmail", "google_docs", "notion")
        registry = _make_registry("gmail", "google_docs", "notion")
        nodes = _make_nodes(registry)

        artifacts = [
            {"integration": "google_docs", "type": "document", "name": "Doc"},
            {"integration": "notion", "type": "page", "name": "Notes"},
        ]
        # Request mentions "notion" but NOT "google doc"
        result = await nodes.smart_router_node(
            _make_state("send the notion document to test@example.com", artifacts)
        )

        call_args = registry.get_toolset.call_args[0][0]
        assert "gmail" in call_args
        assert "notion" in call_args
        assert "google_docs" not in call_args

    @patch("chat.classifier.get_classifier")
    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_artifact_injected_by_name_match(self, mock_classify, mock_get_classifier):
        """Artifact injected when its name appears in the request."""
        mock_classify.return_value = ["gmail"]
        mock_get_classifier.return_value = _make_classifier_mock("gmail", "google_docs")
        registry = _make_registry("gmail", "google_docs")
        nodes = _make_nodes(registry)

        # Artifact name "Backend Languages Report" appears in the request
        artifacts = [{"integration": "google_docs", "type": "document", "name": "Backend Languages Report"}]
        result = await nodes.smart_router_node(
            _make_state("email the backend languages report to test@example.com", artifacts)
        )

        call_args = registry.get_toolset.call_args[0][0]
        assert "gmail" in call_args
        assert "google_docs" in call_args

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

    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_continuation_keyword_injects_all_artifacts(self, mock_classify):
        """'similar' keyword triggers injection of ALL artifact integrations."""
        mock_classify.return_value = ["notion"]
        registry = _make_registry("notion", "google_docs")
        nodes = _make_nodes(registry)

        artifacts = [{"integration": "google_docs", "type": "document", "name": "Test Doc"}]
        result = await nodes.smart_router_node(
            _make_state("Create a similar Notion Document also", artifacts)
        )

        call_args = registry.get_toolset.call_args[0][0]
        assert "notion" in call_args
        assert "google_docs" in call_args

    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_continuation_keyword_same(self, mock_classify):
        """'same' keyword triggers injection of artifact integrations."""
        mock_classify.return_value = ["notion"]
        registry = _make_registry("notion", "google_docs")
        nodes = _make_nodes(registry)

        artifacts = [{"integration": "google_docs", "type": "document", "name": "Test Doc"}]
        result = await nodes.smart_router_node(
            _make_state("create the same thing in Notion", artifacts)
        )

        call_args = registry.get_toolset.call_args[0][0]
        assert "google_docs" in call_args

    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_continuation_keyword_based_on(self, mock_classify):
        """'based on' keyword triggers injection of artifact integrations."""
        mock_classify.return_value = ["notion"]
        registry = _make_registry("notion", "google_docs")
        nodes = _make_nodes(registry)

        artifacts = [{"integration": "google_docs", "type": "document", "name": "Test Doc"}]
        result = await nodes.smart_router_node(
            _make_state("create a Notion page based on the previous document", artifacts)
        )

        call_args = registry.get_toolset.call_args[0][0]
        assert "google_docs" in call_args

    @patch("chat.classifier.get_classifier")
    @patch("chat.integration_registry.classify_integrations", new_callable=AsyncMock)
    async def test_no_continuation_keyword_no_blanket_injection(self, mock_classify, mock_get_classifier):
        """Without continuation keywords, non-referenced artifacts are NOT injected."""
        mock_classify.return_value = ["gmail"]
        mock_get_classifier.return_value = _make_classifier_mock("gmail", "google_docs", "notion")
        registry = _make_registry("gmail", "google_docs", "notion")
        nodes = _make_nodes(registry)

        artifacts = [
            {"integration": "google_docs", "type": "document", "name": "Doc"},
            {"integration": "notion", "type": "page", "name": "Notes"},
        ]
        # "send" is not a continuation keyword — only notion is referenced
        result = await nodes.smart_router_node(
            _make_state("send the notion document to test@example.com", artifacts)
        )

        call_args = registry.get_toolset.call_args[0][0]
        assert "gmail" in call_args
        assert "notion" in call_args
        assert "google_docs" not in call_args


# ---------------------------------------------------------------------------
# Tests for _get_previous_results artifact enrichment
# ---------------------------------------------------------------------------

def _make_plan_with_completed_steps(n_steps: int, results: dict[int, str] | None = None) -> WorkflowPlan:
    """Build a WorkflowPlan with n_steps, optionally setting results by step_number."""
    steps = []
    for i in range(1, n_steps + 1):
        step = WorkflowStep(step_number=i, description=f"Step {i} description")
        if results and i in results:
            step.result = results[i]
            step.status = "completed"
        steps.append(step)
    return WorkflowPlan(original_request="test request", steps=steps)


@patch("chat.nodes.ToolNode", MagicMock)
class TestGetPreviousResultsArtifactEnrichment:
    """Test that _get_previous_results appends EXACT RESOURCE IDs from artifacts."""

    def test_no_artifacts_unchanged(self):
        """No artifacts passed → output is the same as before (backward compat)."""
        registry = _make_registry("notion")
        nodes = _make_nodes(registry)
        plan = _make_plan_with_completed_steps(2, results={1: "Created document."})

        result = nodes._get_previous_results(plan, current_index=2)
        assert "Step 1: Created document." in result
        assert "EXACT RESOURCE" not in result

    def test_matching_artifacts_appended(self):
        """Artifacts whose step_number matches a completed step are appended."""
        registry = _make_registry("google_docs")
        nodes = _make_nodes(registry)
        plan = _make_plan_with_completed_steps(3, results={1: "Created doc.", 2: "Wrote content."})

        artifacts = [
            {"step_number": 1, "type": "document", "name": "Test Doc", "id": "1hK-LoFzab_xZZK", "url": "https://docs.google.com/1hK-LoFzab_xZZK"},
            {"step_number": 2, "type": "document", "name": "Another", "id": "abc123"},
        ]
        result = nodes._get_previous_results(plan, current_index=3, artifacts=artifacts)

        # Step 1 artifact
        assert "EXACT RESOURCE IDs" in result
        assert "1hK-LoFzab_xZZK" in result
        assert "https://docs.google.com/1hK-LoFzab_xZZK" in result
        assert "[document] Test Doc" in result

        # Step 2 artifact
        assert "[document] Another" in result
        assert "abc123" in result

    def test_non_matching_artifacts_not_shown(self):
        """Artifacts from a different step_number are not appended to earlier steps."""
        registry = _make_registry("google_docs")
        nodes = _make_nodes(registry)
        plan = _make_plan_with_completed_steps(3, results={1: "Searched the web."})

        # Artifact belongs to step 2, but we're only looking at steps up to index 2 (step 1)
        artifacts = [
            {"step_number": 2, "type": "document", "name": "Future Doc", "id": "xyz789"},
        ]
        result = nodes._get_previous_results(plan, current_index=2, artifacts=artifacts)

        assert "Step 1: Searched the web." in result
        assert "EXACT RESOURCE" not in result
        assert "xyz789" not in result
