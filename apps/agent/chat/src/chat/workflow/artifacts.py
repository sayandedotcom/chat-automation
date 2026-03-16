"""
Artifact Extraction

Extracts structured artifacts (documents, emails, pages, etc.) and search results
from LangChain message lists produced by workflow steps.
"""

import json
import logging
import re
from typing import Optional

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage

from chat.schemas import Artifact, EmailResultItem, SearchResultItem

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
    messages: list[BaseMessage],
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


def _domain_from_url(url: str) -> str:
    try:
        from urllib.parse import urlparse

        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        parts = url.split("/")
        return parts[2] if len(parts) > 2 else ""


def _search_result_from_dict(item: dict) -> SearchResultItem:
    url = item.get("url", "")
    domain = _domain_from_url(url)
    favicon = item.get("favicon") or (
        f"https://www.google.com/s2/favicons?domain={domain}&sz=32" if domain else None
    )
    return SearchResultItem(
        title=item.get("title", domain),
        url=url,
        domain=domain,
        favicon=favicon,
        date=item.get("published_date") or item.get("date"),
    )


def _parse_tavily_text(text: str) -> list[SearchResultItem]:
    """
    Parse Tavily MCP formatResults() output:
      Title: <title>
      URL: <url>
      Content: <snippet>
      Favicon: <url>   (optional)
    """
    results: list[SearchResultItem] = []
    current: dict = {}

    for line in text.splitlines():
        if line.startswith("Title: "):
            if current.get("url"):
                results.append(_search_result_from_dict(current))
            current = {"title": line[7:].strip()}
        elif line.startswith("URL: ") and current.get("title"):
            current["url"] = line[5:].strip()
        elif line.startswith("Favicon: ") and current.get("title"):
            current["favicon"] = line[9:].strip()

    if current.get("url"):
        results.append(_search_result_from_dict(current))

    return results


def extract_search_results_from_messages(
    messages: list[BaseMessage],
) -> Optional[list[SearchResultItem]]:
    """
    Extract structured search results from tool messages.

    Handles both JSON format (raw Tavily API) and Tavily MCP text format
    (formatResults() output wrapped in a list content block).
    """
    search_results: list[SearchResultItem] = []

    for msg in reversed(messages):
        if not isinstance(msg, ToolMessage) or not msg.content:
            continue

        try:
            content = msg.content

            # MCP returns [{type: "text", text: "..."}] — unwrap to plain string
            if isinstance(content, list):
                text_parts = [
                    block.get("text", "")
                    if isinstance(block, dict) and block.get("type") == "text"
                    else str(block)
                    if isinstance(block, str)
                    else ""
                    for block in content
                ]
                content = "\n".join(p for p in text_parts if p)

            if isinstance(content, str):
                raw_text = content
                # Strip markdown code fences if present
                stripped = raw_text.strip()
                if "```json" in stripped:
                    stripped = stripped.split("```json")[1].split("```")[0].strip()

                # Attempt JSON parse first
                if stripped.startswith("{") or stripped.startswith("["):
                    try:
                        data = json.loads(stripped)
                        results_list = (
                            data.get("results")
                            if isinstance(data, dict)
                            else (data if isinstance(data, list) else None)
                        )
                        if results_list and isinstance(results_list, list):
                            for item in results_list[:10]:
                                if isinstance(item, dict) and "url" in item:
                                    search_results.append(
                                        _search_result_from_dict(item)
                                    )
                            if search_results:
                                return search_results
                    except (json.JSONDecodeError, KeyError, TypeError):
                        pass

                # Fall back to Tavily MCP text format
                if "Title: " in raw_text and "URL: " in raw_text:
                    parsed = _parse_tavily_text(raw_text)
                    if parsed:
                        return parsed

            elif isinstance(content, dict):
                results_list = content.get("results")
                if results_list and isinstance(results_list, list):
                    for item in results_list[:10]:
                        if isinstance(item, dict) and "url" in item:
                            search_results.append(_search_result_from_dict(item))
                    if search_results:
                        return search_results

        except (json.JSONDecodeError, KeyError, TypeError):
            continue

    return search_results if search_results else None


def _parse_email_date(data: dict) -> str:
    """Extract a human-readable date from Gmail message data."""
    # Try headers first
    headers = data.get("payload", {}).get("headers", [])
    if isinstance(headers, list):
        for h in headers:
            if isinstance(h, dict) and h.get("name", "").lower() == "date":
                return h.get("value", "")
    # Fall back to internalDate (epoch ms)
    internal = data.get("internalDate")
    if internal:
        try:
            from datetime import datetime, timezone

            ts = int(internal) / 1000
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            return dt.strftime("%b %d, %Y")
        except (ValueError, OSError):
            pass
    return data.get("date", "")


def _extract_sender(data: dict) -> str:
    """Extract sender from Gmail message data."""
    # Check top-level 'from' / 'sender'
    for key in ("from", "sender"):
        val = data.get(key)
        if val and isinstance(val, str):
            return val
    # Check payload.headers
    headers = data.get("payload", {}).get("headers", [])
    if isinstance(headers, list):
        for h in headers:
            if isinstance(h, dict) and h.get("name", "").lower() == "from":
                return h.get("value", "")
    return "Unknown"


def _extract_subject(data: dict) -> str:
    """Extract subject from Gmail message data."""
    if data.get("subject"):
        return data["subject"]
    headers = data.get("payload", {}).get("headers", [])
    if isinstance(headers, list):
        for h in headers:
            if isinstance(h, dict) and h.get("name", "").lower() == "subject":
                return h.get("value", "")
    return "(No subject)"


def _email_from_dict(data: dict) -> Optional[EmailResultItem]:
    """Build an EmailResultItem from a Gmail message dict."""
    msg_id = data.get("id", "")
    if not msg_id:
        return None
    thread_id = data.get("threadId")
    sender = _extract_sender(data)
    subject = _extract_subject(data)
    snippet = data.get("snippet", data.get("body", ""))[:200]
    date = _parse_email_date(data)
    label_ids = data.get("labelIds", [])
    is_unread = "UNREAD" in label_ids if isinstance(label_ids, list) else None
    return EmailResultItem(
        message_id=msg_id,
        thread_id=thread_id,
        sender=sender,
        subject=subject,
        snippet=snippet,
        date=date,
        is_unread=is_unread,
    )


def _unwrap_mcp_text(content) -> str:
    """Unwrap MCP content blocks to plain text string.

    Handles:
    - Python list: [{"type": "text", "text": "..."}]
    - String-encoded single-nested: '[{"type": "text", "text": "..."}]'
    - String-encoded double-nested: '[[{"type": "text", "text": "..."}]]'
    - Plain string passthrough
    """
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, list):
                # Double-nested: [[{type: text, text: ...}]]
                for inner in block:
                    if isinstance(inner, dict) and inner.get("type") == "text":
                        parts.append(inner.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(p for p in parts if p)

    if not isinstance(content, str):
        return ""

    text = content.strip()

    # Try JSON parse for string-encoded MCP blocks
    if text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return _unwrap_mcp_text(parsed)
        except (json.JSONDecodeError, TypeError):
            pass

    return text


def _parse_gmail_text(text: str) -> list[EmailResultItem]:
    """Parse Gmail MCP text-format output into EmailResultItems.

    Handles output like:
        Retrieved 5 messages:

        Message ID: 19cee54b17065258
        Subject: Building apps was never easier
        From: Steven Cravotta <saas@mail.beehiiv.com>
        Date: Fri, 14 Mar 2026 10:00:00 -0500
        Body: Some content here...

        Message ID: 19cee12345abcdef
        ...
    """
    results: list[EmailResultItem] = []

    # Split on "Message ID:" boundaries
    chunks = re.split(r"(?:^|\n)(?=Message ID:)", text)

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk.startswith("Message ID:"):
            continue

        msg_id = ""
        subject = "(No subject)"
        sender = "Unknown"
        date = ""
        snippet = ""
        thread_id = None
        is_unread = None

        _KNOWN_PREFIXES = (
            "Message ID:",
            "Message-ID:",
            "Message-Id:",
            "Thread ID:",
            "Subject:",
            "From:",
            "To:",
            "Cc:",
            "Bcc:",
            "Reply-To:",
            "Return-Path:",
            "Date:",
            "Labels:",
            "Body:",
            "Content:",
            "Snippet:",
            "Attachments:",
            "MIME-Version:",
            "Content-Type:",
            "Content-Transfer-Encoding:",
            "Delivered-To:",
            "Received:",
            "X-",
            "DKIM-",
            "ARC-",
            "List-",
            "Mailing-List:",
            "Precedence:",
            "References:",
            "In-Reply-To:",
            "Feedback-ID:",
            "Web Link:",
            "Link:",
        )

        lines = chunk.split("\n")
        body_lines: list[str] = []
        in_body = False
        has_metadata = False  # True once we've parsed at least one field

        for line in lines:
            stripped = line.strip()
            if not stripped:
                if in_body:
                    body_lines.append("")
                continue

            if stripped.startswith("Message ID:"):
                msg_id = stripped[len("Message ID:") :].strip()
                has_metadata = True
            elif stripped.startswith("Thread ID:"):
                thread_id = stripped[len("Thread ID:") :].strip()
            elif stripped.startswith("Subject:"):
                subject = stripped[len("Subject:") :].strip() or "(No subject)"
            elif stripped.startswith("From:"):
                sender = stripped[len("From:") :].strip() or "Unknown"
            elif stripped.startswith("Date:"):
                date = stripped[len("Date:") :].strip()
            elif stripped.startswith("Labels:"):
                labels_str = stripped[len("Labels:") :].strip()
                if "UNREAD" in labels_str:
                    is_unread = True
                elif labels_str:
                    is_unread = False
            elif stripped.startswith(("Body:", "Content:", "Snippet:")):
                for prefix in ("Body:", "Content:", "Snippet:"):
                    if stripped.startswith(prefix):
                        rest = stripped[len(prefix) :].strip()
                        if rest:
                            body_lines.append(rest)
                        break
                in_body = True
            elif stripped.startswith("Web Link:"):
                # "Web Link: https://... actual body text here"
                # Extract body text after the URL
                after_prefix = stripped[len("Web Link:") :].strip()
                # Skip the URL, grab text after it
                url_match = re.match(r"https?://\S+\s*(.*)", after_prefix)
                if url_match and url_match.group(1).strip():
                    body_lines.append(url_match.group(1).strip())
                    in_body = True
            elif in_body:
                body_lines.append(stripped)
            elif has_metadata and not any(
                stripped.startswith(p) for p in _KNOWN_PREFIXES
            ):
                # Unrecognized line after metadata — treat as body
                body_lines.append(stripped)
                in_body = True

        if not msg_id:
            continue

        snippet = " ".join(body_lines).strip()[:200] if body_lines else ""

        results.append(
            EmailResultItem(
                message_id=msg_id,
                thread_id=thread_id,
                sender=sender,
                subject=subject,
                snippet=snippet,
                date=date,
                is_unread=is_unread,
            )
        )

    return results


def extract_email_results_from_messages(
    messages: list[BaseMessage],
) -> Optional[list[EmailResultItem]]:
    """
    Extract structured email results from Gmail tool messages.

    Searches for ToolMessages whose name contains 'gmail' AND ('content' or 'thread'
    or 'message'), unwraps MCP content blocks, and parses both JSON and text formats.
    """
    email_results: list[EmailResultItem] = []
    seen_ids: set[str] = set()

    for msg in reversed(messages):
        if not isinstance(msg, ToolMessage) or not msg.content:
            continue

        name = getattr(msg, "name", "") or ""
        if "gmail" not in name.lower():
            continue
        # Only match reading/content tools, not send/draft/label/filter
        if not any(
            kw in name.lower() for kw in ("content", "thread", "message", "batch")
        ):
            continue

        try:
            # Unwrap MCP content blocks (handles list, string-encoded, double-nested)
            raw_text = _unwrap_mcp_text(msg.content)
            if not raw_text:
                continue

            if "```json" in raw_text:
                raw_text = raw_text.split("```json")[1].split("```")[0].strip()

            # Try JSON parse first (structured Gmail API responses)
            if raw_text.startswith("{") or raw_text.startswith("["):
                try:
                    data = json.loads(raw_text)

                    # Handle both single message and arrays
                    items = []
                    if isinstance(data, list):
                        items = data
                    elif isinstance(data, dict):
                        if "messages" in data and isinstance(data["messages"], list):
                            items = data["messages"]
                        else:
                            items = [data]

                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        # Skip MCP content-block dicts ({type: "text", text: ...})
                        if item.get("type") == "text" and "text" in item:
                            continue
                        email = _email_from_dict(item)
                        if email and email.message_id not in seen_ids:
                            seen_ids.add(email.message_id)
                            email_results.append(email)

                    if email_results:
                        return email_results
                except (json.JSONDecodeError, KeyError, TypeError):
                    pass

            # Fall back to text format parsing (Gmail MCP tools return text)
            if "Message ID:" in raw_text:
                parsed = _parse_gmail_text(raw_text)
                for email in parsed:
                    if email.message_id not in seen_ids:
                        seen_ids.add(email.message_id)
                        email_results.append(email)
                if email_results:
                    return email_results

        except (KeyError, TypeError):
            continue

    return email_results if email_results else None


def extract_artifacts_from_step(
    messages: list[BaseMessage],
    step_number: int,
    turn_number: int = 1,
    integration_hint: Optional[str] = None,
) -> list[dict]:
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

        # Normalise content: MCP servers often return list of content blocks,
        # string-encoded JSON, or double-nested variants.
        raw_text = _unwrap_mcp_text(content) or None
        # dict content not handled by _unwrap_mcp_text — checked below

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
