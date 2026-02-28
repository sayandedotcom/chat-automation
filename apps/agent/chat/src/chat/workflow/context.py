"""
Workflow Context Helpers

Builds conversation summaries and integration-context strings injected into
LLM system prompts by the planner and executor nodes.
"""

import logging
import re
from typing import List, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

logger = logging.getLogger(__name__)


def build_conversation_summary(
    messages: List[BaseMessage],
    artifacts: List[dict] = None,
) -> Optional[str]:
    """
    Build a condensed summary of previous conversation turns.

    The messages list contains ALL messages from all turns (add_messages reducer).
    Turn boundaries are identified by HumanMessage entries. For each prior turn we
    extract the user request and the final workflow summary.

    Structured artifacts are rendered in an ARTIFACTS CREATED section per turn.
    Falls back to URL regex extraction when no artifacts exist (backward compat).

    Returns None if this is the first turn (only one HumanMessage).
    """
    human_indices = [
        i for i, msg in enumerate(messages) if isinstance(msg, HumanMessage)
    ]

    if len(human_indices) <= 1:
        return None

    artifacts_by_turn: dict[int, list[dict]] = {}
    for a in artifacts or []:
        artifacts_by_turn.setdefault(a.get("turn_number", 1), []).append(a)

    turn_summaries = []
    for turn_idx in range(len(human_indices) - 1):
        start_idx = human_indices[turn_idx]
        end_idx = human_indices[turn_idx + 1]
        turn_number = turn_idx + 1

        user_msg = messages[start_idx].content

        turn_result = ""
        for msg in reversed(messages[start_idx:end_idx]):
            if isinstance(msg, AIMessage) and msg.content:
                content = (
                    msg.content if isinstance(msg.content, str) else str(msg.content)
                )
                if "Workflow Complete" in content:
                    turn_result = content[:1500]
                    break
                if len(content) > 50 and not turn_result:
                    turn_result = content[:1500]

        if not turn_result:
            turn_result = "(Workflow completed)"

        success = (
            "FAILED"
            if any(
                kw in turn_result.lower()
                for kw in ["can't", "cannot", "failed", "error", "unable"]
            )
            else "SUCCESS"
        )

        summary = f"Turn {turn_number} [{success}]:\n  User request: {user_msg}\n  Outcome: {turn_result}"

        turn_artifacts = artifacts_by_turn.get(turn_number, [])
        if turn_artifacts:
            summary += "\n  ARTIFACTS CREATED:"
            for a in turn_artifacts:
                summary += f'\n    - [{a.get("type", "unknown")}] "{a.get("name", "Untitled")}"'
                if a.get("url"):
                    summary += f"\n      URL: {a['url']}"
                if a.get("id"):
                    summary += f"\n      ID: {a['id']}"
                summary += f"\n      Integration: {a.get('integration', 'unknown')}"
                for mk, mv in (a.get("metadata") or {}).items():
                    summary += f"\n      {mk}: {mv}"
        else:
            fallback_urls = []
            for msg in messages[start_idx:end_idx]:
                if isinstance(msg, AIMessage) and msg.content:
                    content = (
                        msg.content
                        if isinstance(msg.content, str)
                        else str(msg.content)
                    )
                    for url in re.findall(r"https?://[^\s\)\"\'>\]]+", content):
                        if url not in fallback_urls:
                            fallback_urls.append(url)
            if fallback_urls:
                summary += "\n  Artifacts/URLs: " + ", ".join(fallback_urls[:5])

        turn_summaries.append(summary)

    return (
        ("PREVIOUS CONVERSATION:\n" + "\n\n".join(turn_summaries))
        if turn_summaries
        else None
    )


def format_integration_context(integrations: list[str] | None) -> str:
    """Build an integration-awareness section for LLM system prompts."""
    if not integrations:
        return ""
    return (
        f"AVAILABLE INTEGRATIONS: {', '.join(integrations)}\n"
        "Use ONLY tools from these integrations to fulfill the request. "
        "Do NOT substitute one service for another "
        "(e.g., do NOT use Google Docs when the user asked for Notion).\n"
    )


def format_artifacts_context(artifacts: List[dict]) -> str:
    """Build an AVAILABLE ARTIFACTS section for LLM system prompts."""
    if not artifacts:
        return ""

    lines = [
        "AVAILABLE ARTIFACTS (from previous steps/turns — use exact URLs and IDs):"
    ]
    for a in artifacts:
        lines.append(
            f'  - [{a.get("type", "unknown")}] "{a.get("name", "Untitled")}" '
            f"(step {a.get('step_number', '?')}, turn {a.get('turn_number', '?')})"
        )
        if a.get("url"):
            lines.append(f"    URL: {a['url']}")
        if a.get("id"):
            lines.append(f"    ID: {a['id']}")
        if a.get("integration"):
            lines.append(f"    Integration: {a['integration']}")
        for mk, mv in (a.get("metadata") or {}).items():
            lines.append(f"    {mk}: {mv}")
    return "\n".join(lines) + "\n"
