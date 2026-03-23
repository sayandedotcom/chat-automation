"""
Integration Registry for dynamic tool loading.

This module provides config-based tool indexing and filtering,
enabling token-efficient LLM calls by binding only needed tools.
"""

import asyncio
import logging
from pathlib import Path

import yaml
from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)

_registry_lock = asyncio.Lock()
_global_registry: "IntegrationRegistry | None" = None


class IntegrationConfig:
    """Configuration for a single integration loaded from YAML."""

    def __init__(self, name: str, config: dict):
        self.name = name
        self.tool_names = config.get("tool_names", [])  # Explicit tool names
        self.display_name = config.get("display_name", name)
        self.icon = config.get("icon", "default")
        self.requires_auth = config.get("requires_auth", False)
        self.mcp_server = config.get("mcp_server")
        self.planner_hints = config.get("planner_hints", "")
        self.executor_hints = config.get("executor_hints", "")
        self.ui_components = config.get("ui_components", {})


class IntegrationRegistry:
    """
    Pre-loads integrations at startup, provides filtered toolsets at runtime.

    Key features:
    - Config-based tool indexing (explicit tool names from YAML)
    - Instant tool filtering (no LLM call needed)
    - Reverse lookup for incremental loading
    """

    def __init__(self, config_path: Path | None = None):
        self._config_path = (
            config_path or Path(__file__).parent / "integration_config.yaml"
        )
        self._integrations: dict[str, IntegrationConfig] = {}
        self._tools_by_integration: dict[str, list[BaseTool]] = {}
        self._all_tools: list[BaseTool] = []
        self._tool_to_integration: dict[str, str] = {}  # Reverse lookup
        self._tool_name_to_integration: dict[str, str] = {}  # Config-based lookup
        self._tool_name_to_ui_component: dict[str, str | None] = {}
        self._initialized = False

    def _load_config(self):
        """Load integration config from YAML and build classifier index."""
        if not self._config_path.exists():
            logger.warning(f"Integration config not found at {self._config_path}")
            return

        with open(self._config_path) as f:
            config = yaml.safe_load(f)

        integrations_config = config.get("integrations", {})

        for name, integration_config in integrations_config.items():
            self._integrations[name] = IntegrationConfig(name, integration_config)
            ui_components = integration_config.get("ui_components", {})
            wildcard_component = ui_components.get("*")
            # Build reverse lookup from explicit tool_names
            for tool_name in integration_config.get("tool_names", []):
                self._tool_name_to_integration[tool_name] = name
                # Resolve ui_component: specific name > wildcard > None
                self._tool_name_to_ui_component[tool_name] = (
                    ui_components.get(tool_name) or wildcard_component
                )

        logger.info(f"Loaded {len(self._integrations)} integration configs")

        # Build classifier index from the same config
        from chat.integrations.classifier import get_classifier

        classifier = get_classifier()
        classifier.build_index(integrations_config)

    async def load_all(self, tokens: dict):
        """
        Load all MCP integrations and index tools by explicit tool_names from config.

        Args:
            tokens: Dict containing auth tokens (gmail_token, notion_token, etc.)
        """
        from chat.utils.mcp_client import create_mcp_client, load_mcp_tools

        self._load_config()

        client = create_mcp_client(**tokens)
        self._all_tools = await load_mcp_tools(client)

        for tool in self._all_tools:
            integration_name = self._tool_name_to_integration.get(tool.name)
            if integration_name:
                self._tools_by_integration.setdefault(integration_name, []).append(tool)
                self._tool_to_integration[tool.name] = integration_name
            else:
                logger.warning(
                    f"Tool '{tool.name}' not listed in any integration config"
                )

        self._initialized = True

        # Log summary
        for name, tools in self._tools_by_integration.items():
            logger.info(f"Integration '{name}': {len(tools)} tools indexed")

        logger.info(
            f"Registry initialized: {len(self._all_tools)} total tools, "
            f"{len(self._tools_by_integration)} integrations"
        )

    async def load_missing_servers(self, tokens: dict) -> None:
        """
        Incrementally load MCP servers for tokens that weren't available at startup.

        OAuth tokens (e.g. notion_token) arrive per-request via cookies, but the
        registry is pre-warmed at startup with only env-var tokens.  This method
        detects which servers are missing and spins them up on demand.
        """
        from chat.utils.mcp_client import create_mcp_client, load_mcp_tools

        # Map token keys → integration names that should exist in the registry
        token_to_integration = {
            "notion_token": "notion",
            "vercel_token": "vercel",
        }

        missing_tokens: dict[str, str] = {}
        for token_key, integration_name in token_to_integration.items():
            token_value = tokens.get(token_key)
            if token_value and integration_name not in self._tools_by_integration:
                missing_tokens[token_key] = token_value

        if not missing_tokens:
            return

        missing_names = [token_to_integration[k] for k in missing_tokens]
        logger.info(f"Incrementally loading MCP servers: {missing_names}")

        # Only pass the missing tokens — explicitly blank-out everything else
        # so create_mcp_client doesn't re-create servers from env vars.
        # Use empty strings (not None) for google_client_id/secret because
        # create_mcp_client falls back to env vars when these are None.
        all_keys = {
            "gmail_token",
            "vercel_token",
            "notion_token",
            "tavily_api_key",
        }
        call_args = {k: None for k in all_keys}
        call_args["google_client_id"] = ""
        call_args["google_client_secret"] = ""
        call_args.update(missing_tokens)

        client = create_mcp_client(**call_args)
        new_tools = await load_mcp_tools(client)

        # Deduplicate: skip tools already in the registry
        existing_tool_names = {t.name for t in self._all_tools}

        for tool in new_tools:
            if tool.name in existing_tool_names:
                continue  # already loaded

            integration_name = self._tool_name_to_integration.get(tool.name)
            if integration_name:
                self._tools_by_integration.setdefault(integration_name, []).append(tool)
                self._tool_to_integration[tool.name] = integration_name
            else:
                logger.warning(
                    f"Tool '{tool.name}' not listed in any integration config"
                )

            self._all_tools.append(tool)
            existing_tool_names.add(tool.name)

        logger.info(
            f"Incrementally loaded {len(new_tools)} tools from {missing_names}. "
            f"Total tools: {len(self._all_tools)}"
        )

    def get_toolset(self, integrations: list[str]) -> list[BaseTool]:
        """
        Get filtered tools for specified integrations (instant).

        Args:
            integrations: List of integration names to include

        Returns:
            List of tools from the specified integrations.
            Falls back to all tools if no matches found.
        """
        tools = []
        for integration in integrations:
            tools.extend(self._tools_by_integration.get(integration, []))
        return tools if tools else self._all_tools  # Fallback to all

    def get_integration_for_tool(self, tool_name: str) -> str | None:
        """
        Reverse lookup: find which integration provides a tool.

        Args:
            tool_name: Name of the tool to look up

        Returns:
            Integration name or None if not found
        """
        return self._tool_to_integration.get(tool_name)

    def get_ui_component_for_tool(self, tool_name: str) -> str | None:
        """Look up the UI component ID for a tool name (or None for generic card)."""
        return self._tool_name_to_ui_component.get(tool_name)

    def get_integration_config(self, name: str) -> IntegrationConfig | None:
        """Get configuration for an integration by name."""
        return self._integrations.get(name)

    def get_hints(self, integrations: list[str], hint_type: str = "planner") -> str:
        """
        Get combined hints for active integrations.

        Args:
            integrations: List of active integration names
            hint_type: "planner" or "executor"

        Returns:
            Combined hints string (empty string if no hints configured)
        """
        parts = []
        for name in integrations:
            config = self._integrations.get(name)
            if not config:
                continue
            hint = (
                config.planner_hints
                if hint_type == "planner"
                else config.executor_hints
            )
            if hint and hint.strip():
                parts.append(hint.strip())

        if not parts:
            return ""
        return "INTEGRATION-SPECIFIC GUIDELINES:\n" + "\n\n".join(parts) + "\n"

    def get_all_tools(self) -> list[BaseTool]:
        """Get all loaded tools."""
        return self._all_tools

    @property
    def is_initialized(self) -> bool:
        """Check if the registry has been initialized."""
        return self._initialized


async def classify_integrations(
    request: str, registry: IntegrationRegistry
) -> list[str]:
    """
    Classify which integrations are needed using LLM-based classification.

    Uses Gemini Flash to determine which integrations match the user request.
    Falls back to ["web_search"] if the classifier is not initialised or
    classification fails.

    Args:
        request: User's request text
        registry: Initialized IntegrationRegistry

    Returns:
        List of integration names that should be loaded
    """
    from chat.integrations.classifier import get_classifier

    classifier = get_classifier()

    if not classifier.is_initialized:
        logger.warning("Classifier not initialised, defaulting to web_search")
        return ["web_search"]

    result = await classifier.classify_with_fallback(request)

    logger.info(
        "Smart router classification",
        extra={
            "request": request[:100],
            "classified_integrations": result.integrations,
            "method": result.method,
            "confidence": f"{result.confidence:.2f}",
        },
    )

    return result.integrations


async def get_registry(tokens: dict) -> IntegrationRegistry:
    """Get the global registry singleton, initializing if needed (async-safe).

    Ensures the registry is only initialized once at startup, avoiding the
    5-15s tool loading overhead on every request.
    """
    global _global_registry

    if _global_registry is not None and _global_registry.is_initialized:
        return _global_registry

    async with _registry_lock:
        if _global_registry is None or not _global_registry.is_initialized:
            logger.info("Initializing global registry singleton")
            _global_registry = IntegrationRegistry()
            await _global_registry.load_all(tokens)
            logger.info(
                "Registry initialized with %d tools",
                len(_global_registry.get_all_tools()),
            )

    return _global_registry


def get_registry_sync() -> IntegrationRegistry | None:
    """
    Get the global registry synchronously (returns None if not initialized).

    Use this when you need to check if the registry is available
    without awaiting initialization.
    """
    return _global_registry
