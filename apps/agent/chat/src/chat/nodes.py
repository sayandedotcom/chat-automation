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

from chat.schemas import (
    WorkflowState,
    WorkflowPlan,
    WorkflowStep,
    WorkflowPlanOutput,
    PlannedStep,
    SearchResultItem,
    IntegrationInfo,
    Artifact,
)

if TYPE_CHECKING:
    from chat.integration_registry import IntegrationRegistry

logger = logging.getLogger(__name__)

MAX_TOOL_CALLS_PER_STEP = 10  # Prevent infinite tool-call loops within a single step

load_dotenv()

# -------------------
# Shared LLM Instances (Module-level singletons for performance)
# -------------------
_planner_llm = None
_executor_llm = None


def get_planner_llm():
    """Get shared planner LLM instance with structured output."""
    global _planner_llm
    if _planner_llm is None:
        base = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
        )
        _planner_llm = base.with_structured_output(WorkflowPlanOutput)
        logger.info("Initialized shared planner LLM")
    return _planner_llm


def get_executor_llm():
    """Get shared executor LLM instance (without tools - bind tools per request)."""
    global _executor_llm
    if _executor_llm is None:
        _executor_llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
        )
        logger.info("Initialized shared executor LLM")
    return _executor_llm


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
# Artifact Extraction
# -------------------

# Map URL domains to artifact types
_DOMAIN_TO_TYPE = {
    "docs.google.com/document": "document",
    "docs.google.com/spreadsheets": "spreadsheet",
    "docs.google.com/presentation": "presentation",
    "drive.google.com": "file",
    "calendar.google.com": "event",
    "notion.so": "page",
    "notion.site": "page",
}

# Extraction config per integration: (json_id_field, json_url_field, artifact_type, url_regex)
_INTEGRATION_EXTRACTORS = {
    "google_docs": {
        "id_fields": ["documentId"],
        "url_fields": [],
        "type": "document",
        "url_pattern": r'https://docs\.google\.com/document/d/([A-Za-z0-9_-]+)',
    },
    "gmail": {
        "id_fields": ["messageId", "id"],
        "url_fields": [],
        "type": "email",
        "url_pattern": None,
    },
    "notion": {
        "id_fields": ["id"],
        "url_fields": ["url"],
        "type": "page",
        "url_pattern": r'https://(?:www\.)?notion\.(?:so|site)/[^\s]+',
    },
    "google_calendar": {
        "id_fields": ["id"],
        "url_fields": ["htmlLink"],
        "type": "event",
        "url_pattern": None,
    },
    "google_drive": {
        "id_fields": ["id"],
        "url_fields": ["webViewLink"],
        "type": "file",
        "url_pattern": None,
    },
    "google_sheets": {
        "id_fields": ["spreadsheetId"],
        "url_fields": ["spreadsheetUrl"],
        "type": "spreadsheet",
        "url_pattern": r'https://docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]+)',
    },
    "google_slides": {
        "id_fields": ["presentationId"],
        "url_fields": [],
        "type": "presentation",
        "url_pattern": r'https://docs\.google\.com/presentation/d/([A-Za-z0-9_-]+)',
    },
}


def _find_field_recursive(data: dict, field: str) -> Optional[str]:
    """Recursively search a nested dict for a field, return its string value."""
    if field in data:
        val = data[field]
        if isinstance(val, str) and val:
            return val
    for v in data.values():
        if isinstance(v, dict):
            result = _find_field_recursive(v, field)
            if result:
                return result
    return None


def _extract_name_from_data(data: dict) -> str:
    """Try to extract a human-readable name from JSON response data."""
    for key in ("title", "name", "subject", "snippet", "summary"):
        val = _find_field_recursive(data, key)
        if val:
            return val[:200]
    return "Untitled"


def _classify_url_type(url: str) -> Optional[str]:
    """Classify artifact type from URL domain."""
    for domain_prefix, artifact_type in _DOMAIN_TO_TYPE.items():
        if domain_prefix in url:
            return artifact_type
    return None


def _build_artifact_from_match(
    ext_name: str,
    ext_config: dict,
    data: dict,
    artifact_id: str,
    messages: List[BaseMessage],
    step_number: int,
    turn_number: int,
    seen_ids: set,
) -> Optional[dict]:
    """Build an Artifact dict from a matched extractor and JSON data."""
    if artifact_id in seen_ids:
        return None

    seen_ids.add(artifact_id)

    # Extract URL from configured fields
    artifact_url = None
    for url_field in ext_config["url_fields"]:
        artifact_url = _find_field_recursive(data, url_field)
        if artifact_url:
            break

    # Construct URL from ID if no URL field found
    if not artifact_url:
        if ext_name == "google_docs":
            artifact_url = f"https://docs.google.com/document/d/{artifact_id}/edit"
        elif ext_name == "google_sheets":
            artifact_url = f"https://docs.google.com/spreadsheets/d/{artifact_id}/edit"
        elif ext_name == "google_slides":
            artifact_url = f"https://docs.google.com/presentation/d/{artifact_id}/edit"

    name = _extract_name_from_data(data)

    # For gmail, extract recipient from preceding AIMessage tool_calls
    metadata = {}
    if ext_name == "gmail":
        for prev_msg in messages:
            if isinstance(prev_msg, AIMessage) and hasattr(prev_msg, "tool_calls"):
                for tc in prev_msg.tool_calls:
                    args = tc.get("args", {})
                    if "to" in args:
                        metadata["to"] = args["to"]
                    if "subject" in args:
                        metadata["subject"] = args["subject"]

    artifact = Artifact(
        type=ext_config["type"],
        name=name,
        url=artifact_url,
        id=artifact_id,
        integration=ext_name,
        step_number=step_number,
        turn_number=turn_number,
        metadata=metadata,
    )
    return artifact.model_dump()


def extract_artifacts_from_step(
    messages: List[BaseMessage],
    step_number: int,
    turn_number: int = 1,
    integration_hint: Optional[str] = None,
) -> List[dict]:
    """
    Extract structured artifacts from a step's messages (ToolMessage JSON + URL fallback).

    Tries ALL extractors against every ToolMessage — unique ID fields like
    documentId/spreadsheetId match unambiguously without needing integration detection.
    Generic "id" fields require a confirming URL field (htmlLink, webViewLink, url)
    or a matching integration_hint.

    Returns list of Artifact.model_dump() dicts.
    """
    artifacts = []
    seen_ids = set()

    # --- Phase 1: Parse ToolMessage content, try all extractors ---
    for msg in messages:
        if not isinstance(msg, ToolMessage):
            continue

        content = msg.content
        if not content:
            continue

        # Normalize content: MCP servers often return list of content blocks
        # e.g., [{'type': 'text', 'text': '...'}] — extract text from blocks
        raw_text = None
        if isinstance(content, list):
            text_parts = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
                elif isinstance(block, str):
                    text_parts.append(block)
            raw_text = "\n".join(text_parts) if text_parts else None
        elif isinstance(content, str):
            raw_text = content
        elif isinstance(content, dict):
            raw_text = None  # Will handle as dict below

        logger.info(f"[ARTIFACT_EXTRACT] ToolMessage content type={type(content).__name__}, "
                     f"raw_text preview={raw_text[:300] if raw_text else 'None'}")

        # Try to parse JSON from the text
        data = None
        if raw_text:
            try:
                text = raw_text.strip()
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                if text.startswith("{") or text.startswith("["):
                    parsed = json.loads(text)
                    if isinstance(parsed, dict):
                        data = parsed
            except (json.JSONDecodeError, IndexError):
                pass
        elif isinstance(content, dict):
            data = content

        # Phase 1a: If we got structured JSON, try extractors on it
        if data and isinstance(data, dict):
            logger.info(f"[ARTIFACT_EXTRACT] Parsed JSON dict keys: {list(data.keys())[:10]}")

            # Pass 1: Try UNIQUE id fields (documentId, spreadsheetId, etc.)
            matched = False
            for ext_name, ext_config in _INTEGRATION_EXTRACTORS.items():
                for id_field in ext_config["id_fields"]:
                    if id_field == "id":
                        continue  # Skip generic "id" in pass 1
                    artifact_id = _find_field_recursive(data, id_field)
                    if artifact_id:
                        logger.info(f"[ARTIFACT_EXTRACT] Pass 1 MATCH: {ext_name}.{id_field}={artifact_id}")
                        result = _build_artifact_from_match(
                            ext_name, ext_config, data, artifact_id,
                            messages, step_number, turn_number, seen_ids,
                        )
                        if result:
                            artifacts.append(result)
                        matched = True
                        break
                if matched:
                    break

            if matched:
                continue

            # Pass 2: Generic "id" + confirming URL field
            generic_id = _find_field_recursive(data, "id")
            if generic_id:
                for ext_name, ext_config in _INTEGRATION_EXTRACTORS.items():
                    if "id" not in ext_config["id_fields"]:
                        continue
                    if ext_config["url_fields"]:
                        confirmed = any(
                            _find_field_recursive(data, uf) for uf in ext_config["url_fields"]
                        )
                        if confirmed:
                            result = _build_artifact_from_match(
                                ext_name, ext_config, data, generic_id,
                                messages, step_number, turn_number, seen_ids,
                            )
                            if result:
                                artifacts.append(result)
                            break
                    elif ext_name == integration_hint:
                        result = _build_artifact_from_match(
                            ext_name, ext_config, data, generic_id,
                            messages, step_number, turn_number, seen_ids,
                        )
                        if result:
                            artifacts.append(result)
                        break
            continue

        # Phase 1b: Plain text ToolMessage — parse IDs and URLs with regex
        # MCP servers often return human-readable text like:
        #   "Created Google Doc 'Title' (ID: abc123) ... Link: https://docs.google.com/..."
        if raw_text:
            text_matched = False
            for ext_name, ext_config in _INTEGRATION_EXTRACTORS.items():
                url_pattern = ext_config.get("url_pattern")
                if not url_pattern:
                    continue
                url_match = re.search(url_pattern, raw_text)
                if url_match:
                    # Extract ID from URL capture group or from (ID: ...) pattern
                    artifact_id = url_match.group(1) if url_match.lastindex else None
                    if not artifact_id:
                        id_regex = re.search(r'\(ID:\s*([A-Za-z0-9_-]+)\)', raw_text)
                        if id_regex:
                            artifact_id = id_regex.group(1)
                    artifact_url = url_match.group(0)

                    # Extract name from quoted string: 'Title' or "Title"
                    name = "Untitled"
                    name_match = re.search(r"['\"]([^'\"]{2,200})['\"]", raw_text)
                    if name_match:
                        name = name_match.group(1)

                    if artifact_id and artifact_id not in seen_ids:
                        seen_ids.add(artifact_id)
                        logger.info(f"[ARTIFACT_EXTRACT] Phase 1b text MATCH: {ext_name}, "
                                     f"id={artifact_id}, url={artifact_url}, name={name}")
                        artifact = Artifact(
                            type=ext_config["type"],
                            name=name,
                            url=artifact_url,
                            id=artifact_id,
                            integration=ext_name,
                            step_number=step_number,
                            turn_number=turn_number,
                        )
                        artifacts.append(artifact.model_dump())
                        text_matched = True
                        break

            if text_matched:
                continue

            # Also try (ID: ...) pattern without URL for integrations like gmail
            id_regex = re.search(r'\(ID:\s*([A-Za-z0-9_-]+)\)', raw_text)
            if id_regex and integration_hint:
                ext_config = _INTEGRATION_EXTRACTORS.get(integration_hint)
                if ext_config:
                    artifact_id = id_regex.group(1)
                    if artifact_id not in seen_ids:
                        seen_ids.add(artifact_id)
                        name = "Untitled"
                        name_match = re.search(r"['\"]([^'\"]{2,200})['\"]", raw_text)
                        if name_match:
                            name = name_match.group(1)
                        artifact = Artifact(
                            type=ext_config["type"],
                            name=name,
                            url=None,
                            id=artifact_id,
                            integration=integration_hint,
                            step_number=step_number,
                            turn_number=turn_number,
                        )
                        artifacts.append(artifact.model_dump())

    # --- Phase 2: Fallback URL regex on AIMessage content ---
    if not artifacts:
        logger.info(f"[ARTIFACT_EXTRACT] Phase 1 found nothing, falling back to URL regex on AIMessages")
        for msg in messages:
            if isinstance(msg, AIMessage) and msg.content:
                content = msg.content if isinstance(msg.content, str) else str(msg.content)
                urls = re.findall(r'https?://[^\s\)\"\'>\]]+', content)
                for url in urls:
                    artifact_type = _classify_url_type(url)
                    if artifact_type and url not in seen_ids:
                        seen_ids.add(url)
                        artifact = Artifact(
                            type=artifact_type,
                            name="Untitled",
                            url=url,
                            id=None,
                            integration=integration_hint or "unknown",
                            step_number=step_number,
                            turn_number=turn_number,
                        )
                        artifacts.append(artifact.model_dump())

    return artifacts


def build_conversation_summary(
    messages: List[BaseMessage],
    artifacts: List[dict] = None,
) -> Optional[str]:
    """
    Build a condensed summary of previous conversation turns from accumulated messages.

    The messages list contains ALL messages from all turns (due to add_messages reducer).
    We identify turn boundaries by HumanMessage entries. For each previous turn, we extract
    the user request and the final workflow summary.

    If structured artifacts are provided, renders an ARTIFACTS CREATED section per turn.
    Falls back to URL regex extraction when no artifacts exist (backward compat).

    Returns None if this is the first turn (only one HumanMessage).
    """
    # Find all HumanMessage indices
    human_indices = []
    for i, msg in enumerate(messages):
        if isinstance(msg, HumanMessage):
            human_indices.append(i)

    # If only one HumanMessage (the current request), no prior history
    if len(human_indices) <= 1:
        return None

    # Index artifacts by turn number for fast lookup
    artifacts_by_turn: dict[int, list[dict]] = {}
    if artifacts:
        for a in artifacts:
            turn = a.get("turn_number", 1)
            artifacts_by_turn.setdefault(turn, []).append(a)

    # Build summaries for each PREVIOUS turn (exclude the last HumanMessage = current request)
    turn_summaries = []
    for turn_idx in range(len(human_indices) - 1):
        start_idx = human_indices[turn_idx]
        end_idx = human_indices[turn_idx + 1]
        turn_number = turn_idx + 1

        user_msg = messages[start_idx].content

        # Find the workflow completion summary in this turn's messages
        turn_result = ""
        for msg in reversed(messages[start_idx:end_idx]):
            if isinstance(msg, AIMessage) and msg.content:
                content = msg.content if isinstance(msg.content, str) else str(msg.content)
                if "Workflow Complete" in content:
                    turn_result = content[:1500]
                    break
                # Fall back to the last substantial AIMessage
                if len(content) > 50 and not turn_result:
                    turn_result = content[:1500]

        if not turn_result:
            turn_result = "(Workflow completed)"

        success = "FAILED" if any(
            kw in turn_result.lower()
            for kw in ["can't", "cannot", "failed", "error", "unable"]
        ) else "SUCCESS"

        summary = f"Turn {turn_number} [{success}]:\n  User request: {user_msg}\n  Outcome: {turn_result}"

        # Render structured artifacts if available for this turn
        turn_artifacts = artifacts_by_turn.get(turn_number, [])
        if turn_artifacts:
            summary += "\n  ARTIFACTS CREATED:"
            for a in turn_artifacts:
                summary += f'\n    - [{a.get("type", "unknown")}] "{a.get("name", "Untitled")}"'
                if a.get("url"):
                    summary += f'\n      URL: {a["url"]}'
                if a.get("id"):
                    summary += f'\n      ID: {a["id"]}'
                summary += f'\n      Integration: {a.get("integration", "unknown")}'
                if a.get("metadata"):
                    for mk, mv in a["metadata"].items():
                        summary += f"\n      {mk}: {mv}"
        else:
            # Fallback: extract URLs from AIMessages (backward compat for old checkpoints)
            fallback_urls = []
            for msg in messages[start_idx:end_idx]:
                if isinstance(msg, AIMessage) and msg.content:
                    content = msg.content if isinstance(msg.content, str) else str(msg.content)
                    urls = re.findall(r'https?://[^\s\)\"\'>\]]+', content)
                    for url in urls:
                        if url not in fallback_urls:
                            fallback_urls.append(url)
            if fallback_urls:
                summary += "\n  Artifacts/URLs: " + ", ".join(fallback_urls[:5])

        turn_summaries.append(summary)

    if not turn_summaries:
        return None

    return "PREVIOUS CONVERSATION:\n" + "\n\n".join(turn_summaries)


# -------------------
# Helpers
# -------------------
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
    """Build an AVAILABLE ARTIFACTS section for LLM system prompts.

    Returns empty string if no artifacts exist.
    """
    if not artifacts:
        return ""

    lines = ["AVAILABLE ARTIFACTS (from previous steps/turns — use exact URLs and IDs):"]
    for a in artifacts:
        label = a.get("type", "unknown")
        name = a.get("name", "Untitled")
        step = a.get("step_number", "?")
        turn = a.get("turn_number", "?")
        lines.append(f'  - [{label}] "{name}" (step {step}, turn {turn})')
        if a.get("url"):
            lines.append(f"    URL: {a['url']}")
        if a.get("id"):
            lines.append(f"    ID: {a['id']}")
        if a.get("integration"):
            lines.append(f"    Integration: {a['integration']}")
        if a.get("metadata"):
            for mk, mv in a["metadata"].items():
                lines.append(f"    {mk}: {mv}")
    return "\n".join(lines) + "\n"


# -------------------
# Prompts
# -------------------
PLANNER_SYSTEM_PROMPT = """You are a workflow planner. Analyze the user's request and create a step-by-step execution plan.
{conversation_context}
{integration_context}
{artifacts_context}
{integration_hints}
RULES:
1. Each step should be a single, atomic action
2. Steps should be in correct execution order (dependencies first)
3. Be specific about what tools/actions each step requires
4. Keep steps concise but clear
5. ARTIFACT RESOLUTION: When the user refers to "it", "that", "the document", "send it", "mail this", etc.:
   - Check AVAILABLE ARTIFACTS above and embed the exact URL/ID directly into step descriptions.
   - If the most recent turn FAILED, look at EARLIER successful turns for the artifact.
   - Use the [SUCCESS]/[FAILED] markers in conversation history to identify what the user means.
   - Copy URLs and IDs exactly as shown — do NOT invent or guess resource identifiers.
   - NEVER plan a step that asks the user for information available in AVAILABLE ARTIFACTS or conversation context.
   - Be proactive: generate sensible defaults for any missing details based on artifacts and conversation history rather than blocking on the user.

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
{conversation_context}
{integration_context}
{artifacts_context}
{integration_hints}
CURRENT STEP: {current_step}
STEP {step_number} OF {total_steps}

PREVIOUS STEPS COMPLETED:
{previous_results}

YOUR TASK:
Execute ONLY this step using the available tools. Be thorough but focused on just this step.
If the step references a resource, use the exact URL or ID from AVAILABLE ARTIFACTS. Do NOT ask the user for information available in artifacts.
If the step references items from previous conversation turns (e.g., a document URL, an email address), use the conversation context above.

After completing the step:
1. Report what you accomplished
2. Include any relevant outputs (links, IDs, document titles) that might be needed for later steps
3. For web searches, include the source URLs
"""


class WorkflowNodes:
    """Nodes for the dynamic workflow graph with LLM-driven HITL."""

    def __init__(self, tools: List[BaseTool] = None, registry: "IntegrationRegistry" = None):
        """Initialize workflow nodes with shared LLM instances and optional integration registry."""
        self.tools = tools or []
        self.registry = registry

        # Use shared LLM instances (module-level singletons for performance)
        self.planner_llm = get_planner_llm()
        self.executor_llm = get_executor_llm()

        # Bind tools to executor (per-workflow, since tools may differ)
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

        # Classify integrations (Phase 1: instant NLP, Phase 2: LLM fallback if ambiguous)
        integrations = await classify_integrations(user_request, self.registry)

        # Artifact-aware injection: auto-include integrations from prior-turn artifacts
        artifacts = state.get("artifacts", [])
        if artifacts:
            artifact_integrations = {
                a.get("integration") for a in artifacts if a.get("integration")
            }
            for name in artifact_integrations:
                if name not in integrations and self.registry.get_integration_config(name):
                    integrations.append(name)
                    logger.info(f"Smart router: auto-included '{name}' from prior-turn artifact")

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
        Includes conversation context from previous turns for multi-turn support.
        """
        messages = state["messages"]

        # Get the original user request
        user_request = ""
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                user_request = msg.content
                break

        # Build conversation context from accumulated messages (with structured artifacts)
        state_artifacts = state.get("artifacts", [])
        logger.info(f"[PLANNER_DIAG] Turn start — artifacts from state: {state_artifacts}")
        logger.info(f"[PLANNER_DIAG] Total messages: {len(messages)}, "
                     f"HumanMessages: {sum(1 for m in messages if isinstance(m, HumanMessage))}")
        conversation_summary = build_conversation_summary(
            messages, artifacts=state_artifacts
        )
        logger.info(f"[PLANNER_DIAG] conversation_summary: {conversation_summary[:500] if conversation_summary else 'None'}")

        # Format the system prompt with conversation context
        if conversation_summary:
            context_section = f"\n{conversation_summary}\n"
        else:
            context_section = ""

        initial_integrations = state.get("initial_integrations") or []
        integration_context = format_integration_context(initial_integrations)

        # Format artifacts context for planner
        artifacts_context = format_artifacts_context(state_artifacts)
        logger.info(f"[PLANNER_DIAG] artifacts_context for planner: {artifacts_context[:500] if artifacts_context else 'EMPTY'}")

        # Get dynamic integration hints for planner
        integration_hints = ""
        if self.registry and initial_integrations:
            integration_hints = self.registry.get_hints(initial_integrations, "planner")

        system_prompt = PLANNER_SYSTEM_PROMPT.format(
            conversation_context=context_section,
            integration_context=integration_context,
            artifacts_context=artifacts_context,
            integration_hints=integration_hints,
        )

        # Get structured plan from LLM - no JSON parsing needed!
        plan_output: WorkflowPlanOutput = await self.planner_llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Create a plan for: {user_request}")
        ])
        
        logger.debug(f"Plan created: {len(plan_output.steps)} steps, thinking: {plan_output.thinking[:100]}...")

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
            "conversation_summary": conversation_summary,
        }

    async def executor_node(self, state: WorkflowState) -> dict:
        """
        Execute the current step automatically (for steps not requiring approval).
        Supports multi-hop tool calling: after ToolNode runs, this node is
        re-entered so the LLM can see tool results and decide whether to
        make more tool calls or finish.
        """
        plan = state["plan"]
        current_index = state["current_step_index"]

        if not plan or current_index >= len(plan.steps):
            return {"messages": [AIMessage(content="Workflow complete!")]}

        current_step = plan.steps[current_index]

        # CONTINUATION: re-entered after tool results
        if state.get("_executor_chat") and state["messages"] and isinstance(state["messages"][-1], ToolMessage):
            return await self._continue_after_tools(state)

        # FRESH START for this step
        current_step.status = "in_progress"
        initial_integrations = state.get("initial_integrations", [])
        conversation_summary = state.get("conversation_summary", "")
        step_artifacts = state.get("artifacts", [])

        logger.debug(f"Executing step {current_step.step_number}: {current_step.description}")

        previous_results = self._get_previous_results(plan, current_index)
        start_time = time.time()
        incremental_load_events = state.get("incremental_load_events", [])

        try:
            response, executor_chat = await self._start_step_execution(
                current_step, plan, previous_results, conversation_summary, initial_integrations,
                artifacts=step_artifacts,
            )
        except Exception as e:
            error_msg = str(e).lower()

            # Check if error is due to missing tool - attempt incremental loading
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

                        new_tools = self.registry.get_toolset([missing_integration])
                        self.tools.extend(new_tools)
                        self.executor_with_tools = self.executor_llm.bind_tools(self.tools)
                        self.tool_node = ToolNode(self.tools, handle_tool_errors=True)

                        config = self.registry.get_integration_config(missing_integration)
                        incremental_load_events.append({
                            "integration": missing_integration,
                            "display_name": config.display_name if config else missing_integration,
                            "tools_added": len(new_tools),
                            "triggered_by_tool": missing_tool,
                        })

                        response, executor_chat = await self._start_step_execution(
                            current_step, plan, previous_results, conversation_summary, initial_integrations,
                            artifacts=step_artifacts,
                        )

                        initial_integrations = list(initial_integrations)
                        initial_integrations.append(missing_integration)
                    else:
                        raise ValueError(f"Tool '{missing_tool}' not available in any integration")
                else:
                    raise
            else:
                raise

        thinking_duration_ms = int((time.time() - start_time) * 1000)
        current_step.thinking_duration_ms = thinking_duration_ms

        result = {
            "messages": [response],
            "_executor_chat": executor_chat,
            "_step_tool_calls": 0,
            "plan": plan,
        }

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

        Flow:
        1. First entry: Sets awaiting_approval=True, graph ends
        2. Resume with approval_decision: Executes the step
        3. Re-entry after tools: Continues multi-hop tool calling (same as executor_node)
        """
        plan = state["plan"]
        current_index = state["current_step_index"]

        if not plan or current_index >= len(plan.steps):
            return {"messages": [AIMessage(content="Workflow complete!")]}

        current_step = plan.steps[current_index]

        # CONTINUATION: re-entered after tool results (during approved execution)
        if state.get("_executor_chat") and state["messages"] and isinstance(state["messages"][-1], ToolMessage):
            return await self._continue_after_tools(state)

        conversation_summary = state.get("conversation_summary", "")
        initial_integrations = state.get("initial_integrations", [])
        step_artifacts = state.get("artifacts", [])

        # Check if we're resuming after approval
        approval_decision = state.get("approval_decision")
        if approval_decision:
            action = approval_decision.get("action", "approve")

            if action == "skip":
                logger.debug(f"Step {current_step.step_number} skipped by user")
                current_step.status = "skipped"
                current_step.result = "Skipped by user"
                return {
                    "messages": [AIMessage(content=f"Step {current_step.step_number} skipped.")],
                    "plan": plan,
                    "awaiting_approval": False,
                    "approval_step_info": None,
                    "approval_decision": None,
                    "_executor_chat": None,
                    "_step_tool_calls": 0,
                }

            logger.debug(f"Step {current_step.step_number} approved by user")
            current_step.status = "in_progress"
            previous_results = self._get_previous_results(plan, current_index)

            if action == "edit":
                edited_content = approval_decision.get("content", {})
                logger.debug(f"Step {current_step.step_number} content edited by user")
                response, executor_chat = await self._start_step_execution(
                    current_step, plan, previous_results, conversation_summary, initial_integrations,
                    approved_content=edited_content, artifacts=step_artifacts,
                )
            else:
                response, executor_chat = await self._start_step_execution(
                    current_step, plan, previous_results, conversation_summary, initial_integrations,
                    artifacts=step_artifacts,
                )

            return {
                "messages": [response],
                "_executor_chat": executor_chat,
                "_step_tool_calls": 0,
                "plan": plan,
                "awaiting_approval": False,
                "approval_step_info": None,
                "approval_decision": None,
            }

        # First time entering - request approval
        current_step.status = "awaiting_approval"
        logger.debug(f"Approval required for step {current_step.step_number}: {current_step.description}")

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
            "_executor_chat": None,
            "_step_tool_calls": 0,
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

    async def _start_step_execution(
        self,
        step: WorkflowStep,
        plan: WorkflowPlan,
        previous_results: str,
        conversation_summary: str = "",
        initial_integrations: list[str] | None = None,
        approved_content: dict = None,
        artifacts: list[dict] = None,
    ) -> tuple:
        """
        Initialize executor conversation for a step and invoke LLM.
        Returns (response, executor_chat) so the caller can store executor_chat in state
        for multi-hop tool calling.
        """
        context_section = f"\nCONVERSATION HISTORY:\n{conversation_summary}\n" if conversation_summary else ""
        integration_context = format_integration_context(initial_integrations)

        # Format artifacts context for executor
        artifacts_context = format_artifacts_context(artifacts or [])

        # Get dynamic integration hints for executor
        integration_hints = ""
        if self.registry and initial_integrations:
            integration_hints = self.registry.get_hints(initial_integrations, "executor")

        system_prompt = EXECUTOR_SYSTEM_PROMPT.format(
            conversation_context=context_section,
            integration_context=integration_context,
            artifacts_context=artifacts_context,
            integration_hints=integration_hints,
            current_step=step.description,
            step_number=step.step_number,
            total_steps=len(plan.steps),
            previous_results=previous_results,
        )

        human_content = f"Execute step {step.step_number}: {step.description}"
        if approved_content:
            content_str = json.dumps(approved_content, indent=2) if isinstance(approved_content, dict) else str(approved_content)
            human_content += f"\n\nUse this approved content:\n{content_str}"

        executor_chat = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_content),
        ]

        response = await self.executor_with_tools.ainvoke(executor_chat)
        executor_chat.append(response)

        return response, executor_chat

    async def _continue_after_tools(self, state: WorkflowState) -> dict:
        """
        Continue executor after tool results (multi-hop tool calling).
        Called when the executor is re-entered after ToolNode has run.
        Appends tool result messages to the executor's conversation and re-invokes the LLM.
        """
        executor_chat = list(state["_executor_chat"])

        # Extract new tool messages from the tail of state messages
        new_tool_msgs = []
        for msg in reversed(state["messages"]):
            if isinstance(msg, ToolMessage):
                new_tool_msgs.insert(0, msg)
            else:
                break

        executor_chat.extend(new_tool_msgs)

        response = await self.executor_with_tools.ainvoke(executor_chat)
        executor_chat.append(response)

        step_tool_calls = state.get("_step_tool_calls", 0) + len(new_tool_msgs)

        return {
            "messages": [response],
            "_executor_chat": executor_chat,
            "_step_tool_calls": step_tool_calls,
            "plan": state["plan"],
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
        current_step.result = last_message[:2000] if last_message else "Step completed"

        # Extract structured search results for web-search steps
        if any("search" in step.description.lower() for step in [current_step]):
            search_results = extract_search_results_from_messages(messages)
            if search_results:
                current_step.search_results = search_results
                logger.debug(f"Extracted {len(search_results)} structured search results")

        # Extract structured artifacts from this step's messages
        # Only return NEW artifacts — the add_artifacts reducer handles accumulation
        turn_number = sum(1 for m in messages if isinstance(m, HumanMessage))

        # Diagnostic: log message types for extraction
        msg_types = [(type(m).__name__, m.content[:100] if hasattr(m, 'content') and m.content else "")
                     for m in messages[-10:]]
        logger.info(f"[ARTIFACT_DIAG] step_complete step={current_step.step_number}, "
                     f"total_msgs={len(messages)}, last_10_types={msg_types}")
        logger.info(f"[ARTIFACT_DIAG] existing artifacts in state: {state.get('artifacts', [])}")

        new_artifacts = extract_artifacts_from_step(
            messages, step_number=current_step.step_number, turn_number=turn_number
        )
        logger.info(f"[ARTIFACT_DIAG] new_artifacts extracted: {new_artifacts}")

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
                "artifacts": new_artifacts,
                "_executor_chat": None,
                "_step_tool_calls": 0,
            }

        # Continue to next step
        next_step = plan.steps[next_index]
        progress = f"✓ Step {current_index + 1} complete. Moving to step {next_index + 1}: {next_step.description}\n"

        return {
            "messages": [AIMessage(content=progress)],
            "plan": plan,
            "current_step_index": next_index,
            "artifacts": new_artifacts,
            "_executor_chat": None,
            "_step_tool_calls": 0,
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
        return "executor_with_approval"

    return "executor"


def should_continue(state: WorkflowState) -> Literal["tools", "step_complete", "end"]:
    """
    Determine if we need to call tools, complete the step, or end (for approval).
    """
    # If awaiting approval, end the graph (streaming code will detect and send approval event)
    if state.get("awaiting_approval"):
        return "end"
    
    messages = state["messages"]
    if not messages:
        return "step_complete"
    
    last_message = messages[-1]
    
    # Check if the last message has tool calls
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        # Per-step tool call limit to prevent infinite loops
        step_tool_calls = state.get("_step_tool_calls", 0)

        if step_tool_calls >= MAX_TOOL_CALLS_PER_STEP:
            logger.warning(f"Tool call limit ({MAX_TOOL_CALLS_PER_STEP}) reached for step, completing")
            return "step_complete"

        return "tools"
    
    return "step_complete"


def route_after_tools(state: WorkflowState) -> Literal["executor", "executor_with_approval"]:
    """
    After ToolNode runs, route back to the correct executor for multi-hop tool calling.
    The executor will see the tool results and decide whether to make more calls or finish.
    """
    plan = state.get("plan")
    current_index = state.get("current_step_index", 0)

    if plan and 0 <= current_index < len(plan.steps):
        step = plan.steps[current_index]
        if step.requires_human_approval:
            return "executor_with_approval"

    return "executor"


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
        return "executor_with_approval"

    return "executor"
