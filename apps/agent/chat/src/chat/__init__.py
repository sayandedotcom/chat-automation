"""
Chat Agent Package

A LangGraph-based chat agent with MCP tool integrations.
"""

from chat.service import ChatService
from chat.schemas import WorkflowState, WorkflowPlan, GmailCredentialsSyncSchema

__all__ = [
    "ChatService",
    "WorkflowState",
    "WorkflowPlan",
    "GmailCredentialsSyncSchema",
]


def main() -> None:
    """Entry point for the chat package."""
    print("Chat Agent - Use 'fastapi dev src/chat/api.py' to run the server")
