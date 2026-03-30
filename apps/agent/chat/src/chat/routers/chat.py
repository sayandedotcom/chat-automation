"""
Chat Router

Handles all /chat* endpoints: workflow execution, streaming, resume, status, and retry.
"""

import asyncio
import hashlib
import json
import logging

from collections.abc import AsyncIterator

from cachetools import TTLCache
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from chat.config import TAVILY_API_KEY
from chat.schemas import GoogleCredentialsSchema
from chat.service import ChatService
from chat.validation import (
    validate_request,
    validate_thread_id,
    validate_connected_integrations,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# SSE heartbeat interval (seconds) — keeps ALB connection alive during long AI processing
_HEARTBEAT_INTERVAL = 15

# Bounded service cache: max 64 entries, 1-hour TTL to prevent memory leaks
_services: TTLCache = TTLCache(maxsize=64, ttl=3600)
_services_lock = asyncio.Lock()


_HEARTBEAT_SENTINEL = object()


async def _with_heartbeat(
    inner: AsyncIterator[dict],
    interval: float = _HEARTBEAT_INTERVAL,
) -> AsyncIterator[str]:
    """
    Wrap an async event iterator and inject SSE heartbeat keepalives.

    If the inner iterator doesn't yield within *interval* seconds, a
    ``{"type": "heartbeat"}`` SSE line is emitted to prevent the ALB from
    closing the idle TCP connection.

    Uses ``asyncio.wait`` (NOT ``wait_for``) so the underlying generator is
    never cancelled — ``wait_for`` sends ``CancelledError`` into the
    generator which terminates the entire stream.
    """

    async def _next_or_sentinel(ait: AsyncIterator[dict]):
        try:
            return await ait.__anext__()
        except StopAsyncIteration:
            return _HEARTBEAT_SENTINEL

    it = inner.__aiter__()

    while True:
        task = asyncio.ensure_future(_next_or_sentinel(it))

        # Wait for the next event, sending heartbeats on each timeout
        while not task.done():
            done, _ = await asyncio.wait({task}, timeout=interval)
            if not done:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

        result = task.result()
        if result is _HEARTBEAT_SENTINEL:
            break
        yield f"data: {json.dumps(result)}\n\n"


# -------------------
# Request Schemas
# -------------------
class WorkflowRequestSchema(BaseModel):
    """Request schema for workflow execution."""

    request: str = Field(..., description="Natural language workflow request")
    thread_id: str | None = Field(
        default=None, description="Thread ID for workflow continuity"
    )
    user_id: str | None = Field(default=None)
    # Optional OAuth tokens
    gmail_token: str | None = Field(default=None)
    google_credentials: GoogleCredentialsSchema | None = Field(default=None)
    notion_token: str | None = Field(default=None)
    vercel_token: str | None = Field(default=None)
    slack_token: str | None = Field(default=None)
    # Per-integration auth: list of connected integration IDs (kebab-case, e.g. ["google-docs", "notion"])
    connected_integrations: list[str] | None = Field(default=None)


class WorkflowResumeSchema(BaseModel):
    """Request schema for resuming workflow with HITL decision."""

    thread_id: str = Field(..., description="Thread ID of the workflow to resume")
    action: str = Field(..., description="Decision: 'approve', 'edit', or 'skip'")
    content: dict | None = Field(
        default=None, description="Edited content (if action is 'edit')"
    )
    user_id: str | None = Field(default=None)
    # Optional OAuth tokens
    gmail_token: str | None = Field(default=None)
    google_credentials: GoogleCredentialsSchema | None = Field(default=None)
    notion_token: str | None = Field(default=None)
    vercel_token: str | None = Field(default=None)
    slack_token: str | None = Field(default=None)
    # Per-integration auth: list of connected integration IDs (kebab-case, e.g. ["google-docs", "notion"])
    connected_integrations: list[str] | None = Field(default=None)


class WorkflowRetrySchema(BaseModel):
    """Request schema for workflow retry."""

    thread_id: str = Field(..., description="Thread ID of the workflow to retry")
    step_number: int = Field(..., description="Step number to retry from (1-indexed)")
    user_id: str | None = Field(default=None)
    # Optional OAuth tokens
    gmail_token: str | None = Field(default=None)
    google_credentials: GoogleCredentialsSchema | None = Field(default=None)
    notion_token: str | None = Field(default=None)
    vercel_token: str | None = Field(default=None)
    slack_token: str | None = Field(default=None)
    # Per-integration auth: list of connected integration IDs (kebab-case, e.g. ["google-docs", "notion"])
    connected_integrations: list[str] | None = Field(default=None)


def _sanitize_resume_content(content: dict) -> dict:
    """Sanitize user-edited content from the approval flow.

    When users edit tool call arguments (e.g., email body, doc title),
    the edited values flow back as tool arguments that the LLM doesn't re-examine.
    This sanitizes string values to remove control characters while preserving
    the dict structure (tool_calls, arguments, etc.).
    """
    from chat.validation import _sanitize_text

    def _sanitize_value(value):
        if isinstance(value, str):
            return _sanitize_text(value)
        if isinstance(value, dict):
            return {k: _sanitize_value(v) for k, v in value.items()}
        if isinstance(value, list):
            return [_sanitize_value(item) for item in value]
        return value

    return _sanitize_value(content)


async def get_or_create_service(
    user_id: str | None = None,
    gmail_token: str | None = None,
    google_credentials: GoogleCredentialsSchema | None = None,
    notion_token: str | None = None,
    vercel_token: str | None = None,
    slack_token: str | None = None,
) -> ChatService:
    """Get or create a workflow service for the given token combination."""
    google_cache_key = ""
    if google_credentials is not None:
        google_cache_key = ":".join(
            [
                user_id or "",
                google_credentials.account_email or "",
                google_credentials.refresh_token or "",
                google_credentials.access_token
                if not google_credentials.refresh_token
                else "",
            ]
        )
    raw = (
        f"{user_id or ''}:{gmail_token or ''}:{google_cache_key}:"
        f"{notion_token or ''}:{vercel_token or ''}:{slack_token or ''}"
    )
    cache_key = hashlib.sha256(raw.encode()).hexdigest()[:16]

    service = _services.get(cache_key)
    if service is not None:
        return service

    async with _services_lock:
        service = _services.get(cache_key)
        if service is not None:
            return service

        service = ChatService(
            user_id=user_id,
            gmail_token=gmail_token,
            google_credentials=google_credentials,
            notion_token=notion_token,
            vercel_token=vercel_token,
            slack_token=slack_token,
            tavily_api_key=TAVILY_API_KEY,
        )
        await service.initialize()
        _services[cache_key] = service
        return service


@router.post("/chat")
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
    # Validate and sanitize input
    validation = validate_request(data.request)
    if not validation.is_valid:
        raise HTTPException(status_code=400, detail=validation.error)
    thread_id = validate_thread_id(data.thread_id)
    connected = validate_connected_integrations(data.connected_integrations)

    try:
        service = await get_or_create_service(
            user_id=data.user_id,
            gmail_token=data.gmail_token,
            google_credentials=data.google_credentials,
            notion_token=data.notion_token,
            vercel_token=data.vercel_token,
            slack_token=data.slack_token,
        )

        result = await service.execute(
            request=validation.sanitized_text,
            thread_id=thread_id,
            connected_integrations=connected,
        )

        return result

    except Exception as e:
        logger.exception("Error in workflow endpoint")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/stream")
async def execute_workflow_stream(data: WorkflowRequestSchema):
    """
    Execute a workflow with streaming progress updates.
    Returns Server-Sent Events (SSE) with real-time step progress.
    """
    # Validate and sanitize input before starting the stream
    validation = validate_request(data.request)
    if not validation.is_valid:
        raise HTTPException(status_code=400, detail=validation.error)
    validated_thread_id = validate_thread_id(data.thread_id)
    validated_connected = validate_connected_integrations(data.connected_integrations)

    async def generate():
        waiting_for_approval = False
        captured_thread_id = validated_thread_id  # May be None initially
        service = None

        try:
            service = await get_or_create_service(
                user_id=data.user_id,
                gmail_token=data.gmail_token,
                google_credentials=data.google_credentials,
                notion_token=data.notion_token,
                vercel_token=data.vercel_token,
                slack_token=data.slack_token,
            )

            async for event in service.execute_stream(
                request=validation.sanitized_text,
                thread_id=validated_thread_id,
                connected_integrations=validated_connected,
            ):
                # Capture thread_id from events
                if event.get("thread_id"):
                    captured_thread_id = event.get("thread_id")

                event_type = event.get("type", "unknown")
                logger.debug("SSE event sent: type=%s", event_type)
                if event_type == "approval_required":
                    logger.debug(
                        "Approval data: step=%s",
                        event.get("interrupt", {}).get("step_number"),
                    )
                    waiting_for_approval = True

                yield event

            logger.debug("Stream ended, waiting_for_approval=%s", waiting_for_approval)
            if not waiting_for_approval:
                yield {"type": "done"}

        except Exception as e:
            error_message = str(e)
            # Filter out benign LangGraph internal errors that don't affect execution
            benign_errors = [
                "get_config outside of a runnable context",
                "Called get_config outside",
            ]
            is_benign = any(benign in error_message for benign in benign_errors)

            if not is_benign:
                yield {"type": "error", "message": error_message}
            else:
                # Benign LangGraph error — typically raised when interrupt() is called.
                # Check workflow state for a pending interrupt to yield.
                logger.debug(
                    "Filtered benign error (workflow paused for approval): %s",
                    error_message,
                )

                if service and captured_thread_id:
                    try:
                        config = {"configurable": {"thread_id": captured_thread_id}}
                        state_snapshot = await service._workflow.get_app().aget_state(
                            config
                        )

                        if state_snapshot and state_snapshot.tasks:
                            for task in state_snapshot.tasks:
                                if hasattr(task, "interrupts") and task.interrupts:
                                    for interrupt in task.interrupts:
                                        if hasattr(interrupt, "value"):
                                            value = interrupt.value
                                            logger.debug(
                                                "Found pending interrupt from exception handler"
                                            )
                                            yield {
                                                "type": "approval_required",
                                                "thread_id": captured_thread_id,
                                                "interrupt": value,
                                            }
                                            waiting_for_approval = True
                    except Exception as inner_e:
                        logger.exception("Error checking interrupt state: %s", inner_e)

    return StreamingResponse(
        _with_heartbeat(generate()),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/chat/status/{thread_id}")
async def get_workflow_status(thread_id: str):
    """Get the current status of a workflow."""
    try:
        # Get any available workflow service
        if not _services:
            service = await get_or_create_service()
        else:
            service = list(_services.values())[0]

        state = await service.get_workflow_state(thread_id)
        if not state:
            raise HTTPException(status_code=404, detail="Workflow not found")

        return {"thread_id": thread_id, "state": state}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error getting workflow status")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/retry")
async def retry_workflow_step(data: WorkflowRetrySchema):
    """
    Retry a failed workflow step and continue execution.

    Resets the specified step and all subsequent steps to 'pending',
    then resumes execution from that step.
    """
    # Validate inputs
    thread_id = validate_thread_id(data.thread_id)
    if not thread_id:
        raise HTTPException(status_code=400, detail="Invalid thread ID.")
    if not isinstance(data.step_number, int) or data.step_number < 1:
        raise HTTPException(status_code=400, detail="Invalid step number.")
    connected = validate_connected_integrations(data.connected_integrations)

    try:
        service = await get_or_create_service(
            user_id=data.user_id,
            gmail_token=data.gmail_token,
            google_credentials=data.google_credentials,
            notion_token=data.notion_token,
            vercel_token=data.vercel_token,
            slack_token=data.slack_token,
        )

        result = await service.retry_step(
            thread_id=thread_id,
            step_number=data.step_number,
            connected_integrations=connected,
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in workflow retry endpoint")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/resume")
async def resume_workflow_with_decision(data: WorkflowResumeSchema):
    """
    Resume a paused workflow with human decision (approve/edit/skip).

    Used for Human-in-the-Loop approval workflow.
    """
    # Validate inputs
    thread_id = validate_thread_id(data.thread_id)
    if not thread_id:
        raise HTTPException(status_code=400, detail="Invalid thread ID.")
    if data.action not in ("approve", "edit", "skip"):
        raise HTTPException(
            status_code=400, detail="Action must be 'approve', 'edit', or 'skip'."
        )
    connected = validate_connected_integrations(data.connected_integrations)

    # Sanitize edited content — tool arguments from user edits can contain injection
    sanitized_content = _sanitize_resume_content(data.content) if data.content else None

    try:
        service = await get_or_create_service(
            user_id=data.user_id,
            gmail_token=data.gmail_token,
            google_credentials=data.google_credentials,
            notion_token=data.notion_token,
            vercel_token=data.vercel_token,
            slack_token=data.slack_token,
        )

        # Build decision object
        decision = {
            "action": data.action,
        }
        if sanitized_content:
            decision["content"] = sanitized_content

        result = await service.resume_workflow(
            thread_id=thread_id,
            decision=decision,
            connected_integrations=connected,
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in workflow resume endpoint")
        raise HTTPException(status_code=500, detail=str(e))
