"""
Shared helpers for workflow nodes.

Contains EmailAwareToolNode — a ToolNode subclass that injects the
authenticated user's email into Google Workspace tool calls.
"""

from typing import Optional

from langchain_core.tools import BaseTool
from langgraph.prebuilt import ToolNode

from chat.utils.mcp_client import inject_user_email_into_tool_input


class EmailAwareToolNode(ToolNode):
    """ToolNode that injects google_user_email from workflow state into tool inputs."""

    def __init__(self, tools: list[BaseTool], **kwargs):
        super().__init__(tools, **kwargs)
        self._user_email: Optional[str] = None

    def set_user_email(self, email: Optional[str]):
        """Set the user email to inject into tool calls."""
        self._user_email = email

    def invoke(self, input: dict, config=None, **kwargs) -> dict:
        """Invoke tools with user email injection."""
        if self._user_email and isinstance(input, dict):
            # Inject email into all tool call arguments
            messages = input.get("messages", [])
            if messages and isinstance(messages, list):
                for msg in messages:
                    if hasattr(msg, "tool_calls") and msg.tool_calls:
                        for tool_call in msg.tool_calls:
                            if isinstance(tool_call.get("args"), dict):
                                inject_user_email_into_tool_input(
                                    tool_call["args"], self._user_email
                                )
        return super().invoke(input, config=config, **kwargs)
