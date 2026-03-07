const STATUS_ICONS = { pass: "✅", warn: "⚠️", fail: "❌", info: "ℹ️" };

// ---------------------------------------------------------------------------
// Mode system — Easy (glass) vs Full. Applied before first paint.
// ---------------------------------------------------------------------------
(function initMode() {
  chrome.storage?.local?.get(["uiMode"], (result) => {
    const mode = result?.uiMode || "";
    if (mode) document.documentElement.setAttribute("data-mode", mode);
  });
})();

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
  ["loading", "not-detected", "error-state"].forEach((v) => {
    document.getElementById(v).style.display = v === id ? "block" : "none";
  });
}

function showTabs() {
  document.getElementById("tab-bar").style.display = "flex";
}

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

  if (statusValue === "none" || statusValue === "operational") {
    badgeText = "All Operational";
    badgeClass = "badge-green";
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

  // Build realm label if detected
  const realmLabel = detectedEnv ? detectedEnv.replace(" environment", "") : null;

  // Check for active incidents
  const hasIncident = data.incidents && Array.isArray(data.incidents) && data.incidents.length > 0;
  let incidentHtml = "";
  if (hasIncident) {
    const inc = data.incidents[0];
    const updates = inc.updates && inc.updates.length > 0 ? inc.updates[0] : null;
    const updateText = updates ? updates.body : "";
    incidentHtml = `<div class="incident-banner" style="margin:4px 16px 0;padding:6px 8px;border-radius:4px;background:var(--destructive-bg, #fef2f2);color:var(--destructive, #dc2626);font-size:11px"><strong>⚠️ ${escapeHtml(inc.name)}</strong>${updateText ? " — " + escapeHtml(updateText.substring(0, 80)) : ""}</div>`;
  }

  // Simple: badge + link to status page — no dropdown needed
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

const TOUR_STEPS = [
  {
    target: null,
    title: "Welcome to Pendo Health Check",
    body: "This extension runs diagnostics on any page with Pendo installed. Let's take a quick look at what's here.",
  },
  {
    target: '[data-tab="health"]',
    title: "Health Check",
    body: "Instant pass/fail diagnostics — agent loaded, visitor ID, network requests, ad blockers, CMP/GDPR, and more.",
    arrow: "top",
  },
  {
    target: '[data-tab="setup"]',
    title: "Setup Assistant",
    body: "Deep-dive analysis of your Pendo snippet — framework detection, CSP policy, metadata validation, and actionable recommendations.",
    arrow: "top",
  },
  {
    target: '[data-tab="tools"]',
    title: "Tools",
    body: "Developer console, Pendo debugger launcher, and the Copy Issues button.",
    arrow: "top",
  },
  {
    target: "#tool-copy-issues",
    title: "Copy Issues to Clipboard",
    body: "One click copies every problem and fix as plain text — ready to paste into Slack, Jira, or a support ticket. No follow-up questions needed.",
    arrow: "bottom",
    preAction: () => {
      // Switch to tools tab so the button is visible
      const toolsTab = document.querySelector('[data-tab="tools"]');
      if (toolsTab) activateTab(toolsTab);
    },
  },
];

let tourActive = false;
let tourStep = 0;

function startTour() {
  tourActive = true;
  tourStep = 0;
  showTourStep(0);
  trackEvent("tour_start");
}

function showTourStep(idx) {
  // Clean up previous
  document.querySelectorAll(".tour-overlay, .tour-spotlight, .tour-tooltip").forEach(el => el.remove());

  if (idx >= TOUR_STEPS.length) {
    endTour();
    return;
  }

  const step = TOUR_STEPS[idx];
  tourStep = idx;

  // Pre-action (e.g. switch tabs before measuring)
  if (step.preAction) step.preAction();

  // Wait for DOM to settle after tab switch (needs more than 80ms for paint)
  setTimeout(() => {
    const targetEl = step.target ? document.querySelector(step.target) : null;
    if (step.target && !targetEl) { showTourStep(idx + 1); return; }

    const popupW = document.documentElement.clientWidth || 380;
    const popupH = document.documentElement.clientHeight || 540;
    const tipW = Math.min(280, popupW - 32);

    // Overlay — transparent click-catcher (spotlight handles dimming via box-shadow)
    const overlay = document.createElement("div");
    overlay.className = "tour-overlay";
    document.body.appendChild(overlay);

    if (targetEl) {
      // Spotlight — fixed position, box-shadow creates the dim effect
      const rect = targetEl.getBoundingClientRect();
      const pad = 4;
      const spot = document.createElement("div");
      spot.className = "tour-spotlight";
      spot.style.top = (rect.top - pad) + "px";
      spot.style.left = (rect.left - pad) + "px";
      spot.style.width = (rect.width + pad * 2) + "px";
      spot.style.height = (rect.height + pad * 2) + "px";
      document.body.appendChild(spot);
    } else {
      // No target — full-screen dim via overlay background instead of spotlight
      overlay.style.background = "rgba(0,0,0,0.5)";
    }

    // Tooltip — fixed position, clamped to viewport
    const tip = document.createElement("div");
    const arrowDir = step.arrow || null;
    tip.className = "tour-tooltip" + (arrowDir ? " arrow-" + arrowDir : "");

    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const pad = 4;

      // Horizontal: center under target, clamped to 8px from edges
      let tipLeft = Math.round(rect.left + rect.width / 2 - tipW / 2);
      tipLeft = Math.max(8, Math.min(tipLeft, popupW - tipW - 8));
      tip.style.left = tipLeft + "px";
      tip.style.width = tipW + "px";

      // Vertical: below target (arrow-top) or above target (arrow-bottom)
      const gap = 12;
      if (arrowDir === "top") {
        tip.style.top = (rect.bottom + gap) + "px";
      } else if (arrowDir === "bottom") {
        tip.style.bottom = (popupH - rect.top + gap) + "px";
      }

      // Arrow position: point toward center of target
      const arrowLeft = Math.max(16, Math.min(rect.left + rect.width / 2 - tipLeft, tipW - 16));
      tip.style.setProperty("--arrow-left", arrowLeft + "px");
    } else {
      // Centered modal — no arrow, vertically centered
      tip.style.left = Math.round((popupW - tipW) / 2) + "px";
      tip.style.width = tipW + "px";
      tip.style.top = Math.round(popupH * 0.3) + "px";
    }

    // Step indicator and buttons
    const dots = TOUR_STEPS.map((_, i) =>
      `<div class="tour-dot${i === idx ? " active" : ""}"></div>`
    ).join("");

    const isLast = idx === TOUR_STEPS.length - 1;
    const stepLabel = `${idx + 1} of ${TOUR_STEPS.length}`;
    tip.innerHTML = `
      <div class="tour-title">${step.title}</div>
      <div class="tour-body">${step.body}</div>
      <div class="tour-footer">
        <div class="tour-dots">${dots}</div>
        <div class="tour-actions">
          <button class="tour-skip" id="tour-skip">Skip</button>
          ${idx > 0 ? '<button class="tour-btn" id="tour-back">Back</button>' : ''}
          <button class="tour-btn tour-btn-primary" id="tour-next">${isLast ? "Done" : "Next"}</button>
        </div>
      </div>
    `;
    document.body.appendChild(tip);

    // Event handlers
    document.getElementById("tour-next").addEventListener("click", () => showTourStep(idx + 1));
    document.getElementById("tour-skip")?.addEventListener("click", () => endTour());
    document.getElementById("tour-back")?.addEventListener("click", () => showTourStep(idx - 1));

    // Keyboard: Escape to skip, arrow right/enter to advance
    const keyHandler = (e) => {
      if (e.key === "Escape") { document.removeEventListener("keydown", keyHandler); endTour(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { document.removeEventListener("keydown", keyHandler); showTourStep(idx + 1); }
      else if (e.key === "ArrowLeft" && idx > 0) { document.removeEventListener("keydown", keyHandler); showTourStep(idx - 1); }
    };
    document.addEventListener("keydown", keyHandler);
  }, 200);
}

function endTour() {
  tourActive = false;
  document.querySelectorAll(".tour-overlay, .tour-spotlight, .tour-tooltip").forEach(el => el.remove());
  chrome.storage?.local?.set({ tourComplete: true });
  trackEvent("tour_complete", { step: tourStep, total: TOUR_STEPS.length });

  // Return to health tab
  const healthTab = document.querySelector('[data-tab="health"]');
  if (healthTab) activateTab(healthTab);
}

function maybeStartTour() {
  chrome.storage?.local?.get(["tourComplete"], (result) => {
    if (!result.tourComplete) {
      // Delay slightly so the UI has settled
      setTimeout(() => startTour(), 600);
    }
  });
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

let setupLoaded = false;
let activeTabId = null;

function activateTab(tab) {
  const id = tab.dataset.tab;
  if (id === activeTabId) return;
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((t) => {
    t.classList.remove("active");
    t.setAttribute("aria-selected", "false");
    t.setAttribute("tabindex", "-1");
  });
  tab.classList.add("active");
  tab.setAttribute("aria-selected", "true");
  tab.setAttribute("tabindex", "0");
  tab.focus();
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById("panel-" + id).classList.add("active");
  activeTabId = id;

  trackEvent("tab_switch", { tab: id });

  if (id === "setup" && !setupLoaded) {
    setupLoaded = true;
    runSetup();
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", (e) => {
    const tabs = Array.from(document.querySelectorAll(".tab"));
    const idx = tabs.indexOf(tab);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = e.key === "ArrowRight"
        ? tabs[(idx + 1) % tabs.length]
        : tabs[(idx - 1 + tabs.length) % tabs.length];
      activateTab(next);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activateTab(tab);
    }
  });
});

// ---------------------------------------------------------------------------
// Health Check — rendering
// ---------------------------------------------------------------------------

function renderChecks(checks) {
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

  // "What's Good" drawer for passing checks — collapsed by default
  if (passingChecks.length > 0) {
    const drawer = document.createElement("div");
    drawer.className = "setup-section";
    drawer.id = "health-whats-good";
    drawer.style.cssText = "border-top:1px solid var(--border);margin-top:4px";

    let drawerRows = "";
    passingChecks.forEach((c) => {
      drawerRows += `
        <div class="check-row" style="opacity:0.7">
          <span class="check-status">${STATUS_ICONS[c.status]}</span>
          <div class="check-info">
            <div class="check-label">${escapeHtml(c.label)}</div>
            <div class="check-detail">${escapeHtml(c.detail)}</div>
          </div>
        </div>`;
    });

    drawer.innerHTML = `
      <div class="setup-section-header" tabindex="0" role="button" aria-expanded="false" style="color:var(--muted-foreground)">
        <span class="setup-chevron">▶</span>
        <span class="setup-section-title">What's Good (${passingChecks.length})</span>
        <span class="setup-section-badge"><span class="badge badge-green">${passingChecks.length} passed</span></span>
      </div>
      <div class="setup-section-body" style="padding-left:0">${drawerRows}</div>
    `;
    list.appendChild(drawer);
  }

  // Summary: lead with problems if any exist
  const issues = fail + warn;
  if (issues > 0) {
    document.getElementById("summary-counts").innerHTML =
      (fail > 0 ? `<span class="fail">${fail} failed</span> · ` : "") +
      (warn > 0 ? `<span class="warn">${warn} warning${warn !== 1 ? "s" : ""}</span> · ` : "") +
      `<span class="pass">${pass} passed</span>`;
  } else {
    document.getElementById("summary-counts").innerHTML =
      `<span class="pass">All ${pass} checks passed</span>`;
  }

  document.getElementById("health-summary").style.display = "flex";
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

  // First-run tour
  maybeStartTour();
}

// ---------------------------------------------------------------------------
// Health Check — copy (Feature 4: Smart Remediation)
// ---------------------------------------------------------------------------

const REMEDIATION_MAP = {
  "Pendo Agent Loaded": {
    fail: "FIX: The Pendo snippet is not installed on this page. Add the Pendo install script to your <head> tag, or verify your npm/yarn package imports pendo-io correctly.\n  Code: <script async src='https://cdn.pendo.io/agent/static/YOUR_API_KEY/pendo.js'></script>\n  → Find your API key: app.pendo.io → Settings → Subscription Settings → App Details\n  Docs: https://support.pendo.io/hc/en-us/articles/21362607043355-Install-Pendo-on-your-website-or-app"
  },
  "Pendo Ready": {
    warn: "FIX: The agent script loaded but pendo.isReady() returns false — pendo.initialize() hasn't been called yet, or it fired before the script finished loading. Ensure initialize() runs AFTER the Pendo script loads.\n  Code: pendo.initialize({ visitor: { id: 'USER_ID' }, account: { id: 'ACCOUNT_ID' } });\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference",
    fail: "FIX: pendo.isReady() threw an error — the agent may be corrupted or an incompatible version. Clear browser cache, hard reload, and verify your CDN snippet URL matches your subscription.\n  Docs: https://support.pendo.io/hc/en-us/articles/21362607043355-Install-Pendo-on-your-website-or-app"
  },
  "Visitor ID": {
    warn: "FIX: You're sending an anonymous or auto-generated visitor ID. Pendo can't track individual users without a stable, unique ID tied to your auth system.\n  Code: pendo.initialize({ visitor: { id: 'YOUR_USER_ID' } })\n  → Use whatever unique identifier your app assigns at login (e.g. user.id, email, UUID).\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference",
    fail: "FIX: No visitor ID found. pendo.initialize() must be called with a visitor.id parameter after the user authenticates.\n  Code: pendo.initialize({ visitor: { id: 'YOUR_USER_ID' } })\n  → Call this AFTER your login/auth flow resolves — not on page load before the user is known.\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference"
  },
  "Account ID": {
    warn: "FIX: No account ID set. If your app is B2B (multi-tenant), Pendo needs the account ID for company-level analytics, NPS by account, and account-based guide targeting.\n  Code: pendo.initialize({ visitor: { id: 'USER_ID' }, account: { id: 'ACCOUNT_ID' } })\n  → Use your app's organization/tenant/company ID. Single-user apps can skip this.\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference"
  },
  "Pendo Instances": {
    warn: "FIX: Multiple Pendo agent instances or duplicate <script> tags detected. This causes double-counted analytics, guide conflicts, and memory leaks.\n  → Check for duplicate <script> tags in your HTML (View Source → search 'pendo')\n  → Check your bundler config for duplicate pendo-io imports\n  → If using a tag manager (GTM), ensure the snippet isn't also hardcoded in your app\n  Docs: https://support.pendo.io/hc/en-us/articles/21362607043355-Install-Pendo-on-your-website-or-app"
  },
  "Network Requests": {
    warn: "FIX: Pendo network requests are failing or absent. Common causes:\n  1. Ad blocker or privacy extension blocking *.pendo.io → allowlist pendo.io domains\n  2. Corporate proxy/firewall blocking pendo.io → request IT to allowlist: data.pendo.io, cdn.pendo.io, app.pendo.io\n  3. CSP connect-src missing data.pendo.io → see CSP fixes below if present\n  4. VPN/DNS issue → try with VPN off, or verify pendo.io resolves\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo"
  },
  "Feature Flags": {
    warn: "FIX: One or more Pendo features are explicitly disabled in your configuration. Check your pendo.initialize() options for these flags and remove them if unintentional:\n  disableGuides: true      → blocks all in-app guides\n  disableAnalytics: true   → stops all event tracking\n  disableFeedback: true    → hides the Feedback module\n  disablePersistence: true → prevents visitor/account caching\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference"
  },
  "Ad Blocker": {
    warn: "FIX: An ad blocker or privacy extension is interfering with Pendo. This commonly breaks:\n  → Visual Design Studio (can't tag features)\n  → Guide rendering (guides won't appear)\n  → Analytics data collection (events silently dropped)\n  → Resource Center and NPS surveys\n  To fix: disable your ad blocker for this domain, or add these to your allowlist:\n  *.pendo.io, pendo-io-static.storage.googleapis.com, pendo-static-*.storage.googleapis.com\n  Best long-term solution: configure a CNAME so Pendo traffic routes through your own domain.\n  Docs: https://support.pendo.io/hc/en-us/articles/360043539891-CNAME-for-Pendo"
  },
  "Data Host": {
    warn: "FIX: Could not determine Pendo's content or data host. This may indicate the agent hasn't fully initialized, or the configuration is non-standard.\n  Check your pendo.initialize() call for contentHost and dataHost options, or verify the Pendo script src URL.\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference"
  },
  "Consent (CMP)": {
    warn: "FIX: No Consent Management Platform detected but EU locale suggests GDPR may apply. Pendo collects visitor and usage data — initializing without consent in the EU violates GDPR.\n  → Integrate with your CMP (OneTrust, Cookiebot, Didomi, etc.) and only call pendo.initialize() AFTER the user grants consent for analytics/functional cookies.\n  Code example with OneTrust:\n    OneTrust.OnConsentChanged(function() {\n      if (OnetrustActiveGroups.includes('C0002')) { // Performance cookies\n        pendo.initialize({ visitor: { id: user.id } });\n      }\n    });\n  Docs: https://support.pendo.io/hc/en-us/articles/360031867272-Configure-Pendo-with-a-cookie-consent-manager"
  }
};

// (Old per-tab buildPlainTextReport / buildSetupPlainText removed —
//  replaced by unified buildIssuesReport() in Tools section below)

// ---------------------------------------------------------------------------
// Setup Assistant — rendering
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

  // 1. Framework Detection
  let fwHasIssue = false;
  let fwBadge, fwBody;
  if (data.framework && data.framework.name !== "Unknown") {
    fwBadge = `<span class="badge badge-blue">${escapeHtml(data.framework.name)}${data.framework.version ? ` ${escapeHtml(data.framework.version)}` : ""}</span>`;
    fwBody = `<div class="detail-row"><span class="detail-key">Framework</span><span class="detail-val">${escapeHtml(data.framework.name)}${data.framework.version ? ` <span class="badge badge-blue">${escapeHtml(data.framework.version)}</span>` : ""}</span></div>`;
    if (data.framework.renderer) fwBody += `<div class="detail-row"><span class="detail-key">Renderer</span><span class="detail-val">${escapeHtml(data.framework.renderer)}</span></div>`;
    if (data.framework.mode) fwBody += `<div class="detail-row"><span class="detail-key">Mode</span><span class="detail-val">${escapeHtml(data.framework.mode)}</span></div>`;
  } else {
    fwHasIssue = true;
    fwBadge = `<span class="badge badge-yellow">Unknown</span>`;
    fwBody = `<div class="detail-row"><span class="detail-key">Framework</span><span class="detail-val">Could not detect — may be vanilla JS or server-rendered</span></div>`;
  }
  makeSection("Framework", fwBadge, fwBody, fwHasIssue);

  // 2. Snippet Analysis
  if (data.snippet) {
    const asyncOk = data.snippet.isAsync;
    const snipBadge = asyncOk
      ? `<span class="badge badge-green">Async</span>`
      : `<span class="badge badge-yellow">Sync</span>`;
    let snipBody = `
      <div class="detail-row"><span class="detail-key">Load method</span><span class="detail-val">${escapeHtml(data.snippet.loadMethod)}</span></div>
      <div class="detail-row"><span class="detail-key">Async</span><span class="detail-val">${asyncOk ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-yellow">No</span>'}</span></div>`;
    if (data.snippet.placement) snipBody += `<div class="detail-row"><span class="detail-key">Placement</span><span class="detail-val">${escapeHtml(data.snippet.placement)}</span></div>`;
    if (data.snippet.scriptCount !== undefined) snipBody += `<div class="detail-row"><span class="detail-key">Script tags</span><span class="detail-val">${data.snippet.scriptCount}</span></div>`;
    makeSection("Snippet", snipBadge, snipBody, !asyncOk);
  }

  // 3. Initialization
  if (data.initialization) {
    const initBadge = `<span class="badge badge-green">${escapeHtml(data.initialization.method)}</span>`;
    let initBody = `<div class="detail-row"><span class="detail-key">Method</span><span class="detail-val">${escapeHtml(data.initialization.method)}</span></div>`;
    if (data.initialization.timing) initBody += `<div class="detail-row"><span class="detail-key">Timing</span><span class="detail-val">${escapeHtml(data.initialization.timing)}</span></div>`;
    makeSection("Initialization", initBadge, initBody, false);
  }

  // 4. CSP Analysis
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

  // 5. Visitor Metadata
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

  // 6. Account Metadata
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

  // 7. Recommendations
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

  // "What's Good" drawer — collapsed by default
  if (healthySections.length > 0) {
    let drawerBody = "";
    healthySections.forEach((s) => {
      drawerBody += `
        <div class="setup-section">
          <div class="setup-section-header" tabindex="0" role="button" aria-expanded="false">
            <span class="setup-chevron">▶</span>
            <span class="setup-section-title">${s.title}</span>
            <span class="setup-section-badge">${s.badge}</span>
          </div>
          <div class="setup-section-body">${s.body}</div>
        </div>`;
    });
    container.innerHTML += `
      <div class="setup-section" id="whats-good-drawer" style="border-top:1px solid var(--border);margin-top:4px">
        <div class="setup-section-header" tabindex="0" role="button" aria-expanded="false" style="color:var(--muted-foreground)">
          <span class="setup-chevron">▶</span>
          <span class="setup-section-title">What's Good (${healthySections.length})</span>
          <span class="setup-section-badge"><span class="badge badge-green">${healthySections.length} passed</span></span>
        </div>
        <div class="setup-section-body" style="padding-left:4px">${drawerBody}</div>
      </div>`;
  }

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
      activeTabId = "health";
      renderChecks(data.checks);
      populateEasyPanel(data.checks);

      // Re-render status filtered to detected environment
      const env = detectEnvFromChecks(data.checks);
      if (env && window.__pendoServiceStatus) {
        renderPendoStatus(window.__pendoServiceStatus, env);
      }

      // Pre-run Setup analysis in background so copy report always has CSP data
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
            }
          })
          .catch(() => {}); // silently fail — Setup tab click will retry
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

document.getElementById("tool-validate-install")?.addEventListener("click", () => {
  runPendoCommand(function () {
    try {
      if (typeof pendo === "undefined") return { error: "Pendo not found on this page" };
      if (typeof pendo.validateInstall === "function") {
        pendo.validateInstall();
        var isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        var shortcut = isMac ? "Cmd+Option+J" : "F12";
        return { message: "✅ validateInstall() executed — open DevTools (" + shortcut + ") → Console to see results" };
      }
      return { error: "pendo.validateInstall() not available on this agent version" };
    } catch (e) {
      return { error: e.message };
    }
  }, "validateInstall() executed");
});

document.getElementById("tool-validate-env")?.addEventListener("click", () => {
  runPendoCommand(function () {
    try {
      if (typeof pendo === "undefined") return { error: "Pendo not found on this page" };
      if (typeof pendo.validateEnvironment === "function") {
        var result = pendo.validateEnvironment();
        // Try to capture and return meaningful output
        if (result && typeof result === "object") {
          var summary = [];
          var keys = Object.keys(result);
          for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var v = result[k];
            if (typeof v === "boolean") {
              summary.push(k + ": " + (v ? "✅" : "❌"));
            } else if (typeof v === "string" || typeof v === "number") {
              summary.push(k + ": " + v);
            }
          }
          if (summary.length > 0) {
            return { message: "✅ " + summary.join(" · ") };
          }
        }
        // Fallback — result wasn't a parseable object (output went to console)
        var isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        var shortcut = isMac ? "Cmd+Option+J" : "F12";
        return { message: "✅ validateEnvironment() executed — open DevTools (" + shortcut + ") → Console to see results" };
      }
      return { error: "pendo.validateEnvironment() not available on this agent version" };
    } catch (e) {
      return { error: e.message };
    }
  }, "validateEnvironment() executed");
});

document.getElementById("tool-launch-debug")?.addEventListener("click", () => {
  runPendoCommand(function () {
    try {
      if (typeof pendo === "undefined") return { error: "Pendo not found on this page" };

      // Toggle: check if debugger overlay is already open
      var overlay = document.getElementById("pendo-debug-bar") ||
                    document.querySelector("[id*='pendo-debug']") ||
                    document.querySelector("[class*='pendo-debug']");
      if (overlay) {
        if (typeof pendo.disableDebugging === "function") {
          pendo.disableDebugging();
          return { message: "🔒 Debugger closed" };
        }
        // Fallback: try removing the overlay directly
        overlay.remove();
        return { message: "🔒 Debugger overlay removed" };
      }

      if (typeof pendo.enableDebugging === "function") {
        pendo.enableDebugging();
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
  lines.push(`Pendo Issues Report — ${url}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
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

      if (c.label === "Network Requests" && hasCspIssues) {
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
        ? fixes.join("\n  ") + "\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference"
        : "Review this field in your pendo.initialize() call and correct the value format.\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference";
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
      "360032209131": "Content Security Policy for Pendo",
      "21374706009883": "Pendo Install API Reference",
      "21397042498571": "Install Pendo on a Single Page Application",
      "360032207332": "Manage Visitor and Account Metadata",
      "360043539891": "CNAME for Pendo",
      "360031867272": "Configure Pendo with a Cookie Consent Manager",
      "21362607043355": "Install Pendo on Your Website or App"
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
  const text = buildIssuesReport();
  navigator.clipboard.writeText(text).then(() => {
    trackEvent("copy_report");
    if (label) {
      label.textContent = "Copied!";
      setTimeout(() => { label.textContent = "Copy Issues to Clipboard"; }, 1500);
    }
  });
});

// ===========================================================================
// INJECTED FUNCTION: Health Check (runs in page MAIN world)
// ===========================================================================

function runPendoHealthCheck() {
  var checks = [];

  function add(status, label, detail) {
    checks.push({ status: status, label: label, detail: String(detail) });
  }

  // 1. Pendo agent loaded
  if (typeof window.pendo === "undefined" || !window.pendo) {
    add("fail", "Pendo Agent Loaded", "window.pendo is not present");
    return { pendoDetected: false, checks: checks };
  }
  add("pass", "Pendo Agent Loaded", "window.pendo is present");

  // 2. pendo.isReady()
  try {
    var ready = typeof pendo.isReady === "function" && pendo.isReady();
    if (ready) {
      add("pass", "Pendo Ready", "pendo.isReady() returned true");
    } else {
      add("warn", "Pendo Ready", "pendo.isReady() returned false — agent may still be initializing");
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
    if (!visitor) {
      add("fail", "Visitor ID", "No visitor ID found");
    } else if (visitor.startsWith("VISITOR-") || visitor.startsWith("_PENDO_T_")) {
      add("warn", "Visitor ID", "Anonymous visitor: " + visitor);
    } else {
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
    if (!account) {
      add("warn", "Account ID", "No account ID found");
    } else {
      add("pass", "Account ID", account);
    }
  } catch (e) {
    add("fail", "Account ID", "Error reading account ID: " + e.message);
  }

  // 5. Active Guides
  try {
    var guides = pendo.guides;
    if (Array.isArray(guides)) {
      add("pass", "Active Guides", guides.length + " guide(s) loaded");
    } else {
      add("warn", "Active Guides", "pendo.guides is not available");
    }
  } catch (e) {
    add("warn", "Active Guides", "Error reading guides: " + e.message);
  }

  // 7. Number of Pendo instances
  try {
    var instanceCount = 0;
    if (window.pendo) instanceCount++;
    if (window.pendo_) instanceCount++;
    var pendoScripts = document.querySelectorAll('script[src*="pendo"]');
    var totalScripts = pendoScripts.length;

    if (instanceCount > 1) {
      add("warn", "Pendo Instances", instanceCount + " Pendo objects detected (window.pendo + window.pendo_) — possible dual initialization");
    } else if (totalScripts > 1) {
      add("warn", "Pendo Instances", "1 Pendo object, but " + totalScripts + " Pendo script tags found — review for duplicate loading");
    } else {
      add("pass", "Pendo Instances", "1 instance detected (" + totalScripts + " script tag" + (totalScripts !== 1 ? "s" : "") + ")");
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
    if (version) {
      add("pass", "Agent Version", version);
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
    if (apiKey) {
      add("pass", "API Key", apiKey);
    } else {
      add("warn", "API Key", "Could not determine API key");
    }
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

    if (isCname) {
      add("pass", "Data Host", hostDisplay + " (CNAME — ad-blocker resistant)");
    } else if (detectedContentHost || detectedDataHost) {
      add("pass", "Data Host", hostDisplay + " (default Pendo CDN)");
    } else {
      add("warn", "Data Host", "Could not determine data or content host");
    }
  } catch (e) {
    add("warn", "Data Host", "Error detecting data host: " + e.message);
  }

  // 10b. Network request validation (CNAME-aware)
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

    if (pendoRequests.length === 0) {
      add("warn", "Network Requests", "No Pendo network requests detected" + (isCname ? " (checked CNAME domains too)" : "") + ". Data may not be transmitting, or requests completed before page load.");
    } else {
      var failed = pendoRequests.filter(function(e) { return e.transferSize === 0 && e.decodedBodySize === 0; });
      var categories = {};
      pendoRequests.forEach(function(e) {
        var host = "unknown";
        try { host = new URL(e.name).hostname; } catch(_) {}
        if (!categories[host]) categories[host] = 0;
        categories[host]++;
      });
      var summary = Object.keys(categories).map(function(h) { return h + " (" + categories[h] + ")"; }).join(", ");

      // CORS detection: check for requests that loaded but returned 0 bytes with no cache
      var corsLikely = failed.filter(function(e) {
        // transferSize 0 + decodedBodySize 0 + not from cache = likely CORS block
        var isCached = e.encodedBodySize > 0 || (e.transferSize === 0 && e.decodedBodySize > 0);
        return !isCached;
      });

      if (corsLikely.length > 0 && corsLikely.length === failed.length) {
        // All requests blocked — emphasize the diagnosis, not the count
        add("warn", "Network Requests", "All " + pendoRequests.length + " Pendo requests returned 0 bytes — likely blocked by CORS policy, ad blocker, or firewall. Hosts: " + summary);
      } else if (failed.length > 0) {
        var pct = Math.round((failed.length / pendoRequests.length) * 100);
        add("warn", "Network Requests", failed.length + " of " + pendoRequests.length + " Pendo requests failed (" + pct + "% returned 0 bytes). Hosts: " + summary);
      } else {
        add("pass", "Network Requests", pendoRequests.length + " successful request(s). Hosts: " + summary);
      }
    }
  } catch (e) {
    add("warn", "Network Requests", "Could not analyze network requests: " + e.message);
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
      if (opts.disableGuides === true) flags.push("disableGuides=true");
      if (opts.disableAnalytics === true) flags.push("disableAnalytics=true");
      if (opts.disablePersistence === true) flags.push("disablePersistence=true");
      if (opts.disableFeedback === true) flags.push("disableFeedback=true");
      if (opts.guides && opts.guides.disabled === true) flags.push("guides.disabled=true");
      if (opts.excludeAllText === true) flags.push("excludeAllText=true");
      if (opts.xhrTimings === false) flags.push("xhrTimings=false");
      if (opts.xhrWhitelist) flags.push("xhrWhitelist configured");
      if (opts.htmlAttributeBlacklist) flags.push("htmlAttributeBlacklist configured");
      if (opts.htmlAttributes) flags.push("htmlAttributes configured");
    }

    // Also check for Pendo debugging/testing mode
    if (pendo.enableDebugging || (pendo.get && pendo.get("enableDebugging"))) {
      flags.push("debugging enabled");
    }

    if (flags.length > 0) {
      var hasDisable = flags.some(function(f) { return f.indexOf("disable") !== -1; });
      add(hasDisable ? "warn" : "info", "Feature Flags", flags.join(", "));
    } else {
      add("pass", "Feature Flags", "No feature flags detected — all Pendo features appear enabled");
    }
  } catch (e) {
    add("info", "Feature Flags", "Could not inspect feature flags: " + e.message);
  }

  // 12. Ad Blocker Detection
  try {
    var adBlockDetected = false;
    var adBlockSignals = [];

    // Technique 1: Bait element — adblockers hide elements with ad-related class names
    var bait = document.createElement("div");
    bait.className = "adsbox ad-placement ad-banner pub_300x250";
    bait.style.cssText = "position:absolute;top:-10px;left:-10px;width:1px;height:1px;overflow:hidden;pointer-events:none;";
    bait.innerHTML = "&nbsp;";
    document.body.appendChild(bait);

    // Give adblocker CSS rules a moment to apply (they're usually synchronous)
    var baitStyle = window.getComputedStyle(bait);
    if (baitStyle.display === "none" || baitStyle.visibility === "hidden" || bait.offsetHeight === 0) {
      adBlockDetected = true;
      adBlockSignals.push("ad-class elements hidden");
    }
    document.body.removeChild(bait);

    // Technique 2: Check if Pendo CDN/data domains are missing from network traffic
    // despite the agent being loaded (agent could have been cached or bundled)
    var resources = performance.getEntriesByType("resource");
    var hasPendoCdn = resources.some(function(r) { return r.name.indexOf("cdn.pendo.io") !== -1; });
    var hasPendoData = resources.some(function(r) { return r.name.indexOf("data.pendo.io") !== -1; });
    var hasPendoStatic = resources.some(function(r) { return r.name.indexOf("pendo-static") !== -1; });

    if (!hasPendoData && !hasPendoStatic && checks.length >= 10) {
      // Pendo is loaded but no data traffic — something is blocking it
      var netCheck = checks.find(function(c) { return c.label === "Network Requests"; });
      if (netCheck && (netCheck.status === "warn" || netCheck.status === "fail")) {
        adBlockSignals.push("Pendo network traffic blocked");
        adBlockDetected = true;
      }
    }

    if (adBlockDetected) {
      add("warn", "Ad Blocker", "Ad blocker detected (" + adBlockSignals.join("; ") + "). " +
        "Ad blockers can block Pendo CDN/data requests, break Visual Design Studio, and prevent guides from rendering. " +
        "Disable your ad blocker for this domain or allowlist *.pendo.io to ensure full functionality.");
    } else {
      add("pass", "Ad Blocker", "No ad blocker interference detected");
    }
  } catch (e) {
    add("info", "Ad Blocker", "Could not check for ad blockers: " + e.message);
  }

  // 13. Consent Management Platform (CMP) / GDPR detection
  try {
    var cmpDetected = null;
    var cmpSignals = [];

    // OneTrust (most common enterprise CMP)
    if (window.OneTrust || window.OptanonWrapper || window.OnetrustActiveGroups) {
      cmpDetected = "OneTrust";
      if (window.OnetrustActiveGroups) cmpSignals.push("Active groups: " + window.OnetrustActiveGroups);
    }
    // Cookiebot
    else if (window.Cookiebot || window.CookieConsent) {
      cmpDetected = "Cookiebot";
      if (window.Cookiebot && window.Cookiebot.consent) {
        var cb = window.Cookiebot.consent;
        cmpSignals.push("Statistics: " + (cb.statistics ? "granted" : "denied") + ", Marketing: " + (cb.marketing ? "granted" : "denied"));
      }
    }
    // Didomi
    else if (window.Didomi || window.didomiOnReady) {
      cmpDetected = "Didomi";
    }
    // Osano
    else if (window.Osano) {
      cmpDetected = "Osano";
    }
    // TrustArc / TRUSTe
    else if (window.truste || document.querySelector('#truste-consent-track')) {
      cmpDetected = "TrustArc";
    }
    // Quantcast Choice
    else if (window.__cmp || window.quantserve) {
      cmpDetected = "Quantcast Choice";
    }
    // IAB TCF v2 (standard consent API used by many CMPs)
    else if (window.__tcfapi) {
      cmpDetected = "IAB TCF v2 compatible CMP";
      try {
        window.__tcfapi("getTCData", 2, function(tcData, success) {
          if (success && tcData) {
            cmpSignals.push("GDPR applies: " + (tcData.gdprApplies ? "yes" : "no"));
          }
        });
      } catch (_) {}
    }
    // Generic cookie consent banners (banner element detection)
    else if (document.querySelector('[class*="cookie-consent"], [class*="cookie-banner"], [id*="cookie-consent"], [id*="cookie-banner"], [class*="gdpr"], [id*="gdpr"]')) {
      cmpDetected = "Generic cookie consent banner";
    }

    var pendoInitialized = typeof pendo.isReady === "function" ? pendo.isReady() : !!pendo.visitorId;

    if (cmpDetected) {
      var cmpMsg = cmpDetected + " detected" + (cmpSignals.length > 0 ? " (" + cmpSignals.join("; ") + ")" : "");
      if (pendoInitialized) {
        add("pass", "Consent (CMP)", cmpMsg + ". Pendo is active — consent appears to have been granted.");
      } else {
        add("info", "Consent (CMP)", cmpMsg + ". Pendo is NOT active — likely waiting for user consent before initialization (this is correct GDPR behavior).");
      }
    } else {
      // No CMP found — check if this matters
      // Look for signals the app is EU/GDPR-relevant
      var lang = (navigator.language || "").toLowerCase();
      var isEuLocale = /^(de|fr|es|it|nl|pt|pl|sv|da|fi|el|cs|sk|hu|ro|bg|hr|sl|lt|lv|et|mt|ga|lb)/.test(lang);
      var htmlLang = (document.documentElement.lang || "").toLowerCase();
      var isEuHtml = /^(de|fr|es|it|nl|pt|pl|sv|da|fi|el|cs|sk|hu|ro|bg|hr|sl|lt|lv|et|mt|ga|lb)/.test(htmlLang);

      if (isEuLocale || isEuHtml) {
        add("warn", "Consent (CMP)", "No Consent Management Platform detected, but EU locale (" + (lang || htmlLang) + ") suggests GDPR may apply. Pendo should only initialize after user consent is obtained.");
      } else {
        add("info", "Consent (CMP)", "No CMP detected. If this app serves EU users, Pendo should be conditionally initialized based on consent.");
      }
    }
  } catch (e) {
    add("info", "Consent (CMP)", "Could not check for consent management: " + e.message);
  }

  return { pendoDetected: true, checks: checks };
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

  var pendoScripts = document.querySelectorAll('script[src*="pendo"]');
  snippet.scriptCount = pendoScripts.length;

  if (pendoScripts.length > 0) {
    var mainScript = pendoScripts[0];
    snippet.isAsync = mainScript.async || mainScript.defer;
    snippet.loadMethod = mainScript.src.includes("agent/static") ? "Pendo Agent (static)" :
                          mainScript.src.includes("pendo-agent") ? "Pendo Agent (bundled)" :
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
        if (headerCSP.trim()) {
          cspRaw = headerCSP;
          csp.source = "HTTP header";
        }
      } catch (xhrErr) {
        // Fetch failed — can't read HTTP headers from this context
      }
    }

    // --- B. Detect CSP violations already fired (works for BOTH meta and header CSP) ---
    var cspViolations = [];
    var blockedByDomain = {};
    var detectedSubId = null; // Will hold the actual Pendo subscription ID if found
    try {
      // Check Performance API for blocked resources (transferSize=0 + no decodedBodySize)
      var perfEntries = performance.getEntriesByType && performance.getEntriesByType("resource") || [];
      var pendoResources = perfEntries.filter(function(e) { return e.name && e.name.indexOf("pendo") !== -1; });

      // Extract SUB_ID from any Pendo resource URL (blocked or not)
      // Pattern: pendo-static-{SUB_ID}.storage.googleapis.com or content-{SUB_ID}.static.pendo.io
      pendoResources.forEach(function(e) {
        if (detectedSubId) return;
        var m = e.name.match(/pendo-static-(\d+)\.storage/) || e.name.match(/content-(\d+)\.static\.pendo/);
        if (m) detectedSubId = m[1];
      });

      var blockedPendo = pendoResources.filter(function(e) { return e.transferSize === 0 && e.decodedBodySize === 0; });

      if (blockedPendo.length > 0) {
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
    var guidesWorking = pendoFunctional && typeof pendo.getActiveGuides === "function";
    var dataFlowing = false;
    try {
      // Check if data requests to Pendo are succeeding
      var dataReqs = perfEntries ? perfEntries.filter(function(e) {
        return e.name && (e.name.indexOf("data.pendo.io") !== -1 || e.name.indexOf("/data/") !== -1) && e.transferSize > 0;
      }) : [];
      dataFlowing = dataReqs.length > 0;
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

      // script-src
      // Required: cdn.pendo.io, pendo-io-static.storage.googleapis.com,
      //   pendo-static-{{SUB_ID}}.storage.googleapis.com OR content-{{SUB_ID}}.static.pendo.io,
      //   app.pendo.io (designer only), 'unsafe-inline' + 'unsafe-eval' (code blocks/designer only)
      var scriptSrc = getDirective("script-src");
      if (scriptSrc.length > 0) {
        if (!hostAllowed(scriptSrc)) {
          csp.issues.push({ directive: "script-src", severity: "error",
            detail: "Pendo domains not allowed in script-src — the Pendo agent and guide code can't load.",
            fix: "Add to your CSP script-src directive:\n  cdn.pendo.io pendo-io-static.storage.googleapis.com pendo-static-{{SUB_ID}}.storage.googleapis.com content-{{SUB_ID}}.static.pendo.io\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
        }
        if (!valueAllowed(scriptSrc, "'unsafe-inline'")) {
          var hasNonce = scriptSrc.some(function(v) { return v.indexOf("nonce-") !== -1; });
          var hasHash = scriptSrc.some(function(v) { return v.indexOf("sha256-") !== -1 || v.indexOf("sha384-") !== -1; });
          if (!hasNonce && !hasHash) {
            csp.issues.push({ directive: "script-src (inline)", severity: "warning",
              detail: "'unsafe-inline' not in script-src and no nonce/hash found — Pendo's inline snippet and guide code blocks won't run.",
              fix: "Add 'unsafe-inline' to script-src (required for code blocks and classic guides).\n  Or use a nonce: script-src ... 'nonce-YOUR_NONCE'\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
          }
        }
        if (!valueAllowed(scriptSrc, "'unsafe-eval'") && !valueAllowed(scriptSrc, "*")) {
          csp.issues.push({ directive: "script-src (eval)", severity: "warning",
            detail: "'unsafe-eval' not in script-src — guide code blocks and Resource Center integrations may not execute.",
            fix: "Add 'unsafe-eval' to script-src (required for code blocks and Resource Center):\n  script-src ... 'unsafe-eval'\n  Docs: https://support.pendo.io/hc/en-us/articles/360032209131-Content-Security-Policy-for-Pendo" });
        }
      }

      // connect-src
      // Required: data.pendo.io, pendo-static-{{SUB_ID}}.storage.googleapis.com OR
      //   content-{{SUB_ID}}.static.pendo.io, app.pendo.io (designer only)
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
      "The Pendo snippet is loaded synchronously, which blocks page rendering until it finishes downloading.\n  FIX: Add the async attribute to your Pendo <script> tag:\n    <script async src=\"https://cdn.pendo.io/agent/static/YOUR_API_KEY/pendo.js\"></script>\n  If you're using the classic snippet with inline code, add async to the script block that creates the <script> element.\n  Docs: https://support.pendo.io/hc/en-us/articles/21397042498571-Install-Pendo-on-a-single-page-application");
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
      "Fields that may contain sensitive data: " + sensitiveFields.join(", ") + ".\n  FIX: Remove these fields from your pendo.initialize() call, or replace them with non-sensitive equivalents (e.g. use a hashed email instead of a raw email).\n  To exclude fields in Pendo: Settings → Subscription Settings → Data Mappings → find the field → toggle it off.\n  If these fields are intentional, ensure you have a Data Processing Agreement with Pendo covering PII.\n  Docs: https://support.pendo.io/hc/en-us/articles/360032207332-Manage-visitor-and-account-metadata");
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
      "Fields with non-flat values: " + complexFields.join(", ") + ".\n  FIX: Pendo only processes flat key-value pairs — nested objects and arrays are silently ignored.\n  Instead of: { plan: { name: 'Pro', tier: 2 } }\n  Use:        { plan_name: 'Pro', plan_tier: 2 }\n  Instead of: { tags: ['admin', 'beta'] }\n  Use:        { tags: 'admin,beta' }\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference");
  }

  // Framework-specific timing tips
  if (fw.name.indexOf("React") !== -1 || fw.name.indexOf("Next") !== -1) {
    if (!init.hasVisitorId) {
      recommend("tip", "React initialization timing",
        "No visitor ID detected — likely pendo.initialize() is being called before your auth flow resolves.\n  FIX: Call pendo.initialize() inside a useEffect that depends on your auth state:\n    useEffect(() => {\n      if (user?.id) {\n        pendo.initialize({ visitor: { id: user.id }, account: { id: user.accountId } });\n      }\n    }, [user]);\n  Docs: https://support.pendo.io/hc/en-us/articles/21397042498571-Install-Pendo-on-a-single-page-application");
    }
  } else if (fw.name.indexOf("Vue") !== -1 || fw.name.indexOf("Nuxt") !== -1) {
    if (!init.hasVisitorId) {
      recommend("tip", "Vue initialization timing",
        "No visitor ID detected — likely pendo.initialize() is being called before your auth flow resolves.\n  FIX: In Vue, call pendo.initialize() in a route guard or in mounted() after the user is authenticated:\n    mounted() {\n      if (this.$auth.user) {\n        pendo.initialize({ visitor: { id: this.$auth.user.id } });\n      }\n    }\n  Docs: https://support.pendo.io/hc/en-us/articles/21397042498571-Install-Pendo-on-a-single-page-application");
    }
  } else if (fw.name.indexOf("Angular") !== -1) {
    if (!init.hasVisitorId) {
      recommend("tip", "Angular initialization timing",
        "No visitor ID detected — likely pendo.initialize() is being called before your auth flow resolves.\n  FIX: In Angular, call pendo.initialize() in an AfterViewInit lifecycle hook or route resolver after fetching user data:\n    ngAfterViewInit() {\n      this.authService.user$.subscribe(user => {\n        pendo.initialize({ visitor: { id: user.id } });\n      });\n    }\n  Docs: https://support.pendo.io/hc/en-us/articles/21397042498571-Install-Pendo-on-a-single-page-application");
    }
  }

  // Payload size estimate
  try {
    var payloadEstimate = JSON.stringify(pendo.metadata || {}).length;
    if (payloadEstimate > 50000) {
      recommend("warning", "Large metadata payload",
        "Estimated metadata size is " + Math.round(payloadEstimate / 1024) + "KB. Pendo has a 64KB limit per request — exceeding this will silently drop data.\n  FIX: Audit your pendo.initialize() call and remove fields that aren't used for segmentation or analytics.\n  Common culprits: serialized objects, long strings, redundant fields, debug data.\n  To see which fields are actually used: Pendo → Settings → Data Mappings → sort by 'Last Seen'.\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference");
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
          "Running Pendo agent v" + ver + " (major version < 2).\n  FIX: Update to the latest agent by replacing your snippet script src with the current CDN URL, or if using npm, run: npm update @pendo-io/agent\n  Newer versions include performance improvements, Session Replay support, and security patches.\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference");
      }
    }
  } catch (e) {}

  // CSP issues are already surfaced in the CSP section — no need to duplicate
  // as separate recommendations (that was causing "runtime, runtime, runtime...")

  // No metadata at all
  if (result.visitorFields.length === 0 && result.accountFields.length === 0) {
    recommend("tip", "No metadata fields detected",
      "Pendo is initialized without visitor or account metadata. Without metadata, you can't segment users by role, plan, company, or other attributes.\n  FIX: Add metadata fields to your pendo.initialize() call:\n    pendo.initialize({\n      visitor: { id: 'USER_ID', email: 'user@example.com', role: 'admin', created_at: '2024-01-15' },\n      account: { id: 'ACCOUNT_ID', name: 'Acme Corp', plan_level: 'enterprise', is_paying: true }\n    });\n  Start with: email, role, plan_level, created_at, is_paying — these cover 80% of segmentation needs.\n  Docs: https://support.pendo.io/hc/en-us/articles/21374706009883-Pendo-install-API-reference");
  }

  // CNAME recommendation — check if using default Pendo domains
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

    if (usingDefaultCdn) {
      recommend("tip", "No CNAME configured",
        "Pendo is loading from default CDN domains (cdn.pendo.io, data.pendo.io). Ad blockers and corporate firewalls commonly block *.pendo.io.\n  FIX: Configure a CNAME to route Pendo through your own domain (e.g. content.product.yourcompany.com and data.product.yourcompany.com). This makes Pendo traffic appear as first-party, bypassing most ad blockers and firewall restrictions.\n  Contact your Pendo CSM to enable CNAME for your subscription, then update your snippet and DNS.\n  Docs: https://support.pendo.io/hc/en-us/articles/360043539891-CNAME-for-Pendo");
    }
  } catch (_) {}

  return result;
}


// ---------------------------------------------------------------------------
// Easy Mode — gear toggle, panel population, copy, drawer
// ---------------------------------------------------------------------------

(function initModeToggle() {
  const btn = document.getElementById("mode-toggle-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-mode");
    const next = current === "easy" ? "" : "easy";
    if (next) {
      document.documentElement.setAttribute("data-mode", next);
    } else {
      document.documentElement.removeAttribute("data-mode");
    }
    chrome.storage?.local?.set({ uiMode: next });
    trackEvent("mode_switch", { mode: next || "full" });
    // Re-populate easy panel if switching into easy mode and we have data
    if (next === "easy" && window.__lastChecks) {
      populateEasyPanel(window.__lastChecks);
    }
  });
})();

function populateEasyPanel(checks) {
  const icon = document.getElementById("easy-status-icon");
  const label = document.getElementById("easy-status-label");
  const detail = document.getElementById("easy-status-detail");
  const copyBtn = document.getElementById("easy-copy-btn");
  const drawer = document.getElementById("easy-details-drawer");
  if (!icon || !label) return;

  const fails = checks.filter(c => c.status === "fail");
  const warns = checks.filter(c => c.status === "warn");
  const passes = checks.filter(c => c.status === "pass");

  if (fails.length > 0) {
    icon.textContent = "❌";
    label.textContent = fails.length + " Issue" + (fails.length > 1 ? "s" : "") + " Found";
    detail.textContent = fails.length + " failing, " + warns.length + " warning" + (warns.length !== 1 ? "s" : "");
  } else if (warns.length > 0) {
    icon.textContent = "⚠️";
    label.textContent = warns.length + " Warning" + (warns.length > 1 ? "s" : "");
    detail.textContent = "No failures — " + warns.length + " item" + (warns.length !== 1 ? "s" : "") + " to review";
  } else {
    icon.textContent = "✅";
    label.textContent = "All Clear";
    detail.textContent = passes.length + " check" + (passes.length !== 1 ? "s" : "") + " passed";
  }

  // Enable copy button if there are issues
  if (copyBtn) {
    copyBtn.disabled = (fails.length === 0 && warns.length === 0);
  }

  // Populate details drawer
  if (drawer) {
    const issues = checks.filter(c => c.status === "fail" || c.status === "warn");
    if (issues.length === 0) {
      drawer.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--muted-foreground);text-align:center;">No issues to display.</div>';
    } else {
      drawer.innerHTML = issues.map(c => {
        const ico = c.status === "fail" ? "❌" : "⚠️";
        return '<div style="display:flex;align-items:flex-start;gap:6px;padding:6px 0;border-bottom:1px solid var(--glass-border, var(--border));font-size:12px;">'
          + '<span style="flex-shrink:0;">' + ico + '</span>'
          + '<div><strong>' + escapeHtml(c.label) + '</strong><br><span style="color:var(--muted-foreground);">' + escapeHtml(c.detail) + '</span></div>'
          + '</div>';
      }).join("");
    }
  }
}

(function initEasyCopy() {
  const btn = document.getElementById("easy-copy-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const text = buildIssuesReport();
    navigator.clipboard.writeText(text).then(() => {
      trackEvent("copy_report", { mode: "easy" });
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy Issues"; }, 1500);
    });
  });
})();

(function initEasyDrawer() {
  const toggle = document.getElementById("easy-details-toggle");
  const drawer = document.getElementById("easy-details-drawer");
  if (!toggle || !drawer) return;
  toggle.addEventListener("click", () => {
    const open = drawer.classList.toggle("open");
    toggle.textContent = open ? "Hide Details ▴" : "Show Details ▾";
  });
})();

// ---------------------------------------------------------------------------
// Feedback System
// ---------------------------------------------------------------------------
// Help Tour Button — manual tour launch
(function initHelpTourBtn() {
  const btn = document.getElementById("help-tour-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (typeof startTour === "function") startTour();
  });
})();

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
