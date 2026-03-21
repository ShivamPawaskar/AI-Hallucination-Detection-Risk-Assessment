from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.analyzer import HallucinationAnalyzer
from backend.db import AnalysisStore


class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50000)
    source: str | None = Field(default="unknown", max_length=255)
    url: str | None = Field(default=None, max_length=2048)


class AnalyzeResponse(BaseModel):
    trust_score: int
    risk: str
    flagged_sentences: list[str]
    extracted_claims: list[str]
    corrections: list[str]
    corrected_answer: str
    summary: str


class HistoryRecord(BaseModel):
    id: int
    source: str
    url: str | None
    text: str
    trust_score: int
    risk: str
    flagged_sentences: list[str]
    created_at: str


store = AnalysisStore()
analyzer = HallucinationAnalyzer()


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.initialize()
    yield


app = FastAPI(
    title="Hallucination Detection API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/history", response_model=list[HistoryRecord])
async def history(limit: int = 10) -> list[HistoryRecord]:
    safe_limit = max(1, min(limit, 50))
    return [HistoryRecord(**row) for row in store.get_recent_analyses(limit=safe_limit)]


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    result = await analyzer.analyze(payload.text)
    store.save_analysis(
        text=payload.text,
        source=payload.source or "unknown",
        url=payload.url,
        trust_score=result["trust_score"],
        risk=result["risk"],
        flagged_sentences=result["flagged_sentences"],
    )
    return AnalyzeResponse(**result)
