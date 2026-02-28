"""
Artifact Extraction

Extracts structured artifacts (documents, emails, pages, etc.) and search results
from LangChain message lists produced by workflow steps.
"""

import json
import logging
import re
from typing import List, Optional

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage

from chat.schemas import Artifact, SearchResultItem

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# URL-domain → artifact type mapping
# ---------------------------------------------------------------------------
_DOMAIN_TO_TYPE = {
    "docs.google.com/document": "document",
    "docs.google.com/spreadsheets": "spreadsheet",
    "docs.google.com/presentation": "presentation",
    "drive.google.com": "file",
    "calendar.google.com": "event",
    "notion.so": "page",
    "notion.site": "page",
}

# Extraction config per integration
# Each entry: id_fields, url_fields, artifact type, optional URL regex
_INTEGRATION_EXTRACTORS = {
    "google_docs": {
        "id_fields": ["documentId"],
        "url_fields": [],
        "type": "document",
        "url_pattern": r"https://docs\.google\.com/document/d/([A-Za-z0-9_-]+)",
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
        "url_pattern": r"https://(?:www\.)?notion\.(?:so|site)/[^\s]+",
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
        "url_pattern": r"https://docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]+)",
    },
    "google_slides": {
        "id_fields": ["presentationId"],
        "url_fields": [],
        "type": "presentation",
        "url_pattern": r"https://docs\.google\.com/presentation/d/([A-Za-z0-9_-]+)",
    },
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _find_field_recursive(data: dict, field: str) -> Optional[str]:
    """Recursively search a nested dict for a field; return its string value."""
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
    """Try to extract a human-readable name from a JSON response dict."""
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

    artifact_url = None
    for url_field in ext_config["url_fields"]:
        artifact_url = _find_field_recursive(data, url_field)
        if artifact_url:
            break

    if not artifact_url:
        if ext_name == "google_docs":
            artifact_url = f"https://docs.google.com/document/d/{artifact_id}/edit"
        elif ext_name == "google_sheets":
            artifact_url = f"https://docs.google.com/spreadsheets/d/{artifact_id}/edit"
        elif ext_name == "google_slides":
            artifact_url = f"https://docs.google.com/presentation/d/{artifact_id}/edit"

    name = _extract_name_from_data(data)

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


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def extract_search_results_from_messages(
    messages: List[BaseMessage],
) -> Optional[List[SearchResultItem]]:
    """
    Extract structured search results from tool messages.
    Tavily MCP returns JSON with a 'results' array containing title, url, content, etc.
    """
    search_results = []

    for msg in reversed(messages):
        if not isinstance(msg, ToolMessage) or not msg.content:
            continue

        try:
            content = msg.content
            if isinstance(content, str):
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0]
                elif not (
                    content.strip().startswith("{") or content.strip().startswith("[")
                ):
                    continue
                data = json.loads(content.strip())
            elif isinstance(content, dict):
                data = content
            else:
                continue

            results = (
                data.get("results")
                if isinstance(data, dict)
                else (data if isinstance(data, list) else None)
            )

            if results and isinstance(results, list):
                for item in results[:10]:
                    if isinstance(item, dict) and "url" in item:
                        url = item.get("url", "")
                        try:
                            from urllib.parse import urlparse

                            domain = urlparse(url).netloc.replace("www.", "")
                        except Exception:
                            domain = (
                                url.split("/")[2] if len(url.split("/")) > 2 else ""
                            )

                        search_results.append(
                            SearchResultItem(
                                title=item.get("title", domain),
                                url=url,
                                domain=domain,
                                favicon=f"https://www.google.com/s2/favicons?domain={domain}&sz=32",
                                date=item.get("published_date") or item.get("date"),
                            )
                        )

                if search_results:
                    return search_results

        except (json.JSONDecodeError, KeyError, TypeError):
            continue

    return None if not search_results else search_results


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
        if not isinstance(msg, ToolMessage) or not msg.content:
            continue

        content = msg.content

        # Normalise content: MCP servers often return list of content blocks
        raw_text = None
        if isinstance(content, list):
            text_parts = [
                block.get("text", "")
                if isinstance(block, dict) and block.get("type") == "text"
                else block
                if isinstance(block, str)
                else ""
                for block in content
            ]
            raw_text = "\n".join(text_parts) or None
        elif isinstance(content, str):
            raw_text = content
        # dict handled below

        logger.info(
            f"[ARTIFACT_EXTRACT] ToolMessage content type={type(content).__name__}, "
            f"raw_text preview={raw_text[:300] if raw_text else 'None'}"
        )

        # Try to parse JSON
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

        # Phase 1a: Structured JSON — run extractors
        if data and isinstance(data, dict):
            logger.info(
                f"[ARTIFACT_EXTRACT] Parsed JSON dict keys: {list(data.keys())[:10]}"
            )

            # Pass 1: unique id fields (documentId, spreadsheetId, …)
            matched = False
            for ext_name, ext_config in _INTEGRATION_EXTRACTORS.items():
                for id_field in ext_config["id_fields"]:
                    if id_field == "id":
                        continue
                    artifact_id = _find_field_recursive(data, id_field)
                    if artifact_id:
                        logger.info(
                            f"[ARTIFACT_EXTRACT] Pass 1 MATCH: {ext_name}.{id_field}={artifact_id}"
                        )
                        result = _build_artifact_from_match(
                            ext_name,
                            ext_config,
                            data,
                            artifact_id,
                            messages,
                            step_number,
                            turn_number,
                            seen_ids,
                        )
                        if result:
                            artifacts.append(result)
                        matched = True
                        break
                if matched:
                    break

            if matched:
                continue

            # Pass 2: generic "id" + confirming URL field
            generic_id = _find_field_recursive(data, "id")
            if generic_id:
                for ext_name, ext_config in _INTEGRATION_EXTRACTORS.items():
                    if "id" not in ext_config["id_fields"]:
                        continue
                    if ext_config["url_fields"]:
                        if any(
                            _find_field_recursive(data, uf)
                            for uf in ext_config["url_fields"]
                        ):
                            result = _build_artifact_from_match(
                                ext_name,
                                ext_config,
                                data,
                                generic_id,
                                messages,
                                step_number,
                                turn_number,
                                seen_ids,
                            )
                            if result:
                                artifacts.append(result)
                            break
                    elif ext_name == integration_hint:
                        result = _build_artifact_from_match(
                            ext_name,
                            ext_config,
                            data,
                            generic_id,
                            messages,
                            step_number,
                            turn_number,
                            seen_ids,
                        )
                        if result:
                            artifacts.append(result)
                        break
            continue

        # Phase 1b: Plain text — regex extraction
        if raw_text:
            text_matched = False
            for ext_name, ext_config in _INTEGRATION_EXTRACTORS.items():
                url_pattern = ext_config.get("url_pattern")
                if not url_pattern:
                    continue
                url_match = re.search(url_pattern, raw_text)
                if url_match:
                    artifact_id = url_match.group(1) if url_match.lastindex else None
                    if not artifact_id:
                        id_m = re.search(r"\(ID:\s*([A-Za-z0-9_-]+)\)", raw_text)
                        if id_m:
                            artifact_id = id_m.group(1)
                    artifact_url = url_match.group(0)

                    name = "Untitled"
                    name_m = re.search(r"['\"]([^'\"]{2,200})['\"]", raw_text)
                    if name_m:
                        name = name_m.group(1)

                    if artifact_id and artifact_id not in seen_ids:
                        seen_ids.add(artifact_id)
                        logger.info(
                            f"[ARTIFACT_EXTRACT] Phase 1b text MATCH: {ext_name}, "
                            f"id={artifact_id}, url={artifact_url}, name={name}"
                        )
                        artifacts.append(
                            Artifact(
                                type=ext_config["type"],
                                name=name,
                                url=artifact_url,
                                id=artifact_id,
                                integration=ext_name,
                                step_number=step_number,
                                turn_number=turn_number,
                            ).model_dump()
                        )
                        text_matched = True
                        break

            if text_matched:
                continue

            # (ID: ...) pattern without URL — for integrations like gmail
            id_m = re.search(r"\(ID:\s*([A-Za-z0-9_-]+)\)", raw_text)
            if id_m and integration_hint:
                ext_config = _INTEGRATION_EXTRACTORS.get(integration_hint)
                if ext_config:
                    artifact_id = id_m.group(1)
                    if artifact_id not in seen_ids:
                        seen_ids.add(artifact_id)
                        name = "Untitled"
                        name_m = re.search(r"['\"]([^'\"]{2,200})['\"]", raw_text)
                        if name_m:
                            name = name_m.group(1)
                        artifacts.append(
                            Artifact(
                                type=ext_config["type"],
                                name=name,
                                url=None,
                                id=artifact_id,
                                integration=integration_hint,
                                step_number=step_number,
                                turn_number=turn_number,
                            ).model_dump()
                        )

    # --- Phase 2: URL regex on AIMessage content (last resort) ---
    if not artifacts:
        logger.info(
            "[ARTIFACT_EXTRACT] Phase 1 found nothing, falling back to URL regex on AIMessages"
        )
        for msg in messages:
            if isinstance(msg, AIMessage) and msg.content:
                content = (
                    msg.content if isinstance(msg.content, str) else str(msg.content)
                )
                for url in re.findall(r"https?://[^\s\)\"\'>\]]+", content):
                    artifact_type = _classify_url_type(url)
                    if artifact_type and url not in seen_ids:
                        seen_ids.add(url)
                        artifacts.append(
                            Artifact(
                                type=artifact_type,
                                name="Untitled",
                                url=url,
                                id=None,
                                integration=integration_hint or "unknown",
                                step_number=step_number,
                                turn_number=turn_number,
                            ).model_dump()
                        )

    return artifacts
