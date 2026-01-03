from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from pathlib import Path
import json
import os

from chat.service import ChatService
from chat.schemas import ChatRequestSchema, ChatResponseSchemaSerializable, ThreadMessagesResponseSchema, GmailCredentialsSyncSchema
from chat.utils.mcp_client import TAVILY_API_KEY

app = FastAPI(title="Chat Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Service cache for reusing initialized services
_services: dict[str, ChatService] = {}


async def get_or_create_service(
    gmail_token: Optional[str] = None,
    vercel_token: Optional[str] = None,
    notion_token: Optional[str] = None,
    tavily_api_key: Optional[str] = None,
) -> ChatService:
    """Get or create a chat service for the given token combination."""
    cache_key = f"{gmail_token or ''}:{vercel_token or ''}:{notion_token or ''}:{tavily_api_key or ''}"
    
    if cache_key not in _services:
        service = ChatService(
            gmail_token=gmail_token,
            vercel_token=vercel_token,
            notion_token=notion_token,
            tavily_api_key=tavily_api_key,
        )
        await service.initialize()
        _services[cache_key] = service
    
    return _services[cache_key]


@app.get("/health")
def health():
    return {"status": "chat"}


@app.post("/chat")
async def chat(data: ChatRequestSchema) -> ChatResponseSchemaSerializable:
    """Process a chat message and return the response."""
    try:
        service = await get_or_create_service(
            gmail_token=data.gmail_token,
            vercel_token=data.vercel_token,
            notion_token=data.notion_token,
            tavily_api_key=TAVILY_API_KEY,
        )
        return await service.chat(data)
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/chat/messages")
async def get_chat_messages(thread_id: str) -> ThreadMessagesResponseSchema:
    """Get messages for a specific thread ID."""
    if not thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")
    
    try:
        service = await get_or_create_service(
            tavily_api_key=TAVILY_API_KEY,
        )
        return await service.get_thread_messages(thread_id)
    except Exception as e:
        print(f"Error getting messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/chat/threads")
async def list_threads():
    """List all conversation threads."""
    try:
        service = await get_or_create_service(
            tavily_api_key=TAVILY_API_KEY,
        )
        threads = await service.list_threads()
        return {"threads": threads}
    except Exception as e:
        print(f"Error listing threads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# MCP credentials directory (where workspace-mcp stores OAuth credentials)
MCP_CREDENTIALS_DIR = Path.home() / ".google_workspace_mcp" / "credentials"


@app.post("/sync-gmail-credentials")
async def sync_gmail_credentials(data: GmailCredentialsSyncSchema):
    """
    Sync Gmail OAuth credentials from frontend to MCP's credential store.
    This allows the MCP server to use frontend-obtained tokens without prompting again.
    """
    try:
        # Ensure credentials directory exists
        MCP_CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)
        
        # Create credentials in the format MCP expects
        # MCP creates files like: user_<email_hash>.json
        # For simplicity, we'll use a standard filename that single-user mode will find
        credentials = {
            "token": data.access_token,
            "refresh_token": data.refresh_token,
            "token_uri": data.token_uri,
            "client_id": data.client_id,
            "client_secret": data.client_secret,
            "scopes": data.scopes,
        }
        
        if data.expiry:
            credentials["expiry"] = data.expiry
        
        # Write to a user credentials file
        # MCP looks for files matching user_*.json pattern
        cred_file = MCP_CREDENTIALS_DIR / "user_frontend_oauth.json"
        with open(cred_file, "w") as f:
            json.dump(credentials, f, indent=2)
        
        print(f"✅ Gmail credentials synced to {cred_file}")
        return {"status": "success", "message": "Gmail credentials synced to MCP"}
        
    except Exception as e:
        print(f"Error syncing Gmail credentials: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))