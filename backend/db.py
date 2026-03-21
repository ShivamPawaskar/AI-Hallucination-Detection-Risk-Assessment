import json
import sqlite3
from pathlib import Path


class AnalysisStore:
    def __init__(self, db_path: str | None = None) -> None:
        root = Path(__file__).resolve().parent
        self.db_path = db_path or str(root / "analysis_history.db")

    def initialize(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT NOT NULL,
                    url TEXT,
                    text TEXT NOT NULL,
                    trust_score INTEGER NOT NULL,
                    risk TEXT NOT NULL,
                    flagged_sentences TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.commit()

    def save_analysis(
        self,
        text: str,
        source: str,
        url: str | None,
        trust_score: int,
        risk: str,
        flagged_sentences: list[str],
    ) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO analyses (source, url, text, trust_score, risk, flagged_sentences)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (source, url, text, trust_score, risk, json.dumps(flagged_sentences)),
            )
            conn.commit()

    def get_recent_analyses(self, limit: int = 10) -> list[dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT id, source, url, text, trust_score, risk, flagged_sentences, created_at
                FROM analyses
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        return [
            {
                "id": row["id"],
                "source": row["source"],
                "url": row["url"],
                "text": row["text"],
                "trust_score": row["trust_score"],
                "risk": row["risk"],
                "flagged_sentences": json.loads(row["flagged_sentences"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]
