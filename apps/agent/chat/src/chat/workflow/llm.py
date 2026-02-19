"""
Shared LLM Instances

Module-level singletons for the planner and executor LLMs.
Initialised lazily to avoid importing heavy dependencies at module load time.
"""

import os
import logging
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from chat.schemas import WorkflowPlanOutput

load_dotenv()

logger = logging.getLogger(__name__)

_planner_llm = None
_executor_llm = None
_classifier_llm = None


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
    """Get shared executor LLM instance (without tools — bind tools per request)."""
    global _executor_llm
    if _executor_llm is None:
        _executor_llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
        )
        logger.info("Initialized shared executor LLM")
    return _executor_llm


def get_classifier_llm():
    """Get shared classifier LLM instance."""
    global _classifier_llm
    if _classifier_llm is None:
        _classifier_llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
            temperature=0.0,
        )
        logger.info("Initialized shared classifier LLM")
    return _classifier_llm
