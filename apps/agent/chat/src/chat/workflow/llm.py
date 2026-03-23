"""
Shared LLM Instances

Module-level singletons for the planner and executor LLMs.
Initialised lazily to avoid importing heavy dependencies at module load time.
"""

import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from chat.config import GOOGLE_API_KEY
from chat.schemas import ClassifierOutput, WorkflowPlanOutput

logger = logging.getLogger(__name__)

_planner_llm = None
_executor_llm = None
_classifier_llm = None
_summarizer_llm = None


def get_planner_llm():
    """Get shared planner LLM instance with structured output."""
    global _planner_llm
    if _planner_llm is None:
        base = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=GOOGLE_API_KEY,
        )
        _planner_llm = base.with_structured_output(WorkflowPlanOutput)
        logger.info("Initialized shared planner LLM")
    return _planner_llm


def get_executor_llm():
    """Get shared executor LLM instance (without tools — bind tools per request).

    Uses gemini-2.5-flash with minimal thinking budget — the executor needs
    tool-call capability (lite models fail on complex tool schemas like Notion)
    but doesn't benefit from deep reasoning.
    """
    global _executor_llm
    if _executor_llm is None:
        _executor_llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=GOOGLE_API_KEY,
            thinking_budget=1024,
        )
        logger.info("Initialized shared executor LLM (thinking_budget=1024)")
    return _executor_llm


def get_summarizer_llm():
    """Get shared summarizer LLM instance for tool output summarization.

    Uses a non-thinking lite model — summarization is straightforward text
    processing that doesn't require complex tool calls.
    """
    global _summarizer_llm
    if _summarizer_llm is None:
        _summarizer_llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash-lite",
            google_api_key=GOOGLE_API_KEY,
            temperature=0.1,
        )
        logger.info("Initialized shared summarizer LLM (gemini-2.5-flash-lite)")
    return _summarizer_llm


def get_classifier_llm():
    """Get shared classifier LLM with structured output.

    Uses a non-thinking lite model — classification is a simple mapping task
    with a small structured output schema.
    Returns a ClassifierOutput schema directly — no manual JSON parsing needed.
    """
    global _classifier_llm
    if _classifier_llm is None:
        base = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash-lite",
            google_api_key=GOOGLE_API_KEY,
            temperature=0.0,
        )
        _classifier_llm = base.with_structured_output(ClassifierOutput)
        logger.info("Initialized shared classifier LLM (gemini-2.5-flash-lite)")
    return _classifier_llm
