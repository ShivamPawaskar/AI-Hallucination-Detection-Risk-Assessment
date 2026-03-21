import re
from urllib.parse import quote

import httpx


ENTITY_REGEX = re.compile(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b")
YEAR_REGEX = re.compile(r"\b(?:19|20)\d{2}\b")
NUMBER_REGEX = re.compile(r"\b\d+(?:\.\d+)?%?\b")


class WikipediaVerifier:
    def __init__(self) -> None:
        self.summary_url = "https://en.wikipedia.org/api/rest_v1/page/summary/"
        self.headers = {
            "User-Agent": "AITrustMonitor/1.0 (educational-project; contact: local-dev)"
        }

    async def verify_sentences(self, sentences: list[str]) -> list[dict]:
        results: list[dict] = []
        async with httpx.AsyncClient(
            timeout=5.0,
            follow_redirects=True,
            headers=self.headers,
        ) as client:
            for sentence in sentences:
                result = await self._verify_sentence(client, sentence)
                if result:
                    results.append(result)
        return results

    async def _verify_sentence(self, client: httpx.AsyncClient, sentence: str) -> dict | None:
        entities = self._extract_entities(sentence)
        for entity in entities[:3]:
            summary = await self._fetch_summary(client, entity)
            if not summary and entity.lower().startswith("the "):
                summary = await self._fetch_summary(client, entity[4:])
            if not summary:
                continue

            return {
                "sentence": sentence,
                "entity": summary["title"],
                "summary": summary["summary"],
                "source_url": summary["source_url"],
                "mismatch": self._has_numeric_mismatch(sentence, summary["summary"]),
            }
        return None

    def _extract_entities(self, sentence: str) -> list[str]:
        matches = ENTITY_REGEX.findall(sentence)
        deduped: list[str] = []
        for match in matches:
            if match not in deduped and len(match) > 2:
                deduped.append(match)
        return deduped

    async def _fetch_summary(self, client: httpx.AsyncClient, title: str) -> dict | None:
        response = await client.get(f"{self.summary_url}{quote(title)}")
        if response.status_code != 200:
            return None

        data = response.json()
        extract = data.get("extract")
        if not extract:
            return None

        return {
            "title": data.get("title", title),
            "summary": extract,
            "source_url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
        }

    def _has_numeric_mismatch(self, sentence: str, summary: str) -> bool:
        sentence_years = set(YEAR_REGEX.findall(sentence))
        summary_years = set(YEAR_REGEX.findall(summary))
        if sentence_years and summary_years and sentence_years.isdisjoint(summary_years):
            return True

        sentence_numbers = set(NUMBER_REGEX.findall(sentence))
        summary_numbers = set(NUMBER_REGEX.findall(summary))
        if sentence_numbers and summary_numbers and sentence_numbers.isdisjoint(summary_numbers):
            return True

        return False
