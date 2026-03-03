"""
Tests for the "never ask for email" defense-in-depth layers.

Covers:
1. Zero-tool guard in smart_router_node
2. Tool schema sanitization (_strip_autofill_params_from_schema)
3. Tool auto-fill wrapping (_wrap_tool_with_autofill, _is_google_workspace_tool)
4. Strengthened executor prompt text
5. connected_integrations in resume/retry schemas
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from langchain_core.messages import HumanMessage
from langchain_core.tools import BaseTool

from chat.workflow.nodes import WorkflowNodes
from chat.integrations.registry import IntegrationConfig
from chat.utils.mcp_client import (
    _is_google_workspace_tool,
    _strip_autofill_params_from_schema,
    _wrap_tool_with_autofill,
)


# ---------------------------------------------------------------------------
# Helpers (shared with test_smart_router.py patterns)
# ---------------------------------------------------------------------------

def _make_registry_with_auth(*specs) -> MagicMock:
    """Build a mock IntegrationRegistry.

    Each spec is a tuple: (name, requires_auth, mcp_server, has_tools).
    """
    registry = MagicMock()
    configs = {}
    tools_by_integration = {}

    for name, requires_auth, mcp_server, has_tools in specs:
        cfg = IntegrationConfig(
            name,
            {
                "display_name": name.replace("_", " ").title(),
                "icon": "default",
                "requires_auth": requires_auth,
                "mcp_server": mcp_server,
            },
        )
        configs[name] = cfg
        if has_tools:
            fake_tool = MagicMock()
            fake_tool.name = f"{name}_tool"
            tools_by_integration[name] = [fake_tool]
        else:
            tools_by_integration[name] = []

    registry.get_integration_config.side_effect = lambda n: configs.get(n)
    registry.get_toolset.side_effect = lambda names: [
        t for n in names for t in tools_by_integration.get(n, [])
    ]
    registry._tools_by_integration = tools_by_integration
    registry.get_hints.return_value = ""
    return registry


def _make_nodes(registry: MagicMock) -> WorkflowNodes:
    mock_llm = MagicMock()
    mock_llm.bind_tools.return_value = MagicMock()
    nodes = WorkflowNodes(tools=[], registry=registry)
    nodes.executor_llm = mock_llm
    nodes.executor_with_tools = mock_llm
    return nodes


def _make_state(
    user_msg: str,
    connected_integrations: list[str] | None = None,
    artifacts: list[dict] | None = None,
) -> dict:
    return {
        "messages": [HumanMessage(content=user_msg)],
        "artifacts": artifacts or [],
        "connected_integrations": connected_integrations or [],
    }


def _make_mock_tool(name: str, schema: dict | None = None) -> MagicMock:
    """Build a mock BaseTool with a dict args_schema."""
    tool = MagicMock(spec=BaseTool)
    tool.name = name
    tool.args_schema = schema
    # Make invoke/ainvoke real callables so functools.wraps works
    tool.invoke = MagicMock(return_value="ok")
    tool.ainvoke = AsyncMock(return_value="ok")
    return tool


# ===================================================================
# 1. Zero-tool guard in smart_router_node
# ===================================================================

@pytest.mark.asyncio
@patch("chat.workflow.nodes.ToolNode", MagicMock)
class TestZeroToolGuard:
    """If an auth-required integration has 0 tools loaded, smart_router_node
    should return auth_required_integrations instead of letting the LLM
    run without tools."""

    @patch("chat.integrations.registry.classify_integrations", new_callable=AsyncMock)
    async def test_zero_tools_triggers_auth_required(self, mock_classify):
        """Gmail classified + auth passes + 0 tools → auth_required returned."""
        mock_classify.return_value = ["gmail"]
        # has_tools=False simulates MCP server failure
        registry = _make_registry_with_auth(
            ("gmail", True, "google_workspace", False),
        )
        nodes = _make_nodes(registry)

        state = _make_state("catch me up on my latest emails", ["gmail"])
        result = await nodes.smart_router_node(state)

        assert "auth_required_integrations" in result
        assert len(result["auth_required_integrations"]) == 1
        assert result["auth_required_integrations"][0]["mcp_server"] == "google_workspace"
        assert result["auth_required_integrations"][0]["display_name"] == "Gmail"
        assert result["total_tool_count"] == 0

    @patch("chat.integrations.registry.classify_integrations", new_callable=AsyncMock)
    async def test_tools_loaded_no_guard_trigger(self, mock_classify):
        """Gmail classified + auth passes + tools loaded → normal flow."""
        mock_classify.return_value = ["gmail"]
        registry = _make_registry_with_auth(
            ("gmail", True, "google_workspace", True),
        )
        nodes = _make_nodes(registry)

        state = _make_state("catch me up on my latest emails", ["gmail"])
        result = await nodes.smart_router_node(state)

        assert "auth_required_integrations" not in result or not result.get("auth_required_integrations")
        assert result["total_tool_count"] > 0

    @patch("chat.integrations.registry.classify_integrations", new_callable=AsyncMock)
    async def test_non_auth_integration_skipped(self, mock_classify):
        """web_search (no auth) with 0 tools should NOT trigger the guard."""
        mock_classify.return_value = ["web_search"]
        registry = _make_registry_with_auth(
            ("web_search", False, None, False),
        )
        nodes = _make_nodes(registry)

        state = _make_state("search for python tutorials")
        result = await nodes.smart_router_node(state)

        # Should proceed normally, no auth_required
        assert not result.get("auth_required_integrations")

    @patch("chat.integrations.registry.classify_integrations", new_callable=AsyncMock)
    async def test_mixed_integrations_only_missing_flagged(self, mock_classify):
        """Multiple integrations: only the ones with 0 tools are flagged."""
        mock_classify.return_value = ["gmail", "google_docs"]
        registry = _make_registry_with_auth(
            ("gmail", True, "google_workspace", True),       # tools loaded
            ("google_docs", True, "google_workspace", False),  # MCP failed
        )
        nodes = _make_nodes(registry)

        state = _make_state("email the doc to someone", ["gmail", "google-docs"])
        result = await nodes.smart_router_node(state)

        assert "auth_required_integrations" in result
        assert len(result["auth_required_integrations"]) == 1
        assert result["auth_required_integrations"][0]["display_name"] == "Google Docs"

    @patch("chat.integrations.registry.classify_integrations", new_callable=AsyncMock)
    async def test_unauthenticated_takes_precedence_over_zero_tools(self, mock_classify):
        """If user isn't authed at all, the auth check fires first (before zero-tool guard)."""
        mock_classify.return_value = ["gmail"]
        registry = _make_registry_with_auth(
            ("gmail", True, "google_workspace", False),
        )
        nodes = _make_nodes(registry)

        # connected_integrations is empty → user not authed
        state = _make_state("check my emails", [])
        result = await nodes.smart_router_node(state)

        # The pre-flight auth check fires first
        assert "auth_required_integrations" in result
        assert result["auth_required_integrations"][0]["connect_id"] == "gmail"


# ===================================================================
# 2. Tool schema sanitization
# ===================================================================

class TestStripAutofillParams:
    """_strip_autofill_params_from_schema removes userId, user_id, and
    email-like identity params from tool schemas."""

    def test_removes_userId_from_properties(self):
        tool = _make_mock_tool("search_gmail_messages", {
            "type": "object",
            "properties": {
                "userId": {"type": "string", "description": "The user's email address"},
                "query": {"type": "string", "description": "Search query"},
            },
            "required": ["userId", "query"],
        })

        _strip_autofill_params_from_schema(tool)

        schema = tool.args_schema
        assert "userId" not in schema["properties"]
        assert "userId" not in schema["required"]
        assert "query" in schema["properties"]
        assert "query" in schema["required"]

    def test_removes_user_id_underscore(self):
        tool = _make_mock_tool("get_gmail_message_content", {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "User ID"},
                "message_id": {"type": "string"},
            },
            "required": ["user_id", "message_id"],
        })

        _strip_autofill_params_from_schema(tool)

        assert "user_id" not in tool.args_schema["properties"]
        assert "user_id" not in tool.args_schema["required"]
        assert "message_id" in tool.args_schema["properties"]

    def test_removes_email_identity_param(self):
        """Strips params where description mentions 'email address' and name
        looks like identity (user, email, account, owner)."""
        tool = _make_mock_tool("create_gmail_filter", {
            "type": "object",
            "properties": {
                "user_email": {
                    "type": "string",
                    "description": "The user's email address to create filter for",
                },
                "criteria": {"type": "object", "description": "Filter criteria"},
            },
            "required": ["user_email", "criteria"],
        })

        _strip_autofill_params_from_schema(tool)

        assert "user_email" not in tool.args_schema["properties"]
        assert "user_email" not in tool.args_schema["required"]
        assert "criteria" in tool.args_schema["properties"]

    def test_preserves_non_identity_email_param(self):
        """A 'to' parameter mentioning email should NOT be stripped (it's the
        recipient, not the authenticated user)."""
        tool = _make_mock_tool("send_gmail_message", {
            "type": "object",
            "properties": {
                "to": {
                    "type": "string",
                    "description": "Recipient email address",
                },
                "subject": {"type": "string"},
            },
            "required": ["to", "subject"],
        })

        _strip_autofill_params_from_schema(tool)

        # "to" doesn't have "user"/"account"/"owner" in the name → keep it
        assert "to" in tool.args_schema["properties"]

    def test_no_schema_no_error(self):
        """Tool without args_schema doesn't raise."""
        tool = _make_mock_tool("search_gmail_messages", None)
        _strip_autofill_params_from_schema(tool)  # Should not raise

    def test_empty_properties_no_error(self):
        """Tool with empty properties dict is handled gracefully."""
        tool = _make_mock_tool("search_gmail_messages", {
            "type": "object",
            "properties": {},
            "required": [],
        })
        _strip_autofill_params_from_schema(tool)  # Should not raise


# ===================================================================
# 3. Tool auto-fill wrapping
# ===================================================================

class TestIsGoogleWorkspaceTool:
    """_is_google_workspace_tool correctly identifies Google Workspace tools."""

    def test_gmail_tools(self):
        assert _is_google_workspace_tool("search_gmail_messages") is True
        assert _is_google_workspace_tool("send_gmail_message") is True
        assert _is_google_workspace_tool("get_gmail_message_content") is True
        assert _is_google_workspace_tool("draft_gmail_message") is True
        assert _is_google_workspace_tool("list_gmail_labels") is True
        assert _is_google_workspace_tool("manage_gmail_label") is True
        assert _is_google_workspace_tool("modify_gmail_message_labels") is True
        assert _is_google_workspace_tool("batch_modify_gmail_message_labels") is True
        assert _is_google_workspace_tool("create_gmail_filter") is True
        assert _is_google_workspace_tool("delete_gmail_filter") is True

    def test_calendar_tools(self):
        assert _is_google_workspace_tool("list_calendars") is True
        assert _is_google_workspace_tool("get_events") is True
        assert _is_google_workspace_tool("create_event") is True
        assert _is_google_workspace_tool("modify_event") is True
        assert _is_google_workspace_tool("delete_event") is True
        assert _is_google_workspace_tool("query_freebusy") is True

    def test_drive_tools(self):
        assert _is_google_workspace_tool("search_drive_files") is True
        assert _is_google_workspace_tool("get_drive_file_content") is True
        assert _is_google_workspace_tool("list_drive_items") is True
        assert _is_google_workspace_tool("create_drive_file") is True
        assert _is_google_workspace_tool("share_drive_file") is True

    def test_non_google_tools(self):
        assert _is_google_workspace_tool("tavily_search") is False
        assert _is_google_workspace_tool("API-post-search") is False
        assert _is_google_workspace_tool("search_documentation") is False
        assert _is_google_workspace_tool("use_vercel_cli") is False

    def test_docs_sheets_slides_not_matched(self):
        """Docs/Sheets/Slides tools don't start with the gmail/drive/calendar
        prefixes — confirm they are correctly classified based on their actual
        tool names from integration_config.yaml."""
        # These have prefixes like search_docs, create_doc, etc. that are NOT
        # in the prefix list, so they won't be matched.  This is intentional —
        # docs/sheets/slides tools generally don't have userId parameters.
        assert _is_google_workspace_tool("create_doc") is False
        assert _is_google_workspace_tool("create_spreadsheet") is False


class TestWrapToolWithAutofill:
    """_wrap_tool_with_autofill injects userId='me' at call time."""

    def test_invoke_injects_userId(self):
        """The wrapper mutates the input dict to add userId before calling original."""
        captured = {}

        def fake_invoke(input, config=None, **kwargs):
            captured.update(input if isinstance(input, dict) else {"_raw": input})
            return {}

        tool = MagicMock(spec=BaseTool)
        tool.name = "search_gmail_messages"
        tool.invoke = fake_invoke
        tool.ainvoke = AsyncMock(return_value={})

        wrapped = _wrap_tool_with_autofill(tool)

        wrapped.invoke({"query": "test"})
        assert captured["userId"] == "me"
        assert captured["query"] == "test"

    def test_invoke_does_not_override_explicit_userId(self):
        captured = {}

        def fake_invoke(input, config=None, **kwargs):
            captured.update(input if isinstance(input, dict) else {})
            return {}

        tool = MagicMock(spec=BaseTool)
        tool.name = "search_gmail_messages"
        tool.invoke = fake_invoke
        tool.ainvoke = AsyncMock(return_value={})

        wrapped = _wrap_tool_with_autofill(tool)

        wrapped.invoke({"query": "test", "userId": "specific@example.com"})
        assert captured["userId"] == "specific@example.com"

    @pytest.mark.asyncio
    async def test_ainvoke_injects_userId(self):
        captured = {}

        async def fake_ainvoke(input, config=None, **kwargs):
            captured.update(input if isinstance(input, dict) else {})
            return {}

        tool = MagicMock(spec=BaseTool)
        tool.name = "send_gmail_message"
        tool.invoke = MagicMock(return_value={})
        tool.ainvoke = fake_ainvoke

        wrapped = _wrap_tool_with_autofill(tool)

        await wrapped.ainvoke({"to": "test@example.com", "subject": "hi"})
        assert captured["userId"] == "me"
        assert captured["to"] == "test@example.com"

    def test_non_dict_input_ignored(self):
        """If input is not a dict (e.g. a string), auto-fill is skipped."""
        captured = {"called": False}

        def fake_invoke(input, config=None, **kwargs):
            captured["called"] = True
            captured["input"] = input
            return {}

        tool = MagicMock(spec=BaseTool)
        tool.name = "search_gmail_messages"
        tool.invoke = fake_invoke
        tool.ainvoke = AsyncMock(return_value={})

        wrapped = _wrap_tool_with_autofill(tool)

        wrapped.invoke("raw string input")
        assert captured["called"] is True
        assert captured["input"] == "raw string input"


# ===================================================================
# 4. Executor prompt text
# ===================================================================

class TestExecutorPromptStrengthened:
    """Verify the executor system prompt contains the strengthened auth rules."""

    def test_never_ask_for_userId(self):
        from chat.workflow.prompts import EXECUTOR_SYSTEM_PROMPT

        prompt = EXECUTOR_SYSTEM_PROMPT
        assert "You NEVER need their email address, userId, or account info" in prompt

    def test_gmail_implicit_user(self):
        from chat.workflow.prompts import EXECUTOR_SYSTEM_PROMPT

        assert "For all Gmail tools, the authenticated user is implicit" in EXECUTOR_SYSTEM_PROMPT

    def test_google_workspace_identity_handled(self):
        from chat.workflow.prompts import EXECUTOR_SYSTEM_PROMPT

        assert "Google Workspace tools (Docs, Sheets, Slides, Calendar, Drive)" in EXECUTOR_SYSTEM_PROMPT

    def test_auth_failure_response_template(self):
        from chat.workflow.prompts import EXECUTOR_SYSTEM_PROMPT

        assert "This action couldn't be completed. Please reconnect" in EXECUTOR_SYSTEM_PROMPT

    def test_never_ask_any_info_for_auth(self):
        from chat.workflow.prompts import EXECUTOR_SYSTEM_PROMPT

        assert "Do NOT ask the user for ANY information to work around auth failures" in EXECUTOR_SYSTEM_PROMPT


# ===================================================================
# 5. connected_integrations in resume/retry schemas
# ===================================================================

class TestResumeRetrySchemas:
    """WorkflowResumeSchema and WorkflowRetrySchema accept connected_integrations."""

    def test_resume_schema_accepts_connected_integrations(self):
        from chat.routers.chat import WorkflowResumeSchema

        data = WorkflowResumeSchema(
            thread_id="test-123",
            action="approve",
            connected_integrations=["gmail", "google-docs"],
        )
        assert data.connected_integrations == ["gmail", "google-docs"]

    def test_resume_schema_defaults_to_none(self):
        from chat.routers.chat import WorkflowResumeSchema

        data = WorkflowResumeSchema(
            thread_id="test-123",
            action="approve",
        )
        assert data.connected_integrations is None

    def test_retry_schema_accepts_connected_integrations(self):
        from chat.routers.chat import WorkflowRetrySchema

        data = WorkflowRetrySchema(
            thread_id="test-123",
            step_number=1,
            connected_integrations=["notion"],
        )
        assert data.connected_integrations == ["notion"]

    def test_retry_schema_defaults_to_none(self):
        from chat.routers.chat import WorkflowRetrySchema

        data = WorkflowRetrySchema(
            thread_id="test-123",
            step_number=1,
        )
        assert data.connected_integrations is None


# ===================================================================
# 6. Integration config executor_hints contain auth reminders
# ===================================================================

class TestIntegrationConfigHints:
    """Executor hints in integration_config.yaml include auth reminders."""

    def test_gmail_hints_contain_auth_reminder(self):
        import yaml
        import os

        config_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "src",
            "chat",
            "integrations",
            "integration_config.yaml",
        )
        with open(config_path) as f:
            config = yaml.safe_load(f)

        gmail_hints = config["integrations"]["gmail"]["executor_hints"]
        assert "NEVER ask for the user's email address or userId" in gmail_hints

    def test_google_docs_hints_contain_auth_reminder(self):
        import yaml
        import os

        config_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "src",
            "chat",
            "integrations",
            "integration_config.yaml",
        )
        with open(config_path) as f:
            config = yaml.safe_load(f)

        docs_hints = config["integrations"]["google_docs"]["executor_hints"]
        assert "NEVER ask for the user's email address" in docs_hints
