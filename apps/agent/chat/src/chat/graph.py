"""
Chat Graph

LangGraph workflow definition for the chat agent.
Supports PostgreSQL for production or MemorySaver for development.
"""

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import tools_condition
from langchain_core.tools import BaseTool
from typing import List, Optional
from dotenv import load_dotenv
import os

from chat.schemas import ChatState
from chat.nodes import ChatNodes

# Load environment variables
load_dotenv()


def get_checkpointer():
    """
    Get the appropriate checkpointer based on environment.
    Uses PostgreSQL if DATABASE_URL is set, otherwise MemorySaver.
    """
    database_url = os.getenv("DATABASE_URL")
    
    if database_url:
        try:
            from langgraph.checkpoint.postgres import PostgresSaver
            import psycopg
            
            # Create connection pool
            conn = psycopg.connect(database_url)
            checkpointer = PostgresSaver(conn)
            checkpointer.setup()  # Create tables if they don't exist
            print(f"✅ Using PostgreSQL checkpointer")
            return checkpointer
        except Exception as e:
            print(f"⚠️ Failed to connect to PostgreSQL: {e}")
            print("Falling back to MemorySaver")
    
    print("📝 Using MemorySaver (in-memory, not persistent)")
    return MemorySaver()


class ChatWorkflow:
    """Chat workflow using LangGraph."""
    
    def __init__(self, tools: List[BaseTool] = None):
        """
        Initialize the chat workflow.
        
        Args:
            tools: List of MCP tools to use in the workflow
        """
        self.tools = tools or []
        self.checkpointer = get_checkpointer()
        self.nodes = ChatNodes(tools=self.tools)
        
        # Build the graph
        self.app = self._build_graph()
    
    def _build_graph(self):
        """Build and compile the LangGraph workflow."""
        workflow = StateGraph(ChatState)
        
        # Add chat node
        workflow.add_node("chat_node", self.nodes.chat_node)
        workflow.add_edge(START, "chat_node")
        
        # Add tool node if tools are available
        if self.tools:
            tool_node = self.nodes.get_tool_node()
            workflow.add_node("tools", tool_node)
            workflow.add_conditional_edges("chat_node", tools_condition)
            workflow.add_edge("tools", "chat_node")
        else:
            workflow.add_edge("chat_node", END)
        
        # Compile with checkpointer
        return workflow.compile(checkpointer=self.checkpointer)
    
    def get_app(self):
        """Get the compiled workflow app."""
        return self.app
    
    def get_checkpointer(self):
        """Get the checkpointer for state persistence."""
        return self.checkpointer