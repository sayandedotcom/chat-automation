"""
Integration Classifier — two-phase routing for user requests.

Phase 1 (instant): Stemmed keyword matching + fuzzy phrase matching
Phase 2 (fallback): LLM classification for ambiguous / low-confidence cases
"""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Optional

from rapidfuzz import fuzz

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Lightweight suffix-stripping stemmer
# ──────────────────────────────────────────────
_MAIN_SUFFIXES: list[tuple[str, str, int]] = [
    # Only inflectional suffixes — derivational ones (-ment, -tion, -ness,
    # -able, -ful, -ous, -ive, -ally, etc.) are intentionally excluded
    # because they cause singular/plural stems to diverge:
    #   stem("document") = "docu"  vs  stem("documents") = "document"
    # (suffix, replacement, min_stem_length)
    ("ing", "", 5),  # min_len=5 to avoid stripping nouns like "meeting" (4 chars stem)
    ("ed", "", 3),
    ("ly", "", 3),
    # Note: -er removed because "folder"→"fold" vs "folders"→"folder" diverge
]


def stem(word: str) -> str:
    """Simple suffix-stripping stemmer for keyword normalisation."""
    word = word.lower().strip()
    if len(word) <= 3:
        return word

    # "ies" -> "y"  (e.g. "puppies" -> "puppy")
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"

    # "ied" -> "y"  (e.g. "replied" -> "reply")
    if word.endswith("ied") and len(word) > 4:
        return word[:-3] + "y"

    # "sses" -> "ss"  (e.g. "addresses" -> "address")
    if word.endswith("sses"):
        return word[:-2]

    # "es" only after sibilants: s, x, z, sh, ch  (e.g. "boxes" -> "box")
    if word.endswith("es") and len(word) > 4:
        pre = word[:-2]
        if pre.endswith(("s", "x", "z", "sh", "ch")):
            return pre

    # Main suffix rules
    for suffix, replacement, min_len in _MAIN_SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= min_len:
            return word[: -len(suffix)] + replacement

    # Generic plural "s" (last resort, avoids stripping "es" from "file+s")
    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        return word[:-1]

    return word


# ──────────────────────────────────────────────
# Data structures
# ──────────────────────────────────────────────
@dataclass
class IntegrationIndex:
    """Pre-computed search index for one integration."""

    name: str
    stemmed_keywords: set[str]
    raw_keywords: set[str]
    phrases: list[str]
    regex_patterns: list[re.Pattern]
    description: str


@dataclass
class ClassificationResult:
    """Output of the classifier."""

    integrations: list[str]
    scores: dict[str, float]
    method: str  # "nlp" | "llm_fallback" | "fallback_default"
    confidence: float  # 0.0 – 1.0


# ──────────────────────────────────────────────
# Classifier
# ──────────────────────────────────────────────
class IntegrationClassifier:
    """
    Two-phase integration classifier.

    Phase 1 (instant):  stemmed keyword + fuzzy phrase scoring
    Phase 2 (fallback): Gemini Flash structured classification
    """

    # Tunable thresholds
    HIGH_CONFIDENCE = 0.35  # Phase-1 normalised score above this → included
    MIN_ABSOLUTE_SCORE = 1.5  # Raw score above this → included (1 exact keyword match)
    AMBIGUITY_RATIO = 0.8  # Top-2 scores within this ratio → ambiguous
    MIN_FUZZY_SCORE = 75  # rapidfuzz partial_ratio cut-off (0–100)

    def __init__(self) -> None:
        self._indexes: dict[str, IntegrationIndex] = {}
        self._all_stems: dict[str, list[str]] = {}  # stem → [integration_names]
        self._llm = None  # lazy
        self._initialized = False

    # ── index building ────────────────────────

    def build_index(self, integrations_config: dict) -> None:
        """Build search index from the YAML config (called once at startup)."""
        self._indexes.clear()
        self._all_stems.clear()

        for name, config in integrations_config.items():
            raw_keywords = set(config.get("keywords", []))

            # Backward compat: extract keywords from legacy regex patterns
            if not raw_keywords:
                raw_keywords = self._extract_keywords_from_patterns(
                    config.get("request_patterns", [])
                )

            stemmed = {stem(kw) for kw in raw_keywords}

            for s in stemmed:
                self._all_stems.setdefault(s, []).append(name)

            self._indexes[name] = IntegrationIndex(
                name=name,
                stemmed_keywords=stemmed,
                raw_keywords={kw.lower() for kw in raw_keywords},
                phrases=config.get("phrases", []),
                regex_patterns=[
                    re.compile(p, re.IGNORECASE)
                    for p in config.get("request_patterns", [])
                ],
                description=config.get("description", config.get("display_name", name)),
            )

        self._initialized = True
        total_kw = sum(len(idx.stemmed_keywords) for idx in self._indexes.values())
        logger.info(
            f"Classifier index built: {len(self._indexes)} integrations, {total_kw} stemmed keywords"
        )

    @staticmethod
    def _extract_keywords_from_patterns(patterns: list[str]) -> set[str]:
        """Pull individual words from regex alternations (backward compat)."""
        noise = {"is", "are", "was", "were", "for", "in", "about", "the", "and", "or"}
        keywords: set[str] = set()
        for pattern in patterns:
            words = re.findall(r"[a-zA-Z]{2,}", pattern)
            keywords.update(w.lower() for w in words if w.lower() not in noise)
        return keywords

    # ── Phase 1: NLP classification ───────────

    def classify(self, request: str) -> ClassificationResult:
        """Phase 1 — instant NLP-based scoring."""
        request_lower = request.lower()
        tokens = re.findall(r"[a-zA-Z]+", request_lower)
        token_set = set(tokens)
        stemmed_tokens = {stem(t) for t in tokens}

        scores: dict[str, float] = {}

        for name, index in self._indexes.items():
            score = 0.0

            # 1. Exact keyword match (strongest signal)
            exact_matches = index.raw_keywords & token_set
            score += len(exact_matches) * 1.5

            # 2. Stemmed keyword match (catches morphological variants)
            stem_matches = index.stemmed_keywords & stemmed_tokens
            already_counted = {stem(w) for w in exact_matches}
            new_stem_matches = stem_matches - already_counted
            score += len(new_stem_matches) * 1.0

            # 3. Legacy regex patterns (backward compat, additive signal)
            for pattern in index.regex_patterns:
                if pattern.search(request_lower):
                    score += 1.0
                    break

            # 4. Fuzzy phrase matching
            if index.phrases:
                best = max(
                    (fuzz.partial_ratio(phrase.lower(), request_lower) for phrase in index.phrases),
                    default=0,
                )
                if best >= self.MIN_FUZZY_SCORE:
                    score += (best / 100.0) * 1.5

            if score > 0:
                scores[name] = score

        # Normalise and select
        max_score = max(scores.values()) if scores else 0.0
        if max_score > 0:
            normalised = {k: v / max_score for k, v in scores.items()}
        else:
            normalised = {}

        selected = [
            name
            for name, norm in normalised.items()
            if norm >= self.HIGH_CONFIDENCE or scores[name] >= self.MIN_ABSOLUTE_SCORE
        ]

        confidence = min(max_score / 5.0, 1.0)

        return ClassificationResult(
            integrations=selected,
            scores=scores,
            method="nlp",
            confidence=confidence,
        )

    # ── Phase 2: LLM fallback ────────────────

    async def classify_with_fallback(self, request: str) -> ClassificationResult:
        """Full two-phase classification (async because Phase 2 needs an LLM call)."""
        result = self.classify(request)

        needs_fallback = (
            not result.integrations
            or result.confidence < 0.3
            or self._is_ambiguous(result.scores)
        )

        if not needs_fallback:
            logger.info(
                f"Phase 1 classification: {result.integrations} "
                f"(confidence={result.confidence:.2f})"
            )
            return result

        logger.info(
            f"Phase 1 low confidence ({result.confidence:.2f}), "
            f"triggering LLM fallback for: {request[:80]!r}"
        )

        llm_result = await self._llm_classify(request)
        if llm_result:
            return llm_result

        # LLM also failed — use Phase 1 result or ultimate default
        if result.integrations:
            return result

        return ClassificationResult(
            integrations=["web_search"],
            scores={"web_search": 0.1},
            method="fallback_default",
            confidence=0.1,
        )

    def _is_ambiguous(self, scores: dict[str, float]) -> bool:
        if len(scores) < 2:
            return False
        top2 = sorted(scores.values(), reverse=True)[:2]
        if top2[0] == 0:
            return True
        return top2[1] / top2[0] >= self.AMBIGUITY_RATIO

    async def _llm_classify(self, request: str) -> Optional[ClassificationResult]:
        """Phase 2 — Gemini Flash classification."""
        try:
            if self._llm is None:
                import os

                from langchain_google_genai import ChatGoogleGenerativeAI

                self._llm = ChatGoogleGenerativeAI(
                    model="gemini-2.5-flash",
                    google_api_key=os.getenv("GOOGLE_API_KEY"),
                    temperature=0.0,
                )

            integration_list = "\n".join(
                f"- {name}: {idx.description}" for name, idx in self._indexes.items()
            )

            prompt = (
                "Classify which integrations are needed for this user request.\n\n"
                f"Available integrations:\n{integration_list}\n\n"
                f'User request: "{request}"\n\n'
                "Respond with ONLY a JSON array of integration names. "
                'Example: ["gmail", "google_docs"]\n'
                'If the request is a general question, use ["web_search"].\n'
                "Select the minimum set needed."
            )

            from langchain_core.messages import HumanMessage

            response = await self._llm.ainvoke([HumanMessage(content=prompt)])

            content = response.content.strip()
            # Strip markdown code fences if present
            if "```" in content:
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
                content = content.strip()

            integrations = json.loads(content)

            if isinstance(integrations, list) and all(isinstance(i, str) for i in integrations):
                valid = [i for i in integrations if i in self._indexes]
                if valid:
                    return ClassificationResult(
                        integrations=valid,
                        scores={i: 1.0 for i in valid},
                        method="llm_fallback",
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
