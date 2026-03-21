# Detection and Risk Assessment of Hallucinations in Generative AI Systems

Browser-based system for detecting potentially hallucinated claims in AI-generated responses. The project combines a Chrome extension with a FastAPI backend to score responses, flag suspicious sentences, and present a trust-oriented overlay directly on supported AI chat interfaces.

## Overview

This repository contains two connected parts:

- A Chrome extension that runs on supported AI chat websites, extracts the latest assistant response, and triggers analysis.
- A FastAPI backend that performs lightweight heuristic hallucination assessment and returns a trust score, risk level, flagged sentences, extracted claims, and summary output.

The current design is intentionally local-first and cost-efficient. It avoids external model calls in the default path, which keeps latency low and makes the system easy to demo, extend, and deploy.

## Features

- Real-time hallucination risk analysis on AI chat responses
- Floating trust-score overlay injected into supported sites
- Sentence-level flagging for suspicious claims
- FastAPI backend with `/health`, `/analyze`, and `/history` endpoints
- Local SQLite storage for recent analyses
- Popup-based extension controls for backend configuration and manual verification

## Supported Sites

- `https://chat.openai.com/*`
- `https://chatgpt.com/*`
- `https://gemini.google.com/*`
- `https://claude.ai/*`
- `https://www.perplexity.ai/*`

Site extraction logic lives in [`extension/content.js`](./extension/content.js).

## Architecture

1. A user opens a supported AI chat interface.
2. The extension content script detects the latest assistant response.
3. The extension sends the extracted text to the background service worker.
4. The background script forwards the payload to the backend `/analyze` endpoint.
5. The backend evaluates the text and returns a trust score, risk label, summary, and flagged sentences.
6. The content script renders a floating risk overlay on the page.

## Repository Structure

```text
.
|-- backend/
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
|-- requirements.txt
`-- README.md
```

## Backend Setup

### 1. Create a virtual environment

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 2. Install dependencies

```powershell
pip install -r requirements.txt
```

### 3. Start the API

```powershell
uvicorn backend.main:app --reload
```

Default local endpoints:

- `http://localhost:8000/health`
- `http://localhost:8000/analyze`
- `http://localhost:8000/history`

## API Example

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/analyze" `
  -ContentType "application/json" `
  -Body '{"text":"The Eiffel Tower was built in 1890 and is 500 meters tall.","source":"demo"}'
```

## Extension Setup

### 1. Open Chrome extensions

Navigate to `chrome://extensions/`.

### 2. Enable Developer Mode

Turn on Developer Mode in the top-right corner.

### 3. Load the extension

Select `Load unpacked` and choose the [`extension`](./extension) directory.

### 4. Configure the backend endpoint

Open the extension popup and set the backend URL to:

```text
http://localhost:8000/analyze
```

If you deploy the backend, replace it with your hosted `/analyze` URL.

## Detection Strategy

The backend currently uses heuristic analysis designed for low-latency response scoring:

- sentence-level claim extraction
- suspicious phrasing and overconfidence detection
- numeric-density checks
- time-sensitive factual claim detection
- trust-score normalization into a `0-100` scale
- risk classification into `Low`, `Medium`, and `High`

This provides a practical baseline for browser-side verification workflows without depending on paid external APIs.

## Deployment

### Render

- This repository now includes [`render.yaml`](./render.yaml) for one-click deployment.
- Render can deploy the backend directly from GitHub using:
  - Build command: `pip install -r requirements.txt`
  - Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
  - Health check: `/health`
- The hosted service should expose:
  - `/health`
  - `/analyze`
  - `/history`
- The deployment config sets `ANALYSIS_DB_PATH=/tmp/analysis_history.db` by default. This is suitable for demos, but history will be ephemeral unless you attach persistent storage.

### Railway

- Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

The extension manifest already allows common hosted backend patterns including Render and Railway.

## Hosting Strategy

This project has two different hosting/distribution surfaces:

- Backend API: deploy to Render or Railway as a Python web service.
- Browser extension: load unpacked in Chrome for demos, or publish separately through the Chrome Web Store.

If you want a public project landing page, this repository also includes [`docs/index.html`](./docs/index.html), which can be published with GitHub Pages from the `docs/` folder on the `main` branch.

## Roadmap

- Add retrieval-backed verification against trusted sources
- Integrate semantic similarity or evidence ranking
- Improve domain-specific extraction strategies per AI platform
- Add authentication and hosted analysis dashboards
- Prepare Chrome Web Store assets and privacy documentation

## Key Files

- Backend entrypoint: [`backend/main.py`](./backend/main.py)
- Core analysis logic: [`backend/analyzer.py`](./backend/analyzer.py)
- Local persistence layer: [`backend/db.py`](./backend/db.py)
- Extension manifest: [`extension/manifest.json`](./extension/manifest.json)
- DOM extraction and overlay logic: [`extension/content.js`](./extension/content.js)
- Extension service worker: [`extension/background.js`](./extension/background.js)

## Notes

- Local analysis history is stored in SQLite and excluded from git.
- Python cache files and virtual environment files are excluded from git.
- This repository is suitable for academic demos, prototyping, and future production hardening.

## License

No license file is currently included. Add one before reuse or redistribution if needed.
