"""
MCP Adapters Client

Configuration and factory for MCP (Model Context Protocol) clients.
Supports Gmail, Vercel, Notion, and Tavily integrations.
"""

from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_core.tools import BaseTool
from typing import Optional
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()


def create_mcp_client(
    gmail_token: Optional[str] = None,
    vercel_token: Optional[str] = None,
    notion_token: Optional[str] = None,
    tavily_api_key: Optional[str] = None,
) -> MultiServerMCPClient:
    """
    Create MCP client with connected integrations.
    Only includes servers for which we have tokens.
    
    Args:
        gmail_token: Google OAuth access token for Gmail/Workspace
        vercel_token: Vercel access token
        notion_token: Notion OAuth access token
        tavily_api_key: Tavily API key for web search
    
    Returns:
        Configured MultiServerMCPClient instance
    """
    servers = {}

    if gmail_token:
        servers["gmail"] = {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@google/mcp-server-workspace"],
            "env": {"GOOGLE_ACCESS_TOKEN": gmail_token},
        }

    if vercel_token:
        servers["vercel"] = {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@vercel/mcp-server"],
            "env": {"VERCEL_ACCESS_TOKEN": vercel_token},
        }

    if notion_token:
        servers["notion"] = {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@notionhq/notion-mcp-server"],
            "env": {"NOTION_TOKEN": notion_token},
        }

    if tavily_api_key:
        servers["tavily"] = {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "tavily-mcp@latest"],
            "env": {"TAVILY_API_KEY": tavily_api_key},
        }

    return MultiServerMCPClient(servers)


async def load_mcp_tools(client: MultiServerMCPClient) -> list[BaseTool]:
    """
    Load tools from the MCP client.
    
    Args:
        client: Configured MCP client
    
    Returns:
        List of available tools
    """
    try:
        print("Loading MCP tools...")
        tools = await client.get_tools()
        print(f"✅ Loaded {len(tools)} MCP tools: {[t.name for t in tools]}")
        return tools
    except Exception as e:
        print(f"❌ Warning: Failed to load MCP tools: {e}")
        import traceback
        traceback.print_exc()
        return []


# Default Tavily API key from environment
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
