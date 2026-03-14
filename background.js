// Pendo Health Check — Background Service Worker
//
// Handles:
//  - Clearing stale badge on navigation (prevents misleading leftover data)
//  - Receiving full-analysis badge updates from popup
//  - Badge preference sync
//  - Tab switching (badge reflects active tab's cached results)

// Cache full-analysis results per tab (set by popup after analysis completes)
var tabResults = {};

// --- Message listener: popup full-analysis results + preference changes ---
chrome.runtime.onMessage.addListener(function (msg, sender) {
  // Popup sends full analysis results after health check + setup analysis
  if (msg.type === "pendo-badge-update" && msg.tabId) {
    tabResults[msg.tabId] = {
      issues: msg.issues || 0,
      criticals: msg.criticals || 0,
      warnings: msg.warnings || 0,
    };
    updateBadge(msg.tabId);
  }

  // Badge preference toggled in popup
  if (msg.type === "badge-pref-changed") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) updateBadge(tabs[0].id);
    });
  }
});

// --- Clear badge when tab navigates to a new page ---
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.status === "loading") {
    // Page is navigating — cached results are stale
    delete tabResults[tabId];
    // Clear badge if this is the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0] && tabs[0].id === tabId) {
        chrome.action.setBadgeText({ text: "" });
      }
    });
  }
});

// --- Show correct badge when switching tabs ---
chrome.tabs.onActivated.addListener(function (activeInfo) {
  updateBadge(activeInfo.tabId);
});

// --- Clean up when tab closes ---
chrome.tabs.onRemoved.addListener(function (tabId) {
  delete tabResults[tabId];
});

// --- Badge rendering ---
function updateBadge(tabId) {
  chrome.storage.local.get("badgeEnabled", function (result) {
    if (result.badgeEnabled === false) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }

    var data = tabResults[tabId];
    if (!data || data.issues === 0) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }

    chrome.action.setBadgeText({ text: String(data.issues) });
    chrome.action.setBadgeBackgroundColor({
      color: data.criticals > 0 ? "#FF6B6B" : "#FEF484",
    });
    chrome.action.setBadgeTextColor({ color: "#000000" });
  });
}
