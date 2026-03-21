const SITE_CONFIG = [
  {
    id: "chatgpt",
    hostMatch: "chat.openai.com",
    responseSelectors: [
      "[data-message-author-role='assistant'] .markdown",
      "[data-message-author-role='assistant']"
    ]
  },
  {
    id: "chatgpt",
    hostMatch: "chatgpt.com",
    responseSelectors: [
      "[data-message-author-role='assistant'] .markdown",
      "[data-message-author-role='assistant']",
      "[data-testid^='conversation-turn-'] [data-message-author-role='assistant']"
    ]
  },
  {
    id: "gemini",
    hostMatch: "gemini.google.com",
    responseSelectors: [
      "message-content .markdown",
      "message-content",
      ".model-response-text"
    ]
  },
  {
    id: "claude",
    hostMatch: "claude.ai",
    responseSelectors: [
      "[data-testid='assistant-message']",
      ".font-claude-message"
    ]
  },
  {
    id: "perplexity",
    hostMatch: "www.perplexity.ai",
    responseSelectors: [
      "[data-testid='final-answer']",
      ".prose"
    ]
  }
];

const ANALYZE_DEBOUNCE_MS = 1600;
let overlayRoot = null;
let lastAnalyzedText = "";
let analyzeTimer = null;
let currentSettings = { enabled: true, backendUrl: "http://localhost:8000/analyze", theme: "light" };
let isOverlayMinimized = false;

initialize();

async function initialize() {
  await refreshSettings();
  createOverlay();
  watchStorage();
  watchDom();
  scheduleAnalyze();
}

function getSiteConfig() {
  return SITE_CONFIG.find((config) => window.location.host.includes(config.hostMatch)) || {
    id: "generic",
    hostMatch: window.location.host,
    responseSelectors: ["main", "article", ".markdown", ".prose"]
  };
}

async function refreshSettings() {
  currentSettings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
}

function watchStorage() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    if (changes.enabled) {
      currentSettings.enabled = changes.enabled.newValue;
      renderIdleState();
    }

    if (changes.backendUrl) {
      currentSettings.backendUrl = changes.backendUrl.newValue;
    }

    if (changes.theme) {
      currentSettings.theme = changes.theme.newValue || "light";
      applyOverlayTheme();
    }
  });
}

function watchDom() {
  const observer = new MutationObserver(() => scheduleAnalyze());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function scheduleAnalyze() {
  clearTimeout(analyzeTimer);
  analyzeTimer = window.setTimeout(analyzeLatestResponse, ANALYZE_DEBOUNCE_MS);
}

async function analyzeLatestResponse() {
  if (!currentSettings.enabled) {
    renderIdleState();
    return;
  }

  const extracted = extractLatestResponse();
  if (!extracted?.text || extracted.text === lastAnalyzedText) {
    return;
  }

  lastAnalyzedText = extracted.text;
  renderLoading(extracted.source);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "ANALYZE_RESPONSE",
      text: extracted.text,
      source: extracted.source
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Analysis failed");
    }

    renderResult(response.result);
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Unknown error");
  }
}

function extractLatestResponse() {
  const site = getSiteConfig();
  for (const selector of site.responseSelectors) {
    const nodes = Array.from(document.querySelectorAll(selector))
      .map((node) => ({
        text: normalizeText(node.innerText || node.textContent || "")
      }))
      .filter((item) => item.text.length > 40);

    if (nodes.length > 0) {
      const latest = nodes[nodes.length - 1];
      return {
        source: site.id,
        text: latest.text
      };
    }
  }

  return null;
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function createOverlay() {
  if (overlayRoot) {
    return;
  }

  overlayRoot = document.createElement("div");
  overlayRoot.id = "hallucination-risk-overlay";
  overlayRoot.innerHTML = `
    <div class="hrd-card">
      <div class="hrd-aura"></div>
      <div class="hrd-header">
        <div class="hrd-heading">
          <div class="hrd-badge">Trust Layer</div>
          <div class="hrd-title">AI Trust Monitor</div>
          <div class="hrd-subtitle">Live hallucination screening</div>
        </div>
        <div class="hrd-actions">
          <button class="hrd-control hrd-toggle-size" type="button" aria-label="Minimize panel">-</button>
          <button class="hrd-verify" type="button">Verify</button>
        </div>
      </div>
      <div class="hrd-minibar">
        <div class="hrd-minibar-score">--</div>
        <div class="hrd-minibar-risk">Waiting</div>
      </div>
      <div class="hrd-expanded">
        <div class="hrd-hero">
          <div class="hrd-score-block">
            <span class="hrd-score-label">Trust Score</span>
            <span class="hrd-score-value">--</span>
            <span class="hrd-score-note">Realtime confidence estimate</span>
          </div>
          <div class="hrd-risk-stack">
            <div class="hrd-risk-label">Risk Level</div>
            <div class="hrd-risk-pill">Waiting</div>
          </div>
        </div>
        <div class="hrd-summary-shell">
          <div class="hrd-summary-label">Assessment</div>
          <div class="hrd-summary">No response analyzed yet.</div>
        </div>
        <div class="hrd-answer-shell">
          <div class="hrd-summary-label">Corrected Answer</div>
          <div class="hrd-corrected-answer">Verified or safer rewrites will appear here.</div>
        </div>
        <div class="hrd-flags-header">
          <div class="hrd-flags-title">Suspicious Sentences</div>
          <div class="hrd-flags-count">0 flagged</div>
        </div>
        <div class="hrd-flags"></div>
        <div class="hrd-corrections-header">
          <div class="hrd-flags-title">Verified Corrections</div>
        </div>
        <div class="hrd-corrections"></div>
      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #hallucination-risk-overlay {
      position: fixed;
      top: 22px;
      right: 22px;
      z-index: 2147483647;
      width: min(395px, calc(100vw - 28px));
      color: #132238;
      font-family: Georgia, "Times New Roman", serif;
      transition: transform 0.22s ease, opacity 0.22s ease;
    }
    #hallucination-risk-overlay .hrd-card {
      position: relative;
      overflow: hidden;
      background:
        radial-gradient(circle at top right, rgba(203, 106, 52, 0.12) 0%, transparent 30%),
        linear-gradient(155deg, rgba(255, 255, 255, 0.97) 0%, rgba(240, 247, 255, 0.94) 48%, rgba(233, 242, 250, 0.96) 100%);
      border: 1px solid rgba(19, 34, 56, 0.1);
      border-radius: 26px;
      box-shadow:
        0 28px 64px rgba(9, 19, 35, 0.22),
        inset 0 1px 0 rgba(255, 255, 255, 0.74);
      padding: 18px;
      backdrop-filter: blur(18px);
      transition: border-radius 0.2s ease, box-shadow 0.2s ease, padding 0.2s ease;
    }
    #hallucination-risk-overlay .hrd-aura {
      position: absolute;
      top: -56px;
      right: -42px;
      width: 180px;
      height: 180px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(203, 106, 52, 0.14) 0%, transparent 68%);
      pointer-events: none;
    }
    #hallucination-risk-overlay .hrd-header {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: flex-start;
      position: relative;
      z-index: 1;
    }
    #hallucination-risk-overlay .hrd-heading {
      min-width: 0;
    }
    #hallucination-risk-overlay .hrd-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 11px;
      border-radius: 999px;
      background: rgba(19, 34, 56, 0.06);
      color: #5a7089;
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    #hallucination-risk-overlay .hrd-badge::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4cbf83 0%, #1d704b 100%);
      box-shadow: 0 0 0 4px rgba(76, 191, 131, 0.14);
    }
    #hallucination-risk-overlay .hrd-title {
      margin-top: 12px;
      font-size: 22px;
      letter-spacing: -0.04em;
      font-weight: 700;
    }
    #hallucination-risk-overlay .hrd-subtitle {
      margin-top: 4px;
      color: #617992;
      font-size: 13px;
      line-height: 1.4;
    }
    #hallucination-risk-overlay .hrd-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #hallucination-risk-overlay .hrd-control {
      border: 0;
      width: 34px;
      height: 34px;
      border-radius: 999px;
      background: rgba(19, 34, 56, 0.08);
      color: #1a314a;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
    }
    #hallucination-risk-overlay .hrd-verify {
      border: 0;
      border-radius: 999px;
      background: linear-gradient(135deg, #cb6a34 0%, #90431d 100%);
      color: #fff;
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 12px 24px rgba(144, 67, 29, 0.24);
    }
    #hallucination-risk-overlay .hrd-minibar {
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 12px;
      position: relative;
      z-index: 1;
    }
    #hallucination-risk-overlay .hrd-minibar-score {
      font-size: 30px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: -0.06em;
    }
    #hallucination-risk-overlay .hrd-minibar-risk {
      padding: 8px 10px;
      border-radius: 999px;
      background: #d7e3ef;
      color: #334b65;
      font-size: 12px;
      font-weight: 700;
    }
    #hallucination-risk-overlay .hrd-expanded {
      display: block;
      max-height: min(76vh, 720px);
      overflow-y: auto;
      padding-right: 4px;
    }
    #hallucination-risk-overlay .hrd-hero {
      display: flex;
      justify-content: space-between;
      align-items: stretch;
      margin-top: 18px;
      gap: 12px;
      position: relative;
      z-index: 1;
    }
    #hallucination-risk-overlay .hrd-score-block,
    #hallucination-risk-overlay .hrd-risk-stack {
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.68);
      border: 1px solid rgba(19, 34, 56, 0.08);
    }
    #hallucination-risk-overlay .hrd-score-block {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 5px;
      flex: 1 1 auto;
      padding: 15px 16px;
    }
    #hallucination-risk-overlay .hrd-score-label,
    #hallucination-risk-overlay .hrd-risk-label,
    #hallucination-risk-overlay .hrd-summary-label,
    #hallucination-risk-overlay .hrd-flags-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #5b6f86;
      font-weight: 700;
    }
    #hallucination-risk-overlay .hrd-score-value {
      font-size: 42px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: -0.06em;
    }
    #hallucination-risk-overlay .hrd-score-note {
      font-size: 12px;
      color: #6b8199;
    }
    #hallucination-risk-overlay .hrd-risk-stack {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 8px;
      min-width: 112px;
      padding: 15px 14px;
    }
    #hallucination-risk-overlay .hrd-risk-pill {
      border-radius: 999px;
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 700;
      background: #d7e3ef;
      color: #334b65;
      text-align: center;
    }
    #hallucination-risk-overlay .hrd-summary-shell,
    #hallucination-risk-overlay .hrd-answer-shell {
      margin-top: 14px;
      padding: 14px 15px;
      border-radius: 18px;
      position: relative;
      z-index: 1;
    }
    #hallucination-risk-overlay .hrd-summary-shell {
      background: rgba(255, 255, 255, 0.64);
      border: 1px solid rgba(19, 34, 56, 0.08);
    }
    #hallucination-risk-overlay .hrd-answer-shell {
      margin-top: 12px;
      background: rgba(240, 247, 236, 0.86);
      border: 1px solid rgba(30, 98, 61, 0.12);
    }
    #hallucination-risk-overlay .hrd-summary,
    #hallucination-risk-overlay .hrd-corrected-answer {
      margin-top: 8px;
      font-size: 13px;
      line-height: 1.58;
    }
    #hallucination-risk-overlay .hrd-summary {
      color: #27405c;
    }
    #hallucination-risk-overlay .hrd-corrected-answer {
      color: #234734;
    }
    #hallucination-risk-overlay .hrd-flags-header,
    #hallucination-risk-overlay .hrd-corrections-header {
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      position: relative;
      z-index: 1;
    }
    #hallucination-risk-overlay .hrd-flags-count {
      font-size: 12px;
      color: #607992;
    }
    #hallucination-risk-overlay .hrd-flags,
    #hallucination-risk-overlay .hrd-corrections {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 180px;
      overflow: auto;
      position: relative;
      z-index: 1;
    }
    #hallucination-risk-overlay .hrd-flag,
    #hallucination-risk-overlay .hrd-correction {
      border-radius: 14px;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.55;
    }
    #hallucination-risk-overlay .hrd-flag {
      border-left: 4px solid #d86a33;
      background: rgba(255, 255, 255, 0.78);
      color: #2b4560;
    }
    #hallucination-risk-overlay .hrd-correction {
      border-left: 4px solid #2f8a58;
      background: rgba(236, 248, 240, 0.94);
      color: #244936;
    }
    #hallucination-risk-overlay .hrd-flags::-webkit-scrollbar,
    #hallucination-risk-overlay .hrd-corrections::-webkit-scrollbar,
    #hallucination-risk-overlay .hrd-expanded::-webkit-scrollbar {
      width: 8px;
    }
    #hallucination-risk-overlay .hrd-flags::-webkit-scrollbar-thumb,
    #hallucination-risk-overlay .hrd-corrections::-webkit-scrollbar-thumb,
    #hallucination-risk-overlay .hrd-expanded::-webkit-scrollbar-thumb {
      background: rgba(91, 111, 134, 0.28);
      border-radius: 999px;
    }
    #hallucination-risk-overlay.hrd-minimized {
      width: min(250px, calc(100vw - 28px));
    }
    #hallucination-risk-overlay.hrd-minimized .hrd-card {
      padding: 16px;
      border-radius: 22px;
      box-shadow: 0 18px 42px rgba(9, 19, 35, 0.18);
    }
    #hallucination-risk-overlay.hrd-minimized .hrd-badge,
    #hallucination-risk-overlay.hrd-minimized .hrd-subtitle,
    #hallucination-risk-overlay.hrd-minimized .hrd-verify,
    #hallucination-risk-overlay.hrd-minimized .hrd-expanded {
      display: none;
    }
    #hallucination-risk-overlay.hrd-minimized .hrd-title {
      margin-top: 0;
      font-size: 18px;
    }
    #hallucination-risk-overlay.hrd-minimized .hrd-minibar {
      display: flex;
    }
    #hallucination-risk-overlay.hrd-theme-dark {
      color: #e9f1fb;
    }
    #hallucination-risk-overlay.hrd-theme-dark .hrd-card {
      background:
        radial-gradient(circle at top right, rgba(203, 106, 52, 0.14) 0%, transparent 30%),
        linear-gradient(155deg, rgba(10, 20, 33, 0.97) 0%, rgba(16, 30, 48, 0.96) 48%, rgba(9, 18, 31, 0.98) 100%);
      border-color: rgba(143, 167, 193, 0.16);
      box-shadow:
        0 28px 64px rgba(0, 0, 0, 0.36),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }
    #hallucination-risk-overlay.hrd-theme-dark .hrd-badge,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-control,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-score-block,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-risk-stack,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-summary-shell,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-flag,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-minibar-risk {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(143, 167, 193, 0.12);
      color: #e9f1fb;
    }
    #hallucination-risk-overlay.hrd-theme-dark .hrd-answer-shell,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-correction {
      background: rgba(24, 52, 38, 0.56);
      border-color: rgba(80, 152, 109, 0.16);
      color: #d9f1e1;
    }
    #hallucination-risk-overlay.hrd-theme-dark .hrd-subtitle,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-score-note,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-flags-count,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-summary,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-corrected-answer,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-score-label,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-risk-label,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-summary-label,
    #hallucination-risk-overlay.hrd-theme-dark .hrd-flags-title {
      color: #9bb0c7;
    }
    @media (max-width: 680px) {
      #hallucination-risk-overlay {
        top: auto;
        right: 14px;
        left: 14px;
        bottom: 14px;
        width: auto;
      }
      #hallucination-risk-overlay .hrd-hero {
        flex-direction: column;
      }
      #hallucination-risk-overlay .hrd-header {
        align-items: stretch;
      }
    }
  `;

  document.documentElement.appendChild(style);
  document.documentElement.appendChild(overlayRoot);

  overlayRoot.querySelector(".hrd-verify")?.addEventListener("click", () => {
    lastAnalyzedText = "";
    scheduleAnalyze();
  });
  overlayRoot.querySelector(".hrd-toggle-size")?.addEventListener("click", toggleOverlaySize);

  applyOverlayTheme();
  renderIdleState();
}

function toggleOverlaySize() {
  isOverlayMinimized = !isOverlayMinimized;
  overlayRoot.classList.toggle("hrd-minimized", isOverlayMinimized);
  const toggleButton = overlayRoot.querySelector(".hrd-toggle-size");
  toggleButton.textContent = isOverlayMinimized ? "+" : "-";
  toggleButton.setAttribute("aria-label", isOverlayMinimized ? "Maximize panel" : "Minimize panel");
}

function applyOverlayTheme() {
  if (!overlayRoot) {
    return;
  }
  overlayRoot.classList.toggle("hrd-theme-dark", currentSettings.theme === "dark");
}

function renderIdleState() {
  if (!overlayRoot) {
    return;
  }

  const scoreEl = overlayRoot.querySelector(".hrd-score-value");
  const minibarScoreEl = overlayRoot.querySelector(".hrd-minibar-score");
  const riskEl = overlayRoot.querySelector(".hrd-risk-pill");
  const minibarRiskEl = overlayRoot.querySelector(".hrd-minibar-risk");
  const summaryEl = overlayRoot.querySelector(".hrd-summary");
  const correctedAnswerEl = overlayRoot.querySelector(".hrd-corrected-answer");
  const flagsEl = overlayRoot.querySelector(".hrd-flags");
  const correctionsEl = overlayRoot.querySelector(".hrd-corrections");
  const flagCountEl = overlayRoot.querySelector(".hrd-flags-count");

  scoreEl.textContent = currentSettings.enabled ? "--" : "OFF";
  minibarScoreEl.textContent = currentSettings.enabled ? "--" : "OFF";
  riskEl.textContent = currentSettings.enabled ? "Waiting" : "Disabled";
  minibarRiskEl.textContent = currentSettings.enabled ? "Waiting" : "Disabled";
  riskEl.style.background = currentSettings.enabled ? "#d7e3ef" : "#dcdcdc";
  riskEl.style.color = currentSettings.enabled ? "#334b65" : "#4c4c4c";
  minibarRiskEl.style.background = currentSettings.enabled ? "#d7e3ef" : "#dcdcdc";
  minibarRiskEl.style.color = currentSettings.enabled ? "#334b65" : "#4c4c4c";
  summaryEl.textContent = currentSettings.enabled
    ? "Monitoring the latest AI response on this page."
    : "Enable the extension from the popup to resume analysis.";
  correctedAnswerEl.textContent = currentSettings.enabled
    ? "Verified or safer rewrites will appear here."
    : "Analysis is paused while the extension is disabled.";
  flagsEl.innerHTML = "";
  correctionsEl.innerHTML = "";
  flagCountEl.textContent = "0 flagged";
}

function renderLoading(source) {
  overlayRoot.querySelector(".hrd-summary").textContent = `Analyzing latest ${source} response...`;
  overlayRoot.querySelector(".hrd-corrected-answer").textContent = "Building a safer verified answer...";
  overlayRoot.querySelector(".hrd-flags-count").textContent = "Scanning";
}

function renderResult(result) {
  const scoreEl = overlayRoot.querySelector(".hrd-score-value");
  const minibarScoreEl = overlayRoot.querySelector(".hrd-minibar-score");
  const riskEl = overlayRoot.querySelector(".hrd-risk-pill");
  const minibarRiskEl = overlayRoot.querySelector(".hrd-minibar-risk");
  const summaryEl = overlayRoot.querySelector(".hrd-summary");
  const correctedAnswerEl = overlayRoot.querySelector(".hrd-corrected-answer");
  const flagsEl = overlayRoot.querySelector(".hrd-flags");
  const correctionsEl = overlayRoot.querySelector(".hrd-corrections");
  const flagCountEl = overlayRoot.querySelector(".hrd-flags-count");

  scoreEl.textContent = String(result.trust_score);
  minibarScoreEl.textContent = String(result.trust_score);
  riskEl.textContent = result.risk;
  minibarRiskEl.textContent = result.risk;
  summaryEl.textContent = result.summary;
  correctedAnswerEl.textContent = result.corrected_answer || "No corrected answer available.";

  const palette = getRiskPalette(result.risk);
  riskEl.style.background = palette.background;
  riskEl.style.color = palette.foreground;
  minibarRiskEl.style.background = palette.background;
  minibarRiskEl.style.color = palette.foreground;

  flagsEl.innerHTML = "";
  correctionsEl.innerHTML = "";
  flagCountEl.textContent = `${result.flagged_sentences?.length || 0} flagged`;

  if (!result.flagged_sentences?.length) {
    const item = document.createElement("div");
    item.className = "hrd-flag";
    item.style.borderLeftColor = "#2e8b57";
    item.style.background = "rgba(224, 245, 232, 0.9)";
    item.textContent = "No strongly suspicious sentences were flagged.";
    flagsEl.appendChild(item);
  } else {
    for (const sentence of result.flagged_sentences) {
      const item = document.createElement("div");
      item.className = "hrd-flag";
      item.textContent = sentence;
      flagsEl.appendChild(item);
    }
  }

  if (!result.corrections?.length) {
    const item = document.createElement("div");
    item.className = "hrd-correction";
    item.textContent = "No verified correction was generated for this response.";
    correctionsEl.appendChild(item);
    return;
  }

  for (const correction of result.corrections) {
    const item = document.createElement("div");
    item.className = "hrd-correction";
    item.textContent = correction;
    correctionsEl.appendChild(item);
  }
}

function renderError(message) {
  const riskEl = overlayRoot.querySelector(".hrd-risk-pill");
  const minibarScoreEl = overlayRoot.querySelector(".hrd-minibar-score");
  const minibarRiskEl = overlayRoot.querySelector(".hrd-minibar-risk");
  const summaryEl = overlayRoot.querySelector(".hrd-summary");
  const correctedAnswerEl = overlayRoot.querySelector(".hrd-corrected-answer");
  const flagsEl = overlayRoot.querySelector(".hrd-flags");
  const correctionsEl = overlayRoot.querySelector(".hrd-corrections");
  const flagCountEl = overlayRoot.querySelector(".hrd-flags-count");

  riskEl.textContent = "Error";
  minibarScoreEl.textContent = "!";
  minibarRiskEl.textContent = "Error";
  riskEl.style.background = "#f7d6d6";
  riskEl.style.color = "#822727";
  minibarRiskEl.style.background = "#f7d6d6";
  minibarRiskEl.style.color = "#822727";
  summaryEl.textContent = "Backend request failed.";
  correctedAnswerEl.textContent = "No corrected answer could be produced because verification failed.";
  flagCountEl.textContent = "Request failed";
  flagsEl.innerHTML = `<div class="hrd-flag">${message}</div>`;
  correctionsEl.innerHTML = "";
}

function getRiskPalette(risk) {
  switch (risk) {
    case "Low":
      return { background: "#d8f1df", foreground: "#1d6b3d" };
    case "Medium":
      return { background: "#ffedc8", foreground: "#8b5a00" };
    case "High":
      return { background: "#ffd9d3", foreground: "#9a2f20" };
    default:
      return { background: "#d7e3ef", foreground: "#334b65" };
  }
}
