# Pendo Health Check — Chrome Extension

A Manifest V3 Chrome extension that runs real-time diagnostics against the [Pendo](https://www.pendo.io/) analytics agent on any web page. Click the toolbar icon to get instant pass/warn/fail results across 11 health checks, a deep-dive Setup Assistant with framework detection, metadata validation, and actionable recommendations, plus interactive Pendo console tools.

**New in v1.2:** Live Pendo service status monitoring, network request validation, feature flag detection, smart remediation guidance, Tools tab with Pendo console commands, and clear tab delineation.

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

---

## Installation

1. Clone or download this repository
2. Open Chrome → navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the project directory
5. Pin the extension icon in the toolbar for quick access

**From the Chrome Web Store:** [Pendo Health Check](https://chromewebstore.google.com/detail/pendo-health-check/clcjdjkhbhigpbcfliedfdielpjfjcmo)

## Usage

**Pendo Detected** — Navigate to any page with Pendo installed and click the icon. The Health Check tab runs automatically. Switch to Setup Assistant for implementation audit or Tools for interactive Pendo commands.

**Pendo Not Detected** — On pages without Pendo (e.g., `https://example.com`), the extension shows a "Pendo Not Detected" message with guidance.

**Restricted Pages** — On `chrome://` pages, `chrome-extension://` pages, and the Chrome Web Store, the extension shows an error state explaining the restriction.

**Copy Results** — Both tabs include a "Copy Results" / "Copy Report" button that generates a plain-text diagnostic report with smart remediation suggestions for pasting into tickets, Slack, or docs.

**Send Feedback** — A feedback button at the bottom of the popup opens a text prompt. Submitted feedback is PII-scrubbed and stored locally in `chrome.storage.local`.

---

## What's New in v1.2

### Pendo Service Status
The extension now polls the Pendo public status page (`status.pendo.io`) and displays a live service status banner at the top of the popup. Each Pendo component (App, Data Pipeline, Guides, Integrations, etc.) is shown with a colored status dot (green/amber/red/blue). Active incidents are highlighted with a yellow banner. The status is also included in copied reports.

### Network Request Validation (Check #10)
Uses the browser's `performance.getEntriesByType('resource')` API to inspect actual network requests to Pendo domains (`pendo.io`, `pendo-io`, `pendo-static`). Reports pass/warn/fail based on whether Pendo network traffic is detected, which validates that the agent is actively communicating with Pendo servers beyond just being loaded.

### Feature Flag Detection (Check #11)
Inspects `pendo.getOptions()` or `pendo.options` for feature flag configuration (`guidesDisabled`, `disableGuides`, `disablePersistence`, `blockAgentMetadata`, `blockLogAgent`, `cookieDomain`, `htmlApplications`, `htmlAttributes`). Flags any non-default settings that could affect Pendo behavior.

### Tools Tab
A new third tab providing direct access to Pendo's built-in console commands via a 2×2 button grid: Validate Install (`pendo.validateInstall()`), Validate Environment (`pendo.validateEnvironment()`), Enable Debugger (`pendo.enableDebugging()`), and Disable Debugger (`pendo.disableDebugging()`). Each command is injected into the page's MAIN world with status feedback.

### Smart Remediation
The "Copy Results" and "Copy Report" buttons now include a remediation section in the generated text. Each check that returned `warn` or `fail` gets an actionable fix suggestion appended to the report, drawn from a curated `REMEDIATION_MAP` covering all 11 checks. This makes copied reports self-contained troubleshooting guides.

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
│  │  (🩺 + URL) │  │HC|Setup|T│  │   Button    │  │
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
     fetch │    ┌────▼───────────▼────┐   │
  status.  │    │  Target Page (MAIN) │   │
  pendo.io │    │  ┌────────────────┐ │   │
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
│  status.pendo.io     │     background.js       │
│  (Atlassian          │  Service worker —       │
│   Statuspage API)    │  feedback storage       │
└──────────────────────┴────────────────────────┘
```

**Key design decisions:**

- **No content script relay.** Both diagnostic functions are injected directly via `chrome.scripting.executeScript` with `world: "MAIN"`, giving them access to the page's `window.pendo` object without message-passing overhead.
- **Lazy-loaded Setup Assistant.** The Setup Assistant only runs when the user switches to its tab, avoiding unnecessary page injection on every popup open.
- **Live service status.** Fetches from Pendo's public Atlassian Statuspage API (`status.pendo.io/api/v2/summary.json`) on popup open. No authentication required.
- **Zero external dependencies.** Pure vanilla JS with inline CSS. No build step, no npm, no bundler.
- **Minimal permissions.** Only `activeTab` (access current tab on click), `scripting` (inject diagnostic functions), and `storage` (persist feedback).

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
| `permissions` | `["activeTab", "scripting", "storage"]` | Grants access to the current tab, script injection, and local storage |
| `action.default_popup` | `"popup.html"` | The HTML file rendered when the icon is clicked |
| `action.default_icon` | `16/48/128px PNGs` | Toolbar icon at various resolutions |
| `icons` | `16/48/128px PNGs` | Extension management page icons |
| `background.service_worker` | `"background.js"` | Manifest V3 service worker for lifecycle events and feedback storage |

### `popup.html`

The popup UI rendered when the user clicks the extension icon. Contains all CSS inline (no external stylesheet). Key structural elements:

| Element ID | Type | Purpose |
|------------|------|---------|
| `.header` | `div` | Dark blue header bar with 🩺 icon and extension title |
| `#page-url` | `div` | Displays the URL of the active tab being inspected |
| `#pendo-status` | `div` | **NEW v1.2** — Live Pendo service status section with per-component status dots and incident banners |
| `#tab-bar` | `div` | Tab switcher with "Health Check", "Setup Assistant", and "Tools" tabs. Hidden until results load. |
| `#loading` | `div` | Spinner + "Running diagnostics…" shown during initial script injection |
| `#not-detected` | `div` | "Pendo Not Detected" view with 🔍 icon and guidance text |
| `#error-state` | `div` | Error view for restricted pages (chrome://, webstore, etc.) |
| `#panel-health` | `div` | Health Check tab panel — contains `#checks-list` and `#health-summary` |
| `#panel-setup` | `div` | Setup Assistant tab panel — contains `#setup-content` and `#setup-summary` |
| `#panel-tools` | `div` | Tools tab panel — contains 2×2 button grid for Pendo console commands and status feedback |
| `#feedback-bar` | `div` | Footer bar with feedback button |
| `#feedback-modal` | `div` | Modal overlay with textarea, PII warning, submit/cancel buttons |

### `popup.js`

All UI logic, event handling, the two injected diagnostic functions, and Tools tab handlers (~1,482 lines).

**Key sections:**

| Section | Description |
|---------|-------------|
| Constants & Helpers | `STATUS_ICONS`, `showView()`, `showTabs()`, `escapeHtml()` |
| Pendo Service Status | `fetchPendoStatus()` fetches from `status.pendo.io/api/v2/summary.json`, `renderPendoStatus()` renders component status dots and incident banners |
| Tab Switching | Click handlers for Health Check / Setup Assistant tabs with lazy loading |
| Health Check Rendering | `renderChecks()` builds DOM rows with status icons and summary counts |
| Remediation Map | `REMEDIATION_MAP` — curated fix suggestions keyed by check label substring |
| Copy Functionality | `buildPlainTextReport()` and `buildSetupPlainText()` now include remediation tips and service status in generated reports |
| Setup Assistant Rendering | `renderSetup()` — framework, snippet, initialization method/timing, CSP, metadata, recommendations |
| Injected: `runPendoHealthCheck()` | 11 checks run in MAIN world (see table below) |
| Injected: `runPendoSetupAssistant()` | Framework detection, snippet analysis, CSP, metadata validation, recommendations |
| Tools Tab | `runPendoCommand()` helper + 4 button handlers that inject Pendo console commands via MAIN world |
| Feedback IIFE | Modal handling, PII scrubbing, submission via `chrome.runtime.sendMessage` |

### `background.js`

Minimal Manifest V3 service worker. Handles:
- `chrome.runtime.onInstalled` — Logs installation for debugging
- `chrome.runtime.onMessage` — Listens for `"save-feedback"` messages, PII-scrubs, and persists to `chrome.storage.local`

### `icons/`

| File | Size | Used For |
|------|------|----------|
| `icon16.png` | 16×16 | Toolbar icon (small) |
| `icon48.png` | 48×48 | Extensions management page |
| `icon128.png` | 128×128 | Chrome Web Store, install dialog |

---

## Tab Purposes

Each tab has a clearly defined purpose with no overlapping responsibilities:

| Tab | Purpose | Question It Answers |
|-----|---------|-------------------|
| **Health Check** | Runtime state monitoring | *"Is Pendo working right now?"* — checks whether the agent is loaded, ready, communicating, and functioning correctly in the current session |
| **Setup Assistant** | Implementation audit | *"Is Pendo installed correctly?"* — analyzes how the snippet was deployed, what framework it's running in, whether CSP policies are compatible, and whether metadata fields follow best practices |
| **Tools** | Interactive commands | *"Run Pendo diagnostics directly"* — provides one-click access to Pendo's built-in console commands for validation and debugging |

**Why the distinction matters:** Health Check gives you a quick pass/fail dashboard for support tickets and triage. Setup Assistant is the deeper audit you run when onboarding a new app or debugging installation issues. Tools lets you invoke Pendo's own diagnostic utilities without opening the browser console.

---

## Tab 1: Health Check

Runs automatically when the popup opens. Injects `runPendoHealthCheck()` into the page's MAIN world and renders results as a list of pass/warn/fail rows with a summary bar.

**Purpose:** Runtime state monitoring — answers "Is Pendo working right now?" Checks the live state of the Pendo agent in the current browser session. Does not inspect implementation details like snippet placement, framework detection, or CSP policies (those belong in Setup Assistant).

11 checks are run in sequence:

| Check # | Name | What It Inspects |
|---------|------|-----------------|
| 1 | **Pendo Agent Loaded** | `typeof window.pendo !== "undefined"` |
| 2 | **Pendo Ready** | `pendo.isReady()` return value |
| 3 | **Visitor ID** | `pendo.getVisitorId()` — flags anonymous IDs (`VISITOR-*`, `_PENDO_T_*`) |
| 4 | **Account ID** | `pendo.getAccountId()` |
| 5 | **Active Guides** | `pendo.guides` array length |
| 6 | **Pendo Instances** | Detects `window.pendo_` (dual init) and counts `<script src="*pendo*">` tags |
| 7 | **Agent Version** | `pendo.getVersion()` or `pendo.VERSION` |
| 8 | **API Key** | `pendo.get("apiKey")` or `pendo.apiKey` |
| 9 | **Data Host** | `pendo.get("options").dataHost` — flags default CDN vs CNAME |
| 10 | **Network Requests** | `performance.getEntriesByType('resource')` for Pendo domain traffic |
| 11 | **Feature Flags** | `pendo.getOptions()` for non-default agent configuration flags |

If Pendo is not detected at check #1, the function returns early with `pendoDetected: false` and the UI shows the not-detected view.

---

## Tab 2: Setup Assistant

Runs on first click of the "Setup Assistant" tab (lazy-loaded). Injects `runPendoSetupAssistant()` into the page's MAIN world.

**Purpose:** Implementation audit — answers "Is Pendo installed correctly?" Analyzes the technical setup: how the snippet was deployed, what framework it runs on, whether CSP policies will block Pendo, and whether metadata fields follow Pendo best practices. This is the tab for onboarding audits, installation debugging, and implementation reviews.

Renders six analysis sections:

1. **Framework Detection** — Identifies the SPA framework (React, Vue, Angular, etc.) and version
2. **Snippet Analysis** — How the Pendo script is loaded (static agent, inline snippet, npm) and where it's placed
3. **Initialization** — Method used (`pendo.initialize()` / `pendo.identify()`) and timing
4. **Content Security Policy** — Directive-by-directive Pendo compatibility check (script-src, connect-src, style-src, img-src, font-src, frame-src, worker-src)
5. **Metadata Fields** — Visitor and account field validation tables with warnings for sensitive names, invalid characters, nested objects, null values, and oversized strings
6. **Recommendations** — Prioritized, actionable suggestions (errors → warnings → tips)

---

## Tab 3: Tools

**Purpose:** Interactive commands — answers "What does Pendo's own diagnostics say?" Provides one-click access to Pendo's built-in console commands without requiring the user to open browser DevTools.

Available commands:

| Button | Command | What It Does |
|--------|---------|-------------|
| Validate Install | `pendo.validateInstall()` | Runs Pendo's built-in installation validator and opens a results panel |
| Validate Environment | `pendo.validateEnvironment()` | Checks the environment configuration for compatibility issues |
| Enable Debugger | `pendo.enableDebugging()` | Turns on Pendo's verbose debug logging in the browser console |
| Disable Debugger | `pendo.disableDebugging()` | Turns off Pendo debug logging |

Each command is injected via `chrome.scripting.executeScript` in the MAIN world. Status feedback appears below the button grid.

---

## Pendo Service Status

**New in v1.2.** On popup open, the extension fetches the Pendo public status page API at `https://status.pendo.io/api/v2/summary.json`. This displays:

- **Per-component status** — Each Pendo service component (App, Data Pipeline, Guides, Integrations, etc.) shown with a colored status dot: green (operational), amber (degraded/partial outage), red (major outage), or blue (maintenance).
- **Overall status indicator** — A badge in the section header summarizing the overall system state.
- **Active incident banner** — If any unresolved incidents exist, a yellow banner displays the incident name and latest update.
- **Report inclusion** — Service status is appended to copied reports, so support tickets include the system state at time of diagnosis.

The status fetch is fire-and-forget — if it fails (network error, timeout), the section simply stays hidden and health checks proceed normally.

---

## Feedback System

A built-in feedback mechanism lets users submit comments, bug reports, or feature requests directly from the extension popup.

**How it works:**

1. User clicks "Feedback" in the footer bar
2. A modal overlay appears with a textarea
3. User types feedback and clicks "Submit" (or Cmd/Ctrl+Enter)
4. The popup sends the text to `background.js` via `chrome.runtime.sendMessage`
5. `background.js` runs PII scrubbing (regex-based removal of emails, phones, SSNs, credit cards, IPs)
6. The scrubbed entry is appended to `chrome.storage.local`
7. User sees a confirmation message

**PII Patterns Scrubbed:**

| Pattern | Replaced With |
|---------|--------------|
| Email addresses | `[REDACTED_EMAIL]` |
| Phone numbers (US formats) | `[REDACTED_PHONE]` |
| Social Security Numbers | `[REDACTED_SSN]` |
| Credit card numbers (13–19 digits) | `[REDACTED_CC]` |
| IPv4 addresses | `[REDACTED_IP]` |

---

## Permissions

| Permission | Why | Scope |
|------------|-----|-------|
| `activeTab` | Access the URL and DOM of the current tab when the user clicks the extension icon | Only the active tab, only on click |
| `scripting` | Inject `runPendoHealthCheck()` and `runPendoSetupAssistant()` into the page's MAIN world | Only the active tab, only on click |
| `storage` | Persist feedback entries in `chrome.storage.local` | Extension-local only, no sync |

No host permissions, no background network access, no persistent content scripts, no cross-origin requests. The status page fetch uses `fetch()` from the popup context, which does not require additional permissions.

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

Don't forget to add a remediation entry in `REMEDIATION_MAP`:

```javascript
"My New Check": "Actionable fix suggestion for this check."
```

### Adding a new Setup Recommendation

In `popup.js`, find `runPendoSetupAssistant()` and add in the recommendations section:

```javascript
recommend("warning", "My Recommendation Title",
  "Detailed explanation with actionable guidance.");
// severity: "error" | "warning" | "tip"
```

### Adding a new Metadata Validation Rule

In `popup.js`, find `validateFields(obj)` and add inside the field loop:

```javascript
if (someCondition) {
  warnings.push("Description of the issue");
}
```

---

## Changelog

### v1.2.0 (2026-03-05)
- **Added** Pendo service status monitoring via `status.pendo.io` API
- **Added** Network Request Validation check (performance API)
- **Added** Feature Flag Detection check (`pendo.getOptions()`)
- **Added** Tools tab with Pendo console commands (validateInstall, validateEnvironment, enableDebugging, disableDebugging)
- **Added** Smart remediation tips in copied reports (`REMEDIATION_MAP`)
- **Added** Service status included in copied reports
- **Added** Version label in footer bar (auto-syncs from manifest)
- **Refactored** Clear tab delineation — Health Check (runtime state), Setup Assistant (implementation audit), Tools (interactive commands)
- **Removed** Visitor Metadata count and CSP from Health Check (moved exclusively to Setup Assistant where they belong)
- **Updated** Professional icon design (Pendo red with medical cross)
- **Updated** Health Check reduced from 13 to 11 focused runtime checks

### v1.0.1 (2026-03-04)
- Initial Chrome Web Store release
- 11 health checks + Setup Assistant
- Feedback system with PII scrubbing

### v1.0.0 (2026-03-04)
- Initial release

---

## License

MIT
