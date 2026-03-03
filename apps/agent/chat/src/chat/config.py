"""
Centralized configuration for the Chat Agent service.

Loads environment variables once from the monorepo root .env file
and exposes them as module-level constants. All other modules should
import from here instead of calling os.getenv() directly.
"""

import os
from pathlib import Path
from dotenv import load_dotenv


def _find_monorepo_root() -> Path:
    """Walk up from this file to find the monorepo root (contains turbo.json)."""
    current = Path(__file__).resolve().parent
    for parent in current.parents:
        if (parent / "turbo.json").exists():
            return parent
    return current  # fallback


load_dotenv(_find_monorepo_root() / ".env")

# ── LLM ──────────────────────────────────────────────────────────────────────
GOOGLE_API_KEY: str | None = os.getenv("GOOGLE_API_KEY")

# ── Google OAuth (for MCP workspace servers) ─────────────────────────────────
GOOGLE_CLIENT_ID: str | None = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET: str | None = os.getenv("GOOGLE_CLIENT_SECRET")

# ── Integration tokens (populated at runtime via OAuth flow) ─────────────────
GMAIL_TOKEN: str | None = os.getenv("GMAIL_TOKEN")
NOTION_TOKEN: str | None = os.getenv("NOTION_TOKEN")
VERCEL_TOKEN: str | None = os.getenv("VERCEL_TOKEN")

# ── Search ───────────────────────────────────────────────────────────────────
TAVILY_API_KEY: str | None = os.getenv("TAVILY_API_KEY")

# ── MCP credentials directory ────────────────────────────────────────────────
_DEFAULT_MCP_CREDENTIALS_DIR = "/tmp/.google_workspace_mcp/credentials"
GOOGLE_MCP_CREDENTIALS_DIR: Path = Path(
    os.getenv("GOOGLE_MCP_CREDENTIALS_DIR", _DEFAULT_MCP_CREDENTIALS_DIR)
)

# ── App URLs ─────────────────────────────────────────────────────────────────
APP_URL: str | None = os.getenv("APP_URL")
