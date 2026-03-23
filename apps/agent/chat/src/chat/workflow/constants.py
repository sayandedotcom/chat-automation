"""Shared constants for workflow nodes."""

# ---------------------------------------------------------------------------
# Step-complete: rich result building
# ---------------------------------------------------------------------------
TOOL_OUTPUT_CHAR_BUDGET = 4_000
TOOL_OUTPUT_MIN_LENGTH = 50
TOOL_OUTPUT_SNIPPET_LIMIT = 1_500

# ---------------------------------------------------------------------------
# Step-complete: LLM-based summarization
# ---------------------------------------------------------------------------
SUMMARIZE_THRESHOLD = 3_000
SUMMARIZE_INPUT_LIMIT = 25_000

# ---------------------------------------------------------------------------
# Executor: tool result / argument truncation
# ---------------------------------------------------------------------------
TOOL_RESULT_CHAR_LIMIT = 12_000
TOOL_CALL_ARGS_CHAR_LIMIT = 2_000

# ---------------------------------------------------------------------------
# Routing safety limits
# ---------------------------------------------------------------------------
MAX_TOOL_CALLS_PER_STEP = 10
