# Pendo Health Check — Chrome Extension

A Manifest V3 Chrome extension that runs real-time diagnostics against the [Pendo](https://www.pendo.io/) analytics agent on any web page. Click the toolbar icon to get instant pass/warn/fail results across 11 health checks, a deep-dive Setup Assistant with framework detection, metadata validation, and actionable recommendations, plus interactive Pendo console tools.

Companion tool to [pendo-io/ai-setup-assistant](https://github.com/pendo-io/ai-setup-assistant) — the ai-setup-assistant helps developers **install** Pendo into a codebase, while this extension **validates** the running installation from the browser.

---

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [What's New in v1.5](#whats-new-in-v15)
- [Extension Architecture](#extension-architecture)
- [File Reference](#file-reference)
- [Tab Purposes](#tab-purposes)
- [Tab 1: Health Check](#tab-1-health-check)
- [Tab 2: Setup Assistant](#tab-2-setup-assistant)
- [Tab 3: Tools](#tab-3-tools)
- [Pendo Service Status](#pendo-service-status)
- [QA Test Harness](#qa-test-harness)
- [First-Run Onboarding Tour](#first-run-onboarding-tour)
- [Feedback System](#feedback-system)
- [Permissions](#permissions)
- [Extending the Extension](#extending-the-extension)
- [Contributing](#contributing)
- [License](#license)

---

## Installation

### Chrome Web Store

[**Install from Chrome Web Store**](https://chromewebstore.google.com/detail/pendo-health-check/clcjdjkhbhigpbcfliedfdielpjfjcmo)

### Install from Source (Developer Mode)

If you want to run the latest version, contribute, or just prefer not to use the Web Store:

1. **Clone the repo**
   ```bash
   git clone https://github.com/prolitariat/pendo-health-check.git
   cd pendo-health-check
   ```
2. **Open Chrome** and navigate to `chrome://extensions`
3. **Enable Developer mode** (toggle in the top-right corner)
4. **Click "Load unpacked"** and select the cloned directory
5. **Pin the extension** in the toolbar for quick access

That's it — no build step, no npm install, no bundler. The extension is pure vanilla JS.

To update later, just `git pull` and click the ↻ reload button on the extension card in `chrome://extensions`.

## Usage

**Pendo Detected** — Navigate to any page with Pendo installed and click the icon. The Health Check tab runs automatically. Switch to Setup Assistant for implementation audit or Tools for interactive Pendo commands.

**Pendo Not Detected** — On pages without Pendo (e.g., `https://example.com`), the extension shows a "Pendo Not Detected" message with guidance.

**Restricted Pages** — On `chrome://` pages, `chrome-extension://` pages, and the Chrome Web Store, the extension shows an error state explaining the restriction.

**Copy Issues** — The Tools tab includes a "Copy Issues to Clipboard" button that generates a priority-sorted diagnostic report (critical issues first, then warnings, then passes). Issues include smart remediation suggestions and CSP fix instructions, making copied reports self-contained troubleshooting guides. When issues are detected, the copy button pulses to draw attention.

**First-Run Tour** — On first install, the extension walks you through each tab and the copy button with a guided spotlight tour.

**Send Feedback** — A feedback button at the bottom of the popup lets you report issues or suggest features. You can open a GitHub Issue (requires GitHub account) or send an email (no account needed). All feedback is PII-scrubbed before it leaves the extension.

---

## What's New in v1.5

### QA Test Harness (v1.5.0)
A self-hosted HTML page (`test-harness.html`) for regression testing every extension check. Includes 8 preset scenarios (Healthy, Broken, CSP Blocked, GDPR Waiting, CNAME, Ad Blocked, Partial Setup, React SPA) and granular toggle controls for Pendo agent state, identity/metadata, network/hosting, CSP modes, CMP/GDPR platforms, and frameworks. See [QA Test Harness](#qa-test-harness) for details.

### First-Run Onboarding Tour (v1.5.0)
On first install, a 5-step guided tour spotlights each tab and the copy issues button. Uses `chrome.storage.local` to track completion. Supports keyboard navigation (arrow keys, Escape, Enter). See [First-Run Onboarding Tour](#first-run-onboarding-tour).

### Copy Button Pulse (v1.5.0)
When the health check detects warnings or failures, the "Copy Issues" button in the Tools tab pulses pink for 3 cycles to draw attention without overwriting the clipboard.

### CNAME-Aware Host Detection (v1.4.0)
The Setup Assistant now recognizes custom CNAME domains for Pendo CDN and data endpoints. Detects both standard Pendo hosts and custom CNAMEs by inspecting network entries and `pendo._config`.

### CMP / GDPR Consent Detection (v1.4.0)
Detects six major Consent Management Platforms (OneTrust, Cookiebot, Didomi, Osano, TrustArc, TCF v2.0) plus generic cookie banners. Flags EU locale detection. Reports consent platform, readiness state, and potential Pendo blocking.

### CORS Error Detection (v1.4.0)
Inspects `performance.getEntriesByType("resource")` for Pendo requests with `transferSize === 0` and `responseStatus === 0` — the fingerprint of a CORS-blocked request. Warns when detected with actionable remediation.

### Priority-Sorted Clipboard (v1.4.0)
The clipboard report now sorts issues by severity: critical failures first, then warnings, then passes. Makes pasted reports scannable at a glance.

### Clipboard Remediation Rewrite (v1.3.4)
Complete rewrite of the clipboard copy system. Every check includes context-aware remediation text. CSP violations include per-directive fix instructions with auto-detected subscription IDs. Reports are structured as plain text suitable for Slack, Jira, or email.

### WCAG Accessibility (v1.3.1 – v1.3.3)
Full keyboard accessibility with `focus-visible` rings, ARIA `role="tablist"` / `role="tab"` / `role="tabpanel"` attributes, section keyboard navigation, centered equal-width tab layout, tab hover states with pink wash and underline preview, and Pendo yellow (#FEF484) for dark mode warnings and badges.

### v1.2.0 Features
Live Pendo service status monitoring with auto-detected realm, network request validation (Check #10), feature flag detection (Check #11), per-directive CSP fix instructions with auto-detected subscription IDs, Tools tab with Pendo console commands, and smart remediation guidance in all copied reports.

---

## Extension Architecture

```
┌──────────────────────────────────────────────────┐
│                    Chrome Toolbar                 │
│                   [Extension Icon]                │
└─────────────────────┬────────────────────────────┘
                      │ click
┌─────────────────────▼────────────────────────────┐
│                   popup.html                      │
│  ┌─────────────┐  ┌───────────┐  ┌────────────┐  │
│  │   Header    │  │  Tab Bar  │  │  Feedback   │  │
│  │  (icon+URL) │  │HC|Setup|T │  │   Button    │  │
│  └─────────────┘  └─────┬─────┘  └─────┬──────┘  │
│  ┌──────────────┐       │               │         │
│  │Pendo Status  │       │               │         │
│  │(live API)    │       │               │         │
│  └──────┬───────┘       │               │         │
│         │  ┌────────────▼─────────────┐ │         │
│         │  │     popup.js (UI logic)  │ │         │
│         │  │  ┌──────────┐ ┌────────┐ │ │         │
│         │  │  │renderChks│ │render  │ │ │         │
│         │  │  │()        │ │Setup() │ │ │         │
│         │  │  └────┬─────┘ └───┬────┘ │ │         │
│         │  │       │           │      │ │         │
│         │  │  chrome.scripting.executeScript       │
│         │  │       │ world: "MAIN"    │ │         │
│         │  └───────┼───────────┼──────┘ │         │
└──────────┼─────────┼───────────┼────────┼─────────┘
           │         │           │        │
     fetch │    ┌────▼───────────▼────┐   │ GitHub
  status.  │    │  Target Page (MAIN) │   │ Issues /
  pendo.io │    │  ┌────────────────┐ │   │ Email
           │    │  │runPendoHealth  │ │   │
           │    │  │Check()         │ │   │
           │    │  │→ 11 checks     │ │   │
           │    │  └────────────────┘ │   │
           │    │  ┌────────────────┐ │   │
           │    │  │runPendoSetup   │ │   │
           │    │  │Assistant()     │ │   │
           │    │  └────────────────┘ │   │
           │    └─────────────────────┘   │
           │                              │
┌──────────▼──────────────────────────────▼─────┐
│  status.pendo.io     │     Feedback endpoint   │
│  (Atlassian          │  GitHub Issues (devs) or│
│   Statuspage API)    │  Email (no-account)      │
└──────────────────────┴────────────────────────┘
```

**Key design decisions:**

- **No content script relay.** Both diagnostic functions are injected directly via `chrome.scripting.executeScript` with `world: "MAIN"`, giving them access to the page's `window.pendo` object without message-passing overhead.
- **Background pre-loading.** The Setup Assistant analysis runs in the background immediately after Health Check completes, so the copy report always includes CSP data regardless of which tab the user is viewing.
- **Live service status.** Fetches from Pendo's public Atlassian Statuspage API (`status.pendo.io/api/v2/summary.json`) on popup open. Auto-detects realm. No authentication required.
- **Flex column layout.** The popup uses `display: flex; flex-direction: column` with a fixed 600px height. Header, tab bar, and feedback bar are pinned (`flex-shrink: 0`); only the active tab panel scrolls. This prevents the tab bar from scrolling off-screen.
- **Zero external dependencies.** Pure vanilla JS with inline CSS. No build step, no npm, no bundler.
- **Minimal permissions.** `activeTab` (access current tab on click), `scripting` (inject diagnostic functions), and `storage` (persist onboarding tour state).

---

## File Reference

### `manifest.json`

Chrome Extension Manifest V3 configuration.

| Field | Value | Purpose |
|-------|-------|---------|
| `manifest_version` | `3` | Required for Chrome Manifest V3 extensions |
| `name` | `"Pendo Health Check"` | Display name in Chrome toolbar and extensions page |
| `version` | `"1.5.0"` | Extension version (semver) |
| `description` | `"Run diagnostics against the Pendo agent — health checks, setup analysis, service status, network validation, and smart remediation."` | Shown on `chrome://extensions` |
| `permissions` | `["activeTab", "scripting", "storage"]` | Grants access to the current tab, script injection, and local storage |
| `action.default_popup` | `"popup.html"` | The HTML file rendered when the icon is clicked |
| `action.default_icon` | `16/48/128px PNGs` | Toolbar icon at various resolutions |
| `icons` | `16/48/128px PNGs` | Extension management page icons |
| `background.service_worker` | `"background.js"` | Manifest V3 service worker for lifecycle events |

### `popup.html`

The popup UI rendered when the user clicks the extension icon. Contains all CSS inline (no external stylesheet). Flex column layout with pinned header/tabs/footer and scrollable tab panels.

### `popup.js`

All UI logic, event handling, the two injected diagnostic functions (`runPendoHealthCheck`, `runPendoSetupAssistant`), Tools tab handlers, first-run onboarding tour, and copy button pulse animation.

### `background.js`

Minimal Manifest V3 service worker. Handles `chrome.runtime.onInstalled` lifecycle logging.

### `test-harness.html`

Self-hosted QA regression test page. Not included in the Chrome Web Store submission — it's a developer tool for validating extension behavior against mock Pendo states. See [QA Test Harness](#qa-test-harness).

### `icons/`

| File | Size | Used For |
|------|------|----------|
| `icon16.png` | 16×16 | Toolbar icon (small) |
| `icon48.png` | 48×48 | Extensions management page, popup header |
| `icon128.png` | 128×128 | Chrome Web Store, install dialog |

---

## Tab Purposes

Each tab has a clearly defined purpose with no overlapping responsibilities:

| Tab | Purpose | Question It Answers |
|-----|---------|---------------------|
| **Health Check** | Runtime state monitoring | *"Is Pendo working right now?"* |
| **Setup Assistant** | Implementation audit | *"Is Pendo installed correctly?"* |
| **Tools** | Interactive commands & clipboard | *"Run diagnostics and copy issues"* |

---

## Tab 1: Health Check

Runs automatically when the popup opens. Injects `runPendoHealthCheck()` into the page's MAIN world and renders results as a single-column list of pass/warn/fail rows with a summary bar.

11 checks are run in sequence:

| # | Name | What It Inspects |
|---|------|-----------------|
| 1 | **Pendo Agent Loaded** | `typeof window.pendo !== "undefined"` |
| 2 | **Pendo Ready** | `pendo.isReady()` return value |
| 3 | **Visitor ID** | `pendo.getVisitorId()` — flags anonymous IDs |
| 4 | **Account ID** | `pendo.getAccountId()` |
| 5 | **Active Guides** | `pendo.guides` array length |
| 6 | **Pendo Instances** | Detects dual init and counts script tags |
| 7 | **Agent Version** | `pendo.getVersion()` or `pendo.VERSION` |
| 8 | **API Key** | `pendo.get("apiKey")` or `pendo.apiKey` |
| 9 | **Data Host** | `pendo.get("options").dataHost` |
| 10 | **Network Requests** | `performance.getEntriesByType('resource')` for Pendo traffic + CORS detection |
| 11 | **Feature Flags** | `pendo.getOptions()` for non-default config |

---

## Tab 2: Setup Assistant

Runs on first click of the "Setup Assistant" tab and pre-runs in the background after Health Check completes.

Seven analysis sections: Framework Detection, Snippet Analysis, Initialization, Content Security Policy (per-directive with auto-detected SUB_ID), CNAME Host Detection, CMP/GDPR Consent Detection, Metadata Fields, and Recommendations.

---

## Tab 3: Tools

One-click access to Pendo console commands: Validate Install, Validate Environment, Enable Debugger, Disable Debugger. Each injected via MAIN world.

Also includes the **Copy Issues to Clipboard** button, which generates a priority-sorted report with remediation for every warn/fail check.

---

## Pendo Service Status

Auto-detects realm (US/EU/US1/JP), shows status badge linking to `status.pendo.io`, highlights active incidents. Fire-and-forget — if the fetch fails, checks proceed normally.

---

## QA Test Harness

`test-harness.html` is a self-contained HTML page for regression-testing every extension check without needing a live Pendo installation.

**Presets:** 8 one-click scenarios that configure all mocks at once: Healthy, Broken, CSP Blocked, GDPR Waiting, CNAME, Ad Blocked, Partial Setup, React SPA.

**Granular controls:** Sidebar toggles for every mock dimension:

| Category | Controls |
|----------|----------|
| **Pendo Agent** | `window.pendo` exists, `isReady()` state, script tag presence, async attribute, dual instance |
| **Identity & Metadata** | Visitor ID (custom/anonymous/none), Account ID, visitor metadata, sensitive fields, complex/nested objects, large payloads |
| **Guides & Features** | Active guide count, agent version |
| **Network & Hosting** | Content host (default/CNAME/EU), data host, ad blocker simulation, CORS simulation |
| **CSP** | None, permissive, strict-no-pendo, partial, nonce |
| **CMP / GDPR** | OneTrust, Cookiebot, Didomi, Osano, TrustArc, TCF v2.0, generic cookie banner, EU locale toggle |
| **Framework** | None, React, React + Next.js, Vue, Angular, Svelte |

**How to use:** Open `test-harness.html` in Chrome, select a preset or configure toggles, then click the Pendo Health Check extension icon to run diagnostics against the mocked state. The test harness injects mocks into `window.pendo`, `performance.getEntriesByType`, CMP globals, framework globals, and CSP meta tags.

**Note:** `test-harness.html` is a developer tool and should not be included in Chrome Web Store submissions. When packaging the extension for the CWS, exclude this file.

---

## First-Run Onboarding Tour

On first install, the extension runs a 5-step guided tour:

1. **Welcome** — Introduction and what the extension does
2. **Health Check tab** — Runtime diagnostics
3. **Setup Assistant tab** — Implementation audit
4. **Tools tab** — Interactive commands
5. **Copy Issues button** — Priority-sorted clipboard report

The tour uses a spotlight overlay (box-shadow cutout) with positioned tooltips. Supports keyboard navigation: arrow keys to advance/retreat, Escape to skip, Enter to advance. Tour completion is persisted via `chrome.storage.local` so it only runs once.

---

## Feedback System

Two submission options, both PII-scrubbed before leaving the extension:

- **GitHub Issue** — Pre-filled issue on this repo (requires GitHub account)
- **Email** — `mailto:` link (no account needed)

Scrubbed patterns: emails, phone numbers, SSNs, credit card numbers, IPv4 addresses.

---

## Permissions

| Permission | Why | Scope |
|------------|-----|-------|
| `activeTab` | Access current tab on click | Only the active tab, only on click |
| `scripting` | Inject diagnostic functions | Only the active tab, only on click |
| `storage` | Persist onboarding tour state | Local only, no sync |

No host permissions, no background network access, no persistent content scripts.

---

## Extending the Extension

### Adding a new Health Check

In `popup.js`, find `runPendoHealthCheck()` and add before the `return` statement:

```javascript
// 12. My New Check
try {
  var myValue = pendo.someProperty;
  if (myValue) {
    add("pass", "My New Check", "Found: " + myValue);
  } else {
    add("warn", "My New Check", "someProperty not available");
  }
} catch (e) {
  add("fail", "My New Check", "Error: " + e.message);
}
```

Add a remediation entry in `REMEDIATION_MAP`:

```javascript
"My New Check": "Actionable fix suggestion for this check."
```

### Adding a Setup Recommendation

In `runPendoSetupAssistant()`, in the recommendations section:

```javascript
recommend("warning", "My Recommendation Title",
  "Detailed explanation with actionable guidance.");
// severity: "error" | "warning" | "tip"
```

### Adding a QA Test Preset

In `test-harness.html`, add to the `PRESETS` object:

```javascript
"my-scenario": {
  label: "My Scenario",
  pendoExists: true,
  isReady: true,
  // ... configure all toggles
}
```

---

## Contributing

Contributions are welcome! This is a pure vanilla JS project with no build step.

1. Fork the repo
2. Clone your fork locally
3. Load the extension in Chrome via Developer Mode (see [Install from Source](#install-from-source-developer-mode))
4. Make your changes — edit `popup.js`, `popup.html`, or `background.js` directly
5. Test on any page with Pendo installed, and use `test-harness.html` for regression testing
6. Submit a PR

No npm, no bundler, no build commands. Just edit, reload the extension in `chrome://extensions`, and test.

---

## License

[MIT](LICENSE)
