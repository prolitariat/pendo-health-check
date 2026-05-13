const STATUS_ICONS = { pass: "✅", warn: "⚠️", fail: "❌", info: "ℹ️" };

// ---------------------------------------------------------------------------
// Badge preference — stored in chrome.storage.local
// Canvas-rendered icon overlay for pixel-perfect badge positioning
// ---------------------------------------------------------------------------
var badgeEnabled = true; // default on
function applyBadge() {
  var count = window.__lastTotalIssues || 0;
  var crits = window.__lastCriticals || 0;
  var warns = window.__lastWarnings || 0;
  // Let background handle badge rendering — send full analysis results
  // Catch silently: service worker may not be awake yet (MV3 lazy lifecycle)
  chrome.runtime.sendMessage({
    type: "pendo-badge-update",
    tabId: currentTabId,
    issues: count,
    criticals: crits,
    warnings: warns,
  }).catch(function() {});
}

// Load preference and wire toggle
chrome.storage.local.get("badgeEnabled", function(result) {
  if (result.badgeEnabled === false) badgeEnabled = false;
  var checkbox = document.getElementById("badge-enabled");
  if (checkbox) {
    checkbox.checked = badgeEnabled;
    checkbox.addEventListener("change", function() {
      badgeEnabled = checkbox.checked;
      chrome.storage.local.set({ badgeEnabled: badgeEnabled });
      chrome.runtime.sendMessage({ type: "badge-pref-changed" }).catch(function() {});
      applyBadge();
    });
  }
});

// ---------------------------------------------------------------------------
// Analytics — lightweight, privacy-first, fire-and-forget
// Set to "" to disable. Deploy Worker from /analytics directory.
// ---------------------------------------------------------------------------
const ANALYTICS_URL = "https://phc-analytics.noskoviak.workers.dev";

function trackEvent(event, data) {
  if (!ANALYTICS_URL) return;
  try {
    const payload = {
      event: event,
      version: chrome.runtime.getManifest().version,
      ...data,
    };
    fetch(ANALYTICS_URL + "/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {}); // silently fail — never block UX
  } catch (_) {}
}

// Version display
try {
  const v = chrome.runtime.getManifest().version;
  document.addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("version-label");
    if (el) el.textContent = "v" + v;
  });
} catch (_) {}

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------

function showView(id) {
  // v4: when an empty/error state is active, hide the hero/tabs/content too,
  // so the popup doesn't double-render. When `id` is anything else (e.g.
  // "__none__"), all three empty states hide and the main UI takes over.
  ["loading", "not-detected", "error-state"].forEach((v) => {
    var el = document.getElementById(v);
    if (!el) return;
    var active = v === id;
    el.style.display = active ? "block" : "none";
    el.classList.toggle("is-active", active);
  });
  var anyEmpty = id === "loading" || id === "not-detected" || id === "error-state";
  ["hero", "tabs", "content"].forEach(function (uid) {
    var el = document.getElementById(uid);
    if (el && anyEmpty) el.style.display = "none";
  });
}

function showTabs() {
  // v4: reveal hero card, segmented tabs, and the main content area.
  // Called once we've confirmed Pendo is present on the page.
  var hero    = document.getElementById("hero");
  var tabs    = document.getElementById("tabs");
  var content = document.getElementById("content");
  if (hero)    hero.style.display = "flex";
  if (tabs)    tabs.style.display = "flex";
  if (content) content.style.display = "block";
}

// v4: updateScrollFade was a v3 visual cue. The new layout uses .content's
// natural overflow without a gradient fade. Kept as a no-op so legacy
// callers don't throw.
function updateScrollFade() { /* v4 no-op */ }

function escapeHtml(str) {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

// ---------------------------------------------------------------------------
// Pendo Status Page Integration (Feature 1)
// ---------------------------------------------------------------------------

function fetchPendoStatus() {
  fetch("https://status.pendo.io/api/v2/summary.json")
    .then((res) => res.json())
    .then((data) => {
      window.__pendoServiceStatus = data;
      renderPendoStatus(data);
    })
    .catch((err) => {
      // Silently fail — don't break anything
      console.debug("Could not fetch Pendo status:", err);
    });
}

// Map dataHost values to Statuspage component name substrings
const ENV_HOST_MAP = {
  "app.pendo.io": "US environment",
  "data.pendo.io": "US environment",
  "cdn.pendo.io": "US environment",
  "app.au.pendo.io": "AU environment",
  "app.eu.pendo.io": "EU environment",
  "app.jpn.pendo.io": "JPN environment",
  "us1.app.pendo.io": "US1 environment",
};

function detectEnvFromChecks(checks) {
  if (!checks) return null;
  for (let i = 0; i < checks.length; i++) {
    if (checks[i].label === "Data Host") {
      const detail = checks[i].detail || "";
      const host = detail.split(" ")[0].trim().toLowerCase();
      if (!host) continue;

      // Check for regional subdomains first (most specific)
      if (host.includes(".au.") || host.includes("au.pendo")) return "AU environment";
      if (host.includes(".eu.") || host.includes("eu.pendo")) return "EU environment";
      if (host.includes(".jpn.") || host.includes("jpn.pendo")) return "JPN environment";
      if (host.includes("us1.")) return "US1 environment";

      // Default US environment for any pendo.io domain without regional qualifier
      if (host.includes("pendo.io")) return "US environment";

      // CNAME — can't determine region, return null
      return null;
    }
  }
  return null;
}

function renderPendoStatus(data, detectedEnv) {
  const statusDiv = document.getElementById("pendo-status");
  if (!statusDiv) return;

  // Determine overall status
  const statusValue = data.status && data.status.indicator ? data.status.indicator : "";

  let badgeText = "Unknown";
  let badgeClass = "";
  let isHealthy = false;

  if (statusValue === "none" || statusValue === "operational") {
    badgeText = "All Operational";
    badgeClass = "badge-green";
    isHealthy = true;
  } else if (statusValue === "minor" || statusValue === "degraded_performance" || statusValue === "partial_outage") {
    badgeText = "Degraded";
    badgeClass = "badge-yellow";
  } else if (statusValue === "major" || statusValue === "major_outage" || statusValue === "critical") {
    badgeText = "Major Outage";
    badgeClass = "badge-red";
  } else if (statusValue === "maintenance" || statusValue === "under_maintenance") {
    badgeText = "Maintenance";
    badgeClass = "badge-blue";
  }

  // Check for incidents in the last 24 hours
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentIncidents = (data.incidents || []).filter(function(inc) {
    const ts = inc.created_at || inc.updated_at || "";
    return ts ? new Date(ts).getTime() > oneDayAgo : true; // keep if no timestamp
  });
  const hasRecentIncident = recentIncidents.length > 0;

  // Only show status bar when something is wrong or there was a recent incident.
  // "All Operational" with no incidents = nothing to show.
  if (isHealthy && !hasRecentIncident) return;

  // Build realm label if detected
  const realmLabel = detectedEnv ? detectedEnv.replace(" environment", "") : null;

  let incidentHtml = "";
  if (hasRecentIncident) {
    const inc = recentIncidents[0];
    const updates = inc.updates && inc.updates.length > 0 ? inc.updates[0] : null;
    const updateText = updates ? updates.body : "";
    incidentHtml = `<div class="incident-banner" style="margin:4px 16px 0;padding:6px 8px;border-radius:4px;background:var(--destructive-bg, #fef2f2);color:var(--destructive, #dc2626);font-size:11px"><strong>⚠️ ${escapeHtml(inc.name)}</strong>${updateText ? " — " + escapeHtml(updateText.substring(0, 80)) : ""}</div>`;
  }

  statusDiv.innerHTML = `
    <a href="https://status.pendo.io" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:space-between;padding:6px 16px;text-decoration:none;color:inherit;cursor:pointer" title="View Pendo Status Page">
      <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)">Pendo Service Status${realmLabel ? ` <span class="badge badge-blue" style="font-size:9px;padding:1px 5px">${escapeHtml(realmLabel)}</span>` : ""}</span>
      <span class="badge ${badgeClass}" style="font-size:11px">${badgeText}</span>
    </a>${incidentHtml}`;
  statusDiv.style.display = "block";
}

// Click delegation and status setup
document.addEventListener("DOMContentLoaded", () => {

  // Event delegation for all .setup-section-header clicks & keyboard (inline
  // onclick is blocked by Manifest V3 CSP, so we delegate from document)
  function toggleSection(header) {
    const section = header.parentElement;
    if (section && section.classList.contains("setup-section")) {
      const isOpen = section.classList.toggle("open");
      header.setAttribute("aria-expanded", isOpen);
    }
  }
  document.addEventListener("click", (e) => {
    const header = e.target.closest(".setup-section-header");
    if (header) toggleSection(header);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const header = e.target.closest(".setup-section-header");
      if (header) { e.preventDefault(); toggleSection(header); }
    }
  });
});

// ---------------------------------------------------------------------------
// First-Run Onboarding Tour
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

let setupLoaded = false;
let activeTabId = "report"; // Single view — always report
let lastHealthData = null;
let lastSetupData = null;

// ---------------------------------------------------------------------------
// Health Check — rendering
// ---------------------------------------------------------------------------

function renderChecks(checks) {
  // Store health data globally for grade computation
  lastHealthData = { checks: checks };
  window.__lastChecks = checks;

  const list = document.getElementById("checks-list");
  list.innerHTML = "";

  let pass = 0, warn = 0, fail = 0;

  // Sort: problems first (fail → warn → info → pass)
  const ORDER = { fail: 0, warn: 1, info: 2, pass: 3 };
  const sorted = [...checks].sort((a, b) => (ORDER[a.status] ?? 2) - (ORDER[b.status] ?? 2));

  // Separate into problem checks vs passing checks
  const problemChecks = [];
  const passingChecks = [];

  sorted.forEach((c) => {
    if (c.status === "pass") { pass++; passingChecks.push(c); }
    else if (c.status === "warn") { warn++; problemChecks.push(c); }
    else if (c.status === "fail") { fail++; problemChecks.push(c); }
    else problemChecks.push(c); // info counts as noteworthy
  });

  // Render problem checks at full opacity
  if (problemChecks.length > 0) {
    problemChecks.forEach((c) => {
      const row = document.createElement("div");
      row.className = "check-row";
      row.innerHTML = `
        <span class="check-status">${STATUS_ICONS[c.status]}</span>
        <div class="check-info">
          <div class="check-label">${escapeHtml(c.label)}</div>
          <div class="check-detail">${escapeHtml(c.detail)}</div>
        </div>
      `;
      list.appendChild(row);
    });
  } else {
    const allGood = document.createElement("div");
    allGood.style.cssText = "text-align:center;padding:12px 8px;color:var(--success);font-weight:600;font-size:13px";
    allGood.textContent = "✅ All checks passed";
    list.appendChild(allGood);
  }

  // Passed checks omitted — the hero card and Why-this-grade accordion already
  // expose enough state. v4: this list lives inside the accordion now.

  showView("__none__");
  showTabs();

  // Track popup open with check results
  trackEvent("popup_open", {
    has_pendo: 1,
    checks_pass: pass,
    checks_warn: warn,
    checks_fail: fail,
  });

  // Pulse the copy button if there are issues to copy
  if (warn > 0 || fail > 0) {
    const copyBtn = document.getElementById("tool-copy-issues");
    if (copyBtn) {
      setTimeout(() => copyBtn.classList.add("copy-pulse"), 800);
      setTimeout(() => copyBtn.classList.remove("copy-pulse"), 5300);
    }
  }

  // Compute preliminary grade from HC data only — don't render yet.
  // Grade card stays hidden until setup analysis finishes (avoids flash).
  var prelimGrade = computeGrade(checks, []);
  window.__prelimGrade = prelimGrade;
}

// ---------------------------------------------------------------------------
// Health Check — copy (Feature 4: Smart Remediation)
// ---------------------------------------------------------------------------

const REMEDIATION_MAP = {
  "Pendo Agent Loaded": {
    fail: "FIX: The Pendo snippet is not on this page. Add it to your <head>:\n  <script async src='https://cdn.pendo.io/agent/static/YOUR_API_KEY/pendo.js'></script>\n  Find your API key: app.pendo.io → Settings → Subscription Settings → App Details\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script"
  },
  "Pendo Ready": {
    warn: "FIX: pendo.isReady() is false — pendo.initialize() hasn't been called, or it ran before the script finished loading. Ensure initialize() runs after the Pendo script loads.\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script",
    fail: "FIX: pendo.isReady() threw an error. Clear browser cache, hard reload, and verify your snippet URL matches your subscription.\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script"
  },
  "Visitor ID": {
    warn: "FIX: Anonymous visitor ID detected. Pass a stable, unique ID from your auth system (e.g. user.id, email, UUID) via pendo.initialize({ visitor: { id: 'YOUR_USER_ID' } }).\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script",
    fail: "FIX: No visitor ID. Call pendo.initialize() with a visitor.id after the user authenticates — not on page load before the user is known.\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script"
  },
  "Account ID": {
    warn: "FIX: No account ID. For B2B apps, pass the organization/tenant ID via pendo.initialize({ account: { id: 'ACCOUNT_ID' } }). Single-user apps can skip this.\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script"
  },
  "Pendo Instances": {
    warn: "FIX: Multiple Pendo instances detected — causes double-counted analytics and guide conflicts. Check for duplicate <script> tags (View Source → search 'pendo'), duplicate bundler imports, or GTM + hardcoded snippet overlap.\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script"
  },
  "Data Transmission": {
    warn: "FIX: Pendo requests are blocked. Disable your ad blocker for this domain, or ask IT to allowlist *.pendo.io. If using a corporate proxy/VPN, verify data.pendo.io and cdn.pendo.io are reachable.\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo"
  },
  "Feature Flags": {
    warn: "FIX: Pendo features are explicitly disabled in your config. Review your pendo.initialize() options and remove disable flags if unintentional.\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script"
  },
  "Data Host": {
    warn: "FIX: Could not determine Pendo's data or content host. The agent may not be fully initialized. Check your pendo.initialize() call for contentHost and dataHost options.\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script"
  }
};

// ---------------------------------------------------------------------------
// Grade Calculation — unified score from HC + setup data
// ---------------------------------------------------------------------------

function computeGrade(hcChecks, setupIssues) {
  var score = 100;
  var criticals = 0, warnings = 0, passed = 0, infos = 0;

  // Health Check items — graded on a curve so F = badly broken, not "some warnings"
  (hcChecks || []).forEach(function(c) {
    if (c.status === "fail") { score -= 10; criticals++; }
    else if (c.status === "warn") { score -= 3; warnings++; }
    else if (c.status === "info") { score -= 1; infos++; }
    else { passed++; }
  });

  // Setup issues (CSP errors, recommendations)
  (setupIssues || []).forEach(function(si) {
    if (si.severity === "error" || si.severity === "fail") { score -= 10; criticals++; }
    else if (si.severity === "warning" || si.severity === "warn") { score -= 3; warnings++; }
    else if (si.severity === "tip" || si.severity === "info") { score -= 1; infos++; }
  });

  score = Math.max(0, Math.min(100, score));

  var letter, cssClass;
  if (score >= 90) { letter = "A"; cssClass = "grade-a"; }
  else if (score >= 75) { letter = "B"; cssClass = "grade-b"; }
  else if (score >= 60) { letter = "C"; cssClass = "grade-c"; }
  else if (score >= 40) { letter = "D"; cssClass = "grade-d"; }
  else { letter = "F"; cssClass = "grade-f"; }

  var parts = [];
  if (criticals > 0) parts.push(criticals + " critical");
  if (warnings > 0) parts.push(warnings + " warning" + (warnings !== 1 ? "s" : ""));
  if (infos > 0) parts.push(infos + " info");
  parts.push(passed + " passed");

  return { score: score, letter: letter, cssClass: cssClass, summary: parts.join(" · "), criticals: criticals, warnings: warnings };
}

// ---------------------------------------------------------------------------
// Grade Card Rendering
// ---------------------------------------------------------------------------

// v4: renderGradeCard is the analysis flow's hook for "we have a final
// grade, render it." Drives the new hero card. Issue rows are rendered
// separately via v4RenderIssuesList from the analysis flow.
function renderGradeCard(grade) {
  var state = v4DeriveState(grade, true);
  var issueCount = (grade && (grade.criticals + grade.warnings)) || 0;
  v4RenderHero(grade, state, issueCount);
}

// ===========================================================================
// v4: Direction C UI layer
// Hero card · segmented tabs · severity-colored issue rows · compact quick-copy
// All v4-specific UI lives below so the data-extraction code above is untouched.
// ===========================================================================

// Inline SVG strings for the icons we use in dynamic content. Static icons
// (header brand mark, refresh button, etc.) live in popup.html.
var V4_SVG = {
  copy:         '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  check:        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  alertTri:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  alertOctagon: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  info:         '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};

// Chips on the Status panel (compact, five rows). The IDs tab gets the same
// list plus Subscription appended. Diagnostic state (Framework, Ready,
// Active Guides) intentionally does NOT appear here — that's the hero's job.
var V4_CHIPS_STATUS = [
  { key: "visitorId",      label: "Visitor" },
  { key: "accountId",      label: "Account" },
  { key: "sessionId",      label: "Session" },
  { key: "version",        label: "Agent" },
  { key: "realm",          label: "Realm" }
];
var V4_CHIPS_IDS = [
  { key: "visitorId",      label: "Visitor" },
  { key: "accountId",      label: "Account" },
  { key: "subscriptionId", label: "Subscription" },
  { key: "sessionId",      label: "Session" },
  { key: "version",        label: "Agent" },
  { key: "realm",          label: "Realm" }
];

// --- State derivation ----------------------------------------------------

// Map (grade, issue counts) to one of three hero states.
//   healthy  → green grade square, "Pendo is healthy"
//   degraded → orange grade square, "Pendo is degraded"
//   outage   → red grade square, "Pendo is not running"
function v4DeriveState(grade, pendoDetected) {
  if (pendoDetected === false) return "outage";
  if (!grade) return "degraded";
  if (grade.criticals > 0 || grade.letter === "F") return "outage";
  if (grade.warnings > 0 || grade.letter === "C" || grade.letter === "D") return "degraded";
  return "healthy";
}

// --- Hero card -----------------------------------------------------------

function v4RenderHero(grade, state, issueCount) {
  var hero       = document.getElementById("hero");
  var square     = document.getElementById("grade-square");
  var titleEl    = document.getElementById("hero-title");
  var subEl      = document.getElementById("hero-sub");
  if (!hero || !square || !titleEl || !subEl) return;

  square.textContent = grade && grade.letter ? grade.letter : "—";
  square.className = "grade-square state-" + state;
  square.title = grade ? (grade.score + " / 100 · " + grade.summary) : "";

  var titles = {
    healthy:  "Pendo is healthy",
    degraded: "Pendo is degraded",
    outage:   "Pendo is not running"
  };
  var subs = {
    healthy:  "Tracking events, guides loading correctly.",
    degraded: issueCount + " issue" + (issueCount === 1 ? "" : "s") + " found · agent live",
    outage:   "Agent failed to initialize on this page"
  };

  titleEl.textContent = titles[state] || titles.degraded;
  titleEl.className = "hero-title state-" + state;
  subEl.textContent = subs[state] || subs.degraded;
  hero.style.display = "flex";
}

// --- Severity-colored issue rows (top of Status panel) -------------------

function v4SeverityClass(status) {
  if (status === "fail") return "sev-err";
  if (status === "warn") return "sev-warn";
  if (status === "info") return "sev-info";
  return "sev-info";
}
function v4SeverityIcon(status) {
  if (status === "fail") return V4_SVG.alertOctagon;
  if (status === "warn") return V4_SVG.alertTri;
  return V4_SVG.info;
}

function v4RenderIssuesList(checks) {
  var section = document.getElementById("issues-section");
  var ok      = document.getElementById("ok-block");
  var list    = document.getElementById("issues-list");
  var countEl = document.getElementById("active-issues-count");
  var tabCount = document.getElementById("tab-status-count");
  if (!section || !ok || !list || !countEl) return 0;

  // Filter to actionable items: fail + warn + info. Passes do not appear here.
  var actionable = (checks || []).filter(function (c) {
    return c.status === "fail" || c.status === "warn" || c.status === "info";
  });

  list.innerHTML = "";
  countEl.textContent = actionable.length;

  if (actionable.length === 0) {
    section.style.display = "none";
    ok.style.display = "block";
    if (tabCount) {
      tabCount.textContent = "";
      tabCount.classList.remove("has-count");
    }
    return 0;
  }

  ok.style.display = "none";
  section.style.display = "block";
  actionable.forEach(function (c) {
    var row = document.createElement("div");
    row.className = "issue-row " + v4SeverityClass(c.status);
    var text = (c.detail && c.detail.trim()) ? c.detail : c.label;
    row.innerHTML = v4SeverityIcon(c.status) + "<span></span>";
    row.querySelector("span").textContent = text;
    list.appendChild(row);
  });

  if (tabCount) {
    tabCount.textContent = actionable.length;
    tabCount.classList.add("has-count");
  }
  return actionable.length;
}

// --- Compact quick-copy table -------------------------------------------

function v4FormatChipValue(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function v4RenderQuickCopyRow(spec, values, isLast) {
  var raw = values[spec.key];
  var display = v4FormatChipValue(raw);
  var empty = display === null;

  var row = document.createElement(empty ? "div" : "button");
  row.className = "qc-row" + (empty ? " qc-empty" : "");
  if (!empty) {
    row.type = "button";
    row.setAttribute("data-key", spec.key);
  }
  if (isLast) row.style.borderBottom = "none";

  var label = document.createElement("span");
  label.className = "qc-label";
  label.textContent = spec.label;

  var value = document.createElement("span");
  value.className = "qc-value";
  value.textContent = display !== null ? display : "Not set";
  value.title = display !== null ? display : "Not available on this page";

  var copyIcon = document.createElement("span");
  copyIcon.className = "qc-copy-icon";
  copyIcon.innerHTML = V4_SVG.copy;

  row.appendChild(label);
  row.appendChild(value);
  row.appendChild(copyIcon);

  if (!empty) {
    row.addEventListener("click", function () {
      navigator.clipboard.writeText(display).then(function () {
        row.classList.add("is-copied");
        copyIcon.innerHTML = V4_SVG.check;
        try { trackEvent("copy_chip", { key: spec.key }); } catch (_) {}
        setTimeout(function () {
          row.classList.remove("is-copied");
          copyIcon.innerHTML = V4_SVG.copy;
        }, 1000);
      });
    });
  }
  return row;
}

function v4RenderQuickCopy(values, specs, mountId) {
  var mount = document.getElementById(mountId);
  if (!mount) return;
  mount.innerHTML = "";
  specs.forEach(function (spec, idx) {
    mount.appendChild(v4RenderQuickCopyRow(spec, values || {}, idx === specs.length - 1));
  });
}

// Convenience: render both Status (compact) and IDs (full) tables from
// the same values object.
function v4RenderAllQuickCopy(values) {
  v4RenderQuickCopy(values, V4_CHIPS_STATUS, "quick-copy-status");
  v4RenderQuickCopy(values, V4_CHIPS_IDS,    "quick-copy-ids");
}

// --- Tab switching --------------------------------------------------------

function v4ActivateTab(name) {
  var tabs = document.querySelectorAll(".tab[data-tab]");
  tabs.forEach(function (t) {
    var active = t.getAttribute("data-tab") === name;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  var panels = document.querySelectorAll(".tab-panel[data-panel]");
  panels.forEach(function (p) {
    var active = p.getAttribute("data-panel") === name;
    p.classList.toggle("is-active", active);
    if (active) p.removeAttribute("hidden"); else p.setAttribute("hidden", "");
  });
}

// --- Badge state text in footer ------------------------------------------

function v4SyncBadgeStateText() {
  var input = document.getElementById("badge-enabled");
  var text  = document.getElementById("badge-state-text");
  if (!input || !text) return;
  text.textContent = input.checked ? "Badge on" : "Badge off";
}

// --- Wireup: tabs, why-grade accordion, refresh, JSON copy, footer ------

(function v4Wireup() {
  // Segmented tab clicks
  document.querySelectorAll(".tab[data-tab]").forEach(function (t) {
    t.addEventListener("click", function () {
      v4ActivateTab(t.getAttribute("data-tab"));
      try { trackEvent("tab_switch", { tab: t.getAttribute("data-tab") }); } catch (_) {}
    });
  });

  // "Why this grade?" accordion — toggles the checks-list body
  var whyToggle = document.getElementById("why-grade-toggle");
  var whyBody   = document.getElementById("why-grade-body");
  if (whyToggle && whyBody) {
    whyToggle.addEventListener("click", function () {
      var open = whyBody.style.display === "block";
      whyBody.style.display = open ? "none" : "block";
      whyToggle.setAttribute("aria-expanded", open ? "false" : "true");
    });
  }

  // Refresh button — re-run the diagnostic without reopening the popup.
  var refreshBtn = document.getElementById("header-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      refreshBtn.classList.add("spinning");
      setTimeout(function () { refreshBtn.classList.remove("spinning"); }, 600);
      try { trackEvent("refresh_click"); } catch (_) {}
      // Re-run the same DOMContentLoaded flow by reloading the popup window.
      // Cheapest correct behavior; the popup is ephemeral state anyway.
      window.location.reload();
    });
  }

  // Copy all IDs as JSON (IDs tab)
  var copyJson = document.getElementById("copy-all-json");
  if (copyJson) {
    var jsonLabel = copyJson.querySelector(".btn-label");
    copyJson.addEventListener("click", function () {
      var values = window.__lastValues || {};
      var payload = {};
      V4_CHIPS_IDS.forEach(function (spec) {
        payload[spec.key] = values[spec.key] === undefined ? null : values[spec.key];
      });
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(function () {
        if (jsonLabel) {
          var orig = jsonLabel.textContent;
          jsonLabel.textContent = "Copied!";
          setTimeout(function () { jsonLabel.textContent = orig; }, 1500);
        }
        try { trackEvent("copy_ids_json"); } catch (_) {}
      });
    });
  }

  // Footer "Send feedback" link — same handler as the legacy feedback-btn
  // (the click listener is attached lower in the file, no extra wiring needed).

  // Badge checkbox controls the footer text label too.
  var badgeInput = document.getElementById("badge-enabled");
  if (badgeInput) {
    badgeInput.addEventListener("change", v4SyncBadgeStateText);
    v4SyncBadgeStateText();
  }
})();

// ---------------------------------------------------------------------------
// Extract Setup Issues into Unified Format
// ---------------------------------------------------------------------------

function extractSetupIssues(data) {
  if (!data) return [];
  var issues = [];

  // CSP issues
  if (data.csp && Array.isArray(data.csp.issues)) {
    data.csp.issues.forEach(function(issue) {
      issues.push({
        severity: issue.severity, // "error" or "warning"
        label: "CSP: " + issue.directive,
        detail: issue.detail
      });
    });
  }

  // Recommendations (error, warning, tip)
  if (Array.isArray(data.recommendations)) {
    data.recommendations.forEach(function(rec) {
      // Don't duplicate CSP issues that are already captured above
      if (rec.title && rec.title.indexOf("CSP") === -1) {
        issues.push({
          severity: rec.severity, // "error", "warning", "tip"
          label: rec.title,
          detail: rec.detail
        });
      }
    });
  }

  // Metadata warnings
  if (Array.isArray(data.visitorFields)) {
    data.visitorFields.forEach(function(f) {
      if (f.warnings && f.warnings.length > 0) {
        issues.push({
          severity: "warning",
          label: 'Metadata: "' + f.key + '"',
          detail: f.warnings.join("; ")
        });
      }
    });
  }
  if (Array.isArray(data.accountFields)) {
    data.accountFields.forEach(function(f) {
      if (f.warnings && f.warnings.length > 0) {
        issues.push({
          severity: "warning",
          label: 'Metadata: "' + f.key + '"',
          detail: f.warnings.join("; ")
        });
      }
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Render Setup Issues into Unified Report
// ---------------------------------------------------------------------------

// renderSetupIssues removed — setup issues now merge into renderChecks() as one sorted list

// (Old per-tab buildPlainTextReport / buildSetupPlainText removed —
//  replaced by unified buildIssuesReport() in Tools section below)

// ---------------------------------------------------------------------------
// Setup Assistant — rendering (kept for data display in Setup tab if needed)
// ---------------------------------------------------------------------------

function renderSetup(data) {
  if (!data || typeof data !== "object") {
    document.getElementById("setup-loading").style.display = "none";
    document.getElementById("setup-content").innerHTML =
      '<div class="empty-state">No setup data returned — the page may not have loaded properly.</div>';
    document.getElementById("setup-content").style.display = "block";
    return;
  }
  window.__lastSetup = data;
  const container = document.getElementById("setup-content");
  container.innerHTML = "";

  // Collect sections into problem vs healthy buckets
  const problemSections = [];
  const healthySections = [];

  function makeSection(title, badgeHtml, bodyHtml, hasIssue) {
    const html = `
      <div class="setup-section open">
        <div class="setup-section-header" tabindex="0" role="button" aria-expanded="true">
          <span class="setup-chevron">▶</span>
          <span class="setup-section-title">${title}</span>
          <span class="setup-section-badge">${badgeHtml}</span>
        </div>
        <div class="setup-section-body">${bodyHtml}</div>
      </div>`;
    if (hasIssue) problemSections.push(html);
    else healthySections.push({ title, badge: badgeHtml, body: bodyHtml });
  }

  // 1. Snippet Analysis
  if (data.snippet && !data.snippet.isAsync && data.snippet.loadMethod.indexOf("npm") === -1) {
    // Only show if snippet is NOT async (warning case)
    const snipBadge = `<span class="badge badge-yellow">Sync</span>`;
    const snipBody = `<div class="detail-row"><span class="detail-key">Issue</span><span class="detail-val">Pendo snippet is loaded synchronously — add the async attribute to avoid blocking page render</span></div>`;
    makeSection("Snippet", snipBadge, snipBody, true);
  }

  // 2. Initialization
  if (data.initialization) {
    const initBadge = `<span class="badge badge-green">${escapeHtml(data.initialization.method)}</span>`;
    let initBody = `<div class="detail-row"><span class="detail-key">Method</span><span class="detail-val">${escapeHtml(data.initialization.method)}</span></div>`;
    if (data.initialization.timing) initBody += `<div class="detail-row"><span class="detail-key">Timing</span><span class="detail-val">${escapeHtml(data.initialization.timing)}</span></div>`;
    makeSection("Initialization", initBadge, initBody, false);
  }

  // 3. CSP Analysis
  if (data.csp) {
    let cspBadge, cspBody;
    const cspHasIssues = data.csp.detected && data.csp.issues && data.csp.issues.length > 0;
    if (data.csp.detected) {
      const hasErrors = data.csp.issues && data.csp.issues.some(i => i.severity === "error");
      const hasWarnings = data.csp.issues && data.csp.issues.some(i => i.severity === "warning");
      if (hasErrors) cspBadge = `<span class="badge badge-red">${data.csp.issues.length} issue${data.csp.issues.length !== 1 ? "s" : ""}</span>`;
      else if (hasWarnings) cspBadge = `<span class="badge badge-yellow">${data.csp.issues.length} issue${data.csp.issues.length !== 1 ? "s" : ""}</span>`;
      else cspBadge = `<span class="badge badge-green">OK</span>`;

      cspBody = `<div class="detail-row"><span class="detail-key">CSP detected</span><span class="detail-val"><span class="badge badge-yellow">Yes</span> (${escapeHtml(data.csp.source || "meta tag")})</span></div>`;
      const dirNames = Object.keys(data.csp.directives || {});
      if (dirNames.length > 0) cspBody += `<div class="detail-row"><span class="detail-key">Directives</span><span class="detail-val">${escapeHtml(dirNames.join(", "))}</span></div>`;
      if (cspHasIssues) {
        data.csp.issues.forEach((issue) => {
          const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "💡";
          cspBody += `<div class="detail-row"><span class="detail-key">${icon} ${escapeHtml(issue.directive)}</span><span class="detail-val">${escapeHtml(issue.detail)}</span></div>`;
        });
      } else {
        cspBody += `<div class="detail-row"><span class="detail-key">Status</span><span class="detail-val"><span class="badge badge-green">Pendo-compatible</span> All required domains appear allowed</span></div>`;
      }
    } else {
      cspBadge = `<span class="badge badge-green">No CSP</span>`;
      cspBody = `<div class="detail-row"><span class="detail-key">CSP detected</span><span class="detail-val"><span class="badge badge-green">No</span> ${escapeHtml(data.csp.source || "No restrictive CSP found")}</span></div>`;
    }
    makeSection("Content Security Policy", cspBadge, cspBody, cspHasIssues);
  }

  // 4. Visitor Metadata
  if (Array.isArray(data.visitorFields) && data.visitorFields.length > 0) {
    const vWarns = data.visitorFields.filter(f => (f.warnings || []).length > 0).length;
    const vBadge = vWarns > 0
      ? `<span class="badge badge-yellow">${data.visitorFields.length} fields · ${vWarns} warn</span>`
      : `<span class="badge badge-green">${data.visitorFields.length} fields</span>`;
    let vBody = `<table class="metadata-table"><tr><th>Field</th><th>Type</th><th>Status</th></tr>`;
    data.visitorFields.forEach((f) => {
      const w = f.warnings || [];
      const hasWarn = w.length > 0;
      const cls = hasWarn ? "field-warn" : "field-ok";
      const status = hasWarn ? w.map(escapeHtml).join(", ") : "OK";
      vBody += `<tr><td>${escapeHtml(f.key || "?")}</td><td>${escapeHtml(f.type || "?")}</td><td class="${cls}">${status}</td></tr>`;
    });
    vBody += `</table>`;
    makeSection(`Visitor Metadata`, vBadge, vBody, vWarns > 0);
  }

  // 5. Account Metadata
  if (Array.isArray(data.accountFields) && data.accountFields.length > 0) {
    const aWarns = data.accountFields.filter(f => (f.warnings || []).length > 0).length;
    const aBadge = aWarns > 0
      ? `<span class="badge badge-yellow">${data.accountFields.length} fields · ${aWarns} warn</span>`
      : `<span class="badge badge-green">${data.accountFields.length} fields</span>`;
    let aBody = `<table class="metadata-table"><tr><th>Field</th><th>Type</th><th>Status</th></tr>`;
    data.accountFields.forEach((f) => {
      const w = f.warnings || [];
      const hasWarn = w.length > 0;
      const cls = hasWarn ? "field-warn" : "field-ok";
      const status = hasWarn ? w.map(escapeHtml).join(", ") : "OK";
      aBody += `<tr><td>${escapeHtml(f.key || "?")}</td><td>${escapeHtml(f.type || "?")}</td><td class="${cls}">${status}</td></tr>`;
    });
    aBody += `</table>`;
    makeSection(`Account Metadata`, aBadge, aBody, aWarns > 0);
  }

  // Summary counters — track ALL issues across all sections
  let errors = 0, warnings = 0, tips = 0;

  // Count CSP issues
  if (data.csp && data.csp.issues) {
    data.csp.issues.forEach((i) => {
      if (i.severity === "error") errors++;
      else if (i.severity === "warning") warnings++;
    });
  }

  // Count metadata warnings
  if (Array.isArray(data.visitorFields)) data.visitorFields.forEach(f => { if ((f.warnings || []).length > 0) warnings++; });
  if (Array.isArray(data.accountFields)) data.accountFields.forEach(f => { if ((f.warnings || []).length > 0) warnings++; });

  // 6. Recommendations
  if (data.recommendations && data.recommendations.length > 0) {
    let recErrors = 0, recWarnings = 0, recTips = 0;
    data.recommendations.forEach((r) => {
      if (r.severity === "error") { errors++; recErrors++; }
      else if (r.severity === "warning") { warnings++; recWarnings++; }
      else { tips++; recTips++; }
    });
    const recBadge = recErrors > 0
      ? `<span class="badge badge-red">${recErrors} error${recErrors !== 1 ? "s" : ""}</span>`
      : recWarnings > 0
        ? `<span class="badge badge-yellow">${recWarnings} warning${recWarnings !== 1 ? "s" : ""}</span>`
        : `<span class="badge badge-green">${recTips} tip${recTips !== 1 ? "s" : ""}</span>`;

    let recBody = "";
    data.recommendations.forEach((r) => {
      const icon = r.severity === "error" ? "❌" : r.severity === "warning" ? "⚠️" : "💡";
      recBody += `
        <div class="recommendation">
          <span class="rec-icon">${icon}</span>
          <div class="rec-text">
            <strong>${escapeHtml(r.title)}</strong>
            <span class="rec-detail">${escapeHtml(r.detail)}</span>
          </div>
        </div>`;
    });
    makeSection(`Recommendations (${data.recommendations.length})`, recBadge, recBody, recErrors > 0 || recWarnings > 0);
  }

  // === Render: problems first, then "What's Good" drawer ===
  if (problemSections.length > 0) {
    container.innerHTML += problemSections.join("");
  } else {
    container.innerHTML += `<div style="text-align:center;padding:16px 8px;color:var(--success);font-weight:600;font-size:13px">✅ No issues detected</div>`;
  }

  // "What's Good" drawer removed — grade card summary already shows passed count.
  // Keeps the view focused on actionable issues only.

  // Summary
  if (errors + warnings > 0) {
    document.getElementById("setup-summary-counts").innerHTML =
      (errors > 0 ? `<span class="fail">${errors} error${errors !== 1 ? "s" : ""}</span> · ` : "") +
      (warnings > 0 ? `<span class="warn">${warnings} warning${warnings !== 1 ? "s" : ""}</span> · ` : "") +
      `<span style="color:var(--muted-foreground)">${tips} tip${tips !== 1 ? "s" : ""}</span>`;
  } else {
    document.getElementById("setup-summary-counts").innerHTML =
      `<span class="pass">All areas healthy</span>`;
  }

  document.getElementById("setup-loading").style.display = "none";
  container.style.display = "block";
  document.getElementById("setup-summary").style.display = "flex";
}

// ---------------------------------------------------------------------------
// Main — run health check on popup open
// ---------------------------------------------------------------------------

let currentTabId = null;

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  currentTabId = tab.id;
  document.getElementById("page-url").textContent = tab.url || "";
  // v4: also reflect the URL in the visible chip on the Status panel
  var urlDisplay = document.getElementById("page-url-display");
  if (urlDisplay) urlDisplay.textContent = tab.url || "—";

  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("chrome-search://") ||
    tab.url.startsWith("about:") ||
    tab.url.startsWith("edge://") ||
    tab.url.startsWith("https://chrome.google.com/webstore") ||
    tab.status === "unloaded"
  ) {
    showView("error-state");
    return;
  }

  // Fetch Pendo service status (Feature 1)
  fetchPendoStatus();

  chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      func: runPendoHealthCheck,
      world: "MAIN",
    })
    .then((results) => {
      const data = results?.[0]?.result;
      if (!data || !data.pendoDetected) {
        showView("not-detected");
        trackEvent("popup_open", { has_pendo: 0 });
        return;
      }
      window.__lastChecks = data.checks;
      window.__lastValues = data.values || {};
      activeTabId = "report";
      renderChecks(data.checks);

      // v4: populate the Quick Copy compact table (Status) and the full IDs
      // table (IDs tab) immediately from the first analysis pass. Issue rows
      // and hero card update again below once setup analysis completes.
      v4RenderAllQuickCopy(window.__lastValues);
      v4RenderIssuesList(data.checks);

      // Re-render status filtered to detected environment
      const env = detectEnvFromChecks(data.checks);
      if (env && window.__pendoServiceStatus) {
        renderPendoStatus(window.__pendoServiceStatus, env);
      }

      // Pre-run Setup analysis in background so copy report always has CSP data
      // and to extract issues for unified Report view
      if (!setupLoaded) {
        chrome.scripting
          .executeScript({
            target: { tabId: tab.id },
            func: runPendoSetupAssistant,
            world: "MAIN",
          })
          .then((setupResults) => {
            const setupData = setupResults?.[0]?.result;
            if (setupData) {
              window.__lastSetup = setupData;
              lastSetupData = setupData;

              // Extract setup issues and merge into unified report
              const setupIssues = extractSetupIssues(setupData);
              // Convert setup issues to check format and re-render as one sorted list
              const setupAsChecks = setupIssues.map(function(si) {
                var status = (si.severity === "error" || si.severity === "fail") ? "fail"
                           : (si.severity === "warning" || si.severity === "warn") ? "warn"
                           : "info";
                return { status: status, label: si.label, detail: si.detail };
              });
              var allChecks = data.checks.concat(setupAsChecks);
              renderChecks(allChecks);
              v4RenderIssuesList(allChecks);

              // Compute final grade from both HC and setup data
              const finalGrade = computeGrade(data.checks, setupIssues);
              renderGradeCard(finalGrade);

              // v4: re-render quick copy with framework merged from setup data.
              // (Chip set doesn't include framework, but __lastValues is
              // kept up to date for any future consumers / IDs JSON copy.)
              try {
                var mergedValues = Object.assign({}, window.__lastValues || {});
                if (setupData.framework && setupData.framework.name) {
                  mergedValues.framework = setupData.framework.version
                    ? (setupData.framework.name + " " + setupData.framework.version)
                    : setupData.framework.name;
                }
                window.__lastValues = mergedValues;
                v4RenderAllQuickCopy(mergedValues);
              } catch (_) {}

              // Set badge on icon — send full analysis to background
              window.__lastTotalIssues = finalGrade.criticals + finalGrade.warnings;
              window.__lastCriticals = finalGrade.criticals;
              window.__lastWarnings = finalGrade.warnings;
              applyBadge();
            }
          })
          .catch(() => {
            // Setup failed — show grade from HC data only.
            // v4: the hero card is the visible representation; check
            // its dataset/state rather than the legacy grade-card.
            var hero = document.getElementById("hero");
            if (!hero || hero.style.display === "none") {
              var fallbackGrade = window.__prelimGrade || computeGrade(data.checks, []);
              renderGradeCard(fallbackGrade);
              window.__lastTotalIssues = (fallbackGrade.criticals || 0) + (fallbackGrade.warnings || 0);
              window.__lastCriticals = fallbackGrade.criticals || 0;
              window.__lastWarnings = fallbackGrade.warnings || 0;
              applyBadge();
            }
          });
      }
    })
    .catch((err) => {
      // "Frame with ID 0 is showing error page" = tab failed to load (DNS, SSL, etc.)
      const msg = (err.message || "Unknown error");
      if (msg.includes("error page") || msg.includes("Cannot access")) {
        document.getElementById("error-message").textContent =
          "This page didn't load properly — try refreshing it first.";
      } else {
        document.getElementById("error-message").textContent = msg;
      }
      showView("error-state");
    });
});

// ---------------------------------------------------------------------------
// Setup Assistant — run on tab switch
// ---------------------------------------------------------------------------

function runSetup() {
  if (!currentTabId) return;
  chrome.scripting
    .executeScript({
      target: { tabId: currentTabId },
      func: runPendoSetupAssistant,
      world: "MAIN",
    })
    .then((results) => {
      const data = results?.[0]?.result;
      if (!data) {
        document.getElementById("setup-loading").style.display = "none";
        document.getElementById("setup-content").innerHTML =
          '<div class="empty-state">Could not analyze Pendo setup on this page.</div>';
        document.getElementById("setup-content").style.display = "block";
        return;
      }
      renderSetup(data);
    })
    .catch((err) => {
      console.error("Setup assistant failed:", err);
      document.getElementById("setup-loading").style.display = "none";
      document.getElementById("setup-content").innerHTML =
        `<div class="empty-state">Error: ${escapeHtml(err.message || "Unknown error")}</div>`;
      document.getElementById("setup-content").style.display = "block";
    });
}

// ---------------------------------------------------------------------------
// Tools — Pendo console commands
// ---------------------------------------------------------------------------

function setToolStatus(msg, cls) {
  const el = document.getElementById("tool-status");
  if (!el) return;
  el.textContent = msg;
  el.className = cls || "";
}

function runPendoCommand(funcToInject, successMsg) {
  if (!currentTabId) {
    setToolStatus("No active tab", "error");
    return;
  }
  setToolStatus("Running…", "");
  chrome.scripting
    .executeScript({
      target: { tabId: currentTabId },
      func: funcToInject,
      world: "MAIN",
    })
    .then((results) => {
      const r = results?.[0]?.result;
      if (r && r.error) {
        setToolStatus(r.error, "error");
      } else {
        setToolStatus(r?.message || successMsg, "success");
      }
    })
    .catch((err) => {
      setToolStatus("Error: " + (err.message || "Unknown"), "error");
    });
}

// v3: Run pendo.validateInstall() in the page's MAIN world and capture its
// console output. Used by the Copy Issues handler to fold Pendo's own verdict
// into the report. Returns "" if Pendo isn't on the page or the API isn't
// available, so the caller can simply append-or-skip.
function v3CaptureValidateInstall() {
  if (!currentTabId) return Promise.resolve("");
  return chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    func: function () {
      try {
        if (typeof pendo === "undefined") return { skipped: "Pendo agent not present on this page." };
        if (typeof pendo.validateInstall !== "function") return { skipped: "pendo.validateInstall() not available on this agent version." };
        var captured = [];
        var origLog = console.log;
        var origWarn = console.warn;
        console.log = function () { captured.push(Array.from(arguments).join(" ")); origLog.apply(console, arguments); };
        console.warn = function () { captured.push("⚠ " + Array.from(arguments).join(" ")); origWarn.apply(console, arguments); };
        try { pendo.validateInstall(); } finally {
          console.log = origLog;
          console.warn = origWarn;
        }
        return { output: captured.length > 0 ? captured.join("\n") : "validateInstall() completed with no console output." };
      } catch (e) {
        return { error: e.message };
      }
    },
    world: "MAIN"
  }).then(function (results) {
    var r = results && results[0] && results[0].result;
    if (!r) return "";
    if (r.skipped) return r.skipped;
    if (r.error) return "Error running pendo.validateInstall(): " + r.error;
    return r.output || "";
  }).catch(function (err) {
    return "Error running pendo.validateInstall(): " + (err.message || "unknown");
  });
}

document.getElementById("tool-launch-debug")?.addEventListener("click", () => {
  runPendoCommand(function () {
    try {
      if (typeof pendo === "undefined") return { error: "Pendo not found on this page" };

      // Track debug state via a data attribute on <body>. DOM element detection
      // is unreliable because Pendo's debugger overlay may use shadow DOM, iframes,
      // or element names that don't match querySelector patterns.
      var isActive = document.body.getAttribute("data-pendo-debug-active") === "true";

      if (isActive) {
        if (typeof pendo.disableDebugging === "function") {
          pendo.disableDebugging();
          document.body.removeAttribute("data-pendo-debug-active");
          return { message: "🔒 Debugger closed" };
        }
        return { error: "pendo.disableDebugging() not available on this agent version" };
      }

      if (typeof pendo.enableDebugging === "function") {
        pendo.enableDebugging();
        document.body.setAttribute("data-pendo-debug-active", "true");
        return { message: "✅ Debugger launched — click again to close" };
      }
      return { error: "pendo.enableDebugging() not available on this agent version" };
    } catch (e) {
      return { error: e.message };
    }
  }, "Debugger toggled");
});

// ---------------------------------------------------------------------------
// Unified "Copy Issues" — plain English problems + fixes for Slack/Jira
// ---------------------------------------------------------------------------

function buildIssuesReport() {
  const url = document.getElementById("page-url").textContent || "unknown page";
  const lines = [];
  // Preamble doubles as orientation for a human reader AND any LLM the user
  // pastes this into. Keep it factual and short. No marketing.
  lines.push(`Pendo Health Check report — ${url}`);
  lines.push(`Generated: ${new Date().toLocaleString()} by github.com/prolitariat/pendo-health-check v3.0.0 (Chrome extension; side project, not an official Pendo product).`);
  lines.push(`Findings are ordered by severity (PROBLEM > INCIDENT > WARNING > INFO > TIP). Doc URLs at the bottom are verified Pendo Help Center articles; CMP vendor URLs appear inline in the relevant fix.`);
  lines.push("");

  const reported = new Set(); // Track reported topics to avoid duplicates
  const sources = new Set(); // Collect unique documentation URLs
  const collectedIssues = []; // Collect all issues for priority sorting

  // Severity priority: lower = more urgent
  const SEVERITY_ORDER = { "PROBLEM": 0, "INCIDENT": 1, "WARNING": 2, "INFO": 3, "TIP": 4 };

  function addIssue(severity, title, problem, fix) {
    // Deduplicate by normalized title prefix — "Visitor ID" blocks "Visitor ID missing or anonymous"
    const key = title.toLowerCase().replace(/[^a-z]/g, "");
    for (const existing of reported) {
      if (key.startsWith(existing) || existing.startsWith(key)) return;
    }
    reported.add(key);

    let cleanFix = null;
    if (fix) {
      cleanFix = fix.replace(/\n\s*Docs:\s*(https?:\/\/[^\s]+)/g, (_, url) => {
        sources.add(url);
        return "";
      });
    }
    collectedIssues.push({ severity, title, problem, fix: cleanFix });
  }

  // --- Health Check issues ---
  const checks = window.__lastChecks || [];
  const problems = checks.filter(c => c.status === "fail" || c.status === "warn");

  // Check if CSP issues exist — used to make Network Requests fix context-aware
  const setup = window.__lastSetup || {};
  const hasCspIssues = setup.csp && setup.csp.issues && setup.csp.issues.some(i => i.severity === "error" || i.severity === "warning");

  if (problems.length > 0) {
    problems.forEach((c) => {
      const severity = c.status === "fail" ? "PROBLEM" : "WARNING";
      let fix;

      if (c.label === "Data Transmission" && hasCspIssues) {
        fix = "Your Content-Security-Policy is blocking Pendo requests. See the CSP directive fixes below.";
      } else {
        const remap = REMEDIATION_MAP[c.label];
        fix = (remap && remap[c.status]) ? remap[c.status].replace(/^FIX:\s*/i, "") : null;
      }
      addIssue(severity, c.label, c.detail, fix);
    });
  }

  // --- Setup Assistant issues ---

  // CSP issues
  if (setup.csp && setup.csp.issues && setup.csp.issues.length > 0) {
    const cspProblems = setup.csp.issues.filter(i => i.severity === "error" || i.severity === "warning");
    if (cspProblems.length > 0) {
      cspProblems.forEach((issue) => {
        const severity = issue.severity === "error" ? "PROBLEM" : "WARNING";
        addIssue(severity, `CSP: ${issue.directive}`, issue.detail, issue.fix || null);
      });
    }
  }

  // Snippet issues
  if (setup.snippet && !setup.snippet.isAsync && setup.snippet.loadMethod.indexOf("npm") === -1) {
    addIssue("WARNING", "Synchronous script loading",
      "The Pendo snippet is blocking page load.",
      "Add the async attribute to the Pendo <script> tag.");
  }

  // Metadata warnings
  const allFields = (setup.visitorFields || []).concat(setup.accountFields || []);
  const warnFields = allFields.filter(f => f.warnings.length > 0);
  if (warnFields.length > 0) {
    warnFields.forEach((f) => {
      const fixes = [];
      f.warnings.forEach(w => {
        if (w.indexOf("sensitive") !== -1) {
          fixes.push("Remove this field or replace with a non-PII equivalent (e.g. hashed email). Settings → Data Mappings to toggle off.");
        } else if (w.indexOf("letters, numbers, underscores") !== -1) {
          fixes.push("Rename to use only letters, numbers, and underscores (e.g. \"my_field_name\"). Special characters may cause data mapping issues.");
        } else if (w.indexOf("exceeds 1024") !== -1) {
          fixes.push("Truncate or summarize this value — Pendo drops strings longer than 1024 characters.");
        } else if (w.indexOf("Null/undefined") !== -1) {
          fixes.push("Either pass a real value or omit this field entirely. Null values create phantom metadata entries in Pendo.");
        } else if (w.indexOf("Nested object") !== -1) {
          fixes.push("Flatten this object: e.g. { plan: { name: 'Pro' } } → { plan_name: 'Pro' }. Pendo silently ignores nested objects.");
        } else if (w.indexOf("Array value") !== -1) {
          fixes.push("Convert to a comma-separated string: e.g. ['a','b'] → 'a,b'. Pendo silently ignores arrays.");
        } else if (w.indexOf("Function value") !== -1) {
          fixes.push("Replace with the function's return value. Functions are not serialized and will be silently dropped.");
        }
      });
      const fixText = fixes.length > 0
        ? fixes.join("\n  ") + "\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script"
        : "Review this field in your pendo.initialize() call and correct the value format.\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script";
      addIssue("WARNING", `Metadata: "${f.key}"`,
        f.warnings.join("; "),
        fixText);
    });
  }

  // Recommendations (errors and warnings only — skip topics already reported)
  if (setup.recommendations) {
    setup.recommendations.forEach((r) => {
      if (r.severity === "error" || r.severity === "warning") {
        var fixIdx = r.detail.indexOf("\n  FIX:");
        var prob = fixIdx !== -1 ? r.detail.substring(0, fixIdx) : r.detail;
        var fix = fixIdx !== -1 ? r.detail.substring(fixIdx + 7) : null;
        addIssue(r.severity === "error" ? "PROBLEM" : "WARNING", r.title, prob, fix);
      }
    });
  }

  // --- Pendo Service Status (only if there's an active incident) ---
  if (window.__pendoServiceStatus) {
    const st = window.__pendoServiceStatus;
    if (st.incidents && st.incidents.length > 0) {
      st.incidents.forEach((inc) => {
        const update = (inc.incident_updates && inc.incident_updates.length > 0)
          ? inc.incident_updates[0].body : null;
        addIssue("INCIDENT", inc.name,
          `Status: ${inc.status}` + (update ? `. Latest update: ${update}` : ""),
          null);
      });
    }
  }

  // --- Sort by severity and render ---
  collectedIssues.sort((a, b) => {
    return (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
  });

  if (collectedIssues.length === 0) {
    lines.push("No issues found. Everything looks healthy.");
  } else {
    let hasSubIdPlaceholder = false;
    collectedIssues.forEach((issue, idx) => {
      lines.push(`${idx + 1}. [${issue.severity}] ${issue.title}`);
      lines.push(`   Problem: ${issue.problem}`);
      if (issue.fix) {
        // Normalize internal line breaks: replace \n followed by any whitespace
        // with \n + consistent 3-space indent so all fix lines align under "Fix:"
        const normalizedFix = issue.fix
          .replace(/\(Replace SUB_ID with your Pendo subscription ID from app\.pendo\.io\/s\/\[SUB_ID\]\/\)\s*/gi, "")
          .replace(/\n\s*/g, "\n   ")
          .trim();
        lines.push(`   Fix: ${normalizedFix}`);
        if (normalizedFix.indexOf("YOUR_SUB_ID") !== -1) hasSubIdPlaceholder = true;
      }
    });
    lines.push("");
    lines.push("──");
    lines.push(`Total: ${collectedIssues.length} issue${collectedIssues.length !== 1 ? "s" : ""}`);

    // Add SUB_ID note once at the bottom if any fix references YOUR_SUB_ID
    if (hasSubIdPlaceholder) {
      lines.push("");
      lines.push("── Note: YOUR_SUB_ID ──");
      lines.push("Replace YOUR_SUB_ID with your Pendo subscription ID.");
      lines.push("To find it: log in to app.pendo.io → the number in the URL after /s/ is your ID");
      lines.push("(e.g. app.pendo.io/s/12345678/ → SUB_ID is 12345678)");
    }
  }

  // Append Sources section if any documentation URLs were collected
  if (sources.size > 0) {
    lines.push("");
    lines.push("── Sources ──");
    const sourceLabels = {
      "360032209131": "Content-Security-Policy (CSP)",
      "360046272771": "Developer's guide to implementing Pendo using the install script",
      "360031862272": "Installation for Single-Page Frameworks",
      "360031832072": "Visitor and Account Metadata",
      "360043539891": "CNAME for Pendo Insights and Guidance",
      "21326554691227": "Data collection and compliance"
    };
    sources.forEach(url => {
      // Extract article ID to generate a human-readable label
      const match = url.match(/articles\/(\d+)/);
      const label = match && sourceLabels[match[1]] ? sourceLabels[match[1]] : url;
      lines.push(`• ${label}: ${url}`);
    });
  }

  return lines.join("\n");
}

document.getElementById("tool-copy-issues")?.addEventListener("click", () => {
  const btn = document.getElementById("tool-copy-issues");
  const label = btn.querySelector(".tool-label");
  const origLabel = label ? label.textContent : null;
  // v3: also run pendo.validateInstall() so the artifact contains both the
  // extension's interpretation AND Pendo's own verdict. The whole thing is
  // one plain-text blob; the preamble orients both humans and LLMs.
  if (label) label.textContent = "Running validateInstall()…";
  v3CaptureValidateInstall().then(function (validateOutput) {
    let combined = buildIssuesReport();
    if (validateOutput) {
      combined += "\n\n── Pendo's official validateInstall() output ──\n" + validateOutput;
    }
    return navigator.clipboard.writeText(combined);
  }).then(() => {
    trackEvent("copy_report");
    if (label) {
      label.textContent = "Copied!";
      setTimeout(() => { label.textContent = origLabel || "Copy Issues to Clipboard"; }, 1500);
    }
  }).catch(() => {
    if (label) label.textContent = origLabel || "Copy Issues to Clipboard";
  });
});

// ===========================================================================
// INJECTED FUNCTION: Health Check (runs in page MAIN world)
// ===========================================================================

function runPendoHealthCheck() {
  var checks = [];
  // v3: Aggregate raw scalar values for the Quick Copy chip grid in the popup.
  // Each value is best-effort; missing ones surface as gray chips.
  var values = {
    pendoLoaded: false,
    ready: null,
    visitorId: null,
    visitorAnonymous: null,
    accountId: null,
    version: null,
    apiKey: null,
    dataHost: null,
    contentHost: null,
    realm: null,
    activeGuides: null,
    subscriptionId: null,
    sessionId: null
  };

  function add(status, label, detail) {
    checks.push({ status: status, label: label, detail: String(detail) });
  }

  // 1. Pendo agent loaded
  if (typeof window.pendo === "undefined" || !window.pendo) {
    add("fail", "Pendo Agent Loaded", "Pendo is not installed on this page");
    return { pendoDetected: false, checks: checks, values: values };
  }
  add("pass", "Pendo Agent Loaded", "Pendo is installed on this page");
  values.pendoLoaded = true;

  // 2. pendo.isReady()
  try {
    var ready = typeof pendo.isReady === "function" && pendo.isReady();
    values.ready = !!ready;
    if (ready) {
      add("pass", "Pendo Ready", "Pendo is initialized and running");
    } else {
      add("warn", "Pendo Ready", "Pendo is not ready yet — it may still be initializing");
    }
  } catch (e) {
    add("fail", "Pendo Ready", "Error calling pendo.isReady(): " + e.message);
  }

  // 3. Visitor ID
  try {
    var visitor =
      (pendo.getVisitorId && pendo.getVisitorId()) ||
      (pendo.get && pendo.get("visitor") && pendo.get("visitor").id) ||
      (pendo.visitorId) ||
      null;
    values.visitorId = visitor;
    if (!visitor) {
      add("fail", "Visitor ID", "No visitor ID found");
    } else if (visitor.startsWith("VISITOR-") || visitor.startsWith("_PENDO_T_")) {
      values.visitorAnonymous = true;
      add("warn", "Visitor ID", "Anonymous visitor: " + visitor);
    } else {
      values.visitorAnonymous = false;
      add("pass", "Visitor ID", visitor);
    }
  } catch (e) {
    add("fail", "Visitor ID", "Error reading visitor ID: " + e.message);
  }

  // 4. Account ID
  try {
    var account =
      (pendo.getAccountId && pendo.getAccountId()) ||
      (pendo.get && pendo.get("account") && pendo.get("account").id) ||
      (pendo.accountId) ||
      null;
    values.accountId = account;
    if (!account) {
      add("warn", "Account ID", "No account ID found");
    } else {
      add("pass", "Account ID", account);
    }
  } catch (e) {
    add("fail", "Account ID", "Error reading account ID: " + e.message);
  }

  // 6. Number of Pendo instances
  try {
    var instanceCount = 0;
    if (window.pendo) instanceCount++;
    if (window.pendo_) instanceCount++;
    // Only count AGENT scripts — not guide/content resource scripts.
    // Agent: cdn.pendo.io/.../pendo.js or pendo-io-static URLs with /agent/ path.
    // NOT guide content from pendo-static-*, content-*.static.pendo.io, etc.
    var allPendoScripts = document.querySelectorAll('script[src*="pendo"]');
    var agentScripts = 0;
    for (var ps = 0; ps < allPendoScripts.length; ps++) {
      var scriptSrc = allPendoScripts[ps].getAttribute("src") || "";
      var isAgent = (scriptSrc.indexOf("cdn.pendo.io") !== -1 || scriptSrc.indexOf("/agent/") !== -1 ||
                    (scriptSrc.indexOf("pendo-io-static") !== -1 && scriptSrc.indexOf("pendo.js") !== -1));
      var isContent = scriptSrc.indexOf("pendo-static-") !== -1 || scriptSrc.indexOf(".static.pendo.io") !== -1;
      var isTooling = scriptSrc.indexOf("debugger") !== -1 || scriptSrc.indexOf("debug.") !== -1 ||
                      scriptSrc.indexOf("designer") !== -1 || scriptSrc.indexOf("app.pendo.io") !== -1 ||
                      scriptSrc.indexOf("pendo-designer") !== -1;
      if (isAgent && !isContent && !isTooling) agentScripts++;
    }

    if (instanceCount > 1) {
      add("warn", "Pendo Instances", instanceCount + " Pendo objects detected (window.pendo + window.pendo_) — possible dual initialization");
    } else if (agentScripts > 1) {
      add("warn", "Pendo Instances", "1 Pendo object, but " + agentScripts + " Pendo agent scripts found — review for duplicate loading");
    } else {
      // Suppress pass row — "1 instance" is just the expected state, not useful info
      // add("pass", "Pendo Instances", "1 instance detected");
    }
  } catch (e) {
    add("warn", "Pendo Instances", "Error checking instances: " + e.message);
  }

  // 8. Agent version
  try {
    var version =
      (pendo.getVersion && pendo.getVersion()) ||
      pendo.VERSION ||
      null;
    values.version = version;
    if (version) {
      // Only show as check if old (major < 2), otherwise suppress
      var parts = version.split(".");
      var major = parseInt(parts[0], 10);
      if (major < 2) {
        add("warn", "Agent Version", "Agent version outdated (v" + version + ")");
      }
    } else {
      add("warn", "Agent Version", "Could not determine agent version");
    }
  } catch (e) {
    add("warn", "Agent Version", "Error reading version: " + e.message);
  }

  // 9. API key
  try {
    var apiKey =
      (pendo.get && pendo.get("apiKey")) ||
      (pendo.apiKey) ||
      null;
    values.apiKey = apiKey;
    if (!apiKey) {
      add("warn", "API Key", "Could not determine API key");
    }
    // Suppress pass row — a truncated key is not actionable for admins
  } catch (e) {
    add("warn", "API Key", "Error reading API key: " + e.message);
  }

  // 10. Data host + content host (CNAME detection)
  var detectedDataHost = null;
  var detectedContentHost = null;
  var isCname = false;
  try {
    // Read from pendo config — the authoritative source
    if (pendo.get && typeof pendo.get === "function") {
      try {
        var opts = pendo.get("options");
        if (opts && opts.dataHost) detectedDataHost = opts.dataHost;
        if (opts && opts.contentHost) detectedContentHost = opts.contentHost;
      } catch (_) {}
    }
    // Fallback: pendo._config (internal config object)
    if (!detectedDataHost && pendo._config) {
      if (pendo._config.dataHost) detectedDataHost = pendo._config.dataHost;
      if (pendo._config.contentHost) detectedContentHost = pendo._config.contentHost;
    }
    // Fallback: pendo.HOST
    if (!detectedDataHost && pendo.HOST) detectedDataHost = pendo.HOST;
    // Fallback: Pendo script src URL — CNAME shows as content.product.company.com
    if (!detectedContentHost) {
      var scripts = document.querySelectorAll('script[src*="pendo"]');
      for (var i = 0; i < scripts.length; i++) {
        try {
          var u = new URL(scripts[i].src);
          if (u.hostname !== "cdn.pendo.io" && !u.hostname.includes("pendo.io") && !u.hostname.includes("pendo-")) {
            detectedContentHost = u.hostname; // CNAME detected from script src
          } else if (!detectedContentHost) {
            detectedContentHost = u.hostname;
          }
        } catch (_) {}
      }
    }

    // Determine if CNAME is in use
    var defaultDomains = ["cdn.pendo.io", "data.pendo.io", "app.pendo.io", "pendo-io-static.storage.googleapis.com"];
    var isDataDefault = !detectedDataHost || defaultDomains.some(function(d) { return detectedDataHost.includes(d); }) || detectedDataHost.includes("pendo.io");
    var isContentDefault = !detectedContentHost || defaultDomains.some(function(d) { return detectedContentHost.includes(d); }) || detectedContentHost.includes("pendo.io") || detectedContentHost.includes("pendo-");
    isCname = !isDataDefault || !isContentDefault;

    var hostParts = [];
    if (detectedContentHost) hostParts.push("content: " + detectedContentHost);
    if (detectedDataHost) hostParts.push("data: " + detectedDataHost);
    var hostDisplay = hostParts.length > 0 ? hostParts.join(", ") : "unknown";

    if (!detectedContentHost && !detectedDataHost) {
      add("warn", "Data Host", "Could not determine data or content host");
    }
    // Suppress pass row — CDN/CNAME routing is infrastructure detail, not admin-actionable
    values.dataHost = detectedDataHost;
    values.contentHost = detectedContentHost;
    // Realm: derive from data host suffix. CNAME deployments fall back to "Custom".
    try {
      if (detectedDataHost) {
        var dh = String(detectedDataHost).toLowerCase();
        if (dh.indexOf("eu.pendo.io") !== -1) values.realm = "EU";
        else if (dh.indexOf("us1.pendo.io") !== -1) values.realm = "US1";
        else if (dh.indexOf("jp.pendo.io") !== -1 || dh.indexOf("jpn.pendo.io") !== -1) values.realm = "JP";
        else if (dh.indexOf("pendo.io") !== -1) values.realm = "US";
        else values.realm = "Custom CNAME";
      }
    } catch (_) {}
  } catch (e) {
    add("warn", "Data Host", "Error detecting data host: " + e.message);
  }

  // 10b. Data Transmission validation (CNAME-aware) — includes ad blocker diagnosis
  try {
    var perfEntries = performance.getEntriesByType ? performance.getEntriesByType("resource") : [];
    // Build match list: default Pendo domains + any detected CNAME domains
    var matchDomains = ["pendo.io", "pendo-"];
    if (isCname) {
      if (detectedContentHost && matchDomains.indexOf(detectedContentHost) === -1) matchDomains.push(detectedContentHost);
      if (detectedDataHost && matchDomains.indexOf(detectedDataHost) === -1) matchDomains.push(detectedDataHost);
    }

    var pendoRequests = perfEntries.filter(function(e) {
      if (!e.name) return false;
      for (var m = 0; m < matchDomains.length; m++) {
        if (e.name.indexOf(matchDomains[m]) !== -1) return true;
      }
      return false;
    });

    // Ad blocker bait test — merged into this check
    var adBlockDetected = false;
    var adBlockBaitResult = false;
    try {
      var bait = document.createElement("div");
      bait.className = "adsbox ad-placement ad-banner pub_300x250";
      bait.style.cssText = "position:absolute;top:-10px;left:-10px;width:1px;height:1px;overflow:hidden;pointer-events:none;";
      bait.innerHTML = "&nbsp;";
      document.body.appendChild(bait);
      var baitStyle = window.getComputedStyle(bait);
      if (baitStyle.display === "none" || baitStyle.visibility === "hidden" || bait.offsetHeight === 0) {
        adBlockDetected = true;
        adBlockBaitResult = true;
      }
      document.body.removeChild(bait);
    } catch (_) {}

    if (pendoRequests.length === 0) {
      var cause = adBlockDetected ? "ad blocker, CSP, or firewall" : "CSP or firewall";
      add("warn", "Data Transmission", "No Pendo network activity detected — likely blocked by " + cause);
    } else {
      // IMPORTANT: transferSize === 0 && decodedBodySize === 0 does NOT reliably mean "blocked."
      // Cross-origin resources without Timing-Allow-Origin headers report all size values as 0
      // per the Resource Timing API spec. This is a security restriction, not evidence of blocking.
      // We gate on Pendo functionality: if the agent is ready, data IS flowing — the zero sizes
      // are just cross-origin timing redaction.
      var pendoIsWorking = typeof window.pendo !== "undefined" && window.pendo &&
        (typeof pendo.isReady === "function" ? pendo.isReady() : !!pendo.visitorId);

      if (pendoIsWorking) {
        // Pendo agent is initialized and ready — data transmission is working
        add("pass", "Data Transmission", "Pendo is transmitting data");
      } else {
        var failed = pendoRequests.filter(function(e) { return e.transferSize === 0 && e.decodedBodySize === 0; });

        // CORS detection: check for requests that loaded but returned 0 bytes with no cache
        var corsLikely = failed.filter(function(e) {
          var isCached = e.encodedBodySize > 0 || (e.transferSize === 0 && e.decodedBodySize > 0);
          return !isCached;
        });

        if (corsLikely.length > 0 && corsLikely.length === failed.length) {
          var blockCause = adBlockDetected ? "ad blocker, CSP, or firewall" : "CSP or firewall";
          add("warn", "Data Transmission", "All Pendo requests blocked — likely " + blockCause + (adBlockBaitResult ? " (ad blocker detected via bait test)" : ""));
        } else if (failed.length > 0) {
          add("warn", "Data Transmission", "Some Pendo requests blocked — " + failed.length + " failed, likely due to " + (adBlockDetected ? "ad blocker, CSP, or firewall" : "CSP or firewall"));
        } else {
          add("pass", "Data Transmission", "Pendo is transmitting data");
        }
      }
    }
  } catch (e) {
    add("warn", "Data Transmission", "Could not analyze network requests: " + e.message);
  }

  // 11. Feature flags
  try {
    var flags = [];
    var opts = null;

    if (typeof pendo.getOptions === "function") {
      opts = pendo.getOptions();
    } else if (pendo.options) {
      opts = pendo.options;
    } else if (pendo.get && typeof pendo.get === "function") {
      try { opts = pendo.get("options"); } catch(_) {}
    }

    if (opts) {
      // Only surface flags that visibly break Pendo for an admin.
      // SDK config options (xhrWhitelist, htmlAttributes, etc.) are developer-scoped
      // and not actionable by a Pendo admin — suppress them.
      if (opts.disableGuides === true) flags.push("Guides are disabled");
      if (opts.disableAnalytics === true) flags.push("Analytics are disabled");
      if (opts.disablePersistence === true) flags.push("Persistence is disabled");
      if (opts.disableFeedback === true) flags.push("Feedback is disabled");
      if (opts.guides && opts.guides.disabled === true) flags.push("Guides are disabled");
      if (opts.excludeAllText === true) flags.push("Text capture is disabled");
    }

    // Only surface flags that affect Pendo functionality.
    // Debugging mode is intentional, transient, and not actionable — suppress it.
    if (flags.length > 0) {
      add("warn", "Feature Flags", flags.join(", "));
    }
    // Suppress pass row entirely if no flags detected
  } catch (e) {
    add("info", "Feature Flags", "Could not inspect feature flags: " + e.message);
  }

  // v3: Active guides count (chip only — not a graded check)
  try {
    var guides = null;
    if (typeof pendo.getActiveGuides === "function") guides = pendo.getActiveGuides();
    else if (Array.isArray(pendo.guides)) guides = pendo.guides;
    if (guides && typeof guides.length === "number") values.activeGuides = guides.length;
  } catch (_) {}

  // v3: Subscription ID (chip only — what operators paste into Pendo tickets / API calls)
  try {
    var subId = null;
    if (typeof pendo.getSubscriptionId === "function") subId = pendo.getSubscriptionId();
    if (!subId && pendo._config && pendo._config.subscriptionId) subId = pendo._config.subscriptionId;
    if (!subId && pendo.subscriptionId) subId = pendo.subscriptionId;
    if (subId !== null && subId !== undefined) values.subscriptionId = String(subId);
  } catch (_) {}

  // v3: Session ID (chip only — what Pendo support asks for)
  try {
    var sid = null;
    if (typeof pendo.getSessionId === "function") sid = pendo.getSessionId();
    if (!sid && pendo._session && pendo._session.id) sid = pendo._session.id;
    if (!sid && pendo.sessionId) sid = pendo.sessionId;
    if (sid !== null && sid !== undefined) values.sessionId = String(sid);
  } catch (_) {}

  return { pendoDetected: true, checks: checks, values: values };
}

// ===========================================================================
// INJECTED FUNCTION: Setup Assistant (runs in page MAIN world)
// ===========================================================================

function runPendoSetupAssistant() {
  var result = {
    framework: null,
    snippet: null,
    initialization: null,
    csp: null,
    visitorFields: [],
    accountFields: [],
    recommendations: []
  };

  function recommend(severity, title, detail) {
    result.recommendations.push({ severity: severity, title: title, detail: detail });
  }

  // -- If Pendo not present, return minimal result --------------------------
  if (typeof window.pendo === "undefined" || !window.pendo) {
    result.recommendations.push({
      severity: "error",
      title: "Pendo not installed",
      detail: "No Pendo agent detected on this page. Install the Pendo snippet or verify it loads before this check runs."
    });
    return result;
  }

  // ========================================================================
  // 1. FRAMEWORK DETECTION
  // ========================================================================
  var fw = { name: "Unknown", version: null, renderer: null, mode: null };

  // React
  if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    fw.name = "React";
    if (window.React && window.React.version) fw.version = window.React.version;
    // Detect Next.js
    if (window.__NEXT_DATA__ || document.getElementById("__next")) {
      fw.name = "Next.js (React)";
      if (window.__NEXT_DATA__ && window.__NEXT_DATA__.buildId) {
        fw.mode = "Build: " + window.__NEXT_DATA__.buildId;
      }
    }
    // Detect if using React DOM
    if (window.ReactDOM) fw.renderer = "ReactDOM";
  }
  // Vue
  else if (window.Vue || window.__VUE__) {
    fw.name = "Vue";
    if (window.Vue && window.Vue.version) fw.version = window.Vue.version;
    // Detect Nuxt
    if (window.__NUXT__ || window.$nuxt) {
      fw.name = "Nuxt (Vue)";
    }
  }
  // Angular
  else if (window.ng || document.querySelector("[ng-version]")) {
    fw.name = "Angular";
    var ngEl = document.querySelector("[ng-version]");
    if (ngEl) fw.version = ngEl.getAttribute("ng-version");
  }
  // AngularJS (1.x)
  else if (window.angular) {
    fw.name = "AngularJS";
    if (window.angular.version) fw.version = window.angular.version.full;
  }
  // Svelte
  else if (document.querySelector("[class*='svelte-']")) {
    fw.name = "Svelte";
  }
  // Ember
  else if (window.Ember || window.Em) {
    fw.name = "Ember";
    if (window.Ember && window.Ember.VERSION) fw.version = window.Ember.VERSION;
  }
  // jQuery (not a framework, but commonly used with Pendo)
  else if (window.jQuery || window.$) {
    fw.name = "jQuery";
    if (window.jQuery && window.jQuery.fn) fw.version = window.jQuery.fn.jquery;
  }

  // SPA detection
  if (document.querySelector("[id='app']") || document.querySelector("[id='root']")) {
    if (!fw.mode) fw.mode = "SPA (single root element detected)";
  }

  result.framework = fw;

  // ========================================================================
  // 2. SNIPPET ANALYSIS
  // ========================================================================
  var snippet = { loadMethod: "Unknown", isAsync: false, placement: null, scriptCount: 0 };

  // Filter to agent scripts only — exclude guide/content resource scripts
  // (pendo-static-*, content-*.static.pendo.io) that aren't the agent install snippet.
  var allPendoScriptsSnippet = document.querySelectorAll('script[src*="pendo"]');
  var pendoScripts = [];
  for (var si = 0; si < allPendoScriptsSnippet.length; si++) {
    var sSrc = allPendoScriptsSnippet[si].getAttribute("src") || "";
    var sIsContent = sSrc.indexOf("pendo-static-") !== -1 || sSrc.indexOf(".static.pendo.io") !== -1;
    var sIsTooling = sSrc.indexOf("debugger") !== -1 || sSrc.indexOf("debug.") !== -1 ||
                     sSrc.indexOf("designer") !== -1 || sSrc.indexOf("app.pendo.io") !== -1 ||
                     sSrc.indexOf("pendo-designer") !== -1;
    if (!sIsContent && !sIsTooling) pendoScripts.push(allPendoScriptsSnippet[si]);
  }
  snippet.scriptCount = pendoScripts.length;

  if (pendoScripts.length > 0) {
    var mainScript = pendoScripts[0];
    snippet.isAsync = mainScript.async || mainScript.defer;
    var mainSrc = mainScript.getAttribute("src") || "";
    snippet.loadMethod = mainSrc.indexOf("agent/static") !== -1 ? "Pendo Agent (static)" :
                          mainSrc.indexOf("pendo-agent") !== -1 ? "Pendo Agent (bundled)" :
                          "Script tag";

    // Determine placement
    if (mainScript.parentElement && mainScript.parentElement.tagName === "HEAD") {
      snippet.placement = "<head>";
    } else if (mainScript.parentElement && mainScript.parentElement.tagName === "BODY") {
      snippet.placement = "<body>";
    } else {
      snippet.placement = mainScript.parentElement ? mainScript.parentElement.tagName.toLowerCase() : "unknown";
    }
  } else {
    // No external script — likely inline snippet or npm package
    var inlineScripts = document.querySelectorAll("script:not([src])");
    var foundInline = false;
    for (var i = 0; i < inlineScripts.length; i++) {
      if (inlineScripts[i].textContent && inlineScripts[i].textContent.indexOf("pendo") !== -1) {
        snippet.loadMethod = "Inline snippet";
        foundInline = true;
        break;
      }
    }
    if (!foundInline) {
      snippet.loadMethod = "npm package or dynamic injection";
    }
  }

  result.snippet = snippet;

  // ========================================================================
  // 3. INITIALIZATION ANALYSIS
  // ========================================================================
  var init = {
    method: "Unknown",
    timing: null,
    hasVisitorId: false,
    hasAccountId: false
  };

  // Check if initialized
  try {
    var isReady = typeof pendo.isReady === "function" && pendo.isReady();

    if (isReady) {
      init.timing = "Initialized (agent is ready)";
    } else {
      init.timing = "Not yet initialized or pending";
    }

    // Detect initialization method
    if (typeof pendo.initialize === "function") {
      init.method = "pendo.initialize()";
    }
    if (typeof pendo.identify === "function") {
      // Check if identify was likely used (visitor data present but via identify)
      init.method = "pendo.initialize() / pendo.identify()";
    }

    // Check visitor ID
    var vid =
      (pendo.getVisitorId && pendo.getVisitorId()) ||
      (pendo.visitorId) ||
      null;
    if (vid && !vid.startsWith("VISITOR-") && !vid.startsWith("_PENDO_T_")) {
      init.hasVisitorId = true;
    }

    // Check account ID
    var aid =
      (pendo.getAccountId && pendo.getAccountId()) ||
      (pendo.accountId) ||
      null;
    if (aid) {
      init.hasAccountId = true;
    }
  } catch (e) {
    init.timing = "Error inspecting initialization: " + e.message;
  }

  result.initialization = init;

  // ========================================================================
  // 4. CONTENT SECURITY POLICY ANALYSIS (proactive + reactive)
  // ========================================================================
  var csp = { detected: false, source: null, directives: {}, issues: [], proactiveFindings: [] };

  try {
    // --- A. Parse CSP from meta tags AND HTTP headers ---
    // First try meta tags (synchronous)
    var cspMetas = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
    var cspRaw = "";
    for (var cm = 0; cm < cspMetas.length; cm++) {
      cspRaw += " " + (cspMetas[cm].getAttribute("content") || "");
    }

    // Also try reading CSP from HTTP header via same-origin HEAD request
    // (this works because same-origin responses expose CSP headers)
    if (!cspRaw.trim()) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("HEAD", window.location.href, false); // synchronous
        xhr.send();
        var headerCSP = xhr.getResponseHeader("Content-Security-Policy") || "";
        var reportOnlyCSP = xhr.getResponseHeader("Content-Security-Policy-Report-Only") || "";
        if (headerCSP.trim()) {
          cspRaw = headerCSP;
          csp.source = "HTTP header";
        } else if (reportOnlyCSP.trim()) {
          // Report-Only CSP logs violations but does NOT enforce/block anything.
          // Parse it for informational value but mark it clearly.
          cspRaw = reportOnlyCSP;
          csp.source = "HTTP header (Report-Only — not enforced)";
          csp.reportOnly = true;
        }
      } catch (xhrErr) {
        // Fetch failed — can't read HTTP headers from this context
      }
    }

    // --- B. Detect CSP violations via Performance API ---
    // IMPORTANT: transferSize === 0 && decodedBodySize === 0 is NOT reliable evidence
    // of CSP blocking. The Resource Timing API redacts these values for cross-origin
    // resources that don't set Timing-Allow-Origin (which most CDNs don't).
    // We now cross-reference with actual Pendo functionality to avoid false positives.
    var cspViolations = [];
    var blockedByDomain = {};
    var detectedSubId = null; // Will hold the actual Pendo subscription ID if found
    try {
      var perfEntries = performance.getEntriesByType && performance.getEntriesByType("resource") || [];
      var pendoResources = perfEntries.filter(function(e) { return e.name && e.name.indexOf("pendo") !== -1; });

      // Extract SUB_ID from any Pendo resource URL (blocked or not)
      // Pattern: pendo-static-{SUB_ID}.storage.googleapis.com or content-{SUB_ID}.static.pendo.io
      pendoResources.forEach(function(e) {
        if (detectedSubId) return;
        var m = e.name.match(/pendo-static-(\d+)\.storage/) || e.name.match(/content-(\d+)\.static\.pendo/);
        if (m) detectedSubId = m[1];
      });

      // Only treat resources as blocked if Pendo is NOT functional.
      // If Pendo IS working (agent ready, data flowing), zero-size entries are just
      // cross-origin timing redaction, not actual blocking.
      var pendoWorking = typeof window.pendo !== "undefined" && window.pendo &&
        (typeof pendo.isReady === "function" ? pendo.isReady() : !!pendo.visitorId);
      var blockedPendo = pendoResources.filter(function(e) { return e.transferSize === 0 && e.decodedBodySize === 0; });

      if (blockedPendo.length > 0 && !pendoWorking) {
        // Group by domain to avoid flooding the report with per-URL entries
        blockedPendo.forEach(function(e) {
          try {
            var domain = new URL(e.name).hostname;
            if (!blockedByDomain[domain]) blockedByDomain[domain] = 0;
            blockedByDomain[domain]++;
          } catch (ue) {
            if (!blockedByDomain["unknown"]) blockedByDomain["unknown"] = 0;
            blockedByDomain["unknown"]++;
          }
        });
        var domainSummary = Object.keys(blockedByDomain).map(function(d) {
          return d + " (" + blockedByDomain[d] + ")";
        }).join(", ");
        cspViolations.push(blockedPendo.length + " Pendo resource" + (blockedPendo.length !== 1 ? "s" : "") + " blocked: " + domainSummary);
      }
    } catch (perfErr) {}

    // Helper: replace {{SUB_ID}} template with actual subscription ID if detected,
    // or add clear instructions for finding it when not detected.
    function subIdFix(text) {
      if (!text) return text;
      if (detectedSubId) {
        return text.replace(/\{\{SUB_ID\}\}/g, detectedSubId)
                   .replace(/\s*\(replace SUB_ID with your Pendo subscription ID from app\.pendo\.io\/s\/\[SUB_ID\]\/\)/gi, "");
      }
      // SUB_ID not detected — replace template with placeholder only.
      // The SUB_ID lookup instructions are appended ONCE in the clipboard footer
      // (see buildIssuesReport) to avoid repeating them on every CSP fix line.
      return text.replace(/\{\{SUB_ID\}\}/g, "YOUR_SUB_ID");
    }

    // --- C. Proactive: check what Pendo needs vs what's actually working ---
    var pendoFunctional = typeof window.pendo !== "undefined" && window.pendo;
    var pendoAgentLoaded = pendoResources && pendoResources.length > 0;
    // Check if guides API is available AND has loaded guides (not just function existence)
    var guidesWorking = false;
    try {
      guidesWorking = pendoFunctional && typeof pendo.getActiveGuides === "function";
    } catch (gErr) {}
    // Data flow detection: DON'T rely on transferSize (redacted for cross-origin).
    // Instead check (a) if data.pendo.io requests exist at all in perf entries, AND
    // (b) if Pendo reports itself as ready (meaning it successfully communicated).
    var dataFlowing = false;
    try {
      var dataReqs = perfEntries ? perfEntries.filter(function(e) {
        return e.name && (e.name.indexOf("data.pendo.io") !== -1 || e.name.indexOf("/data/") !== -1);
      }) : [];
      // Requests to data.pendo.io exist — combined with pendo being functional,
      // this means data IS flowing (the requests weren't blocked, they just have
      // redacted timing info due to cross-origin restrictions).
      dataFlowing = dataReqs.length > 0 ||
        (pendoFunctional && typeof pendo.isReady === "function" && pendo.isReady());
    } catch (dErr) {}

    // --- D. Parse meta-tag CSP directives ---
    // Pendo-documented required domains (support.pendo.io/hc/en-us/articles/360032209131)
    // Includes US default + regional variants (US1, EU, JP, AU)
    var pendoHosts = [
      // Core US domains
      "cdn.pendo.io", "app.pendo.io", "data.pendo.io", "portal.pendo.io",
      // Regional variants
      "us1.app.pendo.io", "us1.cdn.pendo.io", "us1.data.pendo.io",
      "app.eu.pendo.io", "cdn.eu.pendo.io", "data.eu.pendo.io",
      "app.jpn.pendo.io", "cdn.jpn.pendo.io", "data.jpn.pendo.io",
      "app.au.pendo.io", "cdn.au.pendo.io", "data.au.pendo.io",
      // GCS buckets
      "pendo-io-static.storage.googleapis.com",
      // Wildcards for subscription-specific buckets
      "*.storage.googleapis.com",
      // Wildcard for pendo.io subdomains
      "*.pendo.io", "pendo.io"
    ];

    function hostAllowed(sources) {
      return sources.some(function(v) {
        if (v === "*") return true;
        // Check static host list
        if (pendoHosts.some(function(h) { return v.indexOf(h) !== -1; })) return true;
        // Check new content-SUB_ID.static.pendo.io pattern (Oct 2025+)
        if (v.indexOf(".static.pendo.io") !== -1) return true;
        if (v.indexOf("static.pendo.io") !== -1) return true;
        return false;
      });
    }

    function valueAllowed(sources, val) {
      return sources.some(function(v) { return v === val; });
    }

    function getDirective(name) {
      return csp.directives[name] || csp.directives["default-src"] || [];
    }

    if (cspRaw.trim()) {
      csp.detected = true;
      if (!csp.source) csp.source = "meta tag"; // preserve "HTTP header" if set by XHR

      // Parse directives
      cspRaw.split(";").forEach(function(d) {
        var parts = d.trim().split(/\s+/);
        if (parts.length > 0 && parts[0]) {
          csp.directives[parts[0]] = parts.slice(1);
        }
      });

      // =================================================================
      // Directive-level checks — exact domains per Pendo official docs
      // Ref: support.pendo.io/hc/en-us/articles/360032209131
      //
      // Note: SUB_ID = customer's Pendo subscription ID.
      // Domains ending in pendo-static-{{ SUB_ID }}.storage.googleapis.com
      // or content-{{ SUB_ID }}.static.pendo.io are subscription-specific.
      // We can't know the SUB_ID, so fix text uses the template format.
      // =================================================================

      // Helper: detect 'strict-dynamic' in a directive's sources.
      // When 'strict-dynamic' is present, host-based allowlists are IGNORED by the browser.
      // Scripts loaded by a nonced/hashed trusted script are automatically permitted.
      // Pendo's install snippet is typically nonced, so the agent it fetches is trusted transitively.
      function hasStrictDynamic(sources) {
        return sources.some(function(v) { return v === "'strict-dynamic'"; });
      }

      // Helper: detect nonce or hash in sources
      function hasNonceOrHash(sources) {
        return sources.some(function(v) {
          return v.indexOf("'nonce-") !== -1 || v.indexOf("'sha256-") !== -1 || v.indexOf("'sha384-") !== -1;
        });
      }

      // script-src
      // Required: cdn.pendo.io, pendo-io-static.storage.googleapis.com,
      //   pendo-static-{{SUB_ID}}.storage.googleapis.com OR content-{{SUB_ID}}.static.pendo.io,
      //   app.pendo.io (designer only), 'unsafe-inline' + 'unsafe-eval' (code blocks/designer only)
      var scriptSrc = getDirective("script-src");
      if (scriptSrc.length > 0) {
        var scriptHasStrictDynamic = hasStrictDynamic(scriptSrc);
        var scriptHasNonce = hasNonceOrHash(scriptSrc);

        // If strict-dynamic is present with a nonce/hash, host-based allowlists are irrelevant.
        // The Pendo snippet (nonced) loads the agent, which is trusted transitively.
        if (!hostAllowed(scriptSrc) && !scriptHasStrictDynamic) {
          csp.issues.push({ directive: "script-src", severity: "error",
            detail: "Pendo domains not allowed in script-src — the Pendo agent and guide code can't load.",
            fix: "Add to your CSP script-src directive:\n  cdn.pendo.io pendo-io-static.storage.googleapis.com pendo-static-{{SUB_ID}}.storage.googleapis.com content-{{SUB_ID}}.static.pendo.io\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
        }
        if (!valueAllowed(scriptSrc, "'unsafe-inline'") && !scriptHasNonce && !scriptHasStrictDynamic) {
          csp.issues.push({ directive: "script-src (inline)", severity: "warning",
            detail: "'unsafe-inline' not in script-src and no nonce/hash found — Pendo's inline snippet and guide code blocks won't run.",
            fix: "Add 'unsafe-inline' to script-src (required for code blocks and classic guides).\n  Or use a nonce: script-src ... 'nonce-YOUR_NONCE'\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
        }
        if (!valueAllowed(scriptSrc, "'unsafe-eval'") && !valueAllowed(scriptSrc, "*")) {
          // unsafe-eval warning is still valid even with strict-dynamic — eval is separate
          csp.issues.push({ directive: "script-src (eval)", severity: "warning",
            detail: "'unsafe-eval' not in script-src — guide code blocks and Resource Center integrations may not execute.",
            fix: "Add 'unsafe-eval' to script-src (required for code blocks and Resource Center):\n  script-src ... 'unsafe-eval'\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
        }
      }

      // connect-src
      // Required: data.pendo.io, pendo-static-{{SUB_ID}}.storage.googleapis.com OR
      //   content-{{SUB_ID}}.static.pendo.io, app.pendo.io (designer only)
      // Note: strict-dynamic does NOT affect connect-src — it only applies to script loading.
      // However, if Pendo is demonstrably transmitting data, this is informational not critical.
      var connectSrc = getDirective("connect-src");
      if (connectSrc.length > 0 && !hostAllowed(connectSrc)) {
        csp.issues.push({ directive: "connect-src", severity: "error",
          detail: "Pendo data endpoints not in connect-src — analytics events, guide data, and Session Replay won't transmit.",
          fix: "Add to your CSP connect-src directive:\n  data.pendo.io pendo-static-{{SUB_ID}}.storage.googleapis.com content-{{SUB_ID}}.static.pendo.io app.pendo.io\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
      }

      // style-src
      // Required: pendo-io-static.storage.googleapis.com (default guide CSS),
      //   pendo-static-{{SUB_ID}}.storage.googleapis.com OR content-{{SUB_ID}}.static.pendo.io,
      //   'unsafe-inline', app.pendo.io (designer only)
      var styleSrc = getDirective("style-src");
      if (styleSrc.length > 0) {
        if (!hostAllowed(styleSrc) && !valueAllowed(styleSrc, "*")) {
          csp.issues.push({ directive: "style-src (hosts)", severity: "warning",
            detail: "Pendo style hosts not in style-src — guide CSS and global styles won't load.",
            fix: "Add to your CSP style-src directive:\n  pendo-io-static.storage.googleapis.com pendo-static-{{SUB_ID}}.storage.googleapis.com content-{{SUB_ID}}.static.pendo.io app.pendo.io\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
        }
        if (!valueAllowed(styleSrc, "'unsafe-inline'") && !valueAllowed(styleSrc, "*")) {
          var hasStyleNonce = styleSrc.some(function(v) { return v.indexOf("nonce-") !== -1; });
          csp.issues.push({ directive: "style-src (inline)", severity: "warning",
            detail: "'unsafe-inline' not in style-src — Pendo guide pseudo styles (hover, carets, number scale) won't render.",
            fix: (hasStyleNonce
              ? "Pass your nonce to Pendo via the inlineStyleNonce option:\n  pendo.initialize({ inlineStyleNonce: 'YOUR_NONCE' })"
              : "Add 'unsafe-inline' to your CSP style-src directive.") +
              "\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
        }
      }

      // img-src
      // Required: cdn.pendo.io (classic badge images), data.pendo.io (events sent via img src!),
      //   pendo-static-{{SUB_ID}}.storage.googleapis.com OR content-{{SUB_ID}}.static.pendo.io,
      //   app.pendo.io (designer only), data: (default badge images)
      var imgSrc = getDirective("img-src");
      if (imgSrc.length > 0 && !hostAllowed(imgSrc) && !valueAllowed(imgSrc, "*")) {
        var hasDataUri = valueAllowed(imgSrc, "data:");
        var imgFix = "Add to your CSP img-src directive:\n  cdn.pendo.io data.pendo.io pendo-static-{{SUB_ID}}.storage.googleapis.com content-{{SUB_ID}}.static.pendo.io app.pendo.io";
        if (!hasDataUri) imgFix += " data:";
        imgFix += "\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo";
        csp.issues.push({ directive: "img-src", severity: "warning",
          detail: "Pendo not in img-src — guide images won't load and analytics events won't send (Pendo uses img src for event transmission)." + (!hasDataUri ? " Also missing data: for default badge images." : ""),
          fix: imgFix });
      }

      // font-src
      // Required: cdn.pendo.io (designer fonts, debugger, guide preview)
      var fontSrc = getDirective("font-src");
      if (fontSrc.length > 0 && !hostAllowed(fontSrc) && !valueAllowed(fontSrc, "*")) {
        csp.issues.push({ directive: "font-src", severity: "warning",
          detail: "Pendo not in font-src — Visual Design Studio fonts, debugger, and guide preview fonts won't load.",
          fix: "Add to your CSP font-src directive:\n  cdn.pendo.io\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
      }

      // frame-src / child-src
      // Required: app.pendo.io (Visual Design Studio), portal.pendo.io (Listen ideas portal)
      var frameSrc = csp.directives["frame-src"] || csp.directives["child-src"] || csp.directives["default-src"] || [];
      if (frameSrc.length > 0 && !hostAllowed(frameSrc)) {
        csp.issues.push({ directive: "frame-src", severity: "warning",
          detail: "Pendo not in frame-src — the Visual Design Studio and Listen ideas portal use iframes and will be blocked.",
          fix: "Add to your CSP frame-src directive:\n  app.pendo.io portal.pendo.io\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
      }

      // worker-src
      // Required: blob: (Session Replay web worker for data compression)
      var workerSrc = getDirective("worker-src");
      if (workerSrc.length > 0 && !valueAllowed(workerSrc, "*") && !valueAllowed(workerSrc, "blob:")) {
        csp.issues.push({ directive: "worker-src", severity: "warning",
          detail: "blob: not in worker-src — Session Replay's web worker for data compression can't start, impacting replay capture and page performance.",
          fix: "Add to your CSP worker-src directive:\n  blob:\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
      }

      // trusted-types (Chromium only, requires SDK ≥ 2.184.0)
      var trustedTypes = csp.directives["trusted-types"] || csp.directives["require-trusted-types-for"] || [];
      if (trustedTypes.length > 0 && !valueAllowed(trustedTypes, "pendo")) {
        csp.issues.push({ directive: "trusted-types", severity: "warning",
          detail: "Trusted Types policy active but 'pendo' not listed — Pendo DOM operations will be blocked.",
          fix: "Add to your CSP trusted-types directive:\n  trusted-types pendo\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
      }

      // --- PROACTIVE: check for directives that SHOULD exist but DON'T ---
      // If default-src is restrictive and specific directives are missing, flag them
      var defaultSrc = csp.directives["default-src"] || [];
      var defaultIsRestrictive = defaultSrc.length > 0 && !valueAllowed(defaultSrc, "*") && !hostAllowed(defaultSrc);

      if (defaultIsRestrictive) {
        if (!csp.directives["script-src"]) {
          csp.proactiveFindings.push({ directive: "script-src", severity: "warning", detail: "No script-src defined — inherits from restrictive default-src. Pendo's CDN scripts may be blocked. Explicitly add script-src with cdn.pendo.io." });
        }
        if (!csp.directives["connect-src"]) {
          csp.proactiveFindings.push({ directive: "connect-src", severity: "warning", detail: "No connect-src defined — inherits from restrictive default-src. Pendo analytics data transmission will fail. Add connect-src with data.pendo.io." });
        }
        if (!csp.directives["style-src"]) {
          csp.proactiveFindings.push({ directive: "style-src", severity: "warning", detail: "No style-src defined — inherits from restrictive default-src. Pendo guide styling will be blocked. Add style-src with 'unsafe-inline'." });
        }
        if (!csp.directives["img-src"]) {
          csp.proactiveFindings.push({ directive: "img-src", severity: "warning", detail: "No img-src defined — inherits from restrictive default-src. Pendo guide images won't load. Add img-src with cdn.pendo.io and data:." });
        }
      }
    }

    // --- E. Runtime blocked-resource detection (runs ALWAYS — catches blocks even when CSP parsed OK) ---
    // This catches cases where CSP was readable but resources are still blocked
    // (e.g., multiple CSP headers, browser extensions, report-only policies)
    if (cspViolations.length > 0) {
      if (!csp.detected) {
        csp.detected = true;
        csp.source = "HTTP header (detected via blocked resources)";
      }

      // Map blocked domains to affected CSP directives per Pendo docs
      var blockedDomains = Object.keys(blockedByDomain);
      var hasCdn = blockedDomains.some(function(d) { return d.indexOf("cdn.pendo.io") !== -1; });
      var hasData = blockedDomains.some(function(d) { return d.indexOf("data.pendo.io") !== -1; });
      var hasStorage = blockedDomains.some(function(d) { return d.indexOf("storage.googleapis.com") !== -1; });
      var hasStatic = blockedDomains.some(function(d) { return d.indexOf(".static.pendo.io") !== -1; });
      var hasApp = blockedDomains.some(function(d) { return d.indexOf("app.pendo.io") !== -1; });

      // Build per-directive issues — only for directives actually affected by blocked resources
      var domainSummary = blockedDomains.map(function(d) { return d + " (" + blockedByDomain[d] + ")"; }).join(", ");
      var baseDetail = blockedPendo.length + " Pendo resource" + (blockedPendo.length !== 1 ? "s" : "") + " blocked: " + domainSummary + ".";

      // script-src: cdn.pendo.io loads the agent, storage loads guide code
      if (hasCdn || hasStorage || hasStatic) {
        var scriptDomains = ["cdn.pendo.io", "pendo-io-static.storage.googleapis.com",
          "pendo-static-{{SUB_ID}}.storage.googleapis.com", "content-{{SUB_ID}}.static.pendo.io",
          "'unsafe-inline'"];
        csp.issues.push({ directive: "script-src", severity: "error",
          detail: "Pendo scripts blocked" + (hasCdn ? " (cdn.pendo.io)" : "") + (hasStorage ? " (storage.googleapis.com)" : "") + ".",
          fix: "Add to script-src:\n  " + scriptDomains.join(" ") });
      }

      // connect-src: data.pendo.io sends analytics, storage serves content
      if (hasData || hasStorage || hasStatic || hasApp) {
        var connectDomains = ["data.pendo.io",
          "pendo-static-{{SUB_ID}}.storage.googleapis.com", "content-{{SUB_ID}}.static.pendo.io",
          "app.pendo.io"];
        csp.issues.push({ directive: "connect-src", severity: "error",
          detail: "Pendo data transmission blocked" + (hasData ? " (data.pendo.io)" : "") + (hasStorage ? " (storage.googleapis.com)" : "") + ".",
          fix: "Add to connect-src:\n  " + connectDomains.join(" ") });
      }

      // img-src: data.pendo.io sends events via img src, cdn serves images
      if (hasData || hasCdn || hasStorage || hasStatic) {
        var imgDomains = ["cdn.pendo.io", "data.pendo.io",
          "pendo-static-{{SUB_ID}}.storage.googleapis.com", "content-{{SUB_ID}}.static.pendo.io",
          "app.pendo.io", "data:"];
        csp.issues.push({ directive: "img-src", severity: "warning",
          detail: "Pendo images/events may be blocked" + (hasData ? " (data.pendo.io sends analytics via img src)" : "") + ".",
          fix: "Add to img-src:\n  " + imgDomains.join(" ") });
      }

      // style-src: only if storage/static domains are blocked (serve guide CSS)
      if (hasStorage || hasStatic) {
        csp.issues.push({ directive: "style-src", severity: "warning",
          detail: "Pendo guide styles may be blocked (served from storage/static domains).",
          fix: "Add to style-src:\n  pendo-io-static.storage.googleapis.com pendo-static-{{SUB_ID}}.storage.googleapis.com content-{{SUB_ID}}.static.pendo.io 'unsafe-inline'" });
      }

      // font-src: only if cdn.pendo.io is blocked
      if (hasCdn) {
        csp.issues.push({ directive: "font-src", severity: "warning",
          detail: "Pendo fonts may be blocked (served from cdn.pendo.io).",
          fix: "Add to font-src:\n  cdn.pendo.io" });
      }
    } else if (!csp.detected && pendoAgentLoaded && !dataFlowing && pendoFunctional) {
      // Agent loaded but data isn't flowing — possible silent connect-src block
      csp.detected = true;
      csp.source = "Possible HTTP header restriction";
      csp.issues.push({ directive: "connect-src (silent block)", severity: "warning",
        detail: "Pendo agent loaded but no data requests detected — a CSP connect-src restriction may be silently blocking analytics.",
        fix: "Add to your CSP connect-src directive:\n  data.pendo.io pendo-static-{{SUB_ID}}.storage.googleapis.com content-{{SUB_ID}}.static.pendo.io app.pendo.io" });
    }

    if (!csp.detected) {
      if (pendoResources && pendoResources.length > 0) {
        csp.source = "No restrictive CSP detected (Pendo resources loaded successfully)";
      } else if (pendoFunctional) {
        csp.source = "No restrictive CSP detected (Pendo agent is functional)";
      }
    }

    // Merge proactive findings into issues array
    csp.issues = csp.issues.concat(csp.proactiveFindings);

    // --- FUNCTIONALITY GATE ---
    // If Pendo is demonstrably working (agent ready, data flowing, guides loading),
    // downgrade "error" CSP issues to "warning". The CSP policy may be technically
    // non-compliant with Pendo's docs, but if everything works (e.g., via strict-dynamic,
    // nonces, or other mechanisms the proactive parser doesn't fully understand),
    // a red X critical error is misleading. The user still sees the warning.
    if (pendoFunctional && (dataFlowing || guidesWorking)) {
      csp.issues.forEach(function(issue) {
        if (issue.severity === "error") {
          issue.severity = "warning";
          issue.detail = issue.detail + " (Pendo appears functional — CSP may be using nonces or strict-dynamic)";
        }
      });
    }

    // Report-Only CSP doesn't block anything — downgrade all issues to informational
    if (csp.reportOnly) {
      csp.issues.forEach(function(issue) {
        if (issue.severity === "error" || issue.severity === "warning") {
          issue.severity = "info";
          issue.detail = "[Report-Only] " + issue.detail;
        }
      });
    }

    // Replace {{SUB_ID}} template with actual subscription ID if detected
    csp.issues.forEach(function(issue) {
      if (issue.fix) issue.fix = subIdFix(issue.fix);
    });
    if (detectedSubId) csp.detectedSubId = detectedSubId;
  } catch (e) {
    csp.issues.push({ directive: "parse-error", severity: "warning", detail: "Error analyzing CSP: " + e.message });
  }

  result.csp = csp;

  // ========================================================================
  // 5. METADATA FIELD VALIDATION
  // ========================================================================

  var SENSITIVE_PATTERNS = /^(password|passwd|secret|token|ssn|credit.?card|cvv|auth.?key|api.?secret|private.?key)$/i;
  var VALID_FIELD_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  var MAX_VALUE_LENGTH = 1024;

  function validateFields(obj) {
    var fields = [];
    if (!obj || typeof obj !== "object") return fields;
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var val = obj[key];
      var type = val === null ? "null" : Array.isArray(val) ? "array" : typeof val;
      var warnings = [];

      // Sensitive field name
      if (SENSITIVE_PATTERNS.test(key)) {
        warnings.push("Possibly sensitive field name");
      }

      // Invalid field name characters
      if (!VALID_FIELD_NAME.test(key)) {
        warnings.push("Field name should use only letters, numbers, underscores");
      }

      // Value too long
      if (typeof val === "string" && val.length > MAX_VALUE_LENGTH) {
        warnings.push("Value exceeds 1024 chars (" + val.length + ")");
      }

      // Null or undefined
      if (val === null || val === undefined) {
        warnings.push("Null/undefined value");
      }

      // Nested objects
      if (type === "object" && !Array.isArray(val)) {
        warnings.push("Nested object — Pendo only supports flat fields");
      }

      // Arrays
      if (type === "array") {
        warnings.push("Array value — consider converting to comma-separated string");
      }

      // Functions
      if (type === "function") {
        warnings.push("Function value — will not be sent to Pendo");
      }

      fields.push({ key: key, type: type, warnings: warnings });
    }
    return fields;
  }

  try {
    var visitorMeta =
      pendo.metadata && pendo.metadata.auto && pendo.metadata.auto.visitor;
    if (visitorMeta && typeof visitorMeta === "object") {
      result.visitorFields = validateFields(visitorMeta);
    }
  } catch (e) {}

  try {
    var accountMeta =
      pendo.metadata && pendo.metadata.auto && pendo.metadata.auto.account;
    if (accountMeta && typeof accountMeta === "object") {
      result.accountFields = validateFields(accountMeta);
    }
  } catch (e) {}

  // ========================================================================
  // 5. RECOMMENDATIONS
  // ========================================================================

  // Visitor ID and Account ID: owned by Health Check tab (runtime state).
  // Setup Assistant focuses on installation quality — no duplication here.

  // Async loading
  if (result.snippet && !result.snippet.isAsync && result.snippet.loadMethod.indexOf("npm") === -1) {
    recommend("warning", "Script not loaded async",
      "The Pendo snippet is loaded synchronously, which blocks page rendering until it finishes downloading.\n  FIX: Add the async attribute to your Pendo <script> tag:\n    <script async src=\"https://cdn.pendo.io/agent/static/YOUR_API_KEY/pendo.js\"></script>\n  If you're using the classic snippet with inline code, add async to the script block that creates the <script> element.\n  Docs: https://support.pendo.io/hc/en-us/articles/360031862272-Install-Pendo-on-a-single-page-web-application");
  }

  // Duplicate scripts and dual initialization: owned by Health Check tab
  // (runtime state — "Pendo Instances" check covers script count + object count)

  // Sensitive metadata fields
  var allFields = (result.visitorFields || []).concat(result.accountFields || []);
  var sensitiveFields = [];
  for (var f = 0; f < allFields.length; f++) {
    for (var w = 0; w < allFields[f].warnings.length; w++) {
      if (allFields[f].warnings[w].indexOf("sensitive") !== -1) {
        sensitiveFields.push(allFields[f].key);
      }
    }
  }
  if (sensitiveFields.length > 0) {
    recommend("error", "Potentially sensitive metadata detected",
      "Fields that may contain sensitive data: " + sensitiveFields.join(", ") + ".\n  FIX: Remove these fields from your pendo.initialize() call, or replace them with non-sensitive equivalents (e.g. use a hashed email instead of a raw email).\n  To exclude fields in Pendo: Settings → Subscription Settings → Data Mappings → find the field → toggle it off.\n  If these fields are intentional, ensure you have a Data Processing Agreement with Pendo covering PII.\n  Docs: https://support.pendo.io/hc/en-us/articles/360031832072-Configure-visitor-and-account-metadata");
  }

  // Nested or array fields
  var complexFields = [];
  for (var f2 = 0; f2 < allFields.length; f2++) {
    for (var w2 = 0; w2 < allFields[f2].warnings.length; w2++) {
      if (allFields[f2].warnings[w2].indexOf("Nested") !== -1 || allFields[f2].warnings[w2].indexOf("Array") !== -1) {
        complexFields.push(allFields[f2].key);
      }
    }
  }
  if (complexFields.length > 0) {
    recommend("warning", "Complex metadata values",
      "Fields with non-flat values: " + complexFields.join(", ") + ".\n  FIX: Pendo only processes flat key-value pairs — nested objects and arrays are silently ignored.\n  Instead of: { plan: { name: 'Pro', tier: 2 } }\n  Use:        { plan_name: 'Pro', plan_tier: 2 }\n  Instead of: { tags: ['admin', 'beta'] }\n  Use:        { tags: 'admin,beta' }\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script");
  }

  // Framework-specific timing tips
  if (fw.name.indexOf("React") !== -1 || fw.name.indexOf("Next") !== -1) {
    if (!init.hasVisitorId) {
      recommend("tip", "React initialization timing",
        "No visitor ID detected — likely pendo.initialize() is being called before your auth flow resolves.\n  FIX: Call pendo.initialize() inside a useEffect that depends on your auth state:\n    useEffect(() => {\n      if (user?.id) {\n        pendo.initialize({ visitor: { id: user.id }, account: { id: user.accountId } });\n      }\n    }, [user]);\n  Docs: https://support.pendo.io/hc/en-us/articles/360031862272-Install-Pendo-on-a-single-page-web-application");
    }
  } else if (fw.name.indexOf("Vue") !== -1 || fw.name.indexOf("Nuxt") !== -1) {
    if (!init.hasVisitorId) {
      recommend("tip", "Vue initialization timing",
        "No visitor ID detected — likely pendo.initialize() is being called before your auth flow resolves.\n  FIX: In Vue, call pendo.initialize() in a route guard or in mounted() after the user is authenticated:\n    mounted() {\n      if (this.$auth.user) {\n        pendo.initialize({ visitor: { id: this.$auth.user.id } });\n      }\n    }\n  Docs: https://support.pendo.io/hc/en-us/articles/360031862272-Install-Pendo-on-a-single-page-web-application");
    }
  } else if (fw.name.indexOf("Angular") !== -1) {
    if (!init.hasVisitorId) {
      recommend("tip", "Angular initialization timing",
        "No visitor ID detected — likely pendo.initialize() is being called before your auth flow resolves.\n  FIX: In Angular, call pendo.initialize() in an AfterViewInit lifecycle hook or route resolver after fetching user data:\n    ngAfterViewInit() {\n      this.authService.user$.subscribe(user => {\n        pendo.initialize({ visitor: { id: user.id } });\n      });\n    }\n  Docs: https://support.pendo.io/hc/en-us/articles/360031862272-Install-Pendo-on-a-single-page-web-application");
    }
  }

  // Payload size estimate
  try {
    var payloadEstimate = JSON.stringify(pendo.metadata || {}).length;
    if (payloadEstimate > 50000) {
      recommend("warning", "Large metadata payload",
        "Estimated metadata size is " + Math.round(payloadEstimate / 1024) + "KB. Pendo has a 64KB limit per request — exceeding this will silently drop data.\n  FIX: Audit your pendo.initialize() call and remove fields that aren't used for segmentation or analytics.\n  Common culprits: serialized objects, long strings, redundant fields, debug data.\n  To see which fields are actually used: Pendo → Settings → Data Mappings → sort by 'Last Seen'.\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script");
    }
  } catch (e) {}

  // Agent version check
  try {
    var ver = (pendo.getVersion && pendo.getVersion()) || pendo.VERSION || null;
    if (ver) {
      var parts = ver.split(".");
      var major = parseInt(parts[0], 10);
      if (major < 2) {
        recommend("tip", "Agent version may be outdated",
          "Running Pendo agent v" + ver + " (major version < 2).\n  FIX: Update to the latest agent by replacing your snippet script src with the current CDN URL, or if using npm, run: npm update @pendo/agent\n  Newer versions include performance improvements, Session Replay support, and security patches.\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script");
      }
    }
  } catch (e) {}

  // CSP issues are already surfaced in the CSP section — no need to duplicate
  // as separate recommendations (that was causing "runtime, runtime, runtime...")

  // No metadata at all
  if (result.visitorFields.length === 0 && result.accountFields.length === 0) {
    recommend("tip", "No metadata fields detected",
      "Pendo is initialized without visitor or account metadata. Without metadata, you can't segment users by role, plan, company, or other attributes.\n  FIX: Add metadata fields to your pendo.initialize() call:\n    pendo.initialize({\n      visitor: { id: 'USER_ID', email: 'user@example.com', role: 'admin', created_at: '2024-01-15' },\n      account: { id: 'ACCOUNT_ID', name: 'Acme Corp', plan_level: 'enterprise', is_paying: true }\n    });\n  Start with: email, role, plan_level, created_at, is_paying — these cover 80% of segmentation needs.\n  Docs: https://support.pendo.io/hc/en-us/articles/360046272771-Developer-s-guide-to-implementing-Pendo-using-the-install-script");
  }

  // CNAME recommendation — only show if blocking evidence detected
  try {
    var cnameContentHost = null;
    var cnameDataHost = null;
    if (pendo.get && typeof pendo.get === "function") {
      try {
        var pendoOpts = pendo.get("options");
        if (pendoOpts && pendoOpts.contentHost) cnameContentHost = pendoOpts.contentHost;
        if (pendoOpts && pendoOpts.dataHost) cnameDataHost = pendoOpts.dataHost;
      } catch (_) {}
    }
    if (!cnameContentHost && pendo._config && pendo._config.contentHost) cnameContentHost = pendo._config.contentHost;
    if (!cnameDataHost && pendo._config && pendo._config.dataHost) cnameDataHost = pendo._config.dataHost;
    if (!cnameDataHost && pendo.HOST) cnameDataHost = pendo.HOST;
    // Check script src for CNAME content host
    if (!cnameContentHost) {
      var pScripts = document.querySelectorAll('script[src*="pendo"]');
      for (var ps = 0; ps < pScripts.length; ps++) {
        try { cnameContentHost = new URL(pScripts[ps].src).hostname; } catch (_) {}
      }
    }

    var usingDefaultCdn = (!cnameContentHost || cnameContentHost.indexOf("pendo.io") !== -1 || cnameContentHost.indexOf("pendo-") !== -1) &&
                           (!cnameDataHost || cnameDataHost.indexOf("pendo.io") !== -1);

    // Only recommend CNAME if there's REAL blocking evidence — not just cross-origin timing redaction.
    // transferSize === 0 is unreliable for cross-origin resources without Timing-Allow-Origin.
    // Instead, only show this tip if Pendo is NOT functional (agent not ready = actually blocked).
    if (usingDefaultCdn) {
      var pendoActuallyBlocked = typeof window.pendo === "undefined" || !window.pendo ||
        (typeof pendo.isReady === "function" && !pendo.isReady());
      // Also check ad blocker bait as a secondary signal
      var adBlockEvidence = false;
      try {
        var cnameBait = document.createElement("div");
        cnameBait.className = "adsbox ad-placement";
        cnameBait.style.cssText = "position:absolute;top:-10px;left:-10px;width:1px;height:1px;overflow:hidden;";
        cnameBait.innerHTML = "&nbsp;";
        document.body.appendChild(cnameBait);
        if (window.getComputedStyle(cnameBait).display === "none" || cnameBait.offsetHeight === 0) {
          adBlockEvidence = true;
        }
        document.body.removeChild(cnameBait);
      } catch (_) {}

      if (pendoActuallyBlocked || adBlockEvidence) {
        recommend("tip", "No CNAME configured",
          "Pendo is loading from default CDN domains (cdn.pendo.io, data.pendo.io). Ad blockers and corporate firewalls commonly block *.pendo.io.\n  FIX: Configure a CNAME to route Pendo through your own domain (e.g. content.product.yourcompany.com and data.product.yourcompany.com). This makes Pendo traffic appear as first-party, bypassing most ad blockers and firewall restrictions.\n  Contact your Pendo CSM to enable CNAME for your subscription, then update your snippet and DNS.\n  Docs: https://support.pendo.io/hc/en-us/articles/360043539891-CNAME-for-Pendo");
      }
    }
  } catch (_) {}

  // ========================================================================
  // 10. CMP CONSENT GATING (v3) — flag only when 5-of-5 conditions are met
  // ========================================================================
  //
  // Goal: catch the case where Pendo is initialized and identifying a real
  // user before the page's consent manager indicates analytics consent.
  //
  // Hard rules to avoid false flags:
  //   (1) CMP global is present
  //   (2) The CMP exposes a readable consent state for analytics
  //   (3) That state says analytics consent is explicitly denied or pending
  //   (4) Pendo agent is loaded AND pendo.isReady() === true
  //   (5) Visitor ID is set AND is NOT anonymous
  // If ANY of those is unknown, we say nothing. Anonymous-pre-consent
  // buffering is a legitimate Pendo pattern and must not be flagged.
  //
  // TrustArc + TCF v2.0 are inform-only (their consent APIs are too
  // inconsistent to read confidently from outside the integration).
  // ========================================================================
  try {
    var cmp = null;            // detected platform name
    var cmpReadable = false;   // can we read analytics consent state?
    var cmpAnalyticsDenied = null;
    var cmpRemediationUrl = null;
    var cmpInformOnly = false;

    // --- Cookiebot: Cookiebot.consent.statistics is a boolean ---
    if (typeof window.Cookiebot !== "undefined" && window.Cookiebot && window.Cookiebot.consent) {
      cmp = "Cookiebot";
      if (typeof window.Cookiebot.consent.statistics === "boolean") {
        cmpReadable = true;
        cmpAnalyticsDenied = (window.Cookiebot.consent.statistics === false);
      }
      cmpRemediationUrl = "https://support.cookiebot.com/hc/en-us/articles/4405978132242-Manual-cookie-blocking";
    }
    // --- Didomi: purpose-level status ---
    else if (typeof window.Didomi !== "undefined" && window.Didomi &&
             typeof window.Didomi.getUserConsentStatusForPurpose === "function") {
      cmp = "Didomi";
      try {
        var didomiAnalytics = window.Didomi.getUserConsentStatusForPurpose("analytics");
        if (typeof didomiAnalytics === "boolean") {
          cmpReadable = true;
          cmpAnalyticsDenied = (didomiAnalytics === false);
        }
      } catch (_) {}
      cmpRemediationUrl = "https://developers.didomi.io/cmp/web-sdk/third-parties/no-tag-manager";
    }
    // --- Osano: getConsent returns an object keyed by category ---
    else if (typeof window.Osano !== "undefined" && window.Osano && window.Osano.cm &&
             typeof window.Osano.cm.getConsent === "function") {
      cmp = "Osano";
      try {
        var osanoConsent = window.Osano.cm.getConsent();
        if (osanoConsent && typeof osanoConsent.ANALYTICS === "string") {
          cmpReadable = true;
          cmpAnalyticsDenied = (osanoConsent.ANALYTICS === "DENY");
        }
      } catch (_) {}
      cmpRemediationUrl = "https://docs.osano.com/consent-management-getting-started";
    }
    // --- OneTrust: narrow read. Only flag when active groups string contains
    // ONLY C0001 (strictly-necessary). Category IDs are customer-configurable,
    // so anything broader invites false positives. ---
    else if (typeof window.OneTrust !== "undefined") {
      cmp = "OneTrust";
      try {
        var groups = window.OnetrustActiveGroups;
        if (typeof groups === "string" && groups.length > 0) {
          var parts = groups.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
          if (parts.length === 1 && parts[0] === "C0001") {
            cmpReadable = true;
            cmpAnalyticsDenied = true;
          }
        }
      } catch (_) {}
      cmpRemediationUrl = "https://developer.onetrust.com/onetrust/docs/single-page-applications";
    }
    // --- TrustArc: inform-only ---
    else if (typeof window.truste !== "undefined") {
      cmp = "TrustArc";
      cmpInformOnly = true;
    }
    // --- TCF v2.0: inform-only ---
    else if (typeof window.__tcfapi === "function") {
      cmp = "TCF v2.0";
      cmpInformOnly = true;
    }

    if (cmp) {
      if (cmpInformOnly) {
        recommend("tip", "Consent manager detected (" + cmp + ")",
          cmp + " is present on this page. The extension does not read " + cmp + "'s consent state automatically (the API varies across deployments). Verify manually that Pendo's initialization is gated on analytics consent for your jurisdiction.\n  Docs: https://support.pendo.io/hc/en-us/articles/21326554691227-Data-collection-and-compliance");
      } else if (cmpReadable && cmpAnalyticsDenied) {
        // Conditions 4 + 5: Pendo ready AND non-anonymous visitor
        var pendoReady = false;
        try { pendoReady = (typeof pendo.isReady === "function" && pendo.isReady()); } catch (_) {}

        var cmpVisitorId = null;
        try {
          cmpVisitorId = (pendo.getVisitorId && pendo.getVisitorId()) ||
                         (pendo.get && pendo.get("visitor") && pendo.get("visitor").id) ||
                         pendo.visitorId || null;
        } catch (_) {}
        var nonAnonymousVisitor = !!(cmpVisitorId && typeof cmpVisitorId === "string" &&
          !cmpVisitorId.startsWith("VISITOR-") && !cmpVisitorId.startsWith("_PENDO_T_"));

        if (pendoReady && nonAnonymousVisitor) {
          recommend("warning", "Pendo may be running without consent (" + cmp + ")",
            cmp + " indicates analytics consent has not been granted, but Pendo is initialized and identifying a real visitor. This may be a compliance issue depending on your jurisdiction. Verify how Pendo is categorized in " + cmp + " and that initialization is gated on the analytics/statistics consent state.\n  FIX: Block Pendo's initialization until " + cmp + " signals consent. " + cmp + " remediation pattern: " + cmpRemediationUrl + "\n  Supplementary docs: https://support.pendo.io/hc/en-us/articles/21326554691227-Data-collection-and-compliance");
        }
        // Else: not flagged. Pendo not ready OR anonymous visitor → both
        // legitimate pre-consent states under Pendo's own guidance.
      }
      // Else: CMP present but consent state unreadable → say nothing.
    }
  } catch (_) {}

  return result;
}


// ---------------------------------------------------------------------------
// Feedback System
// ---------------------------------------------------------------------------

(function initFeedback() {
  const feedbackBtn = document.getElementById("feedback-btn");
  const feedbackModal = document.getElementById("feedback-modal");
  const feedbackTextarea = document.getElementById("feedback-text");
  const feedbackSubmit = document.getElementById("feedback-submit");
  const feedbackCancel = document.getElementById("feedback-cancel");
  const feedbackStatus = document.getElementById("feedback-status");

  if (!feedbackBtn) return;

  feedbackBtn.addEventListener("click", () => {
    feedbackModal.style.display = "flex";
    feedbackTextarea.value = "";
    feedbackStatus.textContent = "";
    feedbackStatus.className = "feedback-status";
    feedbackTextarea.focus();
  });

  feedbackCancel.addEventListener("click", () => {
    feedbackModal.style.display = "none";
  });

  feedbackModal.addEventListener("click", (e) => {
    if (e.target === feedbackModal) {
      feedbackModal.style.display = "none";
    }
  });

  // PII scrubbing before feedback leaves the extension
  function scrubPII(str) {
    if (!str) return str;
    str = str.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]");
    str = str.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]");
    str = str.replace(/\b(?:\d[ \-]?){13,19}\b/g, "[REDACTED_CC]");
    str = str.replace(/(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g, "[REDACTED_PHONE]");
    str = str.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED_IP]");
    return str;
  }

  function buildFeedbackPayload() {
    const text = feedbackTextarea.value.trim();
    const pageUrl = document.getElementById("page-url").textContent || "(no URL)";
    const version = chrome.runtime.getManifest().version;
    return {
      feedback: scrubPII(text),
      url: scrubPII(pageUrl),
      version: version,
      timestamp: new Date().toISOString(),
    };
  }

  // GitHub Issue button
  feedbackSubmit.addEventListener("click", () => {
    const text = feedbackTextarea.value.trim();
    if (!text) {
      feedbackStatus.textContent = "Please enter some feedback.";
      feedbackStatus.className = "feedback-status feedback-error";
      return;
    }

    const p = buildFeedbackPayload();
    const title = encodeURIComponent("Feedback: " + p.feedback.slice(0, 80) + (p.feedback.length > 80 ? "…" : ""));
    const body = encodeURIComponent(
      "## Feedback\n\n" + p.feedback +
      "\n\n---\n" +
      "**Page tested:** " + p.url + "\n" +
      "**Extension version:** v" + p.version + "\n" +
      "**Submitted:** " + p.timestamp
    );
    const issueUrl = "https://github.com/prolitariat/pendo-health-check/issues/new?labels=feedback&title=" + title + "&body=" + body;
    chrome.tabs.create({ url: issueUrl });
    trackEvent("feedback_submit", { method: "github" });

    feedbackStatus.textContent = "Opening GitHub — thanks!";
    feedbackStatus.className = "feedback-status feedback-success";
    feedbackTextarea.value = "";
    setTimeout(() => { feedbackModal.style.display = "none"; }, 1200);
  });

  // Email fallback button (no GitHub account needed)
  const feedbackEmail = document.getElementById("feedback-email");
  if (feedbackEmail) {
    feedbackEmail.addEventListener("click", () => {
      const text = feedbackTextarea.value.trim();
      if (!text) {
        feedbackStatus.textContent = "Please enter some feedback.";
        feedbackStatus.className = "feedback-status feedback-error";
        return;
      }

      const p = buildFeedbackPayload();
      const subject = encodeURIComponent("Pendo Health Check Feedback (v" + p.version + ")");
      const mailBody = encodeURIComponent(
        p.feedback + "\n\n---\nPage tested: " + p.url +
        "\nExtension version: v" + p.version +
        "\nSubmitted: " + p.timestamp
      );
      chrome.tabs.create({ url: "mailto:pendohealthcheck@gmail.com?subject=" + subject + "&body=" + mailBody });
      trackEvent("feedback_submit", { method: "email" });

      feedbackStatus.textContent = "Opening email — thanks!";
      feedbackStatus.className = "feedback-status feedback-success";
      feedbackTextarea.value = "";
      setTimeout(() => { feedbackModal.style.display = "none"; }, 1200);
    });
  }

  // Allow Ctrl+Enter / Cmd+Enter to submit
  feedbackTextarea.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      feedbackSubmit.click();
    }
  });
})();
