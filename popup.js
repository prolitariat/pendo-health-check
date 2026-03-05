const STATUS_ICONS = { pass: "✅", warn: "⚠️", fail: "❌", info: "ℹ️" };

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
  const indicator = document.getElementById("status-indicator");
  const componentsDiv = document.getElementById("status-components");

  if (!statusDiv || !indicator || !componentsDiv) return;

  // Determine overall status and badge
  const overallStatus = data.status && data.status.description ? data.status.description : "Unknown";
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

  indicator.textContent = badgeText;
  indicator.className = "badge " + badgeClass;

  // Render components — show only top-level groups, not per-region children
  componentsDiv.innerHTML = "";
  if (data.components && Array.isArray(data.components)) {
    const groups = data.components.filter((c) => c.group === true);
    const topLevel = groups.length > 0
      ? groups
      : data.components.filter((c) => !c.group_id);

    // If we detected the environment, filter to just that one + any non-operational others
    let filtered = topLevel;
    let isFiltered = false;
    if (detectedEnv) {
      const matched = topLevel.filter((c) => c.name && c.name.includes(detectedEnv));
      const problems = topLevel.filter((c) =>
        c.name && !c.name.includes(detectedEnv) &&
        c.status && c.status !== "operational"
      );
      if (matched.length > 0) {
        filtered = [...matched, ...problems];
        isFiltered = true;
      }
    }

    filtered.forEach((comp) => {
      const st = (comp.status || "operational").replace(/_/g, " ");
      const isMatch = detectedEnv && comp.name && comp.name.includes(detectedEnv);
      const row = document.createElement("div");
      row.className = "status-row";
      row.innerHTML = `
        <span class="status-dot ${comp.status || "operational"}"></span>
        <span class="status-name">${escapeHtml(comp.name || "")}${isMatch ? ' <span class="badge badge-blue" style="font-size:9px;padding:1px 5px;">your env</span>' : ""}</span>
        <span class="status-label">${escapeHtml(st)}</span>
      `;
      componentsDiv.appendChild(row);
    });

    // If filtered, add a "Show all environments" toggle
    if (isFiltered && filtered.length < topLevel.length) {
      const toggle = document.createElement("div");
      toggle.className = "status-toggle";
      toggle.textContent = `+ ${topLevel.length - filtered.length} other environments (all operational)`;
      toggle.style.cssText = "font-size:11px;color:#6b7280;cursor:pointer;padding:4px 0 0 22px;";
      toggle.addEventListener("click", () => {
        renderPendoStatus(data, null); // re-render with all
      });
      componentsDiv.appendChild(toggle);
    }
  }

  // Show incident banner if there are unresolved incidents
  if (data.incidents && Array.isArray(data.incidents) && data.incidents.length > 0) {
    const incident = data.incidents[0];
    const banner = document.createElement("div");
    banner.className = "incident-banner";
    const updates = incident.updates && incident.updates.length > 0 ? incident.updates[0] : null;
    const updateText = updates ? updates.body : "No updates yet";
    banner.innerHTML = `<strong>⚠️ ${escapeHtml(incident.name)}</strong>${updateText ? " — " + escapeHtml(updateText.substring(0, 60)) : ""}`;
    statusDiv.insertBefore(banner, componentsDiv);
  }

  statusDiv.style.display = "block";

  // Auto-expand if there's a problem (non-operational or incidents)
  const hasProblems = (statusValue !== "none" && statusValue !== "operational" && statusValue !== "") ||
    (data.incidents && data.incidents.length > 0);
  const compsEl = document.getElementById("status-components");
  const chevron = document.getElementById("status-chevron");
  if (hasProblems && compsEl) {
    compsEl.style.display = "block";
    if (chevron) chevron.style.transform = "rotate(90deg)";
  }
}

// Status section toggle
document.addEventListener("DOMContentLoaded", () => {
  const header = document.getElementById("status-header");
  if (header) {
    header.addEventListener("click", () => {
      const comps = document.getElementById("status-components");
      const chevron = document.getElementById("status-chevron");
      if (comps) {
        const isHidden = comps.style.display === "none";
        comps.style.display = isHidden ? "block" : "none";
        if (chevron) chevron.style.transform = isHidden ? "rotate(90deg)" : "";
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

let setupLoaded = false;
let activeTabId = null;

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const id = tab.dataset.tab;
    if (id === activeTabId) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    document.getElementById("panel-" + id).classList.add("active");
    activeTabId = id;

    if (id === "setup" && !setupLoaded) {
      setupLoaded = true;
      runSetup();
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
      <div class="setup-section-header" onclick="this.parentElement.classList.toggle('open')" style="color:var(--muted-foreground)">
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
}

// ---------------------------------------------------------------------------
// Health Check — copy (Feature 4: Smart Remediation)
// ---------------------------------------------------------------------------

const REMEDIATION_MAP = {
  "Pendo Agent Loaded": {
    fail: "FIX: Ensure the Pendo snippet is installed on this page. Add the Pendo install script to your <head> tag, or verify your npm package imports pendo-io correctly. See: https://support.pendo.io/hc/en-us/articles/21362607043355-Install-Pendo-on-your-website-or-app"
  },
  "Pendo Ready": {
    warn: "FIX: The agent loaded but isn't ready. This usually means pendo.initialize() hasn't been called yet, or it was called before the agent script finished loading. Ensure initialize() runs AFTER the Pendo script loads.",
    fail: "FIX: pendo.isReady() threw an error. The Pendo agent may be corrupted or an incompatible version. Try clearing the cache and reloading."
  },
  "Visitor ID": {
    warn: "FIX: You're sending an anonymous/auto-generated visitor ID. Update your pendo.initialize() call to pass a stable, unique user identifier:\n  pendo.initialize({ visitor: { id: 'YOUR_USER_ID' } })",
    fail: "FIX: No visitor ID found at all. Ensure pendo.initialize() is called with a visitor.id parameter after the user authenticates."
  },
  "Account ID": {
    warn: "FIX: No account ID set. If your app is B2B, pass the account ID:\n  pendo.initialize({ visitor: { id: 'USER_ID' }, account: { id: 'ACCOUNT_ID' } })"
  },
  "Pendo Instances": {
    warn: "FIX: Multiple Pendo instances or script tags detected. Remove duplicate <script> tags that load the Pendo agent. Check your build system for duplicate imports."
  },
  "Network Requests": {
    warn: "FIX: Pendo network requests are failing or absent. Check for:\n  1. Ad blockers or privacy extensions blocking *.pendo.io\n  2. Corporate proxy/firewall rules blocking pendo.io domains\n  3. CSP connect-src not allowing data.pendo.io\n  4. DNS issues resolving pendo.io domains"
  },
  "Feature Flags": {
    warn: "FIX: One or more Pendo features are disabled via configuration. If unintentional, check your pendo.initialize() options object and remove disableGuides, disableAnalytics, or other disable* flags."
  }
};

// (Old per-tab buildPlainTextReport / buildSetupPlainText removed —
//  replaced by unified buildIssuesReport() in Tools section below)

// ---------------------------------------------------------------------------
// Setup Assistant — rendering
// ---------------------------------------------------------------------------

function renderSetup(data) {
  window.__lastSetup = data;
  const container = document.getElementById("setup-content");
  container.innerHTML = "";

  // Collect sections into problem vs healthy buckets
  const problemSections = [];
  const healthySections = [];

  function makeSection(title, badgeHtml, bodyHtml, hasIssue) {
    const html = `
      <div class="setup-section open">
        <div class="setup-section-header" onclick="this.parentElement.classList.toggle('open')">
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
  if (data.visitorFields && data.visitorFields.length > 0) {
    const vWarns = data.visitorFields.filter(f => f.warnings.length > 0).length;
    const vBadge = vWarns > 0
      ? `<span class="badge badge-yellow">${data.visitorFields.length} fields · ${vWarns} warn</span>`
      : `<span class="badge badge-green">${data.visitorFields.length} fields</span>`;
    let vBody = `<table class="metadata-table"><tr><th>Field</th><th>Type</th><th>Status</th></tr>`;
    data.visitorFields.forEach((f) => {
      const hasWarn = f.warnings.length > 0;
      const cls = hasWarn ? "field-warn" : "field-ok";
      const status = hasWarn ? f.warnings.map(escapeHtml).join(", ") : "OK";
      vBody += `<tr><td>${escapeHtml(f.key)}</td><td>${escapeHtml(f.type)}</td><td class="${cls}">${status}</td></tr>`;
    });
    vBody += `</table>`;
    makeSection(`Visitor Metadata`, vBadge, vBody, vWarns > 0);
  }

  // 6. Account Metadata
  if (data.accountFields && data.accountFields.length > 0) {
    const aWarns = data.accountFields.filter(f => f.warnings.length > 0).length;
    const aBadge = aWarns > 0
      ? `<span class="badge badge-yellow">${data.accountFields.length} fields · ${aWarns} warn</span>`
      : `<span class="badge badge-green">${data.accountFields.length} fields</span>`;
    let aBody = `<table class="metadata-table"><tr><th>Field</th><th>Type</th><th>Status</th></tr>`;
    data.accountFields.forEach((f) => {
      const hasWarn = f.warnings.length > 0;
      const cls = hasWarn ? "field-warn" : "field-ok";
      const status = hasWarn ? f.warnings.map(escapeHtml).join(", ") : "OK";
      aBody += `<tr><td>${escapeHtml(f.key)}</td><td>${escapeHtml(f.type)}</td><td class="${cls}">${status}</td></tr>`;
    });
    aBody += `</table>`;
    makeSection(`Account Metadata`, aBadge, aBody, aWarns > 0);
  }

  // 7. Recommendations
  let errors = 0, warnings = 0, tips = 0;
  if (data.recommendations && data.recommendations.length > 0) {
    data.recommendations.forEach((r) => {
      if (r.severity === "error") errors++;
      else if (r.severity === "warning") warnings++;
      else tips++;
    });
    const recBadge = errors > 0
      ? `<span class="badge badge-red">${errors} error${errors !== 1 ? "s" : ""}</span>`
      : warnings > 0
        ? `<span class="badge badge-yellow">${warnings} warning${warnings !== 1 ? "s" : ""}</span>`
        : `<span class="badge badge-green">${tips} tip${tips !== 1 ? "s" : ""}</span>`;

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
    makeSection(`Recommendations (${data.recommendations.length})`, recBadge, recBody, errors > 0 || warnings > 0);
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
          <div class="setup-section-header" onclick="this.parentElement.classList.toggle('open')">
            <span class="setup-chevron">▶</span>
            <span class="setup-section-title">${s.title}</span>
            <span class="setup-section-badge">${s.badge}</span>
          </div>
          <div class="setup-section-body">${s.body}</div>
        </div>`;
    });
    container.innerHTML += `
      <div class="setup-section" id="whats-good-drawer" style="border-top:1px solid var(--border);margin-top:4px">
        <div class="setup-section-header" onclick="this.parentElement.classList.toggle('open')" style="color:var(--muted-foreground)">
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
      `<span style="color:#2563eb">${tips} tip${tips !== 1 ? "s" : ""}</span>`;
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
        return;
      }
      window.__lastChecks = data.checks;
      activeTabId = "health";
      renderChecks(data.checks);

      // Re-render status filtered to detected environment
      const env = detectEnvFromChecks(data.checks);
      if (env && window.__pendoServiceStatus) {
        renderPendoStatus(window.__pendoServiceStatus, env);
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
      if (typeof pendo.enableDebugging === "function") {
        pendo.enableDebugging();
        return { message: "✅ Debugger launched — use the overlay's ✕ to close" };
      }
      return { error: "pendo.enableDebugging() not available on this agent version" };
    } catch (e) {
      return { error: e.message };
    }
  }, "Debugger launched");
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

  let issueCount = 0;
  const reported = new Set(); // Track reported topics to avoid duplicates

  function addIssue(severity, title, problem, fix) {
    // Deduplicate by normalized title prefix — "Visitor ID" blocks "Visitor ID missing or anonymous"
    const key = title.toLowerCase().replace(/[^a-z]/g, "");
    for (const existing of reported) {
      if (key.startsWith(existing) || existing.startsWith(key)) return;
    }
    reported.add(key);
    issueCount++;
    lines.push(`${issueCount}. [${severity}] ${title}`);
    lines.push(`   Problem: ${problem}`);
    if (fix) lines.push(`   Fix: ${fix}`);
    lines.push("");
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
        // CSP is the diagnosed cause — don't list generic possibilities
        fix = "Your Content-Security-Policy is blocking Pendo requests. See the CSP fix below.";
      } else {
        const remap = REMEDIATION_MAP[c.label];
        fix = (remap && remap[c.status]) ? remap[c.status].replace(/^FIX:\s*/i, "") : null;
      }
      addIssue(severity, c.label, c.detail, fix);
    });
  }

  // --- Setup Assistant issues ---
  let hasSetupIssues = false;

  // CSP issues
  if (setup.csp && setup.csp.issues && setup.csp.issues.length > 0) {
    const cspProblems = setup.csp.issues.filter(i => i.severity === "error" || i.severity === "warning");
    if (cspProblems.length > 0) {
      if (!hasSetupIssues && issueCount > 0) { lines.push("── Setup ──"); lines.push(""); }
      hasSetupIssues = true;
      cspProblems.forEach((issue) => {
        const severity = issue.severity === "error" ? "PROBLEM" : "WARNING";
        addIssue(severity, `CSP: ${issue.directive}`, issue.detail, issue.fix || null);
      });
    }
  }

  // Snippet issues
  if (setup.snippet && !setup.snippet.isAsync && setup.snippet.loadMethod.indexOf("npm") === -1) {
    if (!hasSetupIssues && issueCount > 0) { lines.push("── Setup ──"); lines.push(""); hasSetupIssues = true; }
    addIssue("WARNING", "Synchronous script loading",
      "The Pendo snippet is blocking page load.",
      "Add the async attribute to the Pendo <script> tag.");
  }

  // Metadata warnings
  const allFields = (setup.visitorFields || []).concat(setup.accountFields || []);
  const warnFields = allFields.filter(f => f.warnings.length > 0);
  if (warnFields.length > 0) {
    if (!hasSetupIssues && issueCount > 0) { lines.push("── Setup ──"); lines.push(""); hasSetupIssues = true; }
    warnFields.forEach((f) => {
      addIssue("WARNING", `Metadata: "${f.key}"`,
        f.warnings.join("; "),
        "Review this field in your pendo.initialize() call and correct the value format.");
    });
  }

  // Recommendations (errors and warnings only — skip topics already reported)
  if (setup.recommendations) {
    setup.recommendations.forEach((r) => {
      if (r.severity === "error" || r.severity === "warning") {
        if (!hasSetupIssues && issueCount > 0) { lines.push("── Setup ──"); lines.push(""); hasSetupIssues = true; }
        addIssue(r.severity === "error" ? "PROBLEM" : "WARNING", r.title, r.detail, null);
      }
    });
  }

  // --- Pendo Service Status (only if there's an active incident) ---
  if (window.__pendoServiceStatus) {
    const st = window.__pendoServiceStatus;
    if (st.incidents && st.incidents.length > 0) {
      lines.push("── Pendo Service Status ──");
      lines.push("");
      st.incidents.forEach((inc) => {
        const update = (inc.incident_updates && inc.incident_updates.length > 0)
          ? inc.incident_updates[0].body : null;
        addIssue("INCIDENT", inc.name,
          `Status: ${inc.status}` + (update ? `. Latest update: ${update}` : ""),
          null);
      });
    }
  }

  if (issueCount === 0) {
    lines.push("No issues found. Everything looks healthy.");
  } else {
    lines.push("──");
    lines.push(`Total: ${issueCount} issue${issueCount !== 1 ? "s" : ""}`);
  }

  return lines.join("\n");
}

document.getElementById("tool-copy-issues")?.addEventListener("click", () => {
  const btn = document.getElementById("tool-copy-issues");
  const label = btn.querySelector(".tool-label");
  const text = buildIssuesReport();
  navigator.clipboard.writeText(text).then(() => {
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

  // 10. Data host
  try {
    var dataHost = null;
    if (pendo.get && typeof pendo.get === "function") {
      try {
        var opts = pendo.get("options");
        if (opts && opts.dataHost) dataHost = opts.dataHost;
      } catch (_) {}
    }
    if (!dataHost) {
      var scripts = document.querySelectorAll('script[src*="pendo"]');
      for (var i = 0; i < scripts.length; i++) {
        try {
          var u = new URL(scripts[i].src);
          if (!dataHost && u.hostname.includes("pendo")) dataHost = u.hostname;
        } catch (_) {}
      }
    }
    if (!dataHost && pendo.HOST) dataHost = pendo.HOST;

    if (dataHost) {
      var isDefault = dataHost.includes("cdn.pendo.io") || dataHost.includes("data.pendo.io");
      add("pass", "Data Host", dataHost + (isDefault ? " (default Pendo CDN)" : " (CNAME / custom)"));
    } else {
      add("warn", "Data Host", "Could not determine data host");
    }
  } catch (e) {
    add("warn", "Data Host", "Error detecting data host: " + e.message);
  }

  // 10. Network request validation
  try {
    var perfEntries = performance.getEntriesByType ? performance.getEntriesByType("resource") : [];
    var pendoRequests = perfEntries.filter(function(e) {
      return e.name && (e.name.indexOf("pendo.io") !== -1 || e.name.indexOf("pendo-") !== -1);
    });

    if (pendoRequests.length === 0) {
      add("warn", "Network Requests", "No Pendo network requests detected. Data may not be transmitting, or requests completed before page load.");
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

      if (failed.length > 0) {
        add("warn", "Network Requests", pendoRequests.length + " request(s) to Pendo — " + failed.length + " may have failed (0 bytes). Hosts: " + summary);
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
    try {
      // Check Performance API for blocked resources (transferSize=0 + no decodedBodySize)
      var perfEntries = performance.getEntriesByType && performance.getEntriesByType("resource") || [];
      var pendoResources = perfEntries.filter(function(e) { return e.name && e.name.indexOf("pendo") !== -1; });
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
    var pendoHosts = [
      "cdn.pendo.io", "app.pendo.io", "adopt.pendo.io", "data.pendo.io",
      "*.pendo.io", "pendo.io",
      "pendo-io-static.storage.googleapis.com",
      "pendo-static-5763789454311424.storage.googleapis.com",
      "pendo-io-bucket.storage.googleapis.com",
      "*.storage.googleapis.com"
    ];

    function hostAllowed(sources) {
      return sources.some(function(v) {
        return v === "*" || pendoHosts.some(function(h) { return v.indexOf(h) !== -1; });
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

      // -- Directive-level checks (per Pendo docs: support.pendo.io/hc/en-us/articles/360032209131) --

      // script-src — Pendo needs: cdn.pendo.io, app.pendo.io, pendo-io-static.storage.googleapis.com, 'unsafe-inline', 'unsafe-eval'
      var scriptSrc = getDirective("script-src");
      if (scriptSrc.length > 0) {
        if (!hostAllowed(scriptSrc)) {
          csp.issues.push({ directive: "script-src", severity: "error",
            detail: "Pendo CDN not allowed in script-src — agent scripts can't load.",
            fix: "Add to your CSP script-src directive:\n  cdn.pendo.io app.pendo.io pendo-io-static.storage.googleapis.com" });
        }
        if (!valueAllowed(scriptSrc, "'unsafe-inline'")) {
          var hasNonce = scriptSrc.some(function(v) { return v.indexOf("nonce-") !== -1; });
          var hasHash = scriptSrc.some(function(v) { return v.indexOf("sha256-") !== -1 || v.indexOf("sha384-") !== -1; });
          if (!hasNonce && !hasHash) {
            csp.issues.push({ directive: "script-src (inline)", severity: "warning",
              detail: "'unsafe-inline' missing and no nonce/hash — Pendo's inline initialization snippet will be blocked.",
              fix: "Add 'unsafe-inline' to script-src, or add a nonce to the Pendo snippet:\n  script-src ... 'nonce-YOUR_NONCE'" });
          }
        }
        if (!valueAllowed(scriptSrc, "'unsafe-eval'") && !valueAllowed(scriptSrc, "*")) {
          csp.issues.push({ directive: "script-src (eval)", severity: "warning",
            detail: "'unsafe-eval' missing — some Pendo guide features (e.g., guide code blocks) may not execute.",
            fix: "Add 'unsafe-eval' to script-src (required for guide JavaScript):\n  script-src ... 'unsafe-eval'" });
        }
      }

      // connect-src — Pendo needs: app.pendo.io, data.pendo.io, pendo-io-static.storage.googleapis.com
      var connectSrc = getDirective("connect-src");
      if (connectSrc.length > 0 && !hostAllowed(connectSrc)) {
        csp.issues.push({ directive: "connect-src", severity: "error",
          detail: "Pendo data endpoints not allowed in connect-src — analytics events and guide data won't transmit.",
          fix: "Add to your CSP connect-src directive:\n  app.pendo.io data.pendo.io pendo-io-static.storage.googleapis.com" });
      }

      // style-src — Pendo needs: app.pendo.io, cdn.pendo.io, 'unsafe-inline'
      var styleSrc = getDirective("style-src");
      if (styleSrc.length > 0) {
        if (!valueAllowed(styleSrc, "'unsafe-inline'") && !valueAllowed(styleSrc, "*")) {
          var hasStyleNonce = styleSrc.some(function(v) { return v.indexOf("nonce-") !== -1; });
          csp.issues.push({ directive: "style-src", severity: "warning",
            detail: "'unsafe-inline' missing in style-src — Pendo guides inject inline styles and won't render correctly.",
            fix: hasStyleNonce
              ? "Pass your nonce to Pendo via the inlineStyleNonce option:\n  pendo.initialize({ inlineStyleNonce: 'YOUR_NONCE' })"
              : "Add to your CSP style-src directive:\n  app.pendo.io cdn.pendo.io 'unsafe-inline'" });
        }
      }

      // img-src — Pendo needs: cdn.pendo.io, app.pendo.io, pendo-io-static.storage.googleapis.com, data:
      var imgSrc = getDirective("img-src");
      if (imgSrc.length > 0 && !hostAllowed(imgSrc) && !valueAllowed(imgSrc, "*")) {
        var hasDataUri = valueAllowed(imgSrc, "data:");
        var imgFix = "Add to your CSP img-src directive:\n  cdn.pendo.io app.pendo.io pendo-io-static.storage.googleapis.com";
        if (!hasDataUri) imgFix += " data:";
        csp.issues.push({ directive: "img-src", severity: "warning",
          detail: "Pendo CDN not in img-src — guide images and resource center assets won't load." + (!hasDataUri ? " Also missing data: for inline images." : ""),
          fix: imgFix });
      }

      // font-src — Pendo needs: cdn.pendo.io, app.pendo.io
      var fontSrc = getDirective("font-src");
      if (fontSrc.length > 0 && !hostAllowed(fontSrc) && !valueAllowed(fontSrc, "*")) {
        csp.issues.push({ directive: "font-src", severity: "warning",
          detail: "Pendo not in font-src — guide custom fonts won't load.",
          fix: "Add to your CSP font-src directive:\n  cdn.pendo.io app.pendo.io" });
      }

      // frame-src / child-src — Pendo needs: app.pendo.io (resource center + designer)
      var frameSrc = csp.directives["frame-src"] || csp.directives["child-src"] || csp.directives["default-src"] || [];
      if (frameSrc.length > 0 && !hostAllowed(frameSrc)) {
        csp.issues.push({ directive: "frame-src", severity: "warning",
          detail: "Pendo not in frame-src — the resource center and visual designer use iframes and will be blocked.",
          fix: "Add to your CSP frame-src (or child-src) directive:\n  app.pendo.io" });
      }

      // worker-src — Pendo may use web workers
      var workerSrc = getDirective("worker-src");
      if (workerSrc.length > 0 && !valueAllowed(workerSrc, "'self'") && !valueAllowed(workerSrc, "*") && !valueAllowed(workerSrc, "blob:")) {
        csp.issues.push({ directive: "worker-src", severity: "tip",
          detail: "worker-src doesn't allow blob: or 'self' — Pendo web workers for performance optimization may be blocked.",
          fix: "Add to your CSP worker-src directive:\n  blob: 'self'" });
      }

      // trusted-types — if present, Pendo needs its policy name
      var trustedTypes = csp.directives["trusted-types"] || csp.directives["require-trusted-types-for"] || [];
      if (trustedTypes.length > 0 && !valueAllowed(trustedTypes, "pendo")) {
        csp.issues.push({ directive: "trusted-types", severity: "warning",
          detail: "Trusted Types policy active but 'pendo' not listed — Pendo DOM operations will be blocked.",
          fix: "Add the Pendo policy name to your trusted-types directive:\n  trusted-types pendo" });
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
    if (cspViolations.length > 0) {
      if (!csp.detected) {
        csp.detected = true;
        csp.source = "HTTP header (detected via blocked resources)";
      }
      // Build exact fix instructions per Pendo docs
      // (support.pendo.io/hc/en-us/articles/360032209131)
      var blockedDomains = Object.keys(blockedByDomain);
      var hasCdn = blockedDomains.some(function(d) { return d.indexOf("cdn.pendo.io") !== -1; });
      var hasData = blockedDomains.some(function(d) { return d.indexOf("data.pendo.io") !== -1; });
      var hasStorage = blockedDomains.some(function(d) { return d.indexOf("storage.googleapis.com") !== -1; });
      var hasApp = blockedDomains.some(function(d) { return d.indexOf("app.pendo.io") !== -1; });
      var fixLines = [];
      if (hasCdn || hasStorage) {
        fixLines.push("script-src: add cdn.pendo.io app.pendo.io pendo-io-static.storage.googleapis.com 'unsafe-inline' 'unsafe-eval'");
      }
      if (hasData) {
        fixLines.push("connect-src: add app.pendo.io data.pendo.io pendo-io-static.storage.googleapis.com");
      }
      if (hasCdn || hasStorage || hasData) {
        fixLines.push("img-src: add cdn.pendo.io app.pendo.io pendo-io-static.storage.googleapis.com data:");
      }
      fixLines.push("style-src: add app.pendo.io cdn.pendo.io 'unsafe-inline'");
      fixLines.push("font-src: add cdn.pendo.io app.pendo.io");
      fixLines.push("frame-src / child-src: add app.pendo.io");
      var domainSummary = blockedDomains.map(function(d) { return d + " (" + blockedByDomain[d] + ")"; }).join(", ");
      var detail = blockedPendo.length + " Pendo resource" + (blockedPendo.length !== 1 ? "s" : "") + " blocked: " + domainSummary + ".";
      var fixText = "Add these domains to your Content-Security-Policy header:\n  " + fixLines.join("\n  ");
      csp.issues.push({ directive: "Blocked resources", severity: "error", detail: detail, fix: fixText });
    } else if (!csp.detected && pendoAgentLoaded && !dataFlowing && pendoFunctional) {
      // Agent loaded but data isn't flowing — possible silent connect-src block
      csp.detected = true;
      csp.source = "Possible HTTP header restriction";
      csp.issues.push({ directive: "connect-src (silent block)", severity: "warning",
        detail: "Pendo agent loaded but no data requests detected — a CSP connect-src restriction may be silently blocking analytics.",
        fix: "Add to your CSP connect-src directive:\n  app.pendo.io data.pendo.io pendo-io-static.storage.googleapis.com" });
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
      "The Pendo snippet is loaded synchronously, which may impact page load performance. Add the async attribute to the script tag.");
  }

  // Duplicate scripts
  if (result.snippet && result.snippet.scriptCount > 1) {
    recommend("warning", "Multiple Pendo script tags",
      result.snippet.scriptCount + " Pendo script tags found. This can cause duplicate event tracking or conflicts. Ensure only one snippet is loaded.");
  }

  // Dual initialization
  if (window.pendo_) {
    recommend("warning", "Dual Pendo instance detected",
      "Both window.pendo and window.pendo_ exist. This may indicate Pendo Guard or duplicate initialization. Verify this is intentional.");
  }

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
      "Fields that may contain sensitive data: " + sensitiveFields.join(", ") + ". Review these fields and exclude any PII, passwords, or tokens.");
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
      "Fields with non-flat values: " + complexFields.join(", ") + ". Pendo works best with flat key-value pairs. Flatten nested objects or convert arrays to strings.");
  }

  // Framework-specific timing tips
  if (fw.name.indexOf("React") !== -1 || fw.name.indexOf("Next") !== -1) {
    if (!init.hasVisitorId) {
      recommend("tip", "React initialization timing",
        "In React, call pendo.initialize() inside a useEffect hook after authentication completes, so the visitor ID is available.");
    }
  } else if (fw.name.indexOf("Vue") !== -1 || fw.name.indexOf("Nuxt") !== -1) {
    if (!init.hasVisitorId) {
      recommend("tip", "Vue initialization timing",
        "In Vue, call pendo.initialize() in the mounted() lifecycle hook or in a route guard after the user is authenticated.");
    }
  } else if (fw.name.indexOf("Angular") !== -1) {
    if (!init.hasVisitorId) {
      recommend("tip", "Angular initialization timing",
        "In Angular, call pendo.initialize() in an AfterViewInit lifecycle hook or in a route resolver after fetching user data.");
    }
  }

  // Payload size estimate
  try {
    var payloadEstimate = JSON.stringify(pendo.metadata || {}).length;
    if (payloadEstimate > 50000) {
      recommend("warning", "Large metadata payload",
        "Estimated metadata size is " + Math.round(payloadEstimate / 1024) + "KB. Pendo has a 64KB limit. Consider reducing the number of metadata fields.");
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
          "Running Pendo agent v" + ver + ". Check if a newer version is available for improved features and bug fixes.");
      }
    }
  } catch (e) {}

  // CSP issues are already surfaced in the CSP section — no need to duplicate
  // as separate recommendations (that was causing "runtime, runtime, runtime...")

  // No metadata at all
  if (result.visitorFields.length === 0 && result.accountFields.length === 0) {
    recommend("tip", "No metadata fields detected",
      "Pendo is initialized without visitor or account metadata. Adding fields like email, role, plan_level, and created_at enables richer segmentation and analytics.");
  }

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

  feedbackSubmit.addEventListener("click", () => {
    const text = feedbackTextarea.value.trim();
    if (!text) {
      feedbackStatus.textContent = "Please enter some feedback.";
      feedbackStatus.className = "feedback-status feedback-error";
      return;
    }

    feedbackSubmit.disabled = true;
    feedbackSubmit.textContent = "Sending…";

    chrome.runtime.sendMessage(
      {
        type: "save-feedback",
        feedback: text,
        url: document.getElementById("page-url").textContent || "",
      },
      (response) => {
        feedbackSubmit.disabled = false;
        feedbackSubmit.textContent = "Submit";

        if (response && response.ok) {
          feedbackStatus.textContent = "Thanks for your feedback!";
          feedbackStatus.className = "feedback-status feedback-success";
          feedbackTextarea.value = "";
          setTimeout(() => {
            feedbackModal.style.display = "none";
          }, 1200);
        } else {
          feedbackStatus.textContent =
            "Failed to save: " + ((response && response.error) || "Unknown error");
          feedbackStatus.className = "feedback-status feedback-error";
        }
      }
    );
  });

  // Allow Ctrl+Enter / Cmd+Enter to submit
  feedbackTextarea.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      feedbackSubmit.click();
    }
  });
})();
