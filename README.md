# Pendo Health Check — Chrome Extension

A Manifest V3 Chrome extension that runs real-time diagnostics against the [Pendo](https://www.pendo.io/) analytics agent on any web page. Click the toolbar icon to get instant pass/warn/fail results across 11 health checks, a deep-dive Setup Assistant with framework detection, metadata validation, and actionable recommendations, plus interactive Pendo console tools.

**New in v1.2:** Live Pendo service status monitoring, network request validation, feature flag detection, smart remediation guidance, Tools tab with Pendo console commands, per-directive CSP fix instructions, and auto-detected subscription IDs.

Companion tool to [pendo-io/ai-setup-assistant](https://github.com/pendo-io/ai-setup-assistant) — the ai-setup-assistant helps developers **install** Pendo into a codebase, while this extension **validates** the running installation from the browser.

---

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [What's New in v1.2](#whats-new-in-v12)
- [Extension Architecture](#extension-architecture)
- [File Reference](#file-reference)
- [Tab Purposes](#tab-purposes)
- [Tab 1: Health Check](#tab-1-health-check)
- [Tab 2: Setup Assistant](#tab-2-setup-assistant)
- [Tab 3: Tools](#tab-3-tools)
- [Pendo Service Status](#pendo-service-status)
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

**Copy Results** — Both tabs include a "Copy Results" / "Copy Report" button that generates a plain-text diagnostic report with smart remediation suggestions for pasting into tickets, Slack, or docs. The report automatically includes CSP data regardless of which tab you're viewing.

**Send Feedback** — A feedback button at the bottom of the popup lets you report issues or suggest features. You can open a GitHub Issue (requires GitHub account) or send an email (no account needed). All feedback is PII-scrubbed before it leaves the extension.

---

## What's New in v1.2

### Pendo Service Status
The extension polls the Pendo public status page (`status.pendo.io`) and displays a live service status badge with a link to the full status page. The extension auto-detects which Pendo realm (US/EU/US1/JP) the page is using based on network traffic and API key patterns.

### Network Request Validation (Check #10)
Uses the browser's `performance.getEntriesByType('resource')` API to inspect actual network requests to Pendo domains (`pendo.io`, `pendo-io`, `pendo-static`). Reports pass/warn/fail based on whether Pendo network traffic is detected, which validates that the agent is actively communicating with Pendo servers beyond just being loaded.

### Feature Flag Detection (Check #11)
Inspects `pendo.getOptions()` or `pendo.options` for feature flag configuration (`guidesDisabled`, `disableGuides`, `disablePersistence`, `blockAgentMetadata`, `blockLogAgent`, `cookieDomain`, `htmlApplications`, `htmlAttributes`). Flags any non-default settings that could affect Pendo behavior.

### Per-Directive CSP Fix Instructions
The Setup Assistant maps blocked Pendo domains to the specific CSP directives they affect (e.g., `cdn.pendo.io` → `script-src`, `img-src`, `font-src`) rather than dumping all directives. Each issue includes copy-pasteable fix instructions. Subscription IDs are auto-detected from network traffic so the fixes reference your actual Pendo account.

### Tools Tab
A third tab providing direct access to Pendo's built-in console commands: Validate Install (`pendo.validateInstall()`), Validate Environment (`pendo.validateEnvironment()`), Enable Debugger (`pendo.enableDebugging()`), and Disable Debugger (`pendo.disableDebugging()`). Each command is injected into the page's MAIN world with status feedback.

### Smart Remediation
The "Copy Results" and "Copy Report" buttons include a remediation section in the generated text. Each check that returned `warn` or `fail` gets an actionable fix suggestion appended to the report, drawn from a curated `REMEDIATION_MAP` covering all 11 checks. This makes copied reports self-contained troubleshooting guides.

### Tab Delineation
Clear separation between tabs: Health Check monitors runtime state ("Is Pendo working?"), Setup Assistant audits implementation details ("Is Pendo installed correctly?"), and Tools provides interactive commands ("Run Pendo diagnostics directly").

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
- **Zero external dependencies.** Pure vanilla JS with inline CSS. No build step, no npm, no bundler.
- **Minimal permissions.** Only `activeTab` (access current tab on click) and `scripting` (inject diagnostic functions).

---

## File Reference

### `manifest.json`

Chrome Extension Manifest V3 configuration.

| Field | Value | Purpose |
|-------|-------|---------|
| `manifest_version` | `3` | Required for Chrome Manifest V3 extensions |
| `name` | `"Pendo Health Check"` | Display name in Chrome toolbar and extensions page |
| `version` | `"1.2.0"` | Extension version (semver) |
| `description` | `"Run diagnostics against the Pendo agent — health checks, setup analysis, service status, network validation, and smart remediation."` | Shown on `chrome://extensions` |
| `permissions` | `["activeTab", "scripting"]` | Grants access to the current tab and script injection |
| `action.default_popup` | `"popup.html"` | The HTML file rendered when the icon is clicked |
| `action.default_icon` | `16/48/128px PNGs` | Toolbar icon at various resolutions |
| `icons` | `16/48/128px PNGs` | Extension management page icons |
| `background.service_worker` | `"background.js"` | Manifest V3 service worker for lifecycle events |

### `popup.html`

The popup UI rendered when the user clicks the extension icon. Contains all CSS inline (no external stylesheet).

### `popup.js`

All UI logic, event handling, the two injected diagnostic functions, and Tools tab handlers.

### `background.js`

Minimal Manifest V3 service worker. Handles `chrome.runtime.onInstalled` lifecycle logging.

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
| **Tools** | Interactive commands | *"Run Pendo diagnostics directly"* |

---

## Tab 1: Health Check

Runs automatically when the popup opens. Injects `runPendoHealthCheck()` into the page's MAIN world and renders results as a list of pass/warn/fail rows with a summary bar.

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
| 10 | **Network Requests** | `performance.getEntriesByType('resource')` for Pendo traffic |
| 11 | **Feature Flags** | `pendo.getOptions()` for non-default config |

---

## Tab 2: Setup Assistant

Runs on first click of the "Setup Assistant" tab and pre-runs in the background after Health Check completes.

Six analysis sections: Framework Detection, Snippet Analysis, Initialization, Content Security Policy (per-directive with auto-detected SUB_ID), Metadata Fields, and Recommendations.

---

## Tab 3: Tools

One-click access to Pendo console commands: Validate Install, Validate Environment, Enable Debugger, Disable Debugger. Each injected via MAIN world.

---

## Pendo Service Status

Auto-detects realm (US/EU/US1/JP), shows status badge linking to `status.pendo.io`, highlights active incidents. Fire-and-forget — if the fetch fails, checks proceed normally.

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

---

## Contributing

Contributions are welcome! This is a pure vanilla JS project with no build step.

1. Fork the repo
2. Clone your fork locally
3. Load the extension in Chrome via Developer Mode (see [Install from Source](#install-from-source-developer-mode))
4. Make your changes — edit `popup.js`, `popup.html`, or `background.js` directly
5. Test on any page with Pendo installed
6. Submit a PR

No npm, no bundler, no build commands. Just edit, reload the extension in `chrome://extensions`, and test.

---

## License

[MIT](LICENSE)
