"""
Workflow Schemas

State and models for dynamic AI workflow execution.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Annotated, TypedDict, Literal
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class SearchResultItem(BaseModel):
    """Structured search result from Tavily or similar."""
    title: str = Field(..., description="Title of the search result")
    url: str = Field(..., description="URL of the search result")
    domain: str = Field(..., description="Domain name (e.g., 'github.com')")
    favicon: Optional[str] = Field(default=None, description="Favicon URL")
    date: Optional[str] = Field(default=None, description="Published date if available")


# -------------------
# Planner Structured Output Models
# -------------------
class PlannedStep(BaseModel):
    """A single step in the workflow plan - output by the planner LLM."""
    description: str = Field(..., description="What this step does")
    requires_human_approval: bool = Field(
        ..., 
        description="True if this step creates, updates, deletes, or sends anything. False for read-only operations like search, list, or fetch."
    )
    approval_reason: str = Field(
        ..., 
        description="Brief explanation of why this does or doesn't need approval"
    )


class WorkflowPlanOutput(BaseModel):
    """Structured output from the planner LLM - used with with_structured_output()."""
    thinking: str = Field(..., description="Your reasoning about how to break down this task")
    steps: List[PlannedStep] = Field(..., description="Ordered list of steps to execute")


# -------------------
# Runtime Workflow Models
# -------------------
class WorkflowStep(BaseModel):
    """Represents a single step in a workflow during execution."""
    step_number: int = Field(..., description="Step number (1-indexed)")
    description: str = Field(..., description="What this step does")
    requires_human_approval: bool = Field(
        default=False, 
        description="Whether this step needs user approval (set by planner LLM)"
    )
    approval_reason: Optional[str] = Field(
        default=None, 
        description="LLM's explanation for why approval is/isn't needed"
    )
    status: Literal["pending", "in_progress", "awaiting_approval", "completed", "skipped", "failed"] = Field(
        default="pending", description="Current status of this step"
    )
    result: Optional[str] = Field(default=None, description="Result/output of this step")
    error: Optional[str] = Field(default=None, description="Error message if step failed")
    tools_used: List[str] = Field(default_factory=list, description="Tools used in this step")
    # Structured data for web search results
    search_results: Optional[List[SearchResultItem]] = Field(
        default=None, description="Structured search results from web search"
    )


class WorkflowPlan(BaseModel):
    """The complete workflow plan."""
    original_request: str = Field(..., description="Original user request")
    steps: List[WorkflowStep] = Field(default_factory=list, description="List of workflow steps")
    is_complete: bool = Field(default=False, description="Whether workflow is complete")
    final_summary: Optional[str] = Field(default=None, description="Final summary after completion")


class WorkflowState(TypedDict):
    """State for the dynamic workflow graph."""
    messages: Annotated[List[BaseMessage], add_messages]
    plan: Optional[WorkflowPlan]
    current_step_index: int  # 0-indexed, -1 means planning phase
    # State-based HITL fields (instead of using interrupt())
    awaiting_approval: bool  # True when waiting for human approval
    approval_step_info: Optional[dict]  # Info about step awaiting approval
    approval_decision: Optional[dict]  # Decision from user (action: approve/edit/skip)

