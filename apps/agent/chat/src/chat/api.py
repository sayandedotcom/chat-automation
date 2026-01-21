from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from pathlib import Path
import json
from mangum import Mangum

from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from chat.service import ChatService
from chat.workflow_service import WorkflowService
from chat.schemas import ChatRequestSchema, ChatResponseSchemaSerializable, ThreadMessagesResponseSchema, GmailCredentialsSyncSchema
from chat.utils.mcp_client import TAVILY_API_KEY
from chat.integration_registry import get_registry


# -------------------
# Workflow Schemas
# -------------------
class WorkflowRequestSchema(BaseModel):
    """Request schema for workflow execution."""
    request: str = Field(..., description="Natural language workflow request")
    thread_id: Optional[str] = Field(default=None, description="Thread ID for workflow continuity")
    # Optional OAuth tokens
    gmail_token: Optional[str] = Field(default=None)
    notion_token: Optional[str] = Field(default=None)
    slack_token: Optional[str] = Field(default=None)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Pre-warm MCP connections and registry at startup.

    This eliminates the 5-15s cold start delay on first request
    by loading all integrations and tools during app initialization.
    """
    print("🔥 Pre-warming MCP connections and registry...")

    # Get tokens from environment
    tokens = {
        "gmail_token": os.getenv("GMAIL_TOKEN"),
        "notion_token": os.getenv("NOTION_TOKEN"),
        "vercel_token": os.getenv("VERCEL_TOKEN"),
        "tavily_api_key": TAVILY_API_KEY,
    }

    try:
        registry = await get_registry(tokens)
        print(f"✅ Registry pre-warmed with {len(registry.get_all_tools())} tools")
    except Exception as e:
        print(f"⚠️ Failed to pre-warm registry: {e}")
        import traceback
        traceback.print_exc()

    yield  # App runs here

    print("👋 Shutting down...")


app = FastAPI(title="Chat Agent API", lifespan=lifespan)

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


# -------------------
# Workflow Endpoints
# -------------------
# Workflow service cache
_workflow_services: dict[str, WorkflowService] = {}


async def get_or_create_workflow_service(
    gmail_token: Optional[str] = None,
    notion_token: Optional[str] = None,
    slack_token: Optional[str] = None,
) -> WorkflowService:
    """Get or create a workflow service for the given token combination."""
    cache_key = f"wf:{gmail_token or ''}:{notion_token or ''}:{slack_token or ''}"
    
    if cache_key not in _workflow_services:
        service = WorkflowService(
            gmail_token=gmail_token,
            notion_token=notion_token,
            slack_token=slack_token,
            tavily_api_key=TAVILY_API_KEY,
        )
        await service.initialize()
        _workflow_services[cache_key] = service
    
    return _workflow_services[cache_key]


@app.post("/workflow")
async def execute_workflow(data: WorkflowRequestSchema):
    """
    Execute a dynamic multi-step workflow.
    
    Example request:
    {
        "request": "research best auth services, create a notion doc with findings, send to team on slack"
    }
    
    The AI will:
    1. Break down the request into steps
    2. Execute each step sequentially
    3. Return the final result with all step outputs
    """
    try:
        service = await get_or_create_workflow_service(
            gmail_token=data.gmail_token,
            notion_token=data.notion_token,
            slack_token=data.slack_token,
        )
        
        result = await service.execute(
            request=data.request,
            thread_id=data.thread_id,
        )
        
        return result
        
    except Exception as e:
        print(f"Error in workflow endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/workflow/stream")
async def execute_workflow_stream(data: WorkflowRequestSchema):
    """
    Execute a workflow with streaming progress updates.
    Returns Server-Sent Events (SSE) with real-time step progress.
    """
    async def generate():
        waiting_for_approval = False
        captured_thread_id = data.thread_id  # May be None initially
        service = None
        
        try:
            service = await get_or_create_workflow_service(
                gmail_token=data.gmail_token,
                notion_token=data.notion_token,
                slack_token=data.slack_token,
            )
            
            async for event in service.execute_stream(
                request=data.request,
                thread_id=data.thread_id,
            ):
                # Capture thread_id from events
                if event.get("thread_id"):
                    captured_thread_id = event.get("thread_id")
                
                # Log each event being sent
                event_type = event.get("type", "unknown")
                print(f"📤 SSE EVENT SENT: type={event_type}")
                if event_type == "approval_required":
                    print(f"   📋 Approval data: step={event.get('interrupt', {}).get('step_number')}")
                    waiting_for_approval = True
                elif event_type == "progress":
                    steps_info = event.get("plan", {}).get("steps", [])
                    statuses = [f"{s.get('step_number')}:{s.get('status')}" for s in steps_info]
                    print(f"   📊 Steps: {statuses}")
                
                yield f"data: {json.dumps(event)}\n\n"
            
            # Only send done if workflow completed, not if paused for approval
            print(f"📤 Stream ended. waiting_for_approval={waiting_for_approval}")
            if not waiting_for_approval:
                print("📤 SSE EVENT SENT: type=done")
                yield "data: {\"type\": \"done\"}\n\n"
            else:
                print("📤 NOT sending done - workflow paused for approval")
            
        except Exception as e:
            error_message = str(e)
            # Filter out benign LangGraph internal errors that don't affect execution
            benign_errors = [
                "get_config outside of a runnable context",
                "Called get_config outside",
            ]
            is_benign = any(benign in error_message for benign in benign_errors)
            
            if not is_benign:
                yield f"data: {json.dumps({'type': 'error', 'message': error_message})}\n\n"
            else:
                # This error typically happens when interrupt() is called
                # Check if there's a pending interrupt to yield
                print(f"Filtered benign error (workflow paused for approval): {error_message}")
                print(f"   Checking for interrupt with thread_id: {captured_thread_id}")
                
                if service and captured_thread_id:
                    try:
                        # Get the workflow state to check for pending interrupts
                        config = {"configurable": {"thread_id": captured_thread_id}}
                        state_snapshot = await service._workflow.get_app().aget_state(config)
                        
                        print(f"   State snapshot tasks: {state_snapshot.tasks if state_snapshot else 'None'}")
                        
                        if state_snapshot and state_snapshot.tasks:
                            for task in state_snapshot.tasks:
                                print(f"   Task: {task}, has interrupts: {hasattr(task, 'interrupts')}")
                                if hasattr(task, 'interrupts') and task.interrupts:
                                    for interrupt in task.interrupts:
                                        print(f"   Interrupt: {interrupt}, has value: {hasattr(interrupt, 'value')}")
                                        if hasattr(interrupt, 'value'):
                                            value = interrupt.value
                                            print(f"🔐 Found pending interrupt from exception handler: {value}")
                                            yield f"data: {json.dumps({'type': 'approval_required', 'thread_id': captured_thread_id, 'interrupt': value})}\n\n"
                                            waiting_for_approval = True
                        else:
                            print("   No tasks found in state snapshot")
                    except Exception as inner_e:
                        import traceback
                        print(f"⚠️ Error checking interrupt state: {inner_e}")
                        traceback.print_exc()
                else:
                    print(f"   Cannot check interrupt: service={service is not None}, thread_id={captured_thread_id}")
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.get("/workflow/status/{thread_id}")
async def get_workflow_status(thread_id: str):
    """Get the current status of a workflow."""
    try:
        # Get any available workflow service
        if not _workflow_services:
            service = await get_or_create_workflow_service()
        else:
            service = list(_workflow_services.values())[0]
        
        state = await service.get_workflow_state(thread_id)
        if not state:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        return {"thread_id": thread_id, "state": state}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting workflow status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class WorkflowRetrySchema(BaseModel):
    """Request schema for workflow retry."""
    thread_id: str = Field(..., description="Thread ID of the workflow to retry")
    step_number: int = Field(..., description="Step number to retry from (1-indexed)")
    # Optional OAuth tokens
    gmail_token: Optional[str] = Field(default=None)
    notion_token: Optional[str] = Field(default=None)
    slack_token: Optional[str] = Field(default=None)


@app.post("/workflow/retry")
async def retry_workflow_step(data: WorkflowRetrySchema):
    """
    Retry a failed workflow step and continue execution.
    
    Resets the specified step and all subsequent steps to 'pending',
    then resumes execution from that step.
    """
    try:
        service = await get_or_create_workflow_service(
            gmail_token=data.gmail_token,
            notion_token=data.notion_token,
            slack_token=data.slack_token,
        )
        
        result = await service.retry_step(
            thread_id=data.thread_id,
            step_number=data.step_number,
        )
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in workflow retry endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class WorkflowResumeSchema(BaseModel):
    """Request schema for resuming workflow with HITL decision."""
    thread_id: str = Field(..., description="Thread ID of the workflow to resume")
    action: str = Field(..., description="Decision: 'approve', 'edit', or 'skip'")
    content: Optional[dict] = Field(default=None, description="Edited content (if action is 'edit')")
    # Optional OAuth tokens
    gmail_token: Optional[str] = Field(default=None)
    notion_token: Optional[str] = Field(default=None)
    slack_token: Optional[str] = Field(default=None)


@app.post("/workflow/resume")
async def resume_workflow_with_decision(data: WorkflowResumeSchema):
    """
    Resume a paused workflow with human decision (approve/edit/skip).
    
    Used for Human-in-the-Loop approval workflow.
    """
    try:
        service = await get_or_create_workflow_service(
            gmail_token=data.gmail_token,
            notion_token=data.notion_token,
            slack_token=data.slack_token,
        )
        
        # Build decision object
        decision = {
            "action": data.action,
        }
        if data.content:
            decision["content"] = data.content
        
        result = await service.resume_workflow(
            thread_id=data.thread_id,
            decision=decision,
        )
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in workflow resume endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# Create handler for AWS Lambda with specific configuration
handler = Mangum(app, api_gateway_base_path=None, lifespan="off")