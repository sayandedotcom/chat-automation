"""
Workflow Nodes

Graph nodes for dynamic AI workflow execution.
Implements the Plan → Execute → Loop pattern with LLM-driven Human-in-the-Loop support.
"""

from langchain_core.messages import BaseMessage, SystemMessage, AIMessage, HumanMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import BaseTool
from langgraph.prebuilt import ToolNode
from typing import List, Literal, Optional, TYPE_CHECKING
from dotenv import load_dotenv
import os
import json
import re
import time
import logging

from chat.workflow_schemas import (
    WorkflowState,
    WorkflowPlan,
    WorkflowStep,
    WorkflowPlanOutput,
    PlannedStep,
    SearchResultItem,
    IntegrationInfo,
)

if TYPE_CHECKING:
    from chat.integration_registry import IntegrationRegistry

logger = logging.getLogger(__name__)

load_dotenv()


def extract_search_results_from_messages(messages: List[BaseMessage]) -> Optional[List[SearchResultItem]]:
    """
    Extract structured search results from tool messages.
    Tavily MCP returns JSON with 'results' array containing title, url, content, etc.
    """
    search_results = []
    
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage):
            content = msg.content
            if not content:
                continue
            
            try:
                if isinstance(content, str):
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0]
                    elif content.strip().startswith("{") or content.strip().startswith("["):
                        pass
                    else:
                        continue
                    data = json.loads(content.strip())
                elif isinstance(content, dict):
                    data = content
                else:
                    continue
                
                results = None
                if isinstance(data, dict) and "results" in data:
                    results = data["results"]
                elif isinstance(data, list):
                    results = data
                
                if results and isinstance(results, list):
                    for item in results[:10]:
                        if isinstance(item, dict) and "url" in item:
                            url = item.get("url", "")
                            domain = ""
                            try:
                                from urllib.parse import urlparse
                                parsed = urlparse(url)
                                domain = parsed.netloc.replace("www.", "")
                            except:
                                domain = url.split("/")[2] if len(url.split("/")) > 2 else ""
                            
                            search_results.append(SearchResultItem(
                                title=item.get("title", domain),
                                url=url,
                                domain=domain,
                                favicon=f"https://www.google.com/s2/favicons?domain={domain}&sz=32",
                                date=item.get("published_date") or item.get("date"),
                            ))
                    
                    if search_results:
                        return search_results
                        
            except (json.JSONDecodeError, KeyError, TypeError):
                continue
    
    return None if not search_results else search_results


# -------------------
# Prompts
# -------------------
PLANNER_SYSTEM_PROMPT = """You are a workflow planner. Analyze the user's request and create a step-by-step execution plan.

RULES:
1. Each step should be a single, atomic action
2. Steps should be in correct execution order (dependencies first)
3. Be specific about what tools/actions each step requires
4. Keep steps concise but clear

For EACH step, you MUST determine if it requires human approval:

**REQUIRES HUMAN APPROVAL (requires_human_approval: true):**
- Creating documents, pages, files, or records
- Sending emails, messages, or notifications  
- Updating, editing, or modifying existing content
- Deleting or archiving anything
- Publishing or sharing content
- Any action that has external side effects

**DOES NOT REQUIRE APPROVAL (requires_human_approval: false):**
- Searching or researching information
- Reading documents, emails, or messages
- Listing or fetching data
- Analyzing or summarizing content
- Any read-only operation

Be thoughtful about your approval decisions - only require approval when the action has real-world consequences.
"""

EXECUTOR_SYSTEM_PROMPT = """You are a workflow executor. Execute the specific step given to you.

CURRENT STEP: {current_step}
STEP {step_number} OF {total_steps}

PREVIOUS STEPS COMPLETED:
{previous_results}

YOUR TASK:
Execute ONLY this step using the available tools. Be thorough but focused on just this step.

After completing the step:
1. Report what you accomplished
2. Include any relevant outputs (links, IDs, document titles) that might be needed for later steps
3. For web searches, include the source URLs
"""


class WorkflowNodes:
    """Nodes for the dynamic workflow graph with LLM-driven HITL."""

    def __init__(self, tools: List[BaseTool] = None, registry: "IntegrationRegistry" = None):
        """Initialize workflow nodes with LLM and optional integration registry."""
        self.tools = tools or []
        self.registry = registry

        # Base LLM for planning
        base_planner = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
        )

        # Planner with structured output - guaranteed type-safe response
        self.planner_llm = base_planner.with_structured_output(WorkflowPlanOutput)

        # Executor LLM (with tools for execution)
        self.executor_llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
        )
        self.executor_with_tools = (
            self.executor_llm.bind_tools(self.tools) if self.tools else self.executor_llm
        )

        # Tool node
        self.tool_node = ToolNode(self.tools, handle_tool_errors=True) if self.tools else None

    async def smart_router_node(self, state: WorkflowState) -> dict:
        """
        Route request to appropriate integrations using pattern matching.
        This node runs BEFORE the planner and binds only needed tools.
        """
        from chat.integration_registry import classify_integrations

        messages = state["messages"]

        # Get user request
        user_request = ""
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                user_request = msg.content
                break

        if not self.registry:
            # No registry - use all tools (fallback)
            logger.warning("No registry available, using all tools")
            return {
                "loaded_integrations": [],
                "executor_bound_tools": [t.name for t in self.tools] if self.tools else [],
                "total_tool_count": len(self.tools) if self.tools else 0,
                "initial_integrations": [],
                "incremental_load_events": [],
            }

        # Classify integrations (instant, no LLM)
        integrations = classify_integrations(user_request, self.registry)

        # Get filtered tools from registry
        tools = self.registry.get_toolset(integrations)

        # Build integration info for SSE
        loaded_integrations = []
        for name in integrations:
            config = self.registry.get_integration_config(name)
            if config:
                loaded_integrations.append(IntegrationInfo(
                    name=name,
                    display_name=config.display_name,
                    tools_count=len(self.registry._tools_by_integration.get(name, [])),
                    icon=config.icon,
                ))

        # Bind filtered tools to executor
        self.tools = tools
        self.executor_with_tools = self.executor_llm.bind_tools(tools) if tools else self.executor_llm
        self.tool_node = ToolNode(tools, handle_tool_errors=True) if tools else None

        logger.info(f"Smart router: bound {len(tools)} tools from {len(integrations)} integrations")
        print(f"\n🎯 SMART ROUTER")
        print(f"   Request: {user_request[:80]}...")
        print(f"   Integrations: {integrations}")
        print(f"   Tools bound: {len(tools)}")

        return {
            "loaded_integrations": loaded_integrations,
            "executor_bound_tools": [t.name for t in tools],
            "total_tool_count": len(tools),
            "initial_integrations": integrations,
            "incremental_load_events": [],
        }

    async def planner_node(self, state: WorkflowState) -> dict:
        """
        Analyze the user request and create a step-by-step plan.
        Uses structured output for type-safe planning with HITL classification.
        """
        messages = state["messages"]
        
        # Get the original user request
        user_request = ""
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                user_request = msg.content
                break
        
        # Get structured plan from LLM - no JSON parsing needed!
        plan_output: WorkflowPlanOutput = await self.planner_llm.ainvoke([
            SystemMessage(content=PLANNER_SYSTEM_PROMPT),
            HumanMessage(content=f"Create a plan for: {user_request}")
        ])
        
        # Console log the planning
        print("\n" + "="*60)
        print("📋 WORKFLOW PLAN CREATED (LLM Structured Output)")
        print("="*60)
        print(f"Request: {user_request}")
        print(f"LLM Thinking: {plan_output.thinking}\n")
        
        # Convert PlannedStep to WorkflowStep
        workflow_steps = []
        for i, step in enumerate(plan_output.steps):
            workflow_steps.append(
                WorkflowStep(
                    step_number=i + 1,
                    description=step.description,
                    requires_human_approval=step.requires_human_approval,
                    approval_reason=step.approval_reason,
                    status="pending",
                )
            )
            
            # Console log each step
            approval_badge = "🔐 REQUIRES APPROVAL" if step.requires_human_approval else "✅ Auto-execute"
            print(f"### Step {i + 1} [{approval_badge}]")
            print(f"Description: {step.description}")
            print(f"Reason: {step.approval_reason}")
            print()
        
        print("="*60 + "\n")
        
        plan = WorkflowPlan(
            original_request=user_request,
            thinking=plan_output.thinking,  # Store the LLM's reasoning
            steps=workflow_steps,
        )
        
        # Create a message showing the plan
        plan_message = f"📋 **Workflow Plan Created**\n\n"
        plan_message += f"Original request: {user_request}\n\n"
        plan_message += "**Steps:**\n"
        for step in workflow_steps:
            approval_icon = "🔐" if step.requires_human_approval else "✅"
            plan_message += f"{step.step_number}. {approval_icon} {step.description}\n"
        plan_message += "\n---\nStarting execution...\n"
        
        return {
            "messages": [AIMessage(content=plan_message)],
            "plan": plan,
            "current_step_index": 0,
        }

    async def executor_node(self, state: WorkflowState) -> dict:
        """
        Execute the current step automatically (for steps not requiring approval).
        Includes thinking capture and incremental tool loading fallback.
        """
        plan = state["plan"]
        current_index = state["current_step_index"]
        initial_integrations = state.get("initial_integrations", [])

        if not plan or current_index >= len(plan.steps):
            return {"messages": [AIMessage(content="Workflow complete!")]}

        current_step = plan.steps[current_index]
        current_step.status = "in_progress"

        print(f"\n🚀 AUTO-EXECUTING Step {current_step.step_number}: {current_step.description}")

        # Build context from previous steps
        previous_results = self._get_previous_results(plan, current_index)

        # Track thinking time
        start_time = time.time()

        # Try to execute, with incremental loading fallback
        incremental_load_events = state.get("incremental_load_events", [])

        try:
            result = await self._execute_step(current_step, plan, previous_results)
        except Exception as e:
            error_msg = str(e).lower()

            # Check if error is due to missing tool
            if self.registry and "tool" in error_msg and ("not found" in error_msg or "unknown" in error_msg):
                missing_tool = self._extract_tool_name_from_error(str(e))

                if missing_tool:
                    missing_integration = self.registry.get_integration_for_tool(missing_tool)

                    if missing_integration and missing_integration not in initial_integrations:
                        logger.warning(
                            "Incremental loading triggered - classification missed integration",
                            extra={
                                "request": state["messages"][-1].content[:100] if state["messages"] else "",
                                "initially_classified": initial_integrations,
                                "missing_integration": missing_integration,
                                "missing_tool": missing_tool,
                            }
                        )
                        print(f"⚠️ Incremental loading: adding {missing_integration} for tool {missing_tool}")

                        # Load additional tools
                        new_tools = self.registry.get_toolset([missing_integration])
                        self.tools.extend(new_tools)

                        # Re-bind executor with expanded toolset
                        self.executor_with_tools = self.executor_llm.bind_tools(self.tools)
                        self.tool_node = ToolNode(self.tools, handle_tool_errors=True)

                        # Queue incremental load event
                        config = self.registry.get_integration_config(missing_integration)
                        incremental_load_events.append({
                            "integration": missing_integration,
                            "display_name": config.display_name if config else missing_integration,
                            "tools_added": len(new_tools),
                            "triggered_by_tool": missing_tool,
                        })

                        # Retry
                        result = await self._execute_step(current_step, plan, previous_results)

                        # Update initial_integrations
                        initial_integrations = list(initial_integrations)
                        initial_integrations.append(missing_integration)
                    else:
                        raise ValueError(f"Tool '{missing_tool}' not available in any integration")
                else:
                    raise
            else:
                raise

        # Capture thinking duration
        thinking_duration_ms = int((time.time() - start_time) * 1000)

        # Update step with thinking info
        current_step.thinking_duration_ms = thinking_duration_ms

        # Add incremental load events to result
        if incremental_load_events:
            result["incremental_load_events"] = incremental_load_events
            result["initial_integrations"] = initial_integrations

        return result

    def _extract_tool_name_from_error(self, error: str) -> Optional[str]:
        """Parse tool name from error message."""
        patterns = [
            r"tool\s+['\"]([^'\"]+)['\"]",
            r"unknown\s+tool\s+['\"]?(\w+)['\"]?",
            r"tool\s+(\w+)\s+not\s+found",
        ]
        for pattern in patterns:
            match = re.search(pattern, error, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    async def executor_with_approval_node(self, state: WorkflowState) -> dict:
        """
        Handle step that requires human approval using STATE-BASED HITL.
        
        Instead of using interrupt(), this node:
        1. Sets awaiting_approval=True in state
        2. Stores step info in approval_step_info
        3. Returns - graph ends at this node
        4. Streaming code detects this and sends approval_required event
        5. On resume, approval_decision is in state and we continue
        """
        plan = state["plan"]
        current_index = state["current_step_index"]
        
        if not plan or current_index >= len(plan.steps):
            return {"messages": [AIMessage(content="Workflow complete!")]}
        
        current_step = plan.steps[current_index]
        
        # Check if we're resuming after approval
        approval_decision = state.get("approval_decision")
        if approval_decision:
            # We're resuming - handle the decision
            action = approval_decision.get("action", "approve")
            
            if action == "skip":
                print(f"⏭️ Step {current_step.step_number} SKIPPED by user")
                current_step.status = "skipped"
                current_step.result = "Skipped by user"
                return {
                    "messages": [AIMessage(content=f"Step {current_step.step_number} skipped.")],
                    "plan": plan,
                    "awaiting_approval": False,
                    "approval_step_info": None,
                    "approval_decision": None,  # Clear for next step
                }
            
            print(f"✅ Step {current_step.step_number} APPROVED by user")
            current_step.status = "in_progress"
            
            # Execute the step
            previous_results = self._get_previous_results(plan, current_index)
            
            if action == "edit":
                edited_content = approval_decision.get("content", {})
                print(f"✏️ Step {current_step.step_number} content EDITED by user")
                result = await self._execute_step_with_content(current_step, plan, previous_results, edited_content)
            else:
                result = await self._execute_step(current_step, plan, previous_results)
            
            # Clear approval state
            result["awaiting_approval"] = False
            result["approval_step_info"] = None
            result["approval_decision"] = None
            return result
        
        # First time entering - request approval
        current_step.status = "awaiting_approval"
        
        print(f"\n🔐 APPROVAL REQUIRED for Step {current_step.step_number}: {current_step.description}")
        print(f"   Reason: {current_step.approval_reason}")
        
        # Set state to signal we need approval and return
        # The graph will END here, streaming code will detect awaiting_approval
        return {
            "plan": plan,
            "awaiting_approval": True,
            "approval_step_info": {
                "type": "approval_required",
                "step_number": current_step.step_number,
                "description": current_step.description,
                "reason": current_step.approval_reason,
                "actions": ["approve", "edit", "skip"]
            },
        }

    def _get_previous_results(self, plan: WorkflowPlan, current_index: int) -> str:
        """Build context string from previous step results."""
        previous_results = ""
        for step in plan.steps[:current_index]:
            if step.result:
                previous_results += f"Step {step.step_number}: {step.result}\n"
        
        return previous_results if previous_results else "None yet - this is the first step."

    async def _generate_preview_content(
        self, 
        step: WorkflowStep, 
        previous_results: str,
        total_steps: int
    ) -> dict:
        """Generate content preview for user to approve."""
        prompt = f"""Based on the workflow step, generate the content that should be created.

STEP: {step.description}
STEP NUMBER: {step.step_number} of {total_steps}
PREVIOUS RESULTS:
{previous_results}

Generate the content in a structured format. If creating a document/page, include:
- title: The title for the document
- content: The main content/body
- summary: A brief summary (1-2 sentences)

If sending a message/email:
- to: Recipient
- subject: Subject line (if applicable)
- body: Message body

Respond with JSON only.
"""
        response = await self.executor_llm.ainvoke([
            SystemMessage(content="You generate content previews for user approval."),
            HumanMessage(content=prompt)
        ])
        
        try:
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            return json.loads(content.strip())
        except:
            return {"content": response.content, "title": step.description}

    async def _execute_step(
        self, 
        step: WorkflowStep, 
        plan: WorkflowPlan, 
        previous_results: str
    ) -> dict:
        """Execute a step using the LLM with tools."""
        system_prompt = EXECUTOR_SYSTEM_PROMPT.format(
            current_step=step.description,
            step_number=step.step_number,
            total_steps=len(plan.steps),
            previous_results=previous_results,
        )
        
        executor_messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Execute step {step.step_number}: {step.description}")
        ]
        
        print(f"🔧 Executor has {len(self.tools)} tools bound")
        if self.tools:
            print(f"   Tools: {[t.name for t in self.tools[:5]]}...")
        
        response = await self.executor_with_tools.ainvoke(executor_messages)
        
        has_tool_calls = hasattr(response, "tool_calls") and response.tool_calls
        print(f"🤖 LLM Response has tool_calls: {has_tool_calls}")
        
        return {
            "messages": [response], 
            "plan": plan,
        }

    async def _execute_step_with_content(
        self, 
        step: WorkflowStep, 
        plan: WorkflowPlan, 
        previous_results: str,
        approved_content: dict
    ) -> dict:
        """Execute a step with pre-approved content."""
        system_prompt = EXECUTOR_SYSTEM_PROMPT.format(
            current_step=step.description,
            step_number=step.step_number,
            total_steps=len(plan.steps),
            previous_results=previous_results,
        )
        
        content_str = json.dumps(approved_content, indent=2) if isinstance(approved_content, dict) else str(approved_content)
        
        executor_messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Execute step {step.step_number}: {step.description}\n\nUse this approved content:\n{content_str}")
        ]
        
        response = await self.executor_with_tools.ainvoke(executor_messages)
        
        return {
            "messages": [response], 
            "plan": plan,
        }

    async def step_complete_node(self, state: WorkflowState) -> dict:
        """
        Called after a step completes (no more tool calls).
        Updates the plan and moves to next step.
        """
        plan = state["plan"]
        current_index = state["current_step_index"]
        messages = state["messages"]
        
        if not plan or current_index >= len(plan.steps):
            return {}
        
        # Get the last AI message as the result
        last_message = ""
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and msg.content:
                if isinstance(msg.content, list):
                    text_parts = []
                    for item in msg.content:
                        if isinstance(item, dict) and "text" in item:
                            text_parts.append(item["text"])
                        elif isinstance(item, str):
                            text_parts.append(item)
                    last_message = "\n".join(text_parts) if text_parts else str(msg.content)
                else:
                    last_message = str(msg.content)
                break
        
        # Update current step
        current_step = plan.steps[current_index]
        current_step.status = "completed"
        current_step.result = last_message[:500] if last_message else "Step completed"
        
        # Extract structured search results for web-search steps
        if any("search" in step.description.lower() for step in [current_step]):
            search_results = extract_search_results_from_messages(messages)
            if search_results:
                current_step.search_results = search_results
                print(f"📊 Extracted {len(search_results)} structured search results")
        
        # Move to next step
        next_index = current_index + 1
        
        # Check if we're done
        if next_index >= len(plan.steps):
            plan.is_complete = True
            summary = f"✅ **Workflow Complete!**\n\n"
            summary += f"Completed all {len(plan.steps)} steps for: {plan.original_request}\n\n"
            summary += "**Results:**\n"
            for step in plan.steps:
                status_icon = "✓" if step.status == "completed" else "⏭️" if step.status == "skipped" else "?"
                result_preview = step.result[:100] if step.result else "N/A"
                summary += f"{step.step_number}. {status_icon} {step.description}\n   → {result_preview}...\n\n"
            
            plan.final_summary = summary
            return {
                "messages": [AIMessage(content=summary)],
                "plan": plan,
                "current_step_index": next_index,
            }
        
        # Continue to next step
        next_step = plan.steps[next_index]
        progress = f"✓ Step {current_index + 1} complete. Moving to step {next_index + 1}: {next_step.description}\n"
        
        return {
            "messages": [AIMessage(content=progress)],
            "plan": plan,
            "current_step_index": next_index,
        }

    def get_tool_node(self) -> ToolNode:
        """Get the tool node for the graph."""
        return self.tool_node


# -------------------
# Routing Functions
# -------------------
def route_to_executor(state: WorkflowState) -> Literal["executor", "executor_with_approval", "end"]:
    """
    Route to appropriate executor based on LLM's HITL classification.
    This is the key routing decision based on requires_human_approval.
    """
    plan = state.get("plan")
    current_index = state.get("current_step_index", 0)
    
    if not plan or current_index >= len(plan.steps):
        return "end"
    
    current_step = plan.steps[current_index]
    
    if current_step.requires_human_approval:
        print(f"🔀 Routing to APPROVAL executor for step {current_step.step_number}")
        return "executor_with_approval"
    
    print(f"🔀 Routing to AUTO executor for step {current_step.step_number}")
    return "executor"


def should_continue(state: WorkflowState) -> Literal["tools", "step_complete", "end"]:
    """
    Determine if we need to call tools, complete the step, or end (for approval).
    """
    # If awaiting approval, end the graph (streaming code will detect and send approval event)
    if state.get("awaiting_approval"):
        print("🛑 Awaiting approval - ending graph")
        return "end"
    
    messages = state["messages"]
    if not messages:
        return "step_complete"
    
    last_message = messages[-1]
    
    # Check if the last message has tool calls
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        # Count tool messages to prevent infinite loops
        tool_message_count = sum(1 for m in messages if isinstance(m, ToolMessage))
        
        if tool_message_count >= 10:
            print(f"⚠️ Tool call limit (10) reached, completing step")
            return "step_complete"
        
        return "tools"
    
    return "step_complete"


def should_execute_next_step(state: WorkflowState) -> Literal["executor", "executor_with_approval", "end"]:
    """
    After completing a step, check if there are more steps to execute.
    Routes to the appropriate executor based on next step's HITL requirement.
    """
    plan = state.get("plan")
    current_index = state.get("current_step_index", 0)
    
    if not plan or plan.is_complete:
        return "end"
    
    if current_index >= len(plan.steps):
        return "end"
    
    # Route based on next step's requires_human_approval
    next_step = plan.steps[current_index]
    if next_step.requires_human_approval:
        print(f"🔀 Routing to APPROVAL executor for step {next_step.step_number}")
        return "executor_with_approval"
    
    print(f"🔀 Routing to AUTO executor for step {next_step.step_number}")
    return "executor"
