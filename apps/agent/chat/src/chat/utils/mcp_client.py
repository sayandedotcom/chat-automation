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
    
    sanitized = {}
    for key, value in schema.items():
        if value is None:
            # Skip null values - Gemini doesn't accept them
            continue
        elif key in ('anyOf', 'oneOf'):
            # Handle anyOf/oneOf: pick the first non-null type definition
            if isinstance(value, list) and value:
                for item in value:
                    if isinstance(item, dict):
                        # Skip "null" type definitions
                        if item.get('type') == 'null':
                            continue
                        # Use the first valid type definition
                        sanitized_item = sanitize_tool_schema(item)
                        if sanitized_item:
                            # Merge the first valid definition into parent
                            for k, v in sanitized_item.items():
                                if k not in sanitized:
                                    sanitized[k] = v
                            break
        elif key == 'properties' and isinstance(value, dict):
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
            if sanitized_list or key == 'required':  # Keep required even if empty
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
        if hasattr(tool, 'args_schema') and tool.args_schema:
            # Handle both Pydantic models and plain dicts (JSON Schema)
            if isinstance(tool.args_schema, dict):
                schema = tool.args_schema
            elif hasattr(tool.args_schema, 'model_json_schema'):
                schema = tool.args_schema.model_json_schema()
            else:
                return tool
            
            sanitized_schema = sanitize_tool_schema(schema)
            # The schema is read-only, so we just log if there were issues
            if schema != sanitized_schema:
                print(f"⚠️ Sanitized schema for tool: {tool.name}")
    except Exception as e:
        print(f"⚠️ Could not sanitize tool {tool.name}: {e}")
    
    return tool


async def load_mcp_tools(client: MultiServerMCPClient) -> list[BaseTool]:
    """
    Load tools from the MCP client and sanitize their schemas.
    
    Args:
        client: Configured MCP client
    
    Returns:
        List of available tools with sanitized schemas
    """
    from langchain_core.tools import StructuredTool
    
    try:
        print("Loading MCP tools...")
        tools = await client.get_tools()
        
        # Process tools and sanitize schemas for Gemini compatibility
        safe_tools = []
        problematic_tools = []
        
        for tool in tools:
            try:
                # Get the schema (handle both dict and Pydantic model formats)
                if hasattr(tool, 'args_schema') and tool.args_schema:
                    if isinstance(tool.args_schema, dict):
                        original_schema = tool.args_schema
                    elif hasattr(tool.args_schema, 'model_json_schema'):
                        original_schema = tool.args_schema.model_json_schema()
                    else:
                        print(f"⚠️ Unknown args_schema type for {tool.name}: {type(tool.args_schema)}")
                        safe_tools.append(tool)
                        continue
                    
                    # Sanitize the schema
                    sanitized_schema = sanitize_tool_schema(original_schema)
                    
                    # Check if sanitization removed essential parts
                    if not sanitized_schema.get('properties'):
                        # If no properties left, add a minimal schema
                        sanitized_schema = {
                            "type": "object",
                            "properties": {},
                            "required": []
                        }
                    
                    # Ensure 'type' is set
                    if 'type' not in sanitized_schema:
                        sanitized_schema['type'] = 'object'
                    
                    # Create a new tool with the sanitized schema
                    # We need to modify the args_schema directly since it's a dict
                    if isinstance(tool.args_schema, dict):
                        tool.args_schema = sanitized_schema
                    
                    if original_schema != sanitized_schema:
                        print(f"🔧 Sanitized schema for tool: {tool.name}")
                
                safe_tools.append(tool)
                
            except Exception as e:
                print(f"⚠️ Skipping problematic tool {tool.name}: {e}")
                problematic_tools.append(tool.name)
        
        if problematic_tools:
            print(f"⚠️ Skipped {len(problematic_tools)} tools with incompatible schemas: {problematic_tools}")
        
        print(f"✅ Loaded {len(safe_tools)} MCP tools: {[t.name for t in safe_tools]}")
        return safe_tools
    except Exception as e:
        print(f"❌ Warning: Failed to load MCP tools: {e}")
        import traceback
        traceback.print_exc()
        return []


# Default Tavily API key from environment
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
