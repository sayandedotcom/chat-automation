"""
Workflow Nodes

Thin coordinator that delegates to focused modules:

    workflow/smart_router.py       — integration classification & tool binding
    workflow/planner.py            — step-by-step plan generation
    workflow/executor/nodes.py     — step execution & approval flows
    workflow/executor/helpers.py   — stateless executor utilities
    workflow/step_complete.py      — step completion & artifact extraction

Routing functions and other utilities live in:

    workflow/llm.py      — shared LLM singletons
    workflow/artifacts.py — artifact & search-result extraction
    workflow/context.py  — conversation summary + prompt-context helpers
    workflow/routing.py  — graph edge routing functions
    workflow/prompts.py  — system prompt templates
"""

import logging
from typing import TYPE_CHECKING, Optional

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from langgraph.prebuilt import ToolNode

from chat.schemas import WorkflowPlan, WorkflowState, WorkflowStep
from chat.workflow.llm import get_executor_llm, get_planner_llm

# Re-export routing symbols so graph.py can import them from here (single source)
from chat.workflow.routing import (  # noqa: F401
    route_after_smart_router,
    route_after_tools,
    route_to_executor,
    should_continue,
    should_execute_next_step,
)

if TYPE_CHECKING:
    from chat.integrations.registry import IntegrationRegistry

logger = logging.getLogger(__name__)


class WorkflowNodes:
    """Nodes for the dynamic workflow graph with LLM-driven HITL."""

    def __init__(
        self, tools: list[BaseTool] = None, registry: "IntegrationRegistry" = None
    ):
        self.tools = tools or []
        self.registry = registry
        self.planner_llm = get_planner_llm()
        self.executor_llm = get_executor_llm()
        self.executor_with_tools = (
            self.executor_llm.bind_tools(self.tools)
            if self.tools
            else self.executor_llm
        )
        self.tool_node = (
            ToolNode(self.tools, handle_tool_errors=True)
            if self.tools
            else None
        )

    # ------------------------------------------------------------------
    # Smart Router
    # ------------------------------------------------------------------

    async def smart_router_node(self, state: WorkflowState) -> dict:
        """Route request to appropriate integrations before the planner."""
        from chat.workflow.smart_router import run_smart_router

        result = await run_smart_router(
            state, self.registry, self.tools,
            self.executor_llm,
        )
        # Apply tool-binding mutations returned by the standalone function
        new_tools = result.pop("_tools", None)
        new_ewt = result.pop("_executor_with_tools", None)
        new_tn = result.pop("_tool_node", None)
        if new_tools is not None:
            self.tools = new_tools
        if new_ewt is not None:
            self.executor_with_tools = new_ewt
        if new_tn is not None:
            self.tool_node = new_tn
        return result

    # ------------------------------------------------------------------
    # Planner
    # ------------------------------------------------------------------

    async def planner_node(self, state: WorkflowState) -> dict:
        """Create a step-by-step plan with HITL flags using structured LLM output."""
        from chat.workflow.planner import run_planner

        return await run_planner(state, self.planner_llm, self.registry)

    # ------------------------------------------------------------------
    # Executor (auto)
    # ------------------------------------------------------------------

    async def executor_node(self, state: WorkflowState) -> dict:
        """Execute the current step automatically."""
        from chat.workflow.executor.nodes import run_executor

        return await run_executor(
            state,
            continue_after_tools_fn=self._continue_after_tools,
            get_previous_results_fn=self._get_previous_results,
            start_step_execution_fn=self._start_step_execution,
            try_incremental_load_fn=self._try_incremental_load,
        )

    # ------------------------------------------------------------------
    # Executor with approval
    # ------------------------------------------------------------------

    async def executor_with_approval_node(self, state: WorkflowState) -> dict:
        """Handle steps that require human approval (state-based HITL)."""
        from chat.workflow.executor.nodes import run_executor_with_approval

        return await run_executor_with_approval(
            state,
            continue_after_tools_fn=self._continue_after_tools,
            handle_approval_decision_fn=self._handle_approval_decision,
            request_approval_fn=self._request_approval,
        )

    async def _handle_approval_decision(
        self, state, plan, current_step, approval_decision
    ) -> dict:
        from chat.workflow.executor.nodes import handle_approval_decision

        return await handle_approval_decision(
            state, plan, current_step, approval_decision,
            get_previous_results_fn=self._get_previous_results,
            apply_edited_args_fn=self._apply_edited_args,
            start_step_execution_fn=self._start_step_execution,
        )

    async def _request_approval(self, state, plan, current_step) -> dict:
        from chat.workflow.executor.nodes import request_approval

        return await request_approval(
            state, plan, current_step,
            get_previous_results_fn=self._get_previous_results,
            resolve_tool_integration_fn=self._resolve_tool_integration,
            generate_spreadsheet_structure_fn=self._generate_spreadsheet_structure,
            start_step_execution_fn=self._start_step_execution,
        )

    # ------------------------------------------------------------------
    # Step complete
    # ------------------------------------------------------------------

    async def step_complete_node(self, state: WorkflowState) -> dict:
        """Mark the current step done, extract artifacts, advance to next step."""
        from chat.workflow.step_complete import run_step_complete

        return await run_step_complete(state)

    def get_tool_node(self) -> ToolNode:
        return self.tool_node

    async def tool_node_dispatch(self, state: WorkflowState, config: RunnableConfig) -> dict:
        """Dispatch to the current tool_node so the graph always uses the latest one.

        The smart router may replace self.tool_node after graph compilation.
        Using this method as the graph node ensures the graph always calls
        the up-to-date tool node.
        """
        return await self.tool_node.ainvoke(state, config=config)

    # ------------------------------------------------------------------
    # Private helpers (delegated to executor_helpers / executor modules)
    # ------------------------------------------------------------------

    async def _try_incremental_load(
        self, exc, state, current_step, plan, previous_results,
        initial_integrations, step_artifacts, incremental_load_events,
    ):
        from chat.workflow.executor.helpers import try_incremental_load

        result = await try_incremental_load(
            exc, state, current_step, plan, previous_results,
            initial_integrations, step_artifacts, incremental_load_events,
            registry=self.registry,
            tools=self.tools,
            executor_llm=self.executor_llm,
            executor_with_tools=self.executor_with_tools,
            start_step_execution_fn=self._start_step_execution,
        )
        (response, executor_chat, new_integrations,
         incremental_load_events, self.tools,
         self.executor_with_tools, self.tool_node) = result
        return response, executor_chat, new_integrations, incremental_load_events

    def _extract_tool_name_from_error(self, error: str) -> Optional[str]:
        from chat.workflow.executor.helpers import extract_tool_name_from_error
        return extract_tool_name_from_error(error)

    def _resolve_tool_integration(self, tool_name: str) -> str:
        from chat.workflow.executor.helpers import resolve_tool_integration
        return resolve_tool_integration(tool_name, self.registry)

    def _apply_edited_args(self, ai_message: AIMessage, edited_content: dict) -> AIMessage:
        from chat.workflow.executor.helpers import apply_edited_args
        return apply_edited_args(ai_message, edited_content)

    def _get_previous_results(
        self, plan: WorkflowPlan, current_index: int, artifacts: list[dict] = None
    ) -> str:
        from chat.workflow.executor.helpers import get_previous_results
        return get_previous_results(plan, current_index, artifacts)

    async def _generate_spreadsheet_structure(
        self, step: WorkflowStep, previous_results: str
    ) -> dict:
        from chat.workflow.executor.helpers import generate_spreadsheet_structure
        return await generate_spreadsheet_structure(step, previous_results, self.executor_llm)

    async def _start_step_execution(
        self, step, plan, previous_results, conversation_summary="",
        initial_integrations=None, approved_content=None, artifacts=None,
    ) -> tuple:
        from chat.workflow.executor.nodes import start_step_execution
        return await start_step_execution(
            step, plan, previous_results, conversation_summary,
            initial_integrations, approved_content, artifacts,
            executor_with_tools=self.executor_with_tools,
            executor_llm=self.executor_llm,
            registry=self.registry,
        )

    async def _continue_after_tools(self, state: WorkflowState) -> dict:
        from chat.workflow.executor.nodes import continue_after_tools
        return await continue_after_tools(state, self.executor_with_tools)
