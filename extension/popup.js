const enabledToggle = document.getElementById("enabledToggle");
const backendUrlInput = document.getElementById("backendUrl");
const saveBtn = document.getElementById("saveBtn");
const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");
const themeToggle = document.getElementById("themeToggle");
const historyListEl = document.getElementById("historyList");
const historyCountEl = document.getElementById("historyCount");
const statusEl = document.getElementById("status");
const liveTabBtn = document.getElementById("liveTabBtn");
const historyTabBtn = document.getElementById("historyTabBtn");
const livePanel = document.getElementById("livePanel");
const historyPanel = document.getElementById("historyPanel");
let historyRefreshTimer = null;

initializePopup();

async function initializePopup() {
  const settings = await chrome.storage.sync.get(["enabled", "backendUrl", "theme"]);
  enabledToggle.checked = typeof settings.enabled === "boolean" ? settings.enabled : true;
  backendUrlInput.value = settings.backendUrl || "http://localhost:8000/analyze";
  themeToggle.checked = (settings.theme || "light") === "dark";
  applyTheme(themeToggle.checked ? "dark" : "light");
  setActiveTab("live");
  await loadHistory();
  historyRefreshTimer = window.setInterval(() => {
    if (historyPanel.classList.contains("active")) {
      loadHistory();
    }
  }, 12000);
}

saveBtn.addEventListener("click", async () => {
  const backendUrl = backendUrlInput.value.trim();

  if (!backendUrl) {
    statusEl.textContent = "Backend URL is required.";
    statusEl.style.color = "#9d431c";
    return;
  }

  await chrome.storage.sync.set({
    enabled: enabledToggle.checked,
    backendUrl,
    theme: themeToggle.checked ? "dark" : "light"
  });

  statusEl.textContent = "Settings saved.";
  statusEl.style.color = "#1c6a45";
  await loadHistory();
  window.setTimeout(() => {
    statusEl.textContent = "";
    statusEl.style.color = "#607892";
  }, 1800);
});

refreshHistoryBtn.addEventListener("click", async () => {
  await loadHistory();
});

themeToggle.addEventListener("change", () => {
  applyTheme(themeToggle.checked ? "dark" : "light");
});

liveTabBtn.addEventListener("click", () => {
  setActiveTab("live");
});

historyTabBtn.addEventListener("click", async () => {
  setActiveTab("history");
  await loadHistory();
});

async function loadHistory() {
  const backendUrl = backendUrlInput.value.trim() || "http://127.0.0.1:8000/analyze";
  const historyUrl = backendUrl.replace(/\/analyze\/?$/, "/history?limit=10");

  historyListEl.innerHTML = `<div class="history-empty">Loading recent analyses...</div>`;

  try {
    const response = await fetch(historyUrl);
    if (!response.ok) {
      throw new Error(`History request failed with ${response.status}`);
    }

    const records = await response.json();
    historyCountEl.textContent = String(records.length);

    if (!records.length) {
      historyListEl.innerHTML = `<div class="history-empty">No saved records yet. Analyze a few responses first.</div>`;
      return;
    }

    historyListEl.innerHTML = "";
    for (const record of records) {
      const item = document.createElement("div");
      item.className = "history-item";
      item.innerHTML = `
        <div class="history-top">
          <div class="history-source">${escapeHtml(record.source || "unknown")}</div>
          <div class="risk-badge" style="${badgeStyle(record.risk)}">${escapeHtml(record.risk)}</div>
        </div>
        <div class="history-score">Trust score: ${record.trust_score} | ${escapeHtml(record.created_at)}</div>
        <div class="history-text">${escapeHtml(truncateText(record.text, 150))}</div>
      `;
      historyListEl.appendChild(item);
    }
  } catch (error) {
    historyCountEl.textContent = "0";
    historyListEl.innerHTML = `<div class="history-empty">${escapeHtml(error instanceof Error ? error.message : "Failed to load history.")}</div>`;
  }
}

function badgeStyle(risk) {
  switch (risk) {
    case "Low":
      return "background:#d8f1df;color:#1d6b3d;";
    case "Medium":
      return "background:#ffedc8;color:#8b5a00;";
    case "High":
      return "background:#ffd9d3;color:#9a2f20;";
    default:
      return "background:#d7e3ef;color:#334b65;";
  }
}

function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text || "";
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setActiveTab(tabName) {
  const showLive = tabName === "live";
  liveTabBtn.classList.toggle("active", showLive);
  historyTabBtn.classList.toggle("active", !showLive);
  livePanel.classList.toggle("active", showLive);
  historyPanel.classList.toggle("active", !showLive);
}

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
}
