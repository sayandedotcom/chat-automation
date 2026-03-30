"""
Chat Agent Package

A LangGraph-based chat agent with MCP tool integrations.
"""

import logging

from chat.service import ChatService
from chat.schemas import WorkflowState, WorkflowPlan

__all__ = [
    "ChatService",
    "WorkflowState",
    "WorkflowPlan",
]

logger = logging.getLogger(__name__)


def main() -> None:
    """Entry point for the chat package."""
    logger.info("Chat Agent - Use 'fastapi dev src/chat/api.py' to run the server")


def studio() -> None:
    """Run LangGraph Studio local development server."""
    import subprocess
    import sys
    from pathlib import Path

    config_path = Path(__file__).parent.parent.parent / "langgraph.json"
    if not config_path.exists():
        logger.error("langgraph.json not found at %s", config_path)
        sys.exit(1)

    subprocess.run([sys.executable, "-m", "langgraph", "dev"], cwd=config_path.parent)
