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

    def _inject_email(self, input: dict) -> None:
        """Mutate tool call args in-place to inject user_google_email."""
        if not self._user_email or not isinstance(input, dict):
            return
        messages = input.get("messages", [])
        if not isinstance(messages, list):
            return
        for msg in messages:
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tool_call in msg.tool_calls:
                    if isinstance(tool_call.get("args"), dict):
                        inject_user_email_into_tool_input(
                            tool_call["args"], self._user_email
                        )

    def invoke(self, input: dict, config=None, **kwargs) -> dict:
        """Invoke tools with user email injection."""
        self._inject_email(input)
        return super().invoke(input, config=config, **kwargs)

    async def ainvoke(self, input: dict, config=None, **kwargs) -> dict:
        """Async invoke tools with user email injection."""
        self._inject_email(input)
        return await super().ainvoke(input, config=config, **kwargs)
