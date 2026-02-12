"""
Integration Registry for dynamic tool loading.

This module provides config-based tool indexing and filtering,
enabling token-efficient LLM calls by binding only needed tools.
"""

import logging
import re
from pathlib import Path
from typing import Optional

import yaml
from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)

# Global singleton for registry (pre-warmed at startup)
_global_registry: Optional["IntegrationRegistry"] = None


class IntegrationConfig:
    """Configuration for a single integration loaded from YAML."""

    def __init__(self, name: str, config: dict):
        self.name = name
        self.tool_names = config.get("tool_names", [])  # Explicit tool names
        self.display_name = config.get("display_name", name)
        self.icon = config.get("icon", "default")
        self.requires_auth = config.get("requires_auth", False)
        self.mcp_server = config.get("mcp_server")
        self.request_patterns = config.get("request_patterns", [])


class IntegrationRegistry:
    """
    Pre-loads integrations at startup, provides filtered toolsets at runtime.

    Key features:
    - Config-based tool indexing (explicit tool names from YAML)
    - Instant tool filtering (no LLM call needed)
    - Reverse lookup for incremental loading
    """

    def __init__(self, config_path: Optional[Path] = None):
        self._config_path = config_path or Path(__file__).parent / "integration_config.yaml"
        self._integrations: dict[str, IntegrationConfig] = {}
        self._tools_by_integration: dict[str, list[BaseTool]] = {}
        self._all_tools: list[BaseTool] = []
        self._tool_to_integration: dict[str, str] = {}  # Reverse lookup
        self._tool_name_to_integration: dict[str, str] = {}  # Config-based lookup
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
            # Build reverse lookup from config tool_names
            for tool_name in integration_config.get("tool_names", []):
                self._tool_name_to_integration[tool_name] = name

        logger.info(f"Loaded {len(self._integrations)} integration configs")

        # Build classifier index from the same config
        from chat.classifier import get_classifier

        classifier = get_classifier()
        classifier.build_index(integrations_config)

    async def load_all(self, tokens: dict):
        """
        Load all MCP integrations and index by explicit tool names from config.

        Args:
            tokens: Dict containing auth tokens (gmail_token, notion_token, etc.)
        """
        from chat.utils.mcp_client import create_mcp_client, load_mcp_tools

        self._load_config()

        # Create MCP client and load all tools
        client = create_mcp_client(**tokens)
        self._all_tools = await load_mcp_tools(client)

        # Index tools by integration using explicit tool names from config
        for tool in self._all_tools:
            integration_name = self._tool_name_to_integration.get(tool.name)

            if integration_name:
                if integration_name not in self._tools_by_integration:
                    self._tools_by_integration[integration_name] = []
                self._tools_by_integration[integration_name].append(tool)
                self._tool_to_integration[tool.name] = integration_name
            else:
                logger.warning(f"Tool '{tool.name}' not listed in any integration config")

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

        # Only pass the missing tokens — explicitly None-out everything else
        # so create_mcp_client doesn't re-create servers from env vars.
        all_keys = {
            "gmail_token", "vercel_token", "notion_token",
            "tavily_api_key", "google_client_id", "google_client_secret",
        }
        call_args = {k: None for k in all_keys}
        call_args.update(missing_tokens)

        client = create_mcp_client(**call_args)
        new_tools = await load_mcp_tools(client)

        # Deduplicate: skip tools already in the registry
        existing_tool_names = {t.name for t in self._all_tools}

        # Index the new tools into the existing registry
        for tool in new_tools:
            if tool.name in existing_tool_names:
                continue  # already loaded

            integration_name = self._tool_name_to_integration.get(tool.name)
            if integration_name:
                self._tools_by_integration.setdefault(integration_name, []).append(tool)
                self._tool_to_integration[tool.name] = integration_name
            else:
                logger.warning(f"Tool '{tool.name}' not listed in any integration config")

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

    def get_integration_for_tool(self, tool_name: str) -> Optional[str]:
        """
        Reverse lookup: find which integration provides a tool.

        Args:
            tool_name: Name of the tool to look up

        Returns:
            Integration name or None if not found
        """
        return self._tool_to_integration.get(tool_name)

    def get_integration_config(self, name: str) -> Optional[IntegrationConfig]:
        """Get configuration for an integration by name."""
        return self._integrations.get(name)

    def get_all_tools(self) -> list[BaseTool]:
        """Get all loaded tools."""
        return self._all_tools

    @property
    def is_initialized(self) -> bool:
        """Check if the registry has been initialized."""
        return self._initialized


async def classify_integrations(request: str, registry: IntegrationRegistry) -> list[str]:
    """
    Classify which integrations are needed using two-phase approach.

    Phase 1: Enhanced NLP — stemmed keywords + fuzzy phrase matching (instant)
    Phase 2: LLM fallback — Gemini Flash classification (if Phase 1 is ambiguous)

    Falls back to legacy regex-only classification if the classifier is not
    initialised (e.g. during tests or when config loading failed).

    Args:
        request: User's request text
        registry: Initialized IntegrationRegistry

    Returns:
        List of integration names that should be loaded
    """
    from chat.classifier import get_classifier

    classifier = get_classifier()

    if not classifier.is_initialized:
        logger.warning("Classifier not initialised, falling back to legacy regex matching")
        return _legacy_classify(request, registry)

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


def _legacy_classify(request: str, registry: IntegrationRegistry) -> list[str]:
    """
    Original regex-only classification (kept as safety-net fallback).
    """
    request_lower = request.lower()
    needed = set()

    # Check each integration's request patterns
    for name, config in registry._integrations.items():
        for pattern in config.request_patterns:
            if re.search(pattern, request_lower):
                needed.add(name)
                break

    # Smart defaults based on common intents
    if not needed:
        # Question format -> likely web search
        if re.match(r"^(what|who|when|where|why|how)\b", request_lower):
            needed.add("web_search")
        # Action format -> likely workspace
        elif re.match(r"^(create|make|draft|send|schedule)\b", request_lower):
            # Check for specific workspace tools
            if "email" in request_lower or "mail" in request_lower:
                needed.add("gmail")
            elif "doc" in request_lower:
                needed.add("google_docs")
            elif "calendar" in request_lower or "meeting" in request_lower:
                needed.add("google_calendar")
            else:
                needed.add("web_search")  # Fallback
        else:
            # Ultimate fallback
            needed.add("web_search")

    logger.info(
        "Legacy classification",
        extra={
            "request": request[:100],
            "classified_integrations": list(needed),
        },
    )

    return list(needed)


async def get_registry(tokens: dict) -> IntegrationRegistry:
    """
    Get the global registry singleton, initializing if needed.

    This function ensures the registry is only initialized once at startup,
    avoiding the 5-15s tool loading overhead on every request.

    Args:
        tokens: Dict containing auth tokens (gmail_token, notion_token, etc.)

    Returns:
        Initialized IntegrationRegistry singleton
    """
    global _global_registry

    if _global_registry is None or not _global_registry.is_initialized:
        logger.info("Initializing global registry singleton...")
        _global_registry = IntegrationRegistry()
        await _global_registry.load_all(tokens)
        logger.info(f"Registry initialized with {len(_global_registry.get_all_tools())} tools")

    return _global_registry


def get_registry_sync() -> Optional[IntegrationRegistry]:
    """
    Get the global registry synchronously (returns None if not initialized).

    Use this when you need to check if the registry is available
    without awaiting initialization.
    """
    return _global_registry
