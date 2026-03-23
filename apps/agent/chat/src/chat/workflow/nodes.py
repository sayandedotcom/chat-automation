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

import functools
import logging
from typing import TYPE_CHECKING, Optional

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from langgraph.prebuilt import ToolNode

from chat.schemas import WorkflowPlan, WorkflowState, WorkflowStep
from chat.workflow.executor.helpers import (
    deep_parse_stringified_json,
    fix_notion_workspace_parent,
)
from chat.workflow.llm import (
    get_executor_llm,
    get_planner_llm,
    get_summarizer_llm,
)

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


def _sanitize_tool_call_args(state: WorkflowState) -> WorkflowState:
    """Fix double-serialized JSON in tool call arguments before MCP dispatch.

    Returns a shallow-copied state with sanitized messages if any fix was needed.
    """
    messages = state.get("messages", [])
    if not messages:
        return state

    last_msg = messages[-1]
    if not (isinstance(last_msg, AIMessage) and getattr(last_msg, "tool_calls", None)):
        return state

    fixed_any = False
    new_tool_calls = []
    for tc in last_msg.tool_calls:
        args = tc.get("args", {})
        sanitized = deep_parse_stringified_json(args)
        # Fix Notion workspace parent format
        if tc.get("name") == "API-post-page":
            sanitized = fix_notion_workspace_parent(sanitized)
        if sanitized != args:
            fixed_any = True
            logger.warning(
                "Fixed double-serialized args for tool %s", tc.get("name", "?")
            )
        new_tool_calls.append({**tc, "args": sanitized})

    if not fixed_any:
        return state

    new_msg = AIMessage(
        content=last_msg.content, tool_calls=new_tool_calls, id=last_msg.id
    )
    new_messages = list(messages[:-1]) + [new_msg]
    return {**state, "messages": new_messages}


class WorkflowNodes:
    """Nodes for the dynamic workflow graph with LLM-driven HITL."""

    def __init__(
        self, tools: list[BaseTool] = None, registry: "IntegrationRegistry" = None
    ):
        self.tools = tools or []
        self.registry = registry
        self.planner_llm = get_planner_llm()
        self.executor_llm = get_executor_llm()
        self.summarizer_llm = get_summarizer_llm()
        self.executor_with_tools = (
            self.executor_llm.bind_tools(self.tools)
            if self.tools
            else self.executor_llm
        )
        self.executor_with_tools_forced = (
            self.executor_llm.bind_tools(self.tools, tool_choice="any")
            if self.tools
            else self.executor_llm
        )
        self.tool_node = (
            ToolNode(self.tools, handle_tool_errors=True) if self.tools else None
        )

    # ------------------------------------------------------------------
    # Per-step tool scoping
    # ------------------------------------------------------------------

    def _get_step_scoped_bindings(self, step: WorkflowStep):
        """Return (executor_with_tools, executor_with_tools_forced) scoped to step.

        When the planner annotates a step with integrations (e.g. ["notion"]),
        we bind only those tools to the LLM — dramatically reducing input tokens.
        Falls back to the full toolset if step.integrations is empty or the
        registry doesn't have the requested integrations.
        """
        if step.integrations and self.registry:
            scoped = self.registry.get_toolset(step.integrations)
            if scoped:
                logger.info(
                    "Scoping tools for step %d to %s (%d tools, down from %d)",
                    step.step_number,
                    step.integrations,
                    len(scoped),
                    len(self.tools),
                )
                return (
                    self.executor_llm.bind_tools(scoped),
                    self.executor_llm.bind_tools(scoped, tool_choice="any"),
                )
        return self.executor_with_tools, self.executor_with_tools_forced

    def _get_current_step_bindings(self, state: WorkflowState):
        """Get scoped (executor_with_tools, executor_with_tools_forced) for the current step."""
        plan = state.get("plan")
        current_index = state.get("current_step_index", 0)
        if plan and 0 <= current_index < len(plan.steps):
            return self._get_step_scoped_bindings(plan.steps[current_index])
        return self.executor_with_tools, self.executor_with_tools_forced

    # ------------------------------------------------------------------
    # Smart Router
    # ------------------------------------------------------------------

    async def smart_router_node(self, state: WorkflowState) -> dict:
        """Route request to appropriate integrations before the planner."""
        from chat.workflow.smart_router import run_smart_router

        result = await run_smart_router(
            state,
            self.registry,
            self.tools,
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
            # Keep forced binding in sync
            self.executor_with_tools_forced = (
                self.executor_llm.bind_tools(self.tools, tool_choice="any")
                if self.tools
                else self.executor_llm
            )
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

    async def executor_node(self, state: WorkflowState, config: RunnableConfig) -> dict:
        """Execute the current step automatically."""
        from chat.workflow.executor.nodes import run_executor

        # Scope tools to current step's integrations
        scoped_ewt, _ = self._get_current_step_bindings(state)

        return await run_executor(
            state,
            continue_after_tools_fn=functools.partial(
                self._continue_after_tools, config=config, scoped_ewt=scoped_ewt
            ),
            get_previous_results_fn=self._get_previous_results,
            start_step_execution_fn=functools.partial(
                self._start_step_execution, config=config, scoped_ewt=scoped_ewt
            ),
            try_incremental_load_fn=functools.partial(
                self._try_incremental_load, config=config
            ),
        )

    # ------------------------------------------------------------------
    # Executor with approval
    # ------------------------------------------------------------------

    async def executor_with_approval_node(
        self, state: WorkflowState, config: RunnableConfig
    ) -> dict:
        """Handle steps that require human approval (state-based HITL)."""
        from chat.workflow.executor.nodes import run_executor_with_approval

        # Scope tools to current step's integrations
        scoped_ewt, scoped_ewt_forced = self._get_current_step_bindings(state)

        return await run_executor_with_approval(
            state,
            continue_after_tools_fn=functools.partial(
                self._continue_after_tools, config=config, scoped_ewt=scoped_ewt
            ),
            handle_approval_decision_fn=functools.partial(
                self._handle_approval_decision,
                config=config,
                scoped_ewt=scoped_ewt,
            ),
            request_approval_fn=functools.partial(
                self._request_approval,
                config=config,
                scoped_ewt=scoped_ewt,
                scoped_ewt_forced=scoped_ewt_forced,
            ),
        )

    async def _handle_approval_decision(
        self,
        state,
        plan,
        current_step,
        approval_decision,
        *,
        config=None,
        scoped_ewt=None,
    ) -> dict:
        from chat.workflow.executor.nodes import handle_approval_decision

        return await handle_approval_decision(
            state,
            plan,
            current_step,
            approval_decision,
            get_previous_results_fn=self._get_previous_results,
            apply_edited_args_fn=self._apply_edited_args,
            start_step_execution_fn=functools.partial(
                self._start_step_execution, config=config, scoped_ewt=scoped_ewt
            ),
        )

    async def _request_approval(
        self,
        state,
        plan,
        current_step,
        *,
        config=None,
        scoped_ewt=None,
        scoped_ewt_forced=None,
    ) -> dict:
        from chat.workflow.executor.nodes import request_approval

        return await request_approval(
            state,
            plan,
            current_step,
            get_previous_results_fn=self._get_previous_results,
            resolve_tool_integration_fn=self._resolve_tool_integration,
            resolve_ui_component_fn=self._resolve_ui_component,
            generate_spreadsheet_structure_fn=self._generate_spreadsheet_structure,
            start_step_execution_fn=functools.partial(
                self._start_step_execution_forced,
                config=config,
                scoped_ewt=scoped_ewt_forced,
            ),
            # Enable pre-execution of non-UI tools
            tool_node=self.tool_node,
            executor_with_tools=scoped_ewt or self.executor_with_tools,
            config=config,
        )

    # ------------------------------------------------------------------
    # Step complete
    # ------------------------------------------------------------------

    async def step_complete_node(self, state: WorkflowState) -> dict:
        """Mark the current step done, extract artifacts, advance to next step."""
        from chat.workflow.step_complete import run_step_complete

        return await run_step_complete(
            state, registry=self.registry, summarizer_llm=self.summarizer_llm
        )

    def get_tool_node(self) -> ToolNode:
        return self.tool_node

    async def tool_node_dispatch(
        self, state: WorkflowState, config: RunnableConfig
    ) -> dict:
        """Dispatch to the current tool_node so the graph always uses the latest one.

        The smart router may replace self.tool_node after graph compilation.
        Using this method as the graph node ensures the graph always calls
        the up-to-date tool node.
        """
        state = _sanitize_tool_call_args(state)
        return await self.tool_node.ainvoke(state, config=config)

    # ------------------------------------------------------------------
    # Private helpers (delegated to executor_helpers / executor modules)
    # ------------------------------------------------------------------

    async def _try_incremental_load(
        self,
        exc,
        state,
        current_step,
        plan,
        previous_results,
        initial_integrations,
        step_artifacts,
        incremental_load_events,
        *,
        config=None,
    ):
        from chat.workflow.executor.helpers import try_incremental_load

        result = await try_incremental_load(
            exc,
            state,
            current_step,
            plan,
            previous_results,
            initial_integrations,
            step_artifacts,
            incremental_load_events,
            registry=self.registry,
            tools=self.tools,
            executor_llm=self.executor_llm,
            executor_with_tools=self.executor_with_tools,
            start_step_execution_fn=functools.partial(
                self._start_step_execution, config=config
            ),
        )
        (
            response,
            executor_chat,
            new_integrations,
            incremental_load_events,
            self.tools,
            self.executor_with_tools,
            self.tool_node,
        ) = result
        self.executor_with_tools_forced = (
            self.executor_llm.bind_tools(self.tools, tool_choice="any")
            if self.tools
            else self.executor_llm
        )
        return response, executor_chat, new_integrations, incremental_load_events

    def _extract_tool_name_from_error(self, error: str) -> Optional[str]:
        from chat.workflow.executor.helpers import extract_tool_name_from_error

        return extract_tool_name_from_error(error)

    def _resolve_tool_integration(self, tool_name: str) -> str:
        from chat.workflow.executor.helpers import resolve_tool_integration

        return resolve_tool_integration(tool_name, self.registry)

    def _resolve_ui_component(self, tool_name: str) -> Optional[str]:
        if self.registry:
            return self.registry.get_ui_component_for_tool(tool_name)
        return None

    def _apply_edited_args(
        self, ai_message: AIMessage, edited_content: dict
    ) -> AIMessage:
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

        return await generate_spreadsheet_structure(
            step, previous_results, self.executor_llm
        )

    async def _start_step_execution(
        self,
        step,
        plan,
        previous_results,
        conversation_summary="",
        initial_integrations=None,
        approved_content=None,
        artifacts=None,
        *,
        config=None,
        scoped_ewt=None,
    ) -> tuple:
        from chat.workflow.executor.nodes import start_step_execution

        return await start_step_execution(
            step,
            plan,
            previous_results,
            conversation_summary,
            initial_integrations,
            approved_content,
            artifacts,
            executor_with_tools=scoped_ewt or self.executor_with_tools,
            executor_llm=self.executor_llm,
            registry=self.registry,
            config=config,
        )

    async def _start_step_execution_forced(
        self,
        step,
        plan,
        previous_results,
        conversation_summary="",
        initial_integrations=None,
        approved_content=None,
        artifacts=None,
        *,
        config=None,
        scoped_ewt=None,
    ) -> tuple:
        from chat.workflow.executor.nodes import start_step_execution

        return await start_step_execution(
            step,
            plan,
            previous_results,
            conversation_summary,
            initial_integrations,
            approved_content,
            artifacts,
            executor_with_tools=scoped_ewt or self.executor_with_tools_forced,
            executor_llm=self.executor_llm,
            registry=self.registry,
            config=config,
        )

    async def _continue_after_tools(
        self, state: WorkflowState, *, config=None, scoped_ewt=None
    ) -> dict:
        from chat.workflow.executor.nodes import continue_after_tools

        return await continue_after_tools(
            state, scoped_ewt or self.executor_with_tools, config=config
        )
