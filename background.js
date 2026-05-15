// Pendo Health Check — Background Service Worker
//
// Handles:
//  - Clearing stale badge on navigation (prevents misleading leftover data)
//  - Receiving full-analysis badge updates from popup
//  - Badge preference sync
//  - Tab switching (badge reflects active tab's cached results)
//  - v4.1: Optional proactive checking on every page load
//          (opt-in toggle in the Tools tab; requests <all_urls>
//          host permission at runtime via chrome.permissions.request).

// Cache full-analysis results per tab (set by popup after analysis completes)
var tabResults = {};

// Storage key + restricted URL prefixes used by the proactive checker.
var AUTO_CHECK_KEY = "autoCheckEnabled";
var RESTRICTED_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "chrome-search://",
  "about:",
  "edge://",
  "https://chrome.google.com/webstore"
];

// --- Message listener: popup full-analysis results + preference changes ---
chrome.runtime.onMessage.addListener(function (msg, sender) {
  // Popup sends full analysis results after health check + setup analysis
  if (msg.type === "pendo-badge-update" && msg.tabId) {
    tabResults[msg.tabId] = {
      issues: msg.issues || 0,
      criticals: msg.criticals || 0,
      warnings: msg.warnings || 0,
      source: "popup",
    };
    updateBadge(msg.tabId);
  }

  // Badge preference toggled in popup
  if (msg.type === "badge-pref-changed") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) updateBadge(tabs[0].id);
    });
  }

  // Proactive auto-check toggled in popup. Refresh our listener state so we
  // start (or stop) injecting on tab updates without needing a reload.
  if (msg.type === "auto-check-pref-changed") {
    refreshAutoCheckListener();
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

// ===========================================================================
// v4.1: Proactive auto-check on page load (opt-in)
// ===========================================================================

// Lightweight Pendo detection injected into the page's MAIN world. Returns
// {detected, criticals, warnings, issues}. Intentionally narrower than the
// popup's runPendoHealthCheck — the proactive badge is a fast preview, and
// the popup's full analysis still updates the badge with higher fidelity
// when the user opens it.
function v4AutoCheckProbe() {
  try {
    if (typeof window.pendo === "undefined" || !window.pendo) {
      return { detected: false, criticals: 0, warnings: 0, issues: 0 };
    }
    var criticals = 0, warnings = 0;
    // Ready state
    try {
      var ready = typeof pendo.isReady === "function" && pendo.isReady();
      if (!ready) warnings++;
    } catch (_) { criticals++; }
    // Visitor ID present (anonymous prefixes are intentional, not a problem)
    try {
      var visitor =
        (pendo.getVisitorId && pendo.getVisitorId()) ||
        (pendo.get && pendo.get("visitor") && pendo.get("visitor").id) ||
        pendo.visitorId || null;
      if (!visitor) criticals++;
    } catch (_) { criticals++; }
    // Account ID present
    try {
      var account =
        (pendo.getAccountId && pendo.getAccountId()) ||
        (pendo.get && pendo.get("account") && pendo.get("account").id) ||
        pendo.accountId || null;
      if (!account) warnings++;
    } catch (_) {}
    return { detected: true, criticals: criticals, warnings: warnings, issues: criticals + warnings };
  } catch (e) {
    return { detected: false, criticals: 0, warnings: 0, issues: 0, error: e.message };
  }
}

function isRestrictedUrl(url) {
  if (!url) return true;
  for (var i = 0; i < RESTRICTED_URL_PREFIXES.length; i++) {
    if (url.indexOf(RESTRICTED_URL_PREFIXES[i]) === 0) return true;
  }
  return false;
}

// Bound listener reference so we can add/remove the same function instance.
function autoCheckOnTabUpdate(tabId, changeInfo, tab) {
  if (changeInfo.status !== "complete") return;
  if (!tab || isRestrictedUrl(tab.url)) return;

  // Don't clobber a popup-source result — its fidelity is higher.
  var existing = tabResults[tabId];
  if (existing && existing.source === "popup") return;

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: v4AutoCheckProbe,
    world: "MAIN"
  }).then(function (results) {
    var r = results && results[0] && results[0].result;
    if (!r) return;
    if (!r.detected) {
      // No Pendo on this page → clear any prior auto-check result for this tab.
      if (tabResults[tabId] && tabResults[tabId].source !== "popup") {
        delete tabResults[tabId];
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs[0] && tabs[0].id === tabId) chrome.action.setBadgeText({ text: "" });
        });
      }
      return;
    }
    tabResults[tabId] = {
      issues: r.issues || 0,
      criticals: r.criticals || 0,
      warnings: r.warnings || 0,
      source: "auto",
    };
    updateBadge(tabId);
  }).catch(function () {
    // Silently ignore injection failures (sandboxed iframes, restricted pages,
    // page navigated away mid-injection, etc.). Proactive badge is best-effort.
  });
}

// Check whether auto-check is enabled AND the host permission is currently
// granted. If both true, attach the listener; otherwise detach it.
function refreshAutoCheckListener() {
  chrome.storage.local.get(AUTO_CHECK_KEY, function (stored) {
    var enabled = stored && stored[AUTO_CHECK_KEY] === true;
    chrome.permissions.contains({ origins: ["<all_urls>"] }, function (granted) {
      var hasListener = chrome.tabs.onUpdated.hasListener(autoCheckOnTabUpdate);
      if (enabled && granted) {
        if (!hasListener) chrome.tabs.onUpdated.addListener(autoCheckOnTabUpdate);
      } else {
        if (hasListener) chrome.tabs.onUpdated.removeListener(autoCheckOnTabUpdate);
      }
    });
  });
}

// React to the user revoking the host permission via Chrome's settings.
if (chrome.permissions && chrome.permissions.onRemoved) {
  chrome.permissions.onRemoved.addListener(refreshAutoCheckListener);
}
if (chrome.permissions && chrome.permissions.onAdded) {
  chrome.permissions.onAdded.addListener(refreshAutoCheckListener);
}

// Initial state on service worker startup.
refreshAutoCheckListener();
