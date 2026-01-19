"""
Workflow Service

Service layer for dynamic AI workflow execution.
Use this for multi-step, variable-length workflows.
"""

from langchain_core.messages import HumanMessage
from typing import Optional, AsyncGenerator
import uuid

from chat.workflow_graph import DynamicWorkflow
from chat.workflow_schemas import WorkflowState, WorkflowPlan
from chat.utils.mcp_client import create_mcp_client, load_mcp_tools


class WorkflowService:
    """
    Service for executing dynamic multi-step workflows.
    
    Usage:
        service = WorkflowService(notion_token="...", tavily_api_key="...")
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
        self._initialized = False

    async def initialize(self):
        """Initialize MCP client, load tools, and build workflow."""
        if self._initialized:
            return
        
        # Create MCP client with all configured integrations
        self._client = create_mcp_client(
            gmail_token=self.gmail_token,
            vercel_token=self.vercel_token,
            notion_token=self.notion_token,
            tavily_api_key=self.tavily_api_key,
            google_client_id=self.google_client_id,
            google_client_secret=self.google_client_secret,
        )
        
        # Load MCP tools
        self._tools = await load_mcp_tools(self._client)
        
        # Build dynamic workflow
        self._workflow = DynamicWorkflow(tools=self._tools)
        self._initialized = True
        
        print(f"✅ Workflow service initialized with {len(self._tools)} tools")

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
        }
        
        # Stream the workflow execution
        print(f"\n🔄 Starting astream for workflow...")
        async for chunk in self._workflow.get_app().astream(
            initial_state, 
            config=config,
            stream_mode="updates",
        ):
            # Log every chunk received
            print(f"📥 ASTREAM CHUNK: {list(chunk.keys())}")
            
            # Extract data from node outputs
            for node_name, output in chunk.items():
                print(f"   📍 Node: {node_name}, Output type: {type(output)}")
                if not isinstance(output, dict):
                    continue
                    
                plan = output.get("plan")
                current_step = output.get("current_step_index")
                
                # Check for STATE-BASED HITL approval request
                if output.get("awaiting_approval") and output.get("approval_step_info"):
                    approval_info = output["approval_step_info"]
                    print(f"   🔐 AWAITING APPROVAL: step {approval_info.get('step_number')}")
                    yield {
                        "type": "approval_required",
                        "thread_id": thread_id,
                        "interrupt": approval_info,
                    }
                    return  # Stop streaming, waiting for approval
                
                # Always yield progress events with plan updates
                if plan:
                    print(f"   📋 Plan found, steps: {[s.status for s in plan.steps]}")
                    
                    # Yield thinking event if this is the first time we see thinking content
                    if plan.thinking and node_name == "planner":
                        yield {
                            "type": "thinking",
                            "thread_id": thread_id,
                            "content": plan.thinking,
                            "duration_hint": 2,  # Approximate duration in seconds
                        }
                    
                    yield {
                        "type": "progress",
                        "thread_id": thread_id,
                        "current_step": current_step,
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
        
        print(f"🏁 astream completed")
        
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
                                print(f"🔐 Found pending interrupt: {value}")
                                yield {
                                    "type": "approval_required",
                                    "thread_id": thread_id,
                                    "interrupt": value,
                                }
                                return  # Stop - waiting for approval
        except Exception as e:
            print(f"⚠️ Error checking interrupt state: {e}")

    async def get_workflow_state(self, thread_id: str) -> Optional[dict]:
        """Get the current state of a workflow."""
        if not self._initialized:
            await self.initialize()
        
        config = {"configurable": {"thread_id": thread_id}}
        
        try:
            state = await self._workflow.get_app().aget_state(config)
            return state.values if state else None
        except Exception as e:
            print(f"Error getting workflow state: {e}")
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
        print(f"🔄 Resuming workflow {thread_id} with decision: {decision}")
        
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

