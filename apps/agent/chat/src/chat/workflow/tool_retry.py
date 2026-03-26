"""
Tool call retry wrapper for transient MCP failures.

Provides an `awrap_tool_call` implementation for LangGraph's ToolNode that
retries individual tool calls on transient errors (network timeouts, connection
resets, 5xx responses) with exponential backoff and jitter.

Retry is transparent to the LLM — it never sees intermediate failures.
If all retries are exhausted, the final exception propagates to ToolNode's
`handle_tool_errors` handler, which converts it to an error ToolMessage.
"""

import asyncio
import logging
import random
from collections.abc import Callable, Awaitable

from langchain_core.messages import ToolMessage
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command

from chat.workflow.constants import TOOL_RETRY_BASE_DELAY, TOOL_RETRY_MAX_ATTEMPTS

logger = logging.getLogger(__name__)

# Substrings in str(exc).lower() that indicate a transient / retryable failure.
_RETRYABLE_PATTERNS = (
    "failed to fetch",
    "timeout",
    "timed out",
    "connection reset",
    "connection refused",
    "econnrefused",
    "econnreset",
    "broken pipe",
    "502",
    "503",
    "504",
    "service unavailable",
    "bad gateway",
    "gateway timeout",
    "read timeout",
    "connect timeout",
    "network error",
    "socket",
    "eof occurred",
    "ssl: eof",
)

# If the error message contains any of these, skip retry immediately.
# Prevents retrying permanent failures (auth, bad args, not found).
_NON_RETRYABLE_PATTERNS = (
    "401",
    "403",
    "unauthorized",
    "forbidden",
    "permission denied",
    "not found",
    "invalid_grant",
    "invalid argument",
    "validation",
)


def is_retryable_error(exc: Exception) -> bool:
    """Return True if the exception looks like a transient / retriable failure."""
    if isinstance(exc, (ConnectionError, TimeoutError, OSError)):
        return True
    msg = str(exc).lower()
    if any(pattern in msg for pattern in _NON_RETRYABLE_PATTERNS):
        return False
    return any(pattern in msg for pattern in _RETRYABLE_PATTERNS)


async def retry_tool_call(
    request: ToolCallRequest,
    execute: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command]],
) -> ToolMessage | Command:
    """awrap_tool_call handler: retry on transient errors with exponential backoff.

    Passed to ToolNode(awrap_tool_call=retry_tool_call). LangGraph calls this
    instead of executing the tool directly, so we control the retry loop.

    Args:
        request: The tool call request (tool_call, tool, state, runtime).
        execute: The LangGraph-provided coroutine to actually run the tool.

    Returns:
        ToolMessage or Command from the (eventually) successful execution.

    Raises:
        The final exception after all retry attempts are exhausted.
    """
    tool_name = request.tool_call.get("name", "?") if request.tool_call else "?"
    last_exc: Exception | None = None

    for attempt in range(TOOL_RETRY_MAX_ATTEMPTS + 1):
        try:
            result = await execute(request)
            if attempt > 0:
                logger.info(
                    "Tool '%s' succeeded on attempt %d/%d",
                    tool_name,
                    attempt + 1,
                    TOOL_RETRY_MAX_ATTEMPTS + 1,
                )
            return result
        except Exception as exc:
            last_exc = exc
            if attempt == TOOL_RETRY_MAX_ATTEMPTS or not is_retryable_error(exc):
                if attempt > 0:
                    logger.error(
                        "Tool '%s' failed after %d attempt(s): %s",
                        tool_name,
                        attempt + 1,
                        str(exc)[:300],
                    )
                raise

            delay = TOOL_RETRY_BASE_DELAY * (2**attempt) + random.uniform(0, 0.5)
            logger.warning(
                "Tool '%s' transient error (attempt %d/%d), retrying in %.1fs: %s",
                tool_name,
                attempt + 1,
                TOOL_RETRY_MAX_ATTEMPTS + 1,
                delay,
                str(exc)[:200],
            )
            await asyncio.sleep(delay)

    # Should be unreachable, but satisfies the type checker.
    raise last_exc  # type: ignore[misc]
