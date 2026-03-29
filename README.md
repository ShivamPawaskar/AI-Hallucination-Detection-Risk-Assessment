# Detection and Risk Assessment of Hallucinations in Generative AI Systems........

<p align="center">
  <strong>A browser-assisted trust layer for AI-generated responses.</strong><br/>
  Chrome extension + FastAPI backend for live hallucination-risk scoring, flagged-claim surfacing, and lightweight verification context.
</p>

<p align="center">
  <a href="https://github.com/ShivamPawaskar/AI-Hallucination-Detection-Risk-Assessment">Repository</a> |
  <a href="https://shivampawaskar.github.io/AI-Hallucination-Detection-Risk-Assessment/">Project Site</a> |
  <a href="#workflow">Workflow</a> |
  <a href="#local-setup">Local Setup</a> |
  <a href="#deployment">Deployment</a>
</p>

---

## Why This Project Exists

Generative AI systems can produce fluent, confident, and persuasive answers that are factually wrong. That creates a usability problem and a trust problem: users often see polished output before they see uncertainty.

This project inserts a verification-oriented layer into that experience.

Instead of asking users to manually inspect every answer, it:

- watches supported AI chat interfaces
- extracts the latest assistant response
- analyzes suspicious claims in real time
- assigns a trust score and risk level
- displays flagged sentences and safer follow-up context in an overlay

The result is a lightweight hallucination-risk monitoring system designed for demos, research prototypes, and future production hardening.

---

## What It Does

### Core Capabilities

- Live analysis of AI-generated responses on supported chat platforms
- Floating in-page overlay with trust score, risk label, and flagged sentences
- Heuristic claim detection tuned for low latency
- Verification enrichment using Wikipedia summaries for selected claims
- Local history endpoint for recent analyses
- Configurable backend endpoint through the extension popup

### Supported Platforms

- `chat.openai.com`
- `chatgpt.com`
- `gemini.google.com`
- `claude.ai`
- `www.perplexity.ai`

DOM extraction logic is implemented in [`extension/content.js`](./extension/content.js).

---

## System Snapshot

| Layer | Responsibility | Main Files |
|---|---|---|
| Chrome Extension | Detects responses, sends them for analysis, renders overlay UI | [`extension/content.js`](./extension/content.js), [`extension/background.js`](./extension/background.js), [`extension/popup.js`](./extension/popup.js) |
| FastAPI Backend | Scores text, classifies risk, stores recent history | [`backend/main.py`](./backend/main.py), [`backend/analyzer.py`](./backend/analyzer.py), [`backend/db.py`](./backend/db.py) |
| Verification Layer | Adds evidence context for flagged claims | [`backend/verifier.py`](./backend/verifier.py) |
| Hosting | Public landing page and API deployment config | [`docs/index.html`](./docs/index.html), [`render.yaml`](./render.yaml) |

---

## Workflow

```text
User opens ChatGPT / Gemini / Claude / Perplexity
             |
             v
Extension content script detects latest assistant response
             |
             v
Text is sent to the background service worker
             |
             v
POST /analyze on FastAPI backend
             |
             v
Analyzer scores suspicious claims and assigns trust/risk
             |
             v
Verifier optionally fetches supporting context from Wikipedia
             |
             v
Extension overlay renders score, summary, flagged sentences, and corrections
```

### End-to-End Flow

1. The content script monitors supported chat pages for DOM changes.
2. When a new assistant response appears, the latest message is extracted and normalized.
3. The background worker forwards the payload to the configured backend URL.
4. The backend analyzes the text and returns:
   - `trust_score`
   - `risk`
   - `flagged_sentences`
   - `extracted_claims`
   - `corrections`
   - `corrected_answer`
   - `summary`
5. The extension displays the result as a floating trust panel directly on the page.
6. The backend also stores recent analyses for the popup history view.

---

## How The Detection Works

The backend is intentionally lightweight. It favors speed, explainability, and low operating cost over heavyweight model orchestration.

### Current Heuristics

- absolute wording detection such as overly certain phrasing
- weak attribution detection such as vague references to unnamed sources
- numeric-density checks for specific-looking but potentially unsupported details
- time-sensitive claim detection
- factual assertion pattern matching around named entities
- confidence bonuses for speculative language, citation-style wording, and URLs

### Verification Pass

For a subset of flagged sentences, the backend attempts to:

- extract likely entities
- retrieve a Wikipedia summary
- compare basic numeric and year consistency
- attach a short evidence-oriented correction note

This is not a full fact-checking engine. It is a pragmatic trust-screening layer intended to identify high-risk output and give users a reason to inspect further.

---

## User Experience

### Extension Overlay

The injected overlay presents:

- trust score
- risk level
- short assessment summary
- suspicious sentences
- verified corrections or safer rewrites

### Popup Controls

The extension popup lets the user:

- enable or disable the system
- configure the backend `/analyze` URL
- switch theme
- view recent analysis history from the backend

---

## Repository Structure

```text
.
|-- backend/
|   |-- __init__.py
|   |-- analyzer.py
|   |-- db.py
|   |-- main.py
|   `-- verifier.py
|-- extension/
|   |-- background.js
|   |-- content.js
|   |-- manifest.json
|   |-- popup.html
|   `-- popup.js
|-- docs/
|   `-- index.html
|-- render.yaml
|-- requirements.txt
`-- README.md
```

---

## API Contract

### `GET /health`

Health check endpoint.

### `GET /history?limit=10`

Returns recent analyses stored in SQLite.

### `POST /analyze`

Request body:

```json
{
  "text": "The Eiffel Tower was built in 1890 and is 500 meters tall.",
  "source": "demo",
  "url": "https://example.com"
}
```

Example response shape:

```json
{
  "trust_score": 38,
  "risk": "High",
  "flagged_sentences": [
    "The Eiffel Tower was built in 1890 and is 500 meters tall. [Flagged: time-sensitive claim, dense numeric detail, confident factual assertion]"
  ],
  "extracted_claims": [
    "The Eiffel Tower was built in 1890 and is 500 meters tall."
  ],
  "corrections": [
    "Possible mismatch detected for 'Eiffel Tower': ..."
  ],
  "corrected_answer": "Check carefully - Eiffel Tower: ...",
  "summary": "High-risk output with 1 suspicious sentence(s), 1 extracted claim(s), and 1 verification note(s). Trust score: 38."
}
```

Backend implementation lives in [`backend/main.py`](./backend/main.py).

---

## Local Setup

### 1. Clone the Repository

```powershell
git clone https://github.com/ShivamPawaskar/AI-Hallucination-Detection-Risk-Assessment.git
cd AI-Hallucination-Detection-Risk-Assessment
```

### 2. Create and Activate a Virtual Environment

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 3. Install Dependencies

```powershell
pip install -r requirements.txt
```

### 4. Run the Backend

```powershell
uvicorn backend.main:app --reload
```

Default local endpoints:

- `http://localhost:8000/health`
- `http://localhost:8000/analyze`
- `http://localhost:8000/history`

### 5. Load the Chrome Extension

1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Click `Load unpacked`
4. Select the [`extension`](./extension) folder
5. Open the extension popup and set:

```text
http://localhost:8000/analyze
```

---

## Deployment

### Backend Hosting

This repository includes [`render.yaml`](./render.yaml) for simple deployment on Render.

### Render

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`
- Default hosted SQLite path: `/tmp/analysis_history.db`

Important: `/tmp` storage is ephemeral on many hosted platforms. That means analysis history is suitable for demos, not durable production storage.

### Railway

You can also deploy the backend on Railway using the same start command:

```text
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

### Frontend / Project Site

The public project page is served from [`docs/index.html`](./docs/index.html) using GitHub Pages.

---

## Interactive Demo Path

If you want to demo the project quickly:

1. Deploy the FastAPI backend to Render.
2. Copy the hosted `/analyze` endpoint.
3. Load the extension locally in Chrome.
4. Set the hosted backend URL in the popup.
5. Open ChatGPT, Gemini, Claude, or Perplexity.
6. Ask for factual answers with dates, numbers, or confident claims.
7. Watch the overlay update with trust score, risk, and flagged sentences.

---

## Design Decisions

### Why a Browser Extension?

Because the hallucination risk is most useful where the answer is consumed. Surfacing trust information inside the page is more immediate than sending users to a separate dashboard.

### Why Heuristics Instead of Another LLM?

Because the goal is to keep the pipeline:

- fast
- transparent
- cheap to run
- easy to host
- easy to extend with stronger verification later

### Why Keep History?

Recent analyses help compare outputs across prompts and make the system easier to demonstrate, debug, and evaluate.

---

## Roadmap

- retrieval-backed verification against trusted sources
- domain-specific extraction strategies for each supported platform
- stronger evidence ranking and semantic matching
- persistent database support
- authentication and dashboard views
- Chrome Web Store packaging
- privacy policy and production deployment hardening

---

## Key Files

- API entrypoint: [`backend/main.py`](./backend/main.py)
- heuristic analyzer: [`backend/analyzer.py`](./backend/analyzer.py)
- verification helper: [`backend/verifier.py`](./backend/verifier.py)
- local persistence: [`backend/db.py`](./backend/db.py)
- content extraction and overlay UI: [`extension/content.js`](./extension/content.js)
- background request forwarding: [`extension/background.js`](./extension/background.js)
- popup settings and history view: [`extension/popup.js`](./extension/popup.js)
- extension manifest: [`extension/manifest.json`](./extension/manifest.json)

---

## Notes

- Local SQLite data is excluded from git.
- Python caches and `.venv` are excluded from git.
- The current system is suitable for academic projects, demos, and iterative experimentation.
- No license file is included yet.

---

## Author

**Shivam Pawaskar**

- GitHub: <https://github.com/ShivamPawaskar>

If you want this README to feel even more polished, the next useful upgrade would be adding screenshots or a short architecture diagram image under the workflow section.
