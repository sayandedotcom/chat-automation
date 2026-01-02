"""
Chat Schemas

Pydantic models and TypedDict states for the chat agent.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Annotated, TypedDict
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


# -------------------
# Graph State
# -------------------
class ChatState(TypedDict):
    """State for the chat graph."""
    messages: Annotated[List[BaseMessage], add_messages]


# -------------------
# API Request/Response Schemas
# -------------------
class ChatRequestSchema(BaseModel):
    """Request schema for chat endpoint."""
    message: str = Field(..., description="User's chat message")
    thread_id: Optional[str] = Field(default=None, description="Thread ID for conversation continuity")
    # Optional OAuth tokens for MCP integrations
    gmail_token: Optional[str] = Field(default=None, description="Gmail OAuth access token")
    vercel_token: Optional[str] = Field(default=None, description="Vercel access token")
    notion_token: Optional[str] = Field(default=None, description="Notion OAuth access token")


class ChatResponseSchema(BaseModel):
    """Response schema for chat endpoint."""
    response: str = Field(..., description="Assistant's response")
    thread_id: str = Field(..., description="Thread ID for conversation continuity")


class ChatResponseSchemaSerializable(BaseModel):
    """Serializable version of chat response for API responses."""
    messages: List[dict] = Field(default_factory=list, description="List of message dictionaries")
    response: str = Field(..., description="Assistant's response")
    thread_id: str = Field(..., description="Thread ID for conversation continuity")
    tools_used: List[str] = Field(default_factory=list, description="List of tools used in this response")


class ThreadMessagesResponseSchema(BaseModel):
    """Response schema for getting thread messages."""
    messages: List[dict] = Field(default_factory=list, description="List of message dictionaries")
    thread_id: str = Field(..., description="Thread ID")