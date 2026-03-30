"""
MCP Adapters Client

Configuration and factory for MCP (Model Context Protocol) clients.
Supports Gmail, Vercel, Notion, and Tavily integrations.
"""

from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_core.tools import BaseTool
from pathlib import Path

import asyncio
import hashlib
import json
import logging
import os
import shutil
import time

from chat.config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
)
from chat.schemas import GoogleCredentialsSchema

logger = logging.getLogger(__name__)

_GOOGLE_CREDENTIALS_ROOT = Path("/tmp/google-mcp")
_GOOGLE_CREDENTIALS_TTL_SECONDS = 60 * 60


def _cleanup_stale_google_credentials(current_user_id: str) -> None:
    if not _GOOGLE_CREDENTIALS_ROOT.exists():
        return

    current_hash = hashlib.sha256(current_user_id.encode()).hexdigest()[:16]
    cutoff = time.time() - _GOOGLE_CREDENTIALS_TTL_SECONDS

    for user_dir in _GOOGLE_CREDENTIALS_ROOT.iterdir():
        if not user_dir.is_dir():
            continue
        if user_dir.name == current_hash:
            continue
        try:
            if user_dir.stat().st_mtime < cutoff:
                shutil.rmtree(user_dir, ignore_errors=True)
        except OSError:
            logger.warning("Failed to inspect Google credential dir %s", user_dir)


def _build_google_credentials_dir(user_id: str) -> Path:
    user_hash = hashlib.sha256(user_id.encode()).hexdigest()[:16]
    return _GOOGLE_CREDENTIALS_ROOT / user_hash / "credentials"


def _write_google_credentials(
    user_id: str,
    credentials: GoogleCredentialsSchema,
    client_id: str,
    client_secret: str,
) -> str:
    _cleanup_stale_google_credentials(user_id)
    credentials_dir = _build_google_credentials_dir(user_id)
    credentials_dir.mkdir(parents=True, exist_ok=True)
    credential_file = credentials_dir / "user_frontend_oauth.json"
    payload: dict[str, object] = {
        "token": credentials.access_token,
        "refresh_token": credentials.refresh_token or "",
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": client_id,
        "client_secret": client_secret,
        "scopes": credentials.scopes,
    }
    if credentials.expiry:
        payload["expiry"] = credentials.expiry
    credential_file.write_text(json.dumps(payload, indent=2))
    return str(credentials_dir)


def create_mcp_client(
    user_id: str | None = None,
    gmail_token: str | None = None,
    google_credentials: GoogleCredentialsSchema | None = None,
    vercel_token: str | None = None,
    notion_token: str | None = None,
    tavily_api_key: str | None = None,
    google_client_id: str | None = None,
    google_client_secret: str | None = None,
) -> MultiServerMCPClient:
    """
    Create MCP client with connected integrations.
    Only includes servers for which we have tokens.

    Args:
        user_id: App user ID for request-scoped Google credential isolation
        gmail_token: Google OAuth access token for Gmail/Workspace (used as user identifier)
        google_credentials: Google OAuth credentials for request-scoped workspace-mcp
        vercel_token: Vercel access token
        notion_token: Notion OAuth access token
        tavily_api_key: Tavily API key for web search
        google_client_id: Google OAuth Client ID (for workspace-mcp)
        google_client_secret: Google OAuth Client Secret (for workspace-mcp)

    Returns:
        Configured MultiServerMCPClient instance
    """
    servers = {}

    client_id = google_client_id or GOOGLE_CLIENT_ID
    client_secret = google_client_secret or GOOGLE_CLIENT_SECRET

    if user_id and google_credentials and client_id and client_secret:
        mcp_creds_dir = _write_google_credentials(
            user_id=user_id,
            credentials=google_credentials,
            client_id=client_id,
            client_secret=client_secret,
        )
        workspace_env = os.environ.copy()
        workspace_env.update(
            {
                "GOOGLE_CLIENT_ID": client_id,
                "GOOGLE_CLIENT_SECRET": client_secret,
                "GOOGLE_MCP_CREDENTIALS_DIR": mcp_creds_dir,
            }
        )

        # Use pre-installed binary if available, fall back to uv tool run for dev
        ws_tools = [
            "--single-user",
            "--tools",
            "gmail",
            "drive",
            "calendar",
            "docs",
            "sheets",
            "slides",
        ]
        if shutil.which("workspace-mcp"):
            ws_cmd, ws_args = "workspace-mcp", ws_tools
        else:
            ws_cmd, ws_args = "uv", ["tool", "run", "workspace-mcp@1.11.1"] + ws_tools

        servers["google_workspace"] = {
            "transport": "stdio",
            "command": ws_cmd,
            "args": ws_args,
            "env": workspace_env,
            "cwd": "/tmp",
        }
        logger.info("Google Workspace MCP configured for user %s", user_id)

    if vercel_token:
        servers["vercel"] = {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@vercel/mcp-server"],
            "env": {**os.environ, "VERCEL_ACCESS_TOKEN": vercel_token},
        }

    if notion_token:
        # Use pre-installed binary if available, fall back to npx for dev
        if shutil.which("notion-mcp-server"):
            notion_cmd, notion_args = "notion-mcp-server", []
        else:
            notion_cmd, notion_args = "npx", ["-y", "@notionhq/notion-mcp-server@2.1.0"]
        servers["notion"] = {
            "transport": "stdio",
            "command": notion_cmd,
            "args": notion_args,
            "env": {**os.environ, "NOTION_TOKEN": notion_token},
        }

    if tavily_api_key:
        # Use pre-installed binary if available, fall back to npx for dev
        if shutil.which("tavily-mcp"):
            tavily_cmd, tavily_args = "tavily-mcp", []
        else:
            tavily_cmd, tavily_args = "npx", ["-y", "tavily-mcp@0.2.17"]
        servers["tavily"] = {
            "transport": "stdio",
            "command": tavily_cmd,
            "args": tavily_args,
            "env": {**os.environ, "TAVILY_API_KEY": tavily_api_key},
        }

    return MultiServerMCPClient(servers)


def sanitize_tool_schema(schema: dict) -> dict:
    """
    Recursively sanitize a tool schema to remove null values and fix
    compatibility issues with Gemini's function calling.

    Handles:
    - null values at any nesting level
    - anyOf/oneOf validators (simplifies to first non-null type)
    - Properties with None values
    - Empty required arrays
    """
    if not isinstance(schema, dict):
        return schema

    # Keys that Gemini's function-calling API does not support.
    # Passing them through causes warnings and can confuse tool-call generation.
    _UNSUPPORTED_KEYS = {"additionalProperties", "$schema"}

    sanitized = {}
    for key, value in schema.items():
        if value is None:
            # Skip null values - Gemini doesn't accept them
            continue
        elif key in _UNSUPPORTED_KEYS:
            # Strip keys unsupported by Gemini
            continue
        elif key in ("anyOf", "oneOf"):
            # Handle anyOf/oneOf: pick the first non-null type definition
            if isinstance(value, list) and value:
                for item in value:
                    if isinstance(item, dict):
                        # Skip "null" type definitions
                        if item.get("type") == "null":
                            continue
                        # Use the first valid type definition
                        sanitized_item = sanitize_tool_schema(item)
                        if sanitized_item:
                            # Merge the first valid definition into parent
                            for k, v in sanitized_item.items():
                                if k not in sanitized:
                                    sanitized[k] = v
                            break
        elif key == "properties" and isinstance(value, dict):
            # Sanitize each property, removing any with None values
            sanitized_props = {}
            for prop_name, prop_value in value.items():
                if prop_value is None:
                    continue
                if isinstance(prop_value, dict):
                    sanitized_prop = sanitize_tool_schema(prop_value)
                    if sanitized_prop:
                        sanitized_props[prop_name] = sanitized_prop
                else:
                    sanitized_props[prop_name] = prop_value
            if sanitized_props:
                sanitized[key] = sanitized_props
        elif isinstance(value, dict):
            sanitized_value = sanitize_tool_schema(value)
            if sanitized_value:  # Only add if not empty
                sanitized[key] = sanitized_value
        elif isinstance(value, list):
            sanitized_list = [
                sanitize_tool_schema(item) if isinstance(item, dict) else item
                for item in value
                if item is not None
            ]
            if sanitized_list or key == "required":  # Keep required even if empty
                sanitized[key] = sanitized_list
        else:
            sanitized[key] = value

    return sanitized


def sanitize_tool(tool: BaseTool) -> BaseTool:
    """
    Sanitize a tool's schema to be compatible with Gemini.
    """
    try:
        # Access and sanitize the args_schema if it exists
        if hasattr(tool, "args_schema") and tool.args_schema:
            # Handle both Pydantic models and plain dicts (JSON Schema)
            if isinstance(tool.args_schema, dict):
                schema = tool.args_schema
            elif hasattr(tool.args_schema, "model_json_schema"):
                schema = tool.args_schema.model_json_schema()
            else:
                return tool

            sanitized_schema = sanitize_tool_schema(schema)
            # The schema is read-only, so we just log if there were issues
            if schema != sanitized_schema:
                logger.debug("Sanitized schema for tool: %s", tool.name)
    except Exception as e:
        logger.warning("Could not sanitize tool %s: %s", tool.name, e)

    return tool


def _is_google_workspace_tool(name: str) -> bool:
    """Check if a tool belongs to Google Workspace MCP by prefix."""
    _PREFIXES = (
        "search_gmail",
        "get_gmail",
        "send_gmail",
        "draft_gmail",
        "list_gmail",
        "manage_gmail",
        "modify_gmail",
        "batch_modify_gmail",
        "create_gmail",
        "delete_gmail",
        "list_calendars",
        "get_events",
        "create_event",
        "modify_event",
        "delete_event",
        "query_freebusy",
        "search_drive",
        "get_drive",
        "list_drive",
        "create_drive",
        "import_to_google",
        "set_drive",
        "check_drive",
        "update_drive",
        "share_drive",
        "batch_share",
        "copy_drive",
        "transfer_drive",
        "remove_drive",
        "get_drive_file",
        "create_doc",
        "get_doc",
        "update_doc",
        "list_doc",
        "delete_doc",
        "append_to_doc",
        "search_docs",
        "modify_doc",
        "find_and_replace",
        "insert_doc",
        "inspect_doc",
        "batch_update_doc",
        "create_table",
        "debug_table",
        "export_doc",
        "update_paragraph",
        "create_sheet",
        "get_sheet",
        "update_sheet",
        "list_sheet",
        "read_sheet",
        "append_sheet",
        "clear_sheet",
        "delete_sheet",
        "modify_sheet",
        "format_sheet",
        "create_spreadsheet",
        "create_presentation",
        "get_slide",
        "update_slide",
        "add_slide",
        "list_slide",
        "delete_slide",
    )
    return any(name.startswith(p) for p in _PREFIXES)


def _strip_email_param_from_schema(tool: BaseTool) -> None:
    """Hide user_google_email from the LLM — it's auto-injected at call time."""
    try:
        if not (hasattr(tool, "args_schema") and tool.args_schema):
            return
        schema = tool.args_schema if isinstance(tool.args_schema, dict) else None
        if schema is None and hasattr(tool.args_schema, "model_json_schema"):
            schema = tool.args_schema.model_json_schema()
        if not schema:
            return

        props = schema.get("properties", {})
        required = schema.get("required", [])
        if "user_google_email" in props:
            del props["user_google_email"]
        if "user_google_email" in required:
            required.remove("user_google_email")

        # Persist the modified dict back when the original was a Pydantic model
        # (model_json_schema() returns a new dict each time — edits are lost otherwise)
        if not isinstance(tool.args_schema, dict):
            object.__setattr__(tool, "args_schema", schema)
    except Exception as e:
        logger.warning(f"Could not strip email param from {tool.name}: {e}")


class _AutofillEmailTool(BaseTool):
    wrapped_tool: BaseTool
    account_email: str | None = None
    name: str = ""
    description: str = ""

    class Config:
        arbitrary_types_allowed = True

    def __init__(self, wrapped_tool: BaseTool, account_email: str | None):
        super().__init__(
            wrapped_tool=wrapped_tool,
            account_email=account_email,
            name=wrapped_tool.name,
            description=wrapped_tool.description,
        )
        if hasattr(wrapped_tool, "args_schema"):
            object.__setattr__(self, "args_schema", wrapped_tool.args_schema)

    def _inject(self, input):
        if (
            isinstance(input, dict)
            and "user_google_email" not in input
            and self.account_email
        ):
            input["user_google_email"] = self.account_email
        return input

    def _run(self, *args, config=None, **kwargs):
        if "user_google_email" not in kwargs and self.account_email:
            kwargs["user_google_email"] = self.account_email
        return self.wrapped_tool._run(*args, config=config, **kwargs)

    async def _arun(self, *args, config=None, **kwargs):
        if "user_google_email" not in kwargs and self.account_email:
            kwargs["user_google_email"] = self.account_email
        return await self.wrapped_tool._arun(*args, config=config, **kwargs)

    def invoke(self, input, config=None, **kwargs):
        return super().invoke(self._inject(input), config=config, **kwargs)

    async def ainvoke(self, input, config=None, **kwargs):
        return await super().ainvoke(self._inject(input), config=config, **kwargs)


async def load_mcp_tools(
    client: MultiServerMCPClient,
    retries: int = 3,
    base_delay: float = 1.0,
    google_account_email: str | None = None,
) -> list[BaseTool]:
    """
    Load tools from the MCP client and sanitize their schemas.

    Args:
        client: Configured MCP client

    Returns:
        List of available tools with sanitized schemas
    """

    # workspace-mcp internal tools that should never be exposed to the LLM.
    # Auth is handled by frontend OAuth, not workspace-mcp's built-in flows.
    _BLOCKED_TOOLS = {"start_google_auth"}

    try:
        logger.info("Loading MCP tools")

        # MCP servers are spawned as child processes (uvx/npx) and may take a few
        # seconds to initialize. Retry with exponential backoff to handle transient
        # startup failures without surfacing an error to the user.
        last_exc: Exception | None = None
        for attempt in range(retries):
            try:
                tools = await client.get_tools()
                break
            except Exception as exc:
                last_exc = exc
                if attempt < retries - 1:
                    delay = base_delay * (2**attempt)
                    logger.warning(
                        "MCP connection attempt %d/%d failed: %s (retrying in %.1fs)",
                        attempt + 1,
                        retries,
                        exc,
                        delay,
                    )
                    await asyncio.sleep(delay)
        else:
            raise last_exc  # type: ignore[misc]

        safe_tools = []
        problematic_tools = []

        for tool in tools:
            if tool.name in _BLOCKED_TOOLS:
                logger.debug("Filtered internal tool: %s", tool.name)
                continue
            try:
                if hasattr(tool, "args_schema") and tool.args_schema:
                    if isinstance(tool.args_schema, dict):
                        original_schema = tool.args_schema
                    elif hasattr(tool.args_schema, "model_json_schema"):
                        original_schema = tool.args_schema.model_json_schema()
                    else:
                        logger.warning(
                            "Unknown args_schema type for %s: %s",
                            tool.name,
                            type(tool.args_schema),
                        )
                        safe_tools.append(tool)
                        continue

                    sanitized_schema = sanitize_tool_schema(original_schema)

                    if not sanitized_schema.get("properties"):
                        sanitized_schema = {
                            "type": "object",
                            "properties": {},
                            "required": [],
                        }

                    if "type" not in sanitized_schema:
                        sanitized_schema["type"] = "object"

                    if isinstance(tool.args_schema, dict):
                        tool.args_schema = sanitized_schema

                    if original_schema != sanitized_schema:
                        logger.debug("Sanitized schema for tool: %s", tool.name)

                safe_tools.append(tool)

            except Exception as e:
                logger.warning("Skipping problematic tool %s: %s", tool.name, e)
                problematic_tools.append(tool.name)

        if problematic_tools:
            logger.warning(
                "Skipped %d tools with incompatible schemas: %s",
                len(problematic_tools),
                problematic_tools,
            )

        # Auto-fill user_google_email for Google Workspace tools so the LLM
        # never asks for it — resolved from stored OAuth credentials.
        for i, tool in enumerate(safe_tools):
            if _is_google_workspace_tool(tool.name):
                _strip_email_param_from_schema(tool)
                safe_tools[i] = _AutofillEmailTool(
                    wrapped_tool=tool, account_email=google_account_email
                )

        logger.info("Loaded %d MCP tools", len(safe_tools))
        return safe_tools
    except Exception:
        logger.exception("Failed to load MCP tools")
        return []
