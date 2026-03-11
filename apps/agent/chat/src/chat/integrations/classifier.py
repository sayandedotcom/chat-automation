"""
Integration Classifier — LLM-based routing for user requests.

Uses Gemini Flash to classify which integrations are needed for a given request.
"""

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Data structures
# ──────────────────────────────────────────────
@dataclass
class IntegrationIndex:
    """Metadata for one integration (used in LLM prompt construction)."""

    name: str
    description: str
    identity_keywords: list[str]  # brand names / unique identifiers (used by nodes.py)


@dataclass
class ClassificationResult:
    """Output of the classifier."""

    integrations: list[str]
    scores: dict[str, float]
    method: str  # "llm" | "fallback_default"
    confidence: float  # 0.0 – 1.0


# ──────────────────────────────────────────────
# Classifier
# ──────────────────────────────────────────────
class IntegrationClassifier:
    """
    LLM-based integration classifier.

    Uses Gemini Flash to determine which integrations are needed
    for a given user request.
    """

    def __init__(self) -> None:
        self._indexes: dict[str, IntegrationIndex] = {}
        self._llm = None  # lazy
        self._initialized = False

    # ── index building ────────────────────────

    def build_index(self, integrations_config: dict) -> None:
        """Build integration metadata from the YAML config (called once at startup)."""
        self._indexes.clear()

        for name, config in integrations_config.items():
            self._indexes[name] = IntegrationIndex(
                name=name,
                description=config.get("description", config.get("display_name", name)),
                identity_keywords=[
                    kw.lower() for kw in config.get("identity_keywords", [])
                ],
            )

        self._initialized = True
        logger.info(f"Classifier index built: {len(self._indexes)} integrations")

    # ── Classification ────────────────────────

    async def classify_with_fallback(self, request: str) -> ClassificationResult:
        """Classify which integrations are needed for the request."""
        result = await self._llm_classify(request)
        if result:
            return result

        return ClassificationResult(
            integrations=["web_search"],
            scores={"web_search": 0.1},
            method="fallback_default",
            confidence=0.1,
        )

    async def _llm_classify(self, request: str) -> Optional[ClassificationResult]:
        """Gemini Flash classification with structured output."""
        try:
            if self._llm is None:
                from chat.workflow.llm import get_classifier_llm

                self._llm = get_classifier_llm()

            integration_list = "\n".join(
                f"- {name}: {idx.description}" for name, idx in self._indexes.items()
            )

            prompt = (
                "Classify which integrations are needed for this user request.\n\n"
                f"Available integrations:\n{integration_list}\n\n"
                f'User request: "{request}"\n\n'
                'If the request is a general question, use ["web_search"].\n'
                "Select the minimum set needed."
            )

            from langchain_core.messages import HumanMessage

            result = await self._llm.ainvoke([HumanMessage(content=prompt)])

            # result is a ClassifierOutput Pydantic model (structured output)
            valid = [i for i in result.integrations if i in self._indexes]
            if valid:
                return ClassificationResult(
                    integrations=valid,
                    scores={i: 1.0 for i in valid},
                    method="llm",
                    confidence=0.9,
                )
        except Exception as e:
            logger.warning(f"LLM classification failed: {e}")

        return None

    @property
    def is_initialized(self) -> bool:
        return self._initialized


# ──────────────────────────────────────────────
# Module-level singleton
# ──────────────────────────────────────────────
_classifier: Optional[IntegrationClassifier] = None


def get_classifier() -> IntegrationClassifier:
    """Return the global classifier singleton."""
    global _classifier
    if _classifier is None:
        _classifier = IntegrationClassifier()
    return _classifier
