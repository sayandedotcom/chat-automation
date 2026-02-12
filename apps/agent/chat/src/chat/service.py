"""
Workflow Service

Service layer for dynamic AI workflow execution.
Use this for multi-step, variable-length workflows.
"""

from langchain_core.messages import HumanMessage
from typing import Optional, AsyncGenerator
import uuid
import logging

from chat.graph import DynamicWorkflow
from chat.schemas import WorkflowState, WorkflowPlan
from chat.utils.mcp_client import create_mcp_client, load_mcp_tools
from chat.integration_registry import IntegrationRegistry, get_registry, get_registry_sync

logger = logging.getLogger(__name__)


class ChatService:
    """
    Service for executing dynamic multi-step workflows.
    
    Usage:
        service = ChatService(notion_token="...", tavily_api_key="...")
        await service.initialize()
        
        # Execute workflow
        result = await service.execute(
            request="research auth services, create notion doc, share on slack"
        )
    """
    
    def __init__(
        self,
        gmail_token: Optional[str] = None,
        vercel_token: Optional[str] = None,
        notion_token: Optional[str] = None,
        tavily_api_key: Optional[str] = None,
        slack_token: Optional[str] = None,
        google_client_id: Optional[str] = None,
        google_client_secret: Optional[str] = None,
    ):
        """Initialize the workflow service with integration tokens."""
        self.gmail_token = gmail_token
        self.vercel_token = vercel_token
        self.notion_token = notion_token
        self.tavily_api_key = tavily_api_key
        self.slack_token = slack_token
        self.google_client_id = google_client_id
        self.google_client_secret = google_client_secret
        
        self._client = None
        self._tools = []
        self._workflow = None
        self._registry = None
        self._initialized = False

    async def initialize(self):
        """Initialize MCP client, registry, load tools, and build workflow."""
        if self._initialized:
            return

        # Try to use global registry (pre-warmed at startup) for speed
        # Falls back to creating new registry if not available
        global_registry = get_registry_sync()

        if global_registry and global_registry.is_initialized:
            logger.info("Using pre-warmed global registry (fast path)")
            self._registry = global_registry
            # Load any MCP servers for OAuth tokens that weren't available at startup
            await self._registry.load_missing_servers({
                "notion_token": self.notion_token,
                "vercel_token": self.vercel_token,
            })
        else:
            # Fallback: Create new registry (slow path - 5-15s)
            logger.info("Global registry not available, creating new one (slow path)")
            self._registry = await get_registry({
                "gmail_token": self.gmail_token,
                "vercel_token": self.vercel_token,
                "notion_token": self.notion_token,
                "tavily_api_key": self.tavily_api_key,
                "google_client_id": self.google_client_id,
                "google_client_secret": self.google_client_secret,
            })

        # Get all tools (for fallback)
        self._tools = self._registry.get_all_tools()

        # Build dynamic workflow with registry for smart routing
        self._workflow = DynamicWorkflow(tools=self._tools, registry=self._registry)
        self._initialized = True

        logger.info(f"Workflow service initialized with {len(self._tools)} tools")

    async def execute(
        self,
        request: str,
        thread_id: Optional[str] = None,
    ) -> dict:
        """
        Execute a dynamic workflow based on user request.
        
        Args:
            request: Natural language request (e.g., "research X, create doc, share")
            thread_id: Optional thread ID for conversation continuity
            
        Returns:
            dict with workflow results
        """
        if not self._initialized:
            await self.initialize()
        
        thread_id = thread_id or str(uuid.uuid4())
        config = {
            "configurable": {"thread_id": thread_id},
            "recursion_limit": 100,  # Allow more tool call loops
        }
        
        # Initial state (simplified - no more awaiting_approval in state)
        initial_state = {
            "messages": [HumanMessage(content=request)],
            "plan": None,
            "current_step_index": -1,  # -1 indicates planning phase
            "conversation_summary": None,  # Computed by planner_node from accumulated messages
            "_executor_chat": None,
            "_step_tool_calls": 0,
        }
        
        # Execute the workflow
        result = await self._workflow.get_app().ainvoke(initial_state, config=config)
        
        # Extract results
        messages = result.get("messages", [])
        plan = result.get("plan")
        
        # Build response
        response = {
            "thread_id": thread_id,
            "original_request": request,
            "plan": None,
            "messages": [],
            "final_response": "",
            "is_complete": False,
        }
        
        # Extract plan info
        if plan:
            response["plan"] = {
                "steps": [
                    {
                        "step_number": step.step_number,
                        "description": step.description,
                        "status": step.status,
                        "result": step.result,
                        "error": step.error,
                        "tools_used": step.tools_used,
                        "requires_human_approval": step.requires_human_approval,
                        "approval_reason": step.approval_reason,
                    }
                    for step in plan.steps
                ],
                "is_complete": plan.is_complete,
                "final_summary": plan.final_summary,
            }
            response["is_complete"] = plan.is_complete
            response["final_response"] = plan.final_summary or ""
        
        # Extract messages
        for msg in messages:
            if hasattr(msg, 'type') and hasattr(msg, 'content'):
                role = "user" if msg.type == "human" else "assistant"
                response["messages"].append({
                    "role": role,
                    "content": msg.content
                })
        
        return response

    async def execute_stream(
        self,
        request: str,
        thread_id: Optional[str] = None,
    ) -> AsyncGenerator[dict, None]:
        """
        Execute a workflow with streaming updates.
        Yields progress updates as each step completes.
        
        Args:
            request: Natural language request
            thread_id: Optional thread ID
            
        Yields:
            Progress updates for each step
        """
        if not self._initialized:
            await self.initialize()
        
        thread_id = thread_id or str(uuid.uuid4())
        config = {
            "configurable": {"thread_id": thread_id},
            "recursion_limit": 100,  # Allow more tool call loops
        }
        
        initial_state = {
            "messages": [HumanMessage(content=request)],
            "plan": None,
            "current_step_index": -1,
            # State-based HITL fields
            "awaiting_approval": False,
            "approval_step_info": None,
            "approval_decision": None,
            # Integration tracking fields
            "loaded_integrations": [],
            "executor_bound_tools": None,
            "total_tool_count": 0,
            "initial_integrations": None,
            "incremental_load_events": [],
            # Multi-turn conversation context
            "conversation_summary": None,  # Computed by planner_node from accumulated messages
            # Executor tool-loop state
            "_executor_chat": None,
            "_step_tool_calls": 0,
        }

        # Stream the workflow execution with both updates and messages for token-level streaming
        logger.debug("Starting astream for workflow...")

        # Track current executing step for token attribution
        current_executing_step = None

        async for chunk in self._workflow.get_app().astream(
            initial_state,
            config=config,
            stream_mode=["updates", "messages"],  # Get both node updates and message tokens
        ):
            # Handle message-level chunks (token streaming)
            if isinstance(chunk, tuple):
                chunk_type, data = chunk

                if chunk_type == "messages":
                    # This is a message chunk (token) from LLM streaming
                    if isinstance(data, list) and len(data) > 0:
                        for msg_chunk in data:
                            # Check if it's an AIMessage with content
                            if hasattr(msg_chunk, 'content') and msg_chunk.content:
                                content = msg_chunk.content
                                # Extract text from various content formats
                                if isinstance(content, list):
                                    text_parts = []
                                    for item in content:
                                        if isinstance(item, dict) and "text" in item:
                                            text_parts.append(item["text"])
                                        elif isinstance(item, str):
                                            text_parts.append(item)
                                    text = "".join(text_parts)
                                elif isinstance(content, str):
                                    text = content
                                else:
                                    continue

                                # Emit token event if we have text and know which step
                                if text and current_executing_step is not None:
                                    yield {
                                        "type": "token",
                                        "thread_id": thread_id,
                                        "step_number": current_executing_step,
                                        "content": text,
                                    }
                    continue  # Skip to next chunk

                # If it's an updates chunk, unwrap it
                if chunk_type == "updates":
                    chunk = data
                else:
                    continue

            # Handle node-level updates
            if not isinstance(chunk, dict):
                continue

            # Extract data from node outputs
            for node_name, output in chunk.items():
                if not isinstance(output, dict):
                    continue

                # Handle smart_router output - emit integrations_ready event
                if node_name == "smart_router":
                    loaded_integrations = output.get("loaded_integrations", [])
                    total_tool_count = output.get("total_tool_count", 0)

                    if loaded_integrations:
                        logger.debug(f"Smart router: {len(loaded_integrations)} integrations, {total_tool_count} tools")
                        yield {
                            "type": "integrations_ready",
                            "thread_id": thread_id,
                            "integrations": [
                                i.model_dump() if hasattr(i, "model_dump") else i
                                for i in loaded_integrations
                            ],
                            "message": f"Added {len(loaded_integrations)} integration{'s' if len(loaded_integrations) != 1 else ''} successfully",
                            "tool_count": total_tool_count,
                        }

                # Handle incremental load events
                incremental_events = output.get("incremental_load_events", [])
                for event in incremental_events:
                    logger.debug(f"Incremental load: {event.get('integration')}")
                    yield {
                        "type": "integration_added_incrementally",
                        "thread_id": thread_id,
                        "integration": event.get("integration"),
                        "display_name": event.get("display_name"),
                        "tools_added": event.get("tools_added"),
                        "triggered_by": event.get("triggered_by_tool"),
                        "message": f"Added {event.get('display_name')} (+{event.get('tools_added')} tools)",
                    }

                plan = output.get("plan")
                current_step_index = output.get("current_step_index")

                # Track which step is currently executing for token attribution
                if plan and current_step_index is not None and 0 <= current_step_index < len(plan.steps):
                    step = plan.steps[current_step_index]
                    if step.status == "in_progress":
                        current_executing_step = step.step_number

                # Check for STATE-BASED HITL approval request
                if output.get("awaiting_approval") and output.get("approval_step_info"):
                    approval_info = output["approval_step_info"]
                    logger.debug(f"Awaiting approval: step {approval_info.get('step_number')}")
                    yield {
                        "type": "approval_required",
                        "thread_id": thread_id,
                        "interrupt": approval_info,
                    }
                    return  # Stop streaming, waiting for approval

                # Always yield progress events with plan updates
                if plan:

                    # Yield thinking event if this is the first time we see thinking content
                    if plan.thinking and node_name == "planner":
                        yield {
                            "type": "thinking",
                            "thread_id": thread_id,
                            "content": plan.thinking,
                            "duration_hint": 2,  # Approximate duration in seconds
                        }

                    # Yield step thinking events for executor nodes
                    if node_name in ("executor", "executor_with_approval"):
                        if current_step_index is not None and 0 <= current_step_index < len(plan.steps):
                            step = plan.steps[current_step_index]
                            if step.thinking_duration_ms:
                                yield {
                                    "type": "step_thinking",
                                    "thread_id": thread_id,
                                    "step_number": step.step_number,
                                    "thinking": step.thinking,
                                    "duration_ms": step.thinking_duration_ms,
                                }

                    yield {
                        "type": "progress",
                        "thread_id": thread_id,
                        "current_step": current_step_index,
                        "total_steps": len(plan.steps),
                        "plan": {
                            "thinking": plan.thinking,  # Include thinking in plan
                            "steps": [
                                {
                                    "step_number": s.step_number,
                                    "description": s.description,
                                    "status": s.status,
                                    "tools_used": s.tools_used,
                                    "result": s.result,
                                    "error": s.error,
                                    "requires_human_approval": s.requires_human_approval,
                                    "approval_reason": s.approval_reason,
                                    # Per-step thinking
                                    "thinking": s.thinking,
                                    "thinking_duration_ms": s.thinking_duration_ms,
                                    # Include structured search results if available
                                    "search_results": [
                                        {
                                            "title": r.title,
                                            "url": r.url,
                                            "domain": r.domain,
                                            "favicon": r.favicon,
                                            "date": r.date,
                                        }
                                        for r in s.search_results
                                    ] if s.search_results else None,
                                }
                                for s in plan.steps
                            ],
                            "is_complete": plan.is_complete,
                        }
                    }
        
        logger.debug("astream completed")

        # After stream ends, check if there's a pending interrupt
        # LangGraph stores interrupt data in state.tasks
        try:
            state_snapshot = await self._workflow.get_app().aget_state(config)
            if state_snapshot and state_snapshot.tasks:
                for task in state_snapshot.tasks:
                    if hasattr(task, 'interrupts') and task.interrupts:
                        for interrupt in task.interrupts:
                            if hasattr(interrupt, 'value'):
                                value = interrupt.value
                                logger.debug(f"Found pending interrupt: {value}")
                                yield {
                                    "type": "approval_required",
                                    "thread_id": thread_id,
                                    "interrupt": value,
                                }
                                return  # Stop - waiting for approval
        except Exception as e:
            logger.warning(f"Error checking interrupt state: {e}")

    async def get_workflow_state(self, thread_id: str) -> Optional[dict]:
        """Get the current state of a workflow."""
        if not self._initialized:
            await self.initialize()
        
        config = {"configurable": {"thread_id": thread_id}}
        
        try:
            state = await self._workflow.get_app().aget_state(config)
            return state.values if state else None
        except Exception as e:
            logger.error(f"Error getting workflow state: {e}")
            return None

    async def resume_workflow(
        self, 
        thread_id: str,
        decision: dict = None,
    ) -> dict:
        """
        Resume a paused workflow with a decision.
        
        Uses state-based HITL pattern - injects approval decision into state.
        
        Args:
            thread_id: The workflow thread ID
            decision: Decision for HITL approval
                - action: "approve" | "edit" | "skip"
                - content: Optional edited content (if action is "edit")
        """
        
        if not self._initialized:
            await self.initialize()
        
        config = {"configurable": {"thread_id": thread_id}}
        
        # Get current state to verify workflow exists
        state_snapshot = await self._workflow.get_app().aget_state(config)
        if not state_snapshot or not state_snapshot.values:
            return {"error": "Workflow not found", "thread_id": thread_id}
        
        # Resume with decision by injecting approval_decision into state
        logger.debug(f"Resuming workflow {thread_id} with decision: {decision}")
        
        # Update state with the decision and clear awaiting_approval
        await self._workflow.get_app().aupdate_state(
            config,
            {
                "approval_decision": decision or {"action": "approve"},
                "awaiting_approval": False,
            },
            as_node="planner",  # Resume from planner to re-route to executor_with_approval
        )
        
        # Invoke to continue execution
        result = await self._workflow.get_app().ainvoke(None, config=config)
        
        # Build response
        messages = result.get("messages", [])
        plan = result.get("plan")
        
        response = {
            "thread_id": thread_id,
            "resumed": True,
            "plan": None,
            "is_complete": False,
        }
        
        if plan:
            response["plan"] = {
                "steps": [
                    {
                        "step_number": step.step_number,
                        "description": step.description,
                        "status": step.status,
                        "result": step.result,
                        "error": step.error,
                        "tools_used": step.tools_used,
                        "requires_human_approval": step.requires_human_approval,
                        "approval_reason": step.approval_reason,
                    }
                    for step in plan.steps
                ],
                "is_complete": plan.is_complete,
            }
            response["is_complete"] = plan.is_complete
        
        return response

    async def retry_step(
        self,
        thread_id: str,
        step_number: int,
    ) -> dict:
        """
        Retry a failed step and continue execution.
        
        Args:
            thread_id: The workflow thread ID
            step_number: The step number to retry (1-indexed)
            
        Returns:
            Updated workflow state after retry
        """
        if not self._initialized:
            await self.initialize()
        
        config = {"configurable": {"thread_id": thread_id}}
        
        # Get current state
        state_snapshot = await self._workflow.get_app().aget_state(config)
        if not state_snapshot or not state_snapshot.values:
            return {"error": "Workflow not found", "thread_id": thread_id}
        
        state = state_snapshot.values
        plan = state.get("plan")
        
        if not plan or not plan.steps:
            return {"error": "No plan found in workflow", "thread_id": thread_id}
        
        # Validate step number
        if step_number < 1 or step_number > len(plan.steps):
            return {
                "error": f"Invalid step number. Must be between 1 and {len(plan.steps)}",
                "thread_id": thread_id,
            }
        
        # Reset the failed step and all subsequent steps
        for step in plan.steps:
            if step.step_number >= step_number:
                step.status = "pending"
                step.result = None
                step.error = None
        
        # Update the current step index to the step before the retry
        new_step_index = step_number - 1  # 0-indexed
        
        # Update the state
        updated_state = {
            "plan": plan,
            "current_step_index": new_step_index,
        }
        
        # Update state in the checkpointer
        await self._workflow.get_app().aupdate_state(
            config,
            updated_state,
        )
        
        # Resume execution from the updated state
        result = await self._workflow.get_app().ainvoke(None, config=config)
        
        # Build response
        messages = result.get("messages", [])
        updated_plan = result.get("plan")
        
        response = {
            "thread_id": thread_id,
            "retried_from_step": step_number,
            "plan": None,
            "messages": [],
            "is_complete": False,
        }
        
        if updated_plan:
            response["plan"] = {
                "steps": [
                    {
                        "step_number": step.step_number,
                        "description": step.description,
                        "status": step.status,
                        "result": step.result,
                    }
                    for step in updated_plan.steps
                ],
                "is_complete": updated_plan.is_complete,
                "final_summary": updated_plan.final_summary,
            }
            response["is_complete"] = updated_plan.is_complete
        
        for msg in messages:
            if hasattr(msg, 'type') and hasattr(msg, 'content'):
                role = "user" if msg.type == "human" else "assistant"
                response["messages"].append({
                    "role": role,
                    "content": msg.content
                })
        
        return response

