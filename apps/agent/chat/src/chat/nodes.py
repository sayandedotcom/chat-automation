"""
Chat Nodes

Graph nodes for the chat agent workflow.
"""

from langchain_core.messages import BaseMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import BaseTool
from langgraph.prebuilt import ToolNode
from typing import List
from dotenv import load_dotenv
import os

from chat.schemas import ChatState

# Load environment variables
load_dotenv()


class ChatNodes:
    """Nodes for the chat agent graph."""
    
    def __init__(self, tools: List[BaseTool] = None):
        """
        Initialize chat nodes with LLM and tools.
        
        Args:
            tools: List of tools to bind to the LLM
        """
        self.tools = tools or []
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
        )
        self.llm_with_tools = self.llm.bind_tools(self.tools) if self.tools else self.llm
        
        # Create tool node if tools are available
        self.tool_node = ToolNode(self.tools) if self.tools else None
    
    async def chat_node(self, state: ChatState) -> dict:
        """
        Main chat node that processes messages and may request tool calls.
        
        Args:
            state: Current chat state with messages
            
        Returns:
            Updated state with assistant's response
        """
        from langchain_core.messages import SystemMessage
        from chat.prompts import SYSTEM_PROMPT_CHAT
        
        messages = state["messages"]
        
        # Add system prompt at the beginning if not already present
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [SystemMessage(content=SYSTEM_PROMPT_CHAT)] + list(messages)
        
        response = await self.llm_with_tools.ainvoke(messages)
        return {"messages": [response]}
    
    def get_tool_node(self) -> ToolNode:
        """Get the tool node for the graph."""
        return self.tool_node