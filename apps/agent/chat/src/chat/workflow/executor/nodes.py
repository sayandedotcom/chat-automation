"""
Executor node orchestration.

Contains run_executor, run_executor_with_approval, and the core
step-execution / tool-continuation / approval flows.
"""

import json
import logging
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from chat.schemas import WorkflowPlan, WorkflowState, WorkflowStep
from chat.workflow.context import format_artifacts_context, format_integration_context
from chat.workflow.executor.helpers import (
    deep_parse_stringified_json,
    extract_pagination_metadata,
    fix_notion_workspace_parent,
)
from chat.workflow.prompts import EXECUTOR_SYSTEM_PROMPT

if TYPE_CHECKING:
    from chat.integrations.registry import IntegrationRegistry

logger = logging.getLogger(__name__)


async def _astream_collect(model, messages, config=None):
    """Invoke model via streaming so LangGraph can emit real-time token events.

    Equivalent to model.ainvoke(messages) but uses astream() internally,
    which triggers on_llm_new_token callbacks that LangGraph's
    StreamMessagesHandler captures for stream_mode="messages".

    The caller must pass the LangGraph RunnableConfig (which contains the
    StreamMessagesHandler callback) explicitly — ensure_config() does NOT
    pick up the handler when called deep in the call chain.
    """
    full = None
    async for chunk in model.astream(messages, config=config):
        full = chunk if full is None else full + chunk
    if full is None:
        return AIMessage(content="")
    return full


def _extract_thinking(response) -> str | None:
    """Extract thinking/reasoning text from an executor LLM response.

    When the LLM responds with tool_calls alongside text content,
    the text is its reasoning (thinking). When the response is purely
    text (no tool calls), return None — the text is the result, not thinking.
    """
    if not hasattr(response, "content") or not response.content:
        return None
    content = response.content
    if isinstance(content, list):
        content = "\n".join(
            item["text"] if isinstance(item, dict) and "text" in item else str(item)
            for item in content
        )
    if not isinstance(content, str) or not content.strip():
        return None
    # Only treat as thinking when the LLM also made tool calls —
    # otherwise the text IS the step result
    if hasattr(response, "tool_calls") and response.tool_calls:
        return content.strip()
    return None


async def run_executor(
    state: WorkflowState,
    *,
    continue_after_tools_fn,
    get_previous_results_fn,
    start_step_execution_fn,
    try_incremental_load_fn,
) -> dict:
    """Execute the current step automatically (auto-executor node)."""
    plan = state["plan"]
    current_index = state["current_step_index"]

    if not plan or current_index >= len(plan.steps):
        return {"messages": [AIMessage(content="Workflow complete!")]}

    current_step = plan.steps[current_index]

    if state.get("_executor_chat") and isinstance(state["messages"][-1], ToolMessage):
        return await continue_after_tools_fn(state)

    current_step.status = "in_progress"
    initial_integrations = state.get("initial_integrations", [])
    step_artifacts = state.get("artifacts", [])
    previous_results = get_previous_results_fn(
        plan, current_index, artifacts=step_artifacts
    )
    incremental_load_events = state.get("incremental_load_events", [])

    start_time = time.time()
    try:
        response, executor_chat = await start_step_execution_fn(
            current_step,
            plan,
            previous_results,
            state.get("conversation_summary", ""),
            initial_integrations,
            artifacts=step_artifacts,
        )
    except Exception as e:
        (
            response,
            executor_chat,
            initial_integrations,
            incremental_load_events,
        ) = await try_incremental_load_fn(
            e,
            state,
            current_step,
            plan,
            previous_results,
            initial_integrations,
            step_artifacts,
            incremental_load_events,
        )

    # Populate step.thinking from the executor's text response
    # When the LLM responds with tool_calls + text content, the text is its reasoning
    thinking = _extract_thinking(response)
    if thinking:
        current_step.thinking = thinking
        current_step.thinking_duration_ms = int((time.time() - start_time) * 1000)

    result: dict = {
        "messages": [response],
        "_executor_chat": executor_chat,
        "_step_tool_calls": 0,
        "plan": plan,
    }
    if incremental_load_events:
        result["incremental_load_events"] = incremental_load_events
        result["initial_integrations"] = initial_integrations
    return result


async def run_executor_with_approval(
    state: WorkflowState,
    *,
    continue_after_tools_fn,
    handle_approval_decision_fn,
    request_approval_fn,
) -> dict:
    """Handle steps requiring human approval (state-based HITL)."""
    plan = state["plan"]
    current_index = state["current_step_index"]

    if not plan or current_index >= len(plan.steps):
        return {"messages": [AIMessage(content="Workflow complete!")]}

    current_step = plan.steps[current_index]

    if state.get("_executor_chat") and isinstance(state["messages"][-1], ToolMessage):
        return await continue_after_tools_fn(state)

    approval_decision = state.get("approval_decision")
    if approval_decision:
        return await handle_approval_decision_fn(
            state, plan, current_step, approval_decision
        )

    return await request_approval_fn(state, plan, current_step)


async def start_step_execution(
    step: WorkflowStep,
    plan: WorkflowPlan,
    previous_results: str,
    conversation_summary: str = "",
    initial_integrations: list[str] | None = None,
    approved_content: dict = None,
    artifacts: list[dict] = None,
    *,
    executor_with_tools,
    executor_llm,
    registry: "IntegrationRegistry | None",
    config=None,
) -> tuple:
    """Build the executor conversation and invoke the LLM."""
    # Use step-scoped integrations if the planner annotated them, else all loaded
    step_integrations = step.integrations if step.integrations else initial_integrations

    system_prompt = EXECUTOR_SYSTEM_PROMPT.format(
        current_date=datetime.now(timezone.utc).strftime("%A, %B %d, %Y %H:%M UTC"),
        conversation_context=f"\nCONVERSATION HISTORY:\n{conversation_summary}\n"
        if conversation_summary
        else "",
        integration_context=format_integration_context(step_integrations),
        artifacts_context=format_artifacts_context(artifacts or []),
        integration_hints=(
            registry.get_hints(step_integrations, "executor")
            if registry and step_integrations
            else ""
        ),
        current_step=step.description,
        step_number=step.step_number,
        total_steps=len(plan.steps),
        previous_results=previous_results,
    )

    human_content = f"Execute step {step.step_number}: {step.description}"
    if approved_content:
        content_str = (
            json.dumps(approved_content, indent=2)
            if isinstance(approved_content, dict)
            else str(approved_content)
        )
        human_content += f"\n\nUse this approved content:\n{content_str}"

    executor_chat = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_content),
    ]
    response = await _astream_collect(executor_with_tools, executor_chat, config=config)
    executor_chat.append(response)
    return response, executor_chat


from chat.workflow.constants import TOOL_CALL_ARGS_CHAR_LIMIT, TOOL_RESULT_CHAR_LIMIT


def _truncate_tool_call_args(executor_chat: list) -> list:
    """Return executor_chat with oversized tool_call args truncated.

    Only affects the LLM conversation — state['messages'] keeps full data.
    """
    result = []
    for msg in executor_chat:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            needs_truncation = any(
                len(json.dumps(tc.get("args", {}))) > TOOL_CALL_ARGS_CHAR_LIMIT
                for tc in msg.tool_calls
            )
            if needs_truncation:
                truncated_calls = []
                for tc in msg.tool_calls:
                    args_str = json.dumps(tc.get("args", {}))
                    if len(args_str) > TOOL_CALL_ARGS_CHAR_LIMIT:
                        logger.info(
                            "[TRUNCATE] Tool call '%s' args: %d → %d chars",
                            tc.get("name", "?"),
                            len(args_str),
                            TOOL_CALL_ARGS_CHAR_LIMIT,
                        )
                        truncated_calls.append(
                            {
                                **tc,
                                "args": {
                                    "_summary": args_str[:TOOL_CALL_ARGS_CHAR_LIMIT]
                                    + "... [truncated]"
                                },
                            }
                        )
                    else:
                        truncated_calls.append(tc)
                msg = AIMessage(
                    content=msg.content,
                    tool_calls=truncated_calls,
                    id=msg.id,
                )
        result.append(msg)
    return result


async def continue_after_tools(
    state: WorkflowState, executor_with_tools, config=None
) -> dict:
    """Continue the executor conversation after ToolNode results (multi-hop)."""
    import asyncio

    plan = state["plan"]
    current_index = state["current_step_index"]

    executor_chat = list(state["_executor_chat"])
    new_tool_msgs = []
    for msg in reversed(state["messages"]):
        if isinstance(msg, ToolMessage):
            new_tool_msgs.insert(0, msg)
        else:
            break

    # Log context size to help diagnose slow LLM calls
    total_chars = sum(len(str(getattr(m, "content", ""))) for m in new_tool_msgs)
    logger.info(
        f"[CONTINUE] Feeding {len(new_tool_msgs)} tool result(s) to LLM "
        f"({total_chars} chars), executor_chat len={len(executor_chat)}"
    )

    # Truncate oversized tool results for the LLM conversation only.
    # The original ToolMessages in state["messages"] stay untouched so that
    # step_complete can extract full structured data (email_results, etc.).
    chat_tool_msgs = []
    for msg in new_tool_msgs:
        content = msg.content
        content_str = str(content) if not isinstance(content, str) else content
        if len(content_str) > TOOL_RESULT_CHAR_LIMIT:
            pagination_info = extract_pagination_metadata(content_str)
            truncated = content_str[:TOOL_RESULT_CHAR_LIMIT] + (
                "\n\n[... truncated — full content available for processing]"
            )
            if pagination_info:
                truncated += f"\n\nPagination info from response: {pagination_info}"
            logger.info(
                f"[CONTINUE] Truncated tool result '{getattr(msg, 'name', '?')}' "
                f"from {len(content_str)} to {TOOL_RESULT_CHAR_LIMIT} chars"
                f"{' (pagination preserved)' if pagination_info else ''}"
            )
            chat_tool_msgs.append(
                ToolMessage(
                    content=truncated,
                    tool_call_id=msg.tool_call_id,
                    name=getattr(msg, "name", None),
                )
            )
        else:
            chat_tool_msgs.append(msg)

    # Truncate large tool-call args from prior turns to prevent token explosion.
    # E.g. a 17K Notion page JSON from call #1 would be re-sent verbatim in call #2.
    executor_chat = _truncate_tool_call_args(executor_chat)
    executor_chat.extend(chat_tool_msgs)

    start_time = time.time()
    try:
        response = await asyncio.wait_for(
            _astream_collect(executor_with_tools, executor_chat, config=config),
            timeout=120,  # 2 minutes — prevents indefinite hangs
        )
    except asyncio.TimeoutError:
        logger.error(
            f"[CONTINUE] LLM timed out after 120s processing "
            f"{len(new_tool_msgs)} tool result(s) ({total_chars} chars)"
        )
        # Produce a non-tool-call response so the step completes
        response = AIMessage(content="Here are the results from the tools above.")

    executor_chat.append(response)
    duration_ms = int((time.time() - start_time) * 1000)

    # Update step thinking for each tool-loop LLM call
    if plan and 0 <= current_index < len(plan.steps):
        step = plan.steps[current_index]
        thinking = _extract_thinking(response)
        if thinking:
            step.thinking = thinking
            step.thinking_duration_ms = duration_ms

    return {
        "messages": [response],
        "_executor_chat": executor_chat,
        "_step_tool_calls": state.get("_step_tool_calls", 0) + len(new_tool_msgs),
        "plan": plan,
    }


async def handle_approval_decision(
    state,
    plan,
    current_step,
    approval_decision,
    *,
    get_previous_results_fn,
    apply_edited_args_fn,
    start_step_execution_fn,
) -> dict:
    """Process user's approval/skip/edit decision."""
    action = approval_decision.get("action", "approve")

    if action == "skip":
        current_step.status = "skipped"
        current_step.result = "Skipped by user"
        return {
            "messages": [
                AIMessage(content=f"Step {current_step.step_number} skipped.")
            ],
            "plan": plan,
            "awaiting_approval": False,
            "approval_step_info": None,
            "approval_decision": None,
            "_executor_chat": None,
            "_step_tool_calls": 0,
            "_pending_tool_calls_message": None,
        }

    current_step.status = "in_progress"
    pending_msg_data = state.get("_pending_tool_calls_message")

    if pending_msg_data:
        from langchain_core.messages import messages_from_dict

        ai_message = messages_from_dict([pending_msg_data])[0]
        if action == "edit":
            ai_message = apply_edited_args_fn(
                ai_message, approval_decision.get("content", {})
            )
        return {
            "messages": [ai_message],
            "_executor_chat": state.get("_executor_chat") or [],
            "_step_tool_calls": 0,
            "plan": plan,
            "awaiting_approval": False,
            "approval_step_info": None,
            "approval_decision": None,
            "_pending_tool_calls_message": None,
        }

    # Fallback: re-run from scratch
    step_artifacts = state.get("artifacts", [])
    previous_results = get_previous_results_fn(
        plan, state["current_step_index"], artifacts=step_artifacts
    )
    kwargs = dict(
        step=current_step,
        plan=plan,
        previous_results=previous_results,
        conversation_summary=state.get("conversation_summary", ""),
        initial_integrations=state.get("initial_integrations", []),
        artifacts=step_artifacts,
    )
    if action == "edit":
        kwargs["approved_content"] = approval_decision.get("content", {})
    response, executor_chat = await start_step_execution_fn(**kwargs)

    return {
        "messages": [response],
        "_executor_chat": executor_chat,
        "_step_tool_calls": 0,
        "plan": plan,
        "awaiting_approval": False,
        "approval_step_info": None,
        "approval_decision": None,
        "_pending_tool_calls_message": None,
    }


_MAX_PRE_EXEC_ROUNDS = 3  # Safety limit for pre-executing non-UI tools


async def request_approval(
    state,
    plan,
    current_step,
    *,
    get_previous_results_fn,
    resolve_tool_integration_fn,
    resolve_ui_component_fn=None,
    generate_spreadsheet_structure_fn,
    start_step_execution_fn,
    tool_node=None,
    executor_with_tools=None,
    config=None,
) -> dict:
    """Run LLM to generate tool-call preview, then pause for human approval."""
    current_step.status = "awaiting_approval"
    step_artifacts = state.get("artifacts", [])
    previous_results = get_previous_results_fn(
        plan, state["current_step_index"], artifacts=step_artifacts
    )
    tool_calls_preview = []
    pending_message = None
    executor_chat = None
    accumulated_messages: list = []

    try:
        start_time = time.time()
        response, executor_chat = await start_step_execution_fn(
            current_step,
            plan,
            previous_results,
            state.get("conversation_summary", ""),
            state.get("initial_integrations", []),
            artifacts=step_artifacts,
        )
        thinking = _extract_thinking(response)
        if thinking:
            current_step.thinking = thinking
            current_step.thinking_duration_ms = int((time.time() - start_time) * 1000)

        # --- PRE-EXECUTION LOOP ---
        # Auto-execute tool calls that have no ui_component (preparatory
        # reads/searches).  Continue until we find a tool call with a
        # ui_component (the primary user-facing action).
        if tool_node and executor_with_tools and resolve_ui_component_fn:
            for _ in range(_MAX_PRE_EXEC_ROUNDS):
                if not (hasattr(response, "tool_calls") and response.tool_calls):
                    break  # Text response — nothing to pre-execute

                has_ui_tool = any(
                    resolve_ui_component_fn(tc.get("name", ""))
                    for tc in response.tool_calls
                )
                if has_ui_tool:
                    break  # Found the primary action — show approval

                # All tool calls are non-UI (preparatory) — auto-execute
                logger.info(
                    "Pre-executing non-UI tools for step %d: %s",
                    current_step.step_number,
                    [tc.get("name") for tc in response.tool_calls],
                )

                sanitized_tc = []
                for tc in response.tool_calls:
                    args = deep_parse_stringified_json(tc.get("args", {}))
                    if tc.get("name") == "API-post-page":
                        args = fix_notion_workspace_parent(args)
                    sanitized_tc.append({**tc, "args": args})
                exec_msg = AIMessage(
                    content=response.content,
                    tool_calls=sanitized_tc,
                    id=response.id,
                )

                tool_result = await tool_node.ainvoke({"messages": [exec_msg]})
                tool_msgs = [
                    m for m in tool_result["messages"] if isinstance(m, ToolMessage)
                ]

                accumulated_messages.append(response)
                accumulated_messages.extend(tool_msgs)

                # Continue executor conversation (non-forced, non-streaming)
                executor_chat.extend(tool_msgs)
                response = await executor_with_tools.ainvoke(executor_chat)
                executor_chat.append(response)
        # --- END PRE-EXECUTION LOOP ---

        # If step completed entirely during pre-execution (text response, no
        # tool calls) → mark in_progress and return immediately.
        if not (hasattr(response, "tool_calls") and response.tool_calls):
            if accumulated_messages:
                current_step.status = "in_progress"
                return {
                    "messages": accumulated_messages + [response],
                    "_executor_chat": executor_chat,
                    "_step_tool_calls": len(
                        [m for m in accumulated_messages if isinstance(m, ToolMessage)]
                    ),
                    "plan": plan,
                    "awaiting_approval": False,
                    "approval_step_info": None,
                    "approval_decision": None,
                    "_pending_tool_calls_message": None,
                }

        if hasattr(response, "tool_calls") and response.tool_calls:
            for tc in response.tool_calls:
                tool_name = tc.get("name", "")
                args = deep_parse_stringified_json(tc.get("args", {}))
                if tool_name == "API-post-page":
                    args = fix_notion_workspace_parent(args)
                preview_entry = {
                    "id": tc.get("id", ""),
                    "tool_name": tool_name,
                    "integration": resolve_tool_integration_fn(tool_name),
                    "ui_component": (
                        resolve_ui_component_fn(tool_name)
                        if resolve_ui_component_fn
                        else None
                    ),
                    "arguments": args,
                }
                tool_calls_preview.append(preview_entry)

            from langchain_core.messages import message_to_dict

            pending_message = message_to_dict(response)

            # Enrich spreadsheet preview with sheet/column structure
            for idx, tc_preview in enumerate(tool_calls_preview):
                if tc_preview["tool_name"] == "create_spreadsheet":
                    args = tc_preview.get("arguments", {})
                    if not (
                        args.get("sheets") or args.get("headers") or args.get("columns")
                    ):
                        try:
                            structure = await generate_spreadsheet_structure_fn(
                                current_step, previous_results
                            )
                            enriched = dict(args)
                            if not enriched.get("title"):
                                enriched["title"] = structure.get("title", "")
                            enriched["sheets"] = structure.get("sheets", [])
                            tool_calls_preview[idx] = {
                                **tc_preview,
                                "arguments": enriched,
                            }
                        except Exception as e:
                            logger.warning(f"Spreadsheet enrichment failed: {e}")
                    break

    except Exception as e:
        logger.warning(
            f"Failed to generate preview for step {current_step.step_number}: {e}"
        )

    result = {
        "plan": plan,
        "awaiting_approval": True,
        "approval_step_info": {
            "type": "approval_required",
            "step_number": current_step.step_number,
            "description": current_step.description,
            "reason": current_step.approval_reason,
            "actions": ["approve", "edit", "skip"],
            "tool_calls": tool_calls_preview,
        },
        "_executor_chat": executor_chat,
        "_step_tool_calls": 0,
        "_pending_tool_calls_message": pending_message,
    }
    # Preserve tool results from pre-executed non-UI tools in state
    if accumulated_messages:
        result["messages"] = accumulated_messages
    return result
