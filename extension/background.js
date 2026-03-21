const DEFAULT_SETTINGS = {
  enabled: true,
  backendUrl: "http://localhost:8000/analyze",
  theme: "light"
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(["enabled", "backendUrl", "theme"]);
  await chrome.storage.sync.set({
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_SETTINGS.enabled,
    backendUrl: stored.backendUrl || DEFAULT_SETTINGS.backendUrl,
    theme: stored.theme || DEFAULT_SETTINGS.theme
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ANALYZE_RESPONSE") {
    handleAnalyzeRequest(message, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown analysis error"
        });
      });
    return true;
  }

  if (message?.type === "GET_SETTINGS") {
    chrome.storage.sync.get(["enabled", "backendUrl", "theme"]).then((settings) => {
      sendResponse({
        enabled: typeof settings.enabled === "boolean" ? settings.enabled : DEFAULT_SETTINGS.enabled,
        backendUrl: settings.backendUrl || DEFAULT_SETTINGS.backendUrl,
        theme: settings.theme || DEFAULT_SETTINGS.theme
      });
    });
    return true;
  }

  return false;
});

async function handleAnalyzeRequest(message, sender) {
  const settings = await chrome.storage.sync.get(["enabled", "backendUrl"]);
  const enabled = typeof settings.enabled === "boolean" ? settings.enabled : DEFAULT_SETTINGS.enabled;
  const backendUrl = settings.backendUrl || DEFAULT_SETTINGS.backendUrl;

  if (!enabled) {
    return {
      trust_score: 0,
      risk: "Off",
      flagged_sentences: [],
      extracted_claims: [],
      summary: "Extension is disabled."
    };
  }

  const response = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: message.text,
      source: message.source || sender?.tab?.url || "unknown",
      url: sender?.tab?.url || null
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Backend error ${response.status}: ${body}`);
  }

  return response.json();
}
