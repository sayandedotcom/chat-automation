"""
Executor node orchestration.

Contains run_executor, run_executor_with_approval, and the core
step-execution / tool-continuation / approval flows.
"""

import json
import logging
import time
from typing import TYPE_CHECKING

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from chat.schemas import WorkflowPlan, WorkflowState, WorkflowStep
from chat.workflow.context import format_artifacts_context, format_integration_context
from chat.workflow.prompts import EXECUTOR_SYSTEM_PROMPT

if TYPE_CHECKING:
    from chat.integrations.registry import IntegrationRegistry

logger = logging.getLogger(__name__)


async def run_executor(
    state: WorkflowState,
    *,
    set_user_email_from_state_fn,
    continue_after_tools_fn,
    get_previous_results_fn,
    start_step_execution_fn,
    try_incremental_load_fn,
) -> dict:
    """Execute the current step automatically (auto-executor node)."""
    set_user_email_from_state_fn(state)

    plan = state["plan"]
    current_index = state["current_step_index"]

    if not plan or current_index >= len(plan.steps):
        return {"messages": [AIMessage(content="Workflow complete!")]}

    current_step = plan.steps[current_index]

    if state.get("_executor_chat") and isinstance(
        state["messages"][-1], ToolMessage
    ):
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

    if state.get("_executor_chat") and isinstance(
        state["messages"][-1], ToolMessage
    ):
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
) -> tuple:
    """Build the executor conversation and invoke the LLM."""
    system_prompt = EXECUTOR_SYSTEM_PROMPT.format(
        conversation_context=f"\nCONVERSATION HISTORY:\n{conversation_summary}\n"
        if conversation_summary
        else "",
        integration_context=format_integration_context(initial_integrations),
        artifacts_context=format_artifacts_context(artifacts or []),
        integration_hints=(
            registry.get_hints(initial_integrations, "executor")
            if registry and initial_integrations
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
    response = await executor_with_tools.ainvoke(executor_chat)
    executor_chat.append(response)
    return response, executor_chat


async def continue_after_tools(state: WorkflowState, executor_with_tools) -> dict:
    """Continue the executor conversation after ToolNode results (multi-hop)."""
    executor_chat = list(state["_executor_chat"])
    new_tool_msgs = []
    for msg in reversed(state["messages"]):
        if isinstance(msg, ToolMessage):
            new_tool_msgs.insert(0, msg)
        else:
            break

    executor_chat.extend(new_tool_msgs)
    response = await executor_with_tools.ainvoke(executor_chat)
    executor_chat.append(response)

    return {
        "messages": [response],
        "_executor_chat": executor_chat,
        "_step_tool_calls": state.get("_step_tool_calls", 0) + len(new_tool_msgs),
        "plan": state["plan"],
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


async def request_approval(
    state,
    plan,
    current_step,
    *,
    get_previous_results_fn,
    resolve_tool_integration_fn,
    generate_spreadsheet_structure_fn,
    start_step_execution_fn,
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
        current_step.thinking_duration_ms = int((time.time() - start_time) * 1000)

        if hasattr(response, "tool_calls") and response.tool_calls:
            for tc in response.tool_calls:
                tool_name = tc.get("name", "")
                tool_calls_preview.append(
                    {
                        "id": tc.get("id", ""),
                        "tool_name": tool_name,
                        "integration": resolve_tool_integration_fn(tool_name),
                        "arguments": tc.get("args", {}),
                    }
                )

            from langchain_core.messages import message_to_dict

            pending_message = message_to_dict(response)

            # Enrich spreadsheet preview with sheet/column structure
            for idx, tc_preview in enumerate(tool_calls_preview):
                if tc_preview["tool_name"] == "create_spreadsheet":
                    args = tc_preview.get("arguments", {})
                    if not (
                        args.get("sheets")
                        or args.get("headers")
                        or args.get("columns")
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

    return {
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
