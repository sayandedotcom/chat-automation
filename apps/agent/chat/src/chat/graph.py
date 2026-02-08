"""
Workflow Graph

LangGraph workflow for dynamic AI workflow execution.
Implements: Plan → Route → Execute (Auto/Approval) → Loop pattern
"""

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.tools import BaseTool
from typing import List, Optional, TYPE_CHECKING
from dotenv import load_dotenv

from chat.schemas import WorkflowState
from chat.nodes import (
    WorkflowNodes,
    route_to_executor,
    should_continue,
    should_execute_next_step,
)

if TYPE_CHECKING:
    from chat.integration_registry import IntegrationRegistry

load_dotenv()


class DynamicWorkflow:
    """
    Dynamic workflow with LLM-driven Human-in-the-Loop.
    
    The LLM decides during planning which steps need human approval.
    Steps are routed to the appropriate executor based on this classification.
    
    Graph:
    
    ┌─────────┐
    │  START  │
    └────┬────┘
         │
         ▼
    ┌─────────────────┐
    │     PLANNER     │ ← LLM creates plan with HITL flags
    │ (structured out)│
    └────────┬────────┘
             │
             ▼
    ┌────────────────────┐
    │   ROUTE_EXECUTOR   │ ← Routes based on requires_human_approval
    └───────┬────────────┘
            │
    ┌───────┴───────────────────┐
    │                           │
    │ approval=false            │ approval=true
    │                           │
    ▼                           ▼
┌──────────┐            ┌────────────────────────┐
│ EXECUTOR │            │ EXECUTOR_WITH_APPROVAL │
│ (auto)   │            │ (uses interrupt())     │
└────┬─────┘            └───────────┬────────────┘
     │                              │
     │ should_continue              │ should_continue
     ▼                              ▼
┌────────┐                     ┌────────┐
│ TOOLS  │◄────────────────────│ TOOLS  │
└───┬────┘                     └───┬────┘
    │                              │
    └──────────┬───────────────────┘
               ▼
    ┌───────────────────┐
    │   STEP_COMPLETE   │
    └─────────┬─────────┘
              │
    ┌─────────▼────────────┐
    │ should_execute_next  │
    └─────────┬────────────┘
              │
      ┌───────┴───────┐
      │               │
  route_executor     end
      │               │
      ▼               ▼
    (loop)         ┌─────┐
                   │ END │
                   └─────┘
    """
    
    def __init__(
        self,
        tools: List[BaseTool] = None,
        registry: "IntegrationRegistry" = None,
        checkpointer: Optional[BaseCheckpointSaver] = None,
    ):
        """
        Initialize the dynamic workflow.

        Args:
            tools: List of MCP tools to use
            registry: Optional IntegrationRegistry for smart routing
            checkpointer: Checkpointer for persisting workflow state.
                          If None, falls back to in-memory MemorySaver.
        """
        self.tools = tools or []
        self.registry = registry
        self.checkpointer = checkpointer or MemorySaver()
        self.nodes = WorkflowNodes(tools=self.tools, registry=self.registry)
        self.app = self._build_graph()

    def _build_graph(self):
        """Build and compile the workflow graph with conditional HITL routing."""
        workflow = StateGraph(WorkflowState)

        # Add nodes
        # Smart router for dynamic integration loading (runs before planner)
        if self.registry:
            workflow.add_node("smart_router", self.nodes.smart_router_node)

        workflow.add_node("planner", self.nodes.planner_node)
        workflow.add_node("executor", self.nodes.executor_node)
        workflow.add_node("executor_with_approval", self.nodes.executor_with_approval_node)
        workflow.add_node("step_complete", self.nodes.step_complete_node)

        if self.tools or self.registry:
            workflow.add_node("tools", self.nodes.get_tool_node())

        # Add edges
        # START -> SMART_ROUTER (if registry) -> PLANNER
        if self.registry:
            workflow.add_edge(START, "smart_router")
            workflow.add_edge("smart_router", "planner")
        else:
            workflow.add_edge(START, "planner")
        
        # PLANNER -> ROUTE_EXECUTOR (conditional based on LLM's HITL classification)
        workflow.add_conditional_edges(
            "planner",
            route_to_executor,
            {
                "executor": "executor",
                "executor_with_approval": "executor_with_approval",
                "end": END,
            }
        )
        
        # EXECUTOR (auto) can either call tools or complete the step
        if self.tools:
            workflow.add_conditional_edges(
                "executor",
                should_continue,
                {
                    "tools": "tools",
                    "step_complete": "step_complete",
                }
            )
        else:
            workflow.add_edge("executor", "step_complete")
        
        # EXECUTOR_WITH_APPROVAL can call tools, complete step, or end (for approval)
        if self.tools:
            workflow.add_conditional_edges(
                "executor_with_approval",
                should_continue,
                {
                    "tools": "tools",
                    "step_complete": "step_complete",
                    "end": END,  # When awaiting_approval=True
                }
            )
        else:
            workflow.add_edge("executor_with_approval", "step_complete")
        
        # After tools, go to step_complete
        if self.tools:
            workflow.add_edge("tools", "step_complete")
        
        # After step complete, either continue to next step or end
        # We use route_to_executor again for proper HITL routing on next step
        workflow.add_conditional_edges(
            "step_complete",
            should_execute_next_step,
            {
                "executor": "executor",
                "executor_with_approval": "executor_with_approval", 
                "end": END,
            }
        )
        
        return workflow.compile(checkpointer=self.checkpointer)

    def get_app(self):
        """Get the compiled workflow app."""
        return self.app

    def get_checkpointer(self):
        """Get the checkpointer."""
        return self.checkpointer

