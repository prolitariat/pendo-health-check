// Pendo Health Check — Background Service Worker
//
// Handles:
//  - Badge updates from content script probes
//  - Tab switching (badge reflects active tab's Pendo status)
//  - Badge preference sync
//  - Full-analysis overrides from popup

// Cache probe results per tab
var tabResults = {};

// --- Message listener: probes + popup overrides ---
chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (msg.type === "pendo-probe" && sender.tab) {
    tabResults[sender.tab.id] = msg.data;
    // Only update badge if this is the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0] && tabs[0].id === sender.tab.id) {
        updateBadge(sender.tab.id);
      }
    });
  }

  // Popup sends full analysis results — overrides probe's basic count
  if (msg.type === "pendo-badge-update" && msg.tabId) {
    tabResults[msg.tabId] = {
      hasPendo: true,
      issues: msg.issues,
      criticals: msg.criticals || 0,
      warnings: msg.warnings || 0,
    };
    updateBadge(msg.tabId);
  }

  // Badge preference changed from popup toggle
  if (msg.type === "badge-pref-changed") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) updateBadge(tabs[0].id);
    });
  }
});

// --- Tab lifecycle ---
chrome.tabs.onActivated.addListener(function (activeInfo) {
  updateBadge(activeInfo.tabId);
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  delete tabResults[tabId];
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.status === "loading") {
    delete tabResults[tabId];
    // Clear badge immediately on navigation so stale data doesn't linger
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0] && tabs[0].id === tabId) {
        chrome.action.setBadgeText({ text: "" });
      }
    });
  }
});

// --- Badge rendering ---
function updateBadge(tabId) {
  chrome.storage.local.get("badgeEnabled", function (result) {
    if (result.badgeEnabled === false) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }

    var data = tabResults[tabId];
    if (!data || !data.hasPendo) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }

    if (data.issues > 0) {
      chrome.action.setBadgeText({ text: String(data.issues) });
      chrome.action.setBadgeBackgroundColor({
        color: data.criticals > 0 ? "#FF6B6B" : "#FEF484",
      });
      chrome.action.setBadgeTextColor({ color: "#000000" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  });
}
