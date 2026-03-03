"""
Planner node logic.

Creates a step-by-step workflow plan with HITL flags using structured LLM output.
"""

import logging
from typing import TYPE_CHECKING

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from chat.schemas import WorkflowPlan, WorkflowState, WorkflowStep
from chat.workflow.context import (
    build_conversation_summary,
    format_artifacts_context,
    format_integration_context,
)
from chat.workflow.prompts import PLANNER_SYSTEM_PROMPT

if TYPE_CHECKING:
    from chat.integrations.registry import IntegrationRegistry

logger = logging.getLogger(__name__)


async def run_planner(
    state: WorkflowState,
    planner_llm,
    registry: "IntegrationRegistry | None",
) -> dict:
    """Create a step-by-step plan with HITL flags using structured LLM output."""
    messages = state["messages"]
    user_request = next(
        (
            msg.content
            for msg in reversed(messages)
            if isinstance(msg, HumanMessage)
        ),
        "",
    )

    state_artifacts = state.get("artifacts", [])
    logger.info(f"[PLANNER_DIAG] Turn start — artifacts: {state_artifacts}")
    logger.info(
        f"[PLANNER_DIAG] Messages: {len(messages)}, "
        f"HumanMessages: {sum(1 for m in messages if isinstance(m, HumanMessage))}"
    )

    conversation_summary = build_conversation_summary(
        messages, artifacts=state_artifacts
    )
    logger.info(
        f"[PLANNER_DIAG] conversation_summary: "
        f"{conversation_summary[:500] if conversation_summary else 'None'}"
    )

    initial_integrations = state.get("initial_integrations") or []
    artifacts_context = format_artifacts_context(state_artifacts)
    logger.info(
        f"[PLANNER_DIAG] artifacts_context: "
        f"{artifacts_context[:500] if artifacts_context else 'EMPTY'}"
    )

    integration_hints = (
        registry.get_hints(initial_integrations, "planner")
        if registry and initial_integrations
        else ""
    )

    system_prompt = PLANNER_SYSTEM_PROMPT.format(
        conversation_context=f"\n{conversation_summary}\n"
        if conversation_summary
        else "",
        integration_context=format_integration_context(initial_integrations),
        artifacts_context=artifacts_context,
        integration_hints=integration_hints,
    )

    plan_output = await planner_llm.ainvoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Create a plan for: {user_request}"),
        ]
    )
    logger.debug(f"Plan: {len(plan_output.steps)} steps")

    workflow_steps = [
        WorkflowStep(
            step_number=i + 1,
            description=step.description,
            requires_human_approval=step.requires_human_approval,
            approval_reason=step.approval_reason,
            status="pending",
        )
        for i, step in enumerate(plan_output.steps)
    ]

    plan = WorkflowPlan(
        original_request=user_request,
        thinking=plan_output.thinking,
        steps=workflow_steps,
    )

    plan_msg = "📋 **Workflow Plan Created**\n\n"
    plan_msg += f"Original request: {user_request}\n\n**Steps:**\n"
    for step in workflow_steps:
        icon = "🔐" if step.requires_human_approval else "✅"
        plan_msg += f"{step.step_number}. {icon} {step.description}\n"
    plan_msg += "\n---\nStarting execution...\n"

    return {
        "messages": [AIMessage(content=plan_msg)],
        "plan": plan,
        "current_step_index": 0,
        "conversation_summary": conversation_summary,
    }
