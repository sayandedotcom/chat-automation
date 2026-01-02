"""
Chat Service

Business logic layer for the chat agent.
Handles MCP client initialization, workflow execution, and message management.
"""

from langchain_core.messages import HumanMessage
from typing import Optional
import uuid

from chat.graph import ChatWorkflow
from chat.utils.mcp_client import create_mcp_client, load_mcp_tools
from chat.schemas import (
    ChatRequestSchema,
    ChatResponseSchemaSerializable,
    ThreadMessagesResponseSchema,
)


class ChatService:
    """Service layer for chat operations."""
    
    def __init__(
        self,
        gmail_token: Optional[str] = None,
        vercel_token: Optional[str] = None,
        notion_token: Optional[str] = None,
        tavily_api_key: Optional[str] = None,
    ):
        """
        Initialize the chat service.
        
        Args:
            gmail_token: Google OAuth access token
            vercel_token: Vercel access token
            notion_token: Notion OAuth access token
            tavily_api_key: Tavily API key
        """
        self.gmail_token = gmail_token
        self.vercel_token = vercel_token
        self.notion_token = notion_token
        self.tavily_api_key = tavily_api_key
        
        self._client = None
        self._tools = []
        self._workflow = None
        self._initialized = False
    
    async def initialize(self):
        """Initialize MCP client, load tools, and build workflow."""
        if self._initialized:
            return
        
        # Create MCP client
        self._client = create_mcp_client(
            gmail_token=self.gmail_token,
            vercel_token=self.vercel_token,
            notion_token=self.notion_token,
            tavily_api_key=self.tavily_api_key,
        )
        
        # Load MCP tools
        self._tools = await load_mcp_tools(self._client)
        
        # Build workflow
        self._workflow = ChatWorkflow(tools=self._tools)
        self._initialized = True
        
        print(f"✅ Chat service initialized with {len(self._tools)} tools")
    
    async def chat(self, request: ChatRequestSchema) -> ChatResponseSchemaSerializable:
        """
        Process a chat message and return the response.
        
        Args:
            request: Chat request with message and optional thread_id
            
        Returns:
            Chat response with assistant's reply and thread_id
        """
        if not self._initialized:
            await self.initialize()
        
        # Generate thread ID if not provided
        thread_id = request.thread_id or str(uuid.uuid4())
        
        # Invoke the workflow
        config = {"configurable": {"thread_id": thread_id}}
        result = await self._workflow.get_app().ainvoke(
            {"messages": [HumanMessage(content=request.message)]},
            config=config,
        )
        
        # Extract response
        messages = result.get("messages", [])
        response_content = ""
        if messages:
            last_message = messages[-1]
            response_content = last_message.content if hasattr(last_message, 'content') else str(last_message)
        
        # Convert messages to serializable format
        serializable_messages = []
        for msg in messages:
            if hasattr(msg, 'type') and hasattr(msg, 'content'):
                role = "user" if msg.type == "human" else "assistant"
                serializable_messages.append({
                    "role": role,
                    "content": msg.content
                })
            elif isinstance(msg, dict):
                serializable_messages.append(msg)
            else:
                serializable_messages.append({
                    "role": "unknown",
                    "content": str(msg)
                })
        
        return ChatResponseSchemaSerializable(
            messages=serializable_messages,
            response=response_content,
            thread_id=thread_id,
            tools_used=[t.name for t in self._tools] if self._tools else [],
        )
    
    async def get_thread_messages(self, thread_id: str) -> ThreadMessagesResponseSchema:
        """
        Get all messages in a conversation thread.
        
        Args:
            thread_id: The thread ID to retrieve messages for
            
        Returns:
            Thread messages response
        """
        if not self._initialized:
            await self.initialize()
        
        config = {"configurable": {"thread_id": thread_id}}
        
        try:
            state = await self._workflow.get_app().aget_state(config)
            messages = state.values.get("messages", [])
            
            serializable_messages = []
            for msg in messages:
                if hasattr(msg, 'type') and hasattr(msg, 'content'):
                    role = "user" if msg.type == "human" else "assistant"
                    serializable_messages.append({
                        "role": role,
                        "content": msg.content
                    })
                elif isinstance(msg, dict):
                    serializable_messages.append(msg)
                else:
                    serializable_messages.append({
                        "role": "unknown",
                        "content": str(msg)
                    })
            
            return ThreadMessagesResponseSchema(
                messages=serializable_messages,
                thread_id=thread_id,
            )
        except Exception as e:
            print(f"Error getting messages for thread {thread_id}: {e}")
            return ThreadMessagesResponseSchema(
                messages=[],
                thread_id=thread_id,
            )
    
    async def list_threads(self) -> list[str]:
        """
        List all conversation threads.
        
        Returns:
            List of thread IDs
        """
        if not self._initialized:
            await self.initialize()
        
        threads = set()
        try:
            checkpointer = self._workflow.get_checkpointer()
            async for checkpoint in checkpointer.alist(None):
                threads.add(checkpoint.config["configurable"]["thread_id"])
        except Exception as e:
            print(f"Error listing threads: {e}")
        
        return list(threads)