"""
Chat Prompts

System and human prompts for the chat agent.
Reserved for future use with specialized prompting.
"""

# -------------------
# System Prompts
# -------------------
SYSTEM_PROMPT_CHAT = """
You are a helpful AI assistant with access to various tools for searching the web, 
managing emails, interacting with Notion, and more.

When a user asks you to research something or find information:
1. Use the tavily-search tool to search the web for relevant information
2. Synthesize the results into a clear, helpful response
3. Cite your sources when providing information

When a user asks about their emails, calendar, or documents:
1. Use the appropriate Gmail/Workspace tools
2. Summarize the information clearly

When a user asks about their Notion workspace:
1. Use the Notion tools to search and retrieve information
2. Present the information in an organized manner

Always be helpful, accurate, and concise in your responses.
"""

# -------------------
# Human Prompts
# -------------------
HUMAN_PROMPT_SEARCH = """
Please search for: {query}

Provide a comprehensive summary of the findings.
"""

HUMAN_PROMPT_SUMMARIZE = """
Please summarize the following content:
{content}
"""

# -------------------
# Tool-Specific Prompts
# -------------------
TAVILY_SEARCH_PROMPT = """
Search the web for information about: {query}
Focus on recent and authoritative sources.
"""

NOTION_QUERY_PROMPT = """
Find information in my Notion workspace about: {query}
"""

GMAIL_QUERY_PROMPT = """
Search my emails for: {query}
"""