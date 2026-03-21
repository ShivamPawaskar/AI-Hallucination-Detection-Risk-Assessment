import re
from dataclasses import dataclass

from backend.verifier import WikipediaVerifier


SENTENCE_SPLIT_REGEX = re.compile(r"(?<=[.!?])\s+")
YEAR_REGEX = re.compile(r"\b(?:19|20)\d{2}\b")
NUMBER_REGEX = re.compile(r"\b\d+(?:\.\d+)?%?\b")
URL_REGEX = re.compile(r"https?://\S+")
ABSOLUTE_REGEX = re.compile(
    r"\b(always|never|guaranteed|definitely|undeniable|proven|certainly|everyone knows)\b",
    re.IGNORECASE,
)
WEAK_ATTRIBUTION_REGEX = re.compile(
    r"\b(studies show|experts say|research proves|according to reports|it is known that)\b",
    re.IGNORECASE,
)
SPECULATIVE_REGEX = re.compile(
    r"\b(might|may|could|possibly|likely|appears to|suggests|approximately|around)\b",
    re.IGNORECASE,
)
CITATION_STYLE_REGEX = re.compile(
    r"\b(according to|reported by|published by|based on|cited by)\b",
    re.IGNORECASE,
)
ENTITY_CLAIM_REGEX = re.compile(
    r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b.*?\b(is|was|were|has|have|won|founded|invented|caused|discovered|served|created|built)\b"
)


@dataclass
class SentenceAnalysis:
    sentence: str
    penalty: float
    confidence_bonus: float
    reasons: list[str]
    is_claim: bool


class HallucinationAnalyzer:
    def __init__(self) -> None:
        self.verifier = WikipediaVerifier()

    async def analyze(self, text: str) -> dict:
        normalized = self._normalize_text(text)
        sentences = self._split_sentences(normalized)
        sentence_analyses = [self._analyze_sentence(sentence) for sentence in sentences]

        claims = self._extract_claims(sentence_analyses)
        flagged_items = [item for item in sentence_analyses if item.penalty >= 14]
        flagged_sentences = [self._format_flag(item) for item in flagged_items[:8]]

        verifications = await self.verifier.verify_sentences([item.sentence for item in flagged_items[:4]])
        trust_score = self._calculate_trust_score(sentence_analyses, flagged_items, verifications)
        risk = self._risk_label(trust_score)
        corrections = self._build_corrections(flagged_items[:4], verifications)
        corrected_answer = self._build_corrected_answer(sentences, verifications)

        return {
            "trust_score": trust_score,
            "risk": risk,
            "flagged_sentences": flagged_sentences,
            "extracted_claims": claims[:10],
            "corrections": corrections[:6],
            "corrected_answer": corrected_answer,
            "summary": self._build_summary(trust_score, risk, len(flagged_items), len(claims), len(corrections)),
        }

    def _normalize_text(self, text: str) -> str:
        return re.sub(r"\s+", " ", text.strip())

    def _split_sentences(self, text: str) -> list[str]:
        if not text:
            return []
        return [part.strip() for part in SENTENCE_SPLIT_REGEX.split(text) if part.strip()]

    def _extract_claims(self, sentence_analyses: list[SentenceAnalysis]) -> list[str]:
        claims: list[str] = []
        for item in sentence_analyses:
            sentence = item.sentence
            if len(sentence) < 25:
                continue
            if item.is_claim or sentence.count(",") >= 2:
                claims.append(sentence)
        return claims

    def _analyze_sentence(self, sentence: str) -> SentenceAnalysis:
        penalty = 0.0
        confidence_bonus = 0.0
        reasons: list[str] = []

        has_entity_claim = bool(ENTITY_CLAIM_REGEX.search(sentence))
        has_year = bool(YEAR_REGEX.search(sentence))
        numeric_mentions = NUMBER_REGEX.findall(sentence)
        has_url = bool(URL_REGEX.search(sentence))
        has_speculation = bool(SPECULATIVE_REGEX.search(sentence))
        has_citation_style = bool(CITATION_STYLE_REGEX.search(sentence))

        if ABSOLUTE_REGEX.search(sentence):
            penalty += 14
            reasons.append("absolute wording")
        if WEAK_ATTRIBUTION_REGEX.search(sentence):
            penalty += 12
            reasons.append("weak attribution")
        if has_year:
            penalty += 5
            reasons.append("time-sensitive claim")
        if len(numeric_mentions) >= 2:
            penalty += 8
            reasons.append("dense numeric detail")
        elif len(numeric_mentions) == 1:
            penalty += 4
            reasons.append("numeric claim")
        if len(sentence) > 220:
            penalty += 6
            reasons.append("long compound statement")
        if has_entity_claim and not has_speculation:
            penalty += 10
            reasons.append("confident factual assertion")

        if has_speculation:
            confidence_bonus += 6
        if has_citation_style:
            confidence_bonus += 5
        if has_url:
            confidence_bonus += 7

        is_claim = has_entity_claim or has_year or bool(numeric_mentions)
        return SentenceAnalysis(
            sentence=sentence,
            penalty=penalty,
            confidence_bonus=confidence_bonus,
            reasons=reasons,
            is_claim=is_claim,
        )

    def _calculate_trust_score(
        self,
        sentence_analyses: list[SentenceAnalysis],
        flagged_items: list[SentenceAnalysis],
        verifications: list[dict],
    ) -> int:
        if not sentence_analyses:
            return 0

        average_penalty = sum(item.penalty for item in sentence_analyses) / len(sentence_analyses)
        average_bonus = sum(item.confidence_bonus for item in sentence_analyses) / len(sentence_analyses)
        flagged_density = len(flagged_items) / len(sentence_analyses)
        verified_matches = sum(1 for item in verifications if not item.get("mismatch"))
        verified_mismatches = sum(1 for item in verifications if item.get("mismatch"))
        fully_verified_bonus = 10 if flagged_items and verified_matches == len(flagged_items) and verified_mismatches == 0 else 0

        trust_score = round(
            84
            - (average_penalty * 1.45)
            - (flagged_density * 15)
            + (average_bonus * 2.4)
            + (verified_matches * 26)
            - (verified_mismatches * 18)
            + fully_verified_bonus
        )
        return max(0, min(100, trust_score))

    def _risk_label(self, trust_score: int) -> str:
        if trust_score >= 72:
            return "Low"
        if trust_score >= 44:
            return "Medium"
        return "High"

    def _build_summary(
        self,
        trust_score: int,
        risk: str,
        flagged_count: int,
        claim_count: int,
        correction_count: int,
    ) -> str:
        if flagged_count == 0:
            return f"Low-risk output with no strongly suspicious claims detected. Trust score: {trust_score}."
        return (
            f"{risk}-risk output with {flagged_count} suspicious sentence(s), "
            f"{claim_count} extracted claim(s), and {correction_count} verification note(s). "
            f"Trust score: {trust_score}."
        )

    def _format_flag(self, item: SentenceAnalysis) -> str:
        reason_text = ", ".join(item.reasons[:3])
        return f"{item.sentence} [Flagged: {reason_text}]" if reason_text else item.sentence

    def _build_corrections(self, flagged_items: list[SentenceAnalysis], verifications: list[dict]) -> list[str]:
        corrections: list[str] = []
        verified_by_sentence = {entry["sentence"]: entry for entry in verifications}

        for item in flagged_items:
            verification = verified_by_sentence.get(item.sentence)
            if verification and verification.get("summary"):
                prefix = "Possible mismatch detected" if verification.get("mismatch") else "Verified context"
                corrections.append(
                    f"{prefix} for '{verification['entity']}': {verification['summary']}"
                )
            else:
                corrections.append(self._rewrite_as_cautious_statement(item.sentence))
        return corrections

    def _build_corrected_answer(self, sentences: list[str], verifications: list[dict]) -> str:
        if verifications:
            parts = []
            for entry in verifications[:3]:
                if entry.get("summary"):
                    label = "Verified" if not entry.get("mismatch") else "Check carefully"
                    parts.append(f"{label} - {entry['entity']}: {entry['summary']}")
            if parts:
                return " ".join(parts)

        if not sentences:
            return ""

        safe_sentences = [self._rewrite_as_cautious_statement(sentence) for sentence in sentences[:3]]
        return " ".join(safe_sentences)

    def _rewrite_as_cautious_statement(self, sentence: str) -> str:
        softened = re.sub(ABSOLUTE_REGEX, "often", sentence)
        if not SPECULATIVE_REGEX.search(softened):
            softened = f"This claim should be verified: {softened}"
        return softened
