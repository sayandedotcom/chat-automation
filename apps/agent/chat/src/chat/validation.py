"""
Input Validation & Sanitization

Validates and sanitizes user input before it reaches the LLM pipeline.
Defends against prompt injection, excessive input, and malicious patterns.

Defense layers:
1. Length limits — prevent context bloat / DoS
2. Injection detection — catch attempts to override system prompts
3. Content sanitization — neutralize control characters and encoding tricks
4. The existing HITL approval system is the final defense for write operations
"""

import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# --- Configuration ---

# Maximum allowed length for user request text (characters)
MAX_REQUEST_LENGTH = 10_000

# Maximum allowed length for thread_id
MAX_THREAD_ID_LENGTH = 128

# Maximum number of connected_integrations
MAX_CONNECTED_INTEGRATIONS = 20

# --- Injection detection patterns ---
# These catch common prompt injection attempts. The patterns are intentionally
# broad — false positives are handled by returning a warning, not blocking.

_INJECTION_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Direct instruction override attempts
    (
        re.compile(
            r"ignore\s+(all\s+)?(previous|above|prior|earlier|system)\s+(instructions?|prompts?|rules?|constraints?)",
            re.IGNORECASE,
        ),
        "instruction_override",
    ),
    (
        re.compile(
            r"disregard\s+(all\s+)?(previous|above|prior|earlier|system)\s+(instructions?|prompts?|rules?|constraints?)",
            re.IGNORECASE,
        ),
        "instruction_override",
    ),
    (
        re.compile(
            r"forget\s+(all\s+)?(previous|above|prior|earlier|your)\s+(instructions?|prompts?|rules?|context)",
            re.IGNORECASE,
        ),
        "instruction_override",
    ),
    # System prompt extraction attempts
    (
        re.compile(
            r"(print|show|display|reveal|output|repeat|echo)\s+(your|the|system)\s+(system\s+)?(prompt|instructions?|rules?|context)",
            re.IGNORECASE,
        ),
        "prompt_extraction",
    ),
    (
        re.compile(
            r"what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?|rules?|directives?)",
            re.IGNORECASE,
        ),
        "prompt_extraction",
    ),
    # Role-play / persona override
    (
        re.compile(
            r"you\s+are\s+now\s+(a|an|the)\s+",
            re.IGNORECASE,
        ),
        "role_override",
    ),
    (
        re.compile(
            r"(act|behave|respond|pretend)\s+as\s+(if\s+you\s+are\s+)?(a|an|the)\s+",
            re.IGNORECASE,
        ),
        "role_override",
    ),
    (
        re.compile(
            r"switch\s+to\s+(a\s+)?(new|different)\s+(mode|role|persona)",
            re.IGNORECASE,
        ),
        "role_override",
    ),
    # Delimiter injection — trying to break out of the user message context
    (
        re.compile(
            r"<\s*/?\s*(system|assistant|human|user|instruction|prompt)\s*>",
            re.IGNORECASE,
        ),
        "delimiter_injection",
    ),
    (
        re.compile(
            r"\[\s*(SYSTEM|INST|ASSISTANT|USER)\s*\]",
            re.IGNORECASE,
        ),
        "delimiter_injection",
    ),
    # Tool manipulation — trying to call specific tools or override tool behavior
    (
        re.compile(
            r"(call|invoke|execute|run|use)\s+tool\s*[:\-]?\s*(send_gmail|delete|create_spreadsheet)",
            re.IGNORECASE,
        ),
        "tool_manipulation",
    ),
    # Approval bypass — trying to skip HITL
    (
        re.compile(
            r"(skip|bypass|disable|ignore|remove)\s+(all\s+)?(approval|confirmation|human|review|hitl)",
            re.IGNORECASE,
        ),
        "approval_bypass",
    ),
    (
        re.compile(
            r"(auto[\-\s]?approve|no\s+approval\s+needed|approve\s+automatically)",
            re.IGNORECASE,
        ),
        "approval_bypass",
    ),
    # Data exfiltration — trying to send data to external endpoints
    (
        re.compile(
            r"(send|post|forward|exfiltrate|upload)\s+(to|data\s+to)\s+https?://",
            re.IGNORECASE,
        ),
        "data_exfiltration",
    ),
]


@dataclass
class ValidationResult:
    """Result of input validation."""

    is_valid: bool
    sanitized_text: str  # The cleaned text (always set, even if invalid)
    error: str | None = None  # User-facing error message if invalid
    warnings: list[str] | None = (
        None  # Non-blocking warnings (logged, not shown to user)
    )


def validate_request(request: str) -> ValidationResult:
    """Validate and sanitize a user workflow request.

    Returns a ValidationResult with the sanitized text and any issues found.
    Hard blocks (is_valid=False) are for clearly malicious input.
    Soft warnings are logged but the request proceeds.
    """
    warnings = []

    # --- 1. Null / empty check ---
    if not request or not request.strip():
        return ValidationResult(
            is_valid=False,
            sanitized_text="",
            error="Request cannot be empty.",
        )

    # --- 2. Length limit ---
    if len(request) > MAX_REQUEST_LENGTH:
        return ValidationResult(
            is_valid=False,
            sanitized_text=request[:MAX_REQUEST_LENGTH],
            error=f"Request is too long ({len(request)} characters). Maximum is {MAX_REQUEST_LENGTH}.",
        )

    # --- 3. Sanitize control characters ---
    sanitized = _sanitize_text(request)

    # --- 4. Detect injection patterns ---
    detections = _detect_injections(sanitized)
    if detections:
        detection_types = [d[1] for d in detections]
        logger.warning(
            f"[INPUT_VALIDATION] Injection patterns detected: {detection_types} "
            f"in request: {sanitized[:200]}..."
        )

        # Hard block for delimiter injection and approval bypass — these are
        # unambiguous attack patterns with no legitimate use case
        hard_block_types = {"delimiter_injection", "approval_bypass"}
        hard_blocks = [d for d in detections if d[1] in hard_block_types]

        if hard_blocks:
            return ValidationResult(
                is_valid=False,
                sanitized_text=sanitized,
                error="Your request contains content that cannot be processed. Please rephrase your request.",
            )

        # Soft warning for other patterns — they could be legitimate
        # (e.g., "send to https://..." is normal for sharing links)
        for _pattern, detection_type in detections:
            if detection_type not in hard_block_types:
                warnings.append(f"potential_{detection_type}")

    return ValidationResult(
        is_valid=True,
        sanitized_text=sanitized,
        warnings=warnings if warnings else None,
    )


def validate_thread_id(thread_id: str | None) -> str | None:
    """Validate and sanitize a thread ID."""
    if thread_id is None:
        return None
    # Thread IDs should be UUIDs or simple alphanumeric strings
    if len(thread_id) > MAX_THREAD_ID_LENGTH:
        return None
    # Strip anything that isn't alphanumeric, hyphen, or underscore
    sanitized = re.sub(r"[^a-zA-Z0-9\-_]", "", thread_id)
    return sanitized if sanitized else None


def validate_connected_integrations(
    integrations: list[str] | None,
) -> list[str] | None:
    """Validate the connected_integrations list."""
    if integrations is None:
        return None
    if len(integrations) > MAX_CONNECTED_INTEGRATIONS:
        integrations = integrations[:MAX_CONNECTED_INTEGRATIONS]
    # Each integration ID should be a simple kebab-case string
    valid = []
    for integration in integrations:
        if isinstance(integration, str) and re.match(
            r"^[a-z0-9][a-z0-9\-]{0,50}$", integration
        ):
            valid.append(integration)
    return valid


def _sanitize_text(text: str) -> str:
    """Remove or neutralize potentially dangerous characters from user input.

    Preserves normal text, punctuation, and unicode (for international users).
    Strips only control characters and zero-width characters that could be used
    to hide injected content.
    """
    # Remove ASCII control characters (except newline, tab, carriage return)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # Remove zero-width and invisible unicode characters that could hide content
    # U+200B zero-width space, U+200C/D zero-width non/joiner,
    # U+2060 word joiner, U+FEFF BOM, U+200E/F LTR/RTL marks
    text = re.sub(r"[\u200b\u200c\u200d\u2060\ufeff\u200e\u200f]", "", text)

    # Remove Unicode tag characters (U+E0001-U+E007F) — used in prompt smuggling
    text = re.sub(r"[\U000e0001-\U000e007f]", "", text)

    # Collapse excessive whitespace (>3 consecutive newlines → 2)
    text = re.sub(r"\n{4,}", "\n\n\n", text)

    # Collapse excessive spaces (>10 consecutive → 1)
    text = re.sub(r" {11,}", " ", text)

    return text.strip()


def _detect_injections(text: str) -> list[tuple[str, str]]:
    """Scan text for known injection patterns.

    Returns list of (matched_text, detection_type) tuples.
    """
    detections = []
    for pattern, detection_type in _INJECTION_PATTERNS:
        match = pattern.search(text)
        if match:
            detections.append((match.group(0), detection_type))
    return detections
