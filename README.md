# Pendo Health Check — Chrome Extension

A Manifest V3 Chrome extension that runs real-time diagnostics against the [Pendo](https://www.pendo.io/) analytics agent on any web page. Click the toolbar icon to get instant pass/warn/fail results across 11 health checks, plus a deep-dive Setup Assistant with framework detection, metadata validation, and actionable recommendations.

Companion tool to [pendo-io/ai-setup-assistant](https://github.com/pendo-io/ai-setup-assistant) — the ai-setup-assistant helps developers **install** Pendo into a codebase, while this extension **validates** the running installation from the browser.

---

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Extension Architecture](#extension-architecture)
- [File Reference](#file-reference)
- [Tab 1: Health Check](#tab-1-health-check)
- [Tab 2: Setup Assistant](#tab-2-setup-assistant)
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

## Usage

**Pendo Detected** — Navigate to any page with Pendo installed and click the icon. The Health Check tab runs automatically. Switch to the Setup Assistant tab for deeper analysis.

**Pendo Not Detected** — On pages without Pendo (e.g., `https://example.com`), the extension shows a "Pendo Not Detected" message with guidance.

**Restricted Pages** — On `chrome://` pages, `chrome-extension://` pages, and the Chrome Web Store, the extension shows an error state explaining the restriction.

**Copy Results** — Both tabs include a "Copy Results" / "Copy Report" button that generates a plain-text diagnostic report for pasting into tickets, Slack, or docs.

**Send Feedback** — A feedback button at the bottom of the popup opens a text prompt. Submitted feedback is PII-scrubbed and stored locally in `feedback.json` within the extension directory.

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
│  │  (🩺 + URL) │  │ HC | Setup│  │   Button    │  │
│  └─────────────┘  └─────┬─────┘  └─────┬──────┘  │
│                         │               │         │
│  ┌──────────────────────▼─────────────┐ │         │
│  │         popup.js (UI logic)        │ │         │
│  │  ┌──────────┐  ┌───────────────┐   │ │         │
│  │  │renderChk │  │ renderSetup   │   │ │         │
│  │  │ s()      │  │ ()            │   │ │         │
│  │  └────┬─────┘  └──────┬────────┘   │ │         │
│  │       │               │            │ │         │
│  │  chrome.scripting.executeScript     │ │         │
│  │       │ world: "MAIN"│             │ │         │
│  └───────┼───────────────┼────────────┘ │         │
└──────────┼───────────────┼──────────────┼─────────┘
           │               │              │
┌──────────▼───────────────▼──────────┐   │
│         Target Page (MAIN world)     │   │
│  ┌─────────────────────────────┐    │   │
│  │ runPendoHealthCheck()       │    │   │
│  │ → reads window.pendo        │    │   │
│  │ → returns {checks[]}         │    │   │
│  └─────────────────────────────┘    │   │
│  ┌─────────────────────────────┐    │   │
│  │ runPendoSetupAssistant()    │    │   │
│  │ → detects framework         │    │   │
│  │ → analyzes snippet, CSP     │    │   │
│  │ → validates metadata        │    │   │
│  │ → generates recommendations │    │   │
│  └─────────────────────────────┘    │   │
└─────────────────────────────────────┘   │
                                           │
┌─────────────────────────────────────────▼─────┐
│                 background.js                     │
│  Service worker — lifecycle events, feedback    │
│  storage via chrome.runtime messages           │
└────────────────────────────────────────────────┘
                      │
                      ▼
              feedback.json (local)
```

**Key design decisions:**

- **No content script relay.** Both diagnostic functions are injected directly via `chrome.scripting.executeScript` with `world: "MAIN"`, giving them access to the page's `window.pendo` object without message-passing overhead.
- **Lazy-loaded Setup Assistant.** The Setup Assistant only runs when the user switches to its tab, avoiding unnecessary page injection on every popup open.
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
| `version` | `"1.0.0"` | Extension version (semver) |
| `description` | `"Run diagnostics against the Pendo agent on any page"` | Shown on `chrome://extensions` |
| `permissions` | `["activeTab", "scripting"]` | Grants access to the current tab and script injection |
| `action.default_popup` | `"popup.html"` | The HTML file rendered when the icon is clicked |
| `action.default_icon` | `16/48/128px PNGs` | Toolbar icon at various resolutions |
| `icons` | `16/48/128px PNGs` | Extension management page icons |
| `background.service_worker` | `"background.js"` | Manifest V3 service worker for lifecycle events and feedback storage |

### `popup.html`

The popup UI rendered when the user clicks the extension icon. Contains all CSS inline (no external stylesheet). Key structural elements:

| Element ID | Type | Purpose |
|------------|------|---------|
| `.header` | `div` | Dark blue header bar with 🩺 icon, extension title, and current page URL |
| `#page-url` | `div` | Displays the URL of the active tab being inspected |
| `#tab-bar` | `div` | Tab switcher with "Health Check" and "Setup Assistant" tabs. Hidden until results load. |
| `#loading` | `div` | Spinner + "Running diagnostics…" shown during initial script injection |
| `#not-detected` | `div` | "Pendo Not Detected" view with 🔍 icon and guidance text |
| `#error-state` | `div` | Error view for restricted pages (chrome://, webstore, etc.) |
| `#panel-health` | `div` | Health Check tab panel — contains `#checks-list` and `#health-summary` |
| `#checks-list` | `div` | Container for dynamically rendered health check rows |
| `#health-summary` | `div` | Summary bar with pass/warn/fail counts and Copy Results button |
| `#copy-btn` | `button` | Copies health check results as plain text to clipboard |
| `#panel-setup` | `div` | Setup Assistant tab panel — contains `#setup-content` and `#setup-summary` |
| `#setup-loading` | `div` | Spinner shown while Setup Assistant analyzes the page |
| `#setup-content` | `div` | Container for dynamically rendered setup analysis sections |
| `#setup-summary` | `div` | Summary bar with error/warning/tip counts and Copy Report button |
| `#copy-setup-btn` | `button` | Copies setup report as plain text to clipboard |
| `#feedback-bar` | `div` | Footer bar with feedback button |
| `#feedback-modal` | `div` | Modal overlay with textarea, PII warning, submit/cancel buttons |

**CSS Design System:**

- Width: `380px` fixed
- Font: System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial`)
- Base font size: `13px`
- Header background: `#1b2a4a` (dark navy)
- Status colors: Pass `#16a34a` (green), Warn `#d97706` (amber), Fail `#dc2626` (red), Info `#2563eb` (blue)
- Badge variants: `.badge-green`, `.badge-yellow`, `.badge-red`, `.badge-blue`

### `popup.js`

All UI logic, event handling, and the two injected diagnostic functions. Organized into these sections:

**Constants & Helpers (lines 1–18)**

| Symbol | Purpose |
|--------|---------|
| `STATUS_ICONS` | Maps status strings to emoji: `pass→✅`, `warn→⚠️`, `fail→❌`, `info→ℹ️` |
| `showView(id)` | Shows one of the three state views (`loading`, `not-detected`, `error-state`) by setting `display: block` on the target and `display: none` on the others |
| `showTabs()` | Makes the tab bar visible (`display: flex`) |
| `escapeHtml(str)` | Sanitizes strings for safe innerHTML insertion via `textContent` trick |

**Tab Switching (lines 20–36)**

Attaches click handlers to `.tab` elements. Tracks `activeTabId` and `setupLoaded` to ensure the Setup Assistant only runs once (lazy loading). Clicking "Setup" for the first time triggers `runSetup()`.

**Health Check Rendering (lines 38–70)**

| Function | Purpose |
|----------|---------|
| `renderChecks(checks)` | Iterates the checks array from `runPendoHealthCheck()`, builds DOM rows with status icon + label + detail, counts pass/warn/fail, populates the summary bar, hides the loading spinner, and shows tabs |

**Copy Functionality (lines 72–130)**

| Function | Purpose |
|----------|---------|
| `buildPlainTextReport(url, checks)` | Generates a multi-line plain-text health check report with emoji status icons and summary counts |
| `buildSetupPlainText(url, data)` | Generates a multi-line plain-text setup assistant report covering framework, snippet, initialization, CSP, metadata fields, and recommendations |
| Copy button handlers | Use `navigator.clipboard.writeText()` with visual feedback (button turns green, shows "Copied!", reverts after 1.5s) |

**Setup Assistant Rendering (lines 132–280)**

| Function | Purpose |
|----------|---------|
| `renderSetup(data)` | Renders the full setup analysis into `#setup-content`: Framework Detection, Snippet Analysis, Initialization, CSP Analysis, Visitor Metadata table, Account Metadata table, and Recommendations. Uses section headers, detail rows, badge components, and the metadata table. |

**Main Entry Point (lines 282–320)**

On popup open, `chrome.tabs.query` gets the active tab, sets the URL display, checks for restricted pages (redirects to error-state), then calls `chrome.scripting.executeScript` with `runPendoHealthCheck` in MAIN world. Results are either rendered (Pendo detected) or trigger the not-detected view.

**Setup Runner (lines 322–350)**

| Function | Purpose |
|----------|---------|
| `runSetup()` | Called on first Setup tab click. Injects `runPendoSetupAssistant` into the page's MAIN world, renders results or shows an error empty state. |

**Injected Function: `runPendoHealthCheck()` (lines 352–560)**

Runs in the target page's MAIN world. Returns `{ pendoDetected: boolean, checks: Array<{status, label, detail}> }`.

| Check # | Name | What It Inspects |
|---------|------|-----------------|
| 1 | **Pendo Agent Loaded** | `typeof window.pendo !== "undefined"` |
| 2 | **Pendo Ready** | `pendo.isReady()` return value |
| 3 | **Visitor ID** | `pendo.getVisitorId()`, `pendo.get("visitor").id`, `pendo.visitorId` — flags anonymous IDs (`VISITOR-*`, `_PENDO_T_*`) |
| 4 | **Account ID** | `pendo.getAccountId()`, `pendo.get("account").id`, `pendo.accountId` |
| 5 | **Visitor Metadata** | `pendo.metadata.auto.visitor` — counts and lists field names |
| 6 | **Active Guides** | `pendo.guides` array length |
| 7 | **Pendo Instances** | Detects `window.pendo_` (dual init) and counts `<script src="*pendo*">` tags |
| 8 | **Agent Version** | `pendo.getVersion()` or `pendo.VERSION` |
| 9 | **API Key** | `pendo.get("apiKey")` or `pendo.apiKey` |
| 10 | **Data Host** | `pendo.get("options").dataHost`, script tag hostname, or `pendo.HOST` — flags default CDN vs CNAME |
| 11 | **Content Security Policy** | Parses `<meta http-equiv="Content-Security-Policy">` tags, checks `script-src`, `connect-src`, `style-src`, `img-src`, `frame-src` for Pendo domains |

**Injected Function: `runPendoSetupAssistant()` (lines 562–end)**

Runs in the target page's MAIN world. Returns a rich analysis object:

```javascript
{
  framework: { name, version, renderer, mode },
  snippet: { loadMethod, isAsync, placement, scriptCount },
  initialization: { method, timing, hasVisitorId, hasAccountId },
  csp: { detected, source, directives, issues[] },
  visitorFields: [{ key, type, warnings[] }],
  accountFields: [{ key, type, warnings[] }],
  recommendations: [{ severity, title, detail }]
}
```

**Framework Detection** — Checks for React (`window.React`, `__REACT_DEVTOOLS_GLOBAL_HOOK__`), Next.js (`__NEXT_DATA__`), Vue (`window.Vue`, `__VUE__`), Nuxt (`__NUXT__`), Angular (`window.ng`, `[ng-version]`), AngularJS (`window.angular`), Svelte (class selectors), Ember (`window.Ember`), jQuery (`window.jQuery`).

**Snippet Analysis** — Inspects `<script src="*pendo*">` tags for load method (static agent, bundled, inline, npm/dynamic), async attribute, DOM placement, and tag count.

**Initialization Analysis** — Checks `pendo.isReady()`, detects `pendo.initialize()`/`pendo.identify()`, validates visitor ID (non-anonymous) and account ID presence.

**CSP Analysis** — Parses CSP meta tags, extracts directives, checks `script-src`, `connect-src`, `style-src`, `img-src`, `font-src`, `frame-src`, `worker-src` for Pendo CDN domains (`cdn.pendo.io`, `data.pendo.io`, `app.pendo.io`, `*.pendo.io`). Falls back to performance API resource entries to heuristically determine if HTTP-header CSP is blocking anything.

**Metadata Validation** — `validateFields(obj)` inspects each field in `pendo.metadata.auto.visitor` and `pendo.metadata.auto.account`:

| Rule | Flagged As |
|------|-----------|
| Field name matches sensitive pattern (`password`, `token`, `ssn`, `credit_card`, etc.) | "Possibly sensitive field name" |
| Field name has invalid characters (not matching `^[a-zA-Z_][a-zA-Z0-9_]*$`) | Warning |
| String value exceeds 1024 characters | Warning |
| Null/undefined value | Warning |
| Nested object (non-array) | "Nested object — Pendo only supports flat fields" |
| Array value | "Array value — consider converting to comma-separated string" |
| Function value | "Function value — will not be sent to Pendo" |

**Recommendations Engine** — Generates prioritized suggestions:

| Condition | Severity | Recommendation |
|-----------|----------|----------------|
| Missing/anonymous visitor ID | Error | Pass a unique, stable user ID |
| Missing account ID | Warning | Pass account.id for B2B analytics |
| Synchronous script loading | Warning | Add async attribute |
| Multiple script tags | Warning | Ensure only one snippet loads |
| Dual Pendo instance (`window.pendo_`) | Warning | Verify intentional |
| Sensitive metadata fields detected | Error | Review and exclude PII |
| Complex (nested/array) metadata values | Warning | Flatten for Pendo compatibility |
| Framework-specific timing (React/Vue/Angular) | Tip | Hook-specific initialization guidance |
| Payload size > 50KB | Warning | Approaching 64KB limit |
| Agent version < 2.x | Tip | Check for updates |
| CSP errors | Error | Update CSP directives |
| CSP warnings | Warning | Review directive compatibility |
| No metadata at all | Tip | Add fields for richer segmentation |

### `background.js`

Minimal Manifest V3 service worker. Currently handles:

- `chrome.runtime.onInstalled` — Logs installation for debugging
- `chrome.runtime.onMessage` — Listens for `"save-feedback"` messages from the popup, PII-scrubs the text, and appends to `feedback.json` via the extension's local storage

Reserved for future enhancements: badge updates, context menu actions, cross-tab result caching.

### `icons/`

Extension icons at three sizes:

| File | Size | Used For |
|------|------|----------|
| `icon16.png` | 16×16 | Toolbar icon (small) |
| `icon48.png` | 48×48 | Extensions management page |
| `icon128.png` | 128×128 | Chrome Web Store, install dialog |

### `feedback.json`

Auto-created on first feedback submission. Stores PII-scrubbed feedback entries as a JSON array:

```json
[
  {
    "timestamp": "2026-03-04T23:15:00.000Z",
    "url": "https://app.example.com/dashboard",
    "feedback": "[REDACTED_EMAIL] said the health check was helpful but missed checking for guide throttling",
    "extensionVersion": "1.0.0"
  }
]
```

PII patterns automatically scrubbed before storage: email addresses, phone numbers, SSNs, credit card numbers, IP addresses, and US zip+4 codes.

---

## Tab 1: Health Check

Runs automatically when the popup opens. Injects `runPendoHealthCheck()` into the page's MAIN world and renders results as a list of pass/warn/fail rows with a summary bar.

11 checks are run in sequence. If Pendo is not detected at check #1, the function returns early with `pendoDetected: false` and the UI shows the not-detected view.

## Tab 2: Setup Assistant

Runs on first click of the "Setup Assistant" tab (lazy-loaded). Injects `runPendoSetupAssistant()` into the page's MAIN world. Renders six analysis sections:

1. **Framework Detection** — Identifies the SPA framework and version
2. **Snippet Analysis** — How the Pendo script is loaded and placed
3. **Initialization** — Method, timing, and identity parameters
4. **Content Security Policy** — Directive-by-directive Pendo compatibility check
5. **Metadata Fields** — Visitor and account field validation tables
6. **Recommendations** — Prioritized, actionable suggestions (errors → warnings → tips)

---

## Feedback System

A built-in feedback mechanism lets users submit comments, bug reports, or feature requests directly from the extension popup.

**How it works:**

1. User clicks "Send Feedback" in the footer bar
2. A modal overlay appears with a textarea and a note about PII scrubbing
3. User types feedback and clicks "Submit"
4. The popup sends the text to `background.js` via `chrome.runtime.sendMessage`
5. `background.js` runs PII scrubbing (regex-based removal of emails, phones, SSNs, credit cards, IPs)
6. The scrubbed entry is appended to `feedback.json` in `chrome.storage.local`
7. User sees a confirmation message

**PII Patterns Scrubbed:**

| Pattern | Replaced With |
|---------|--------------|
| Email addresses (`user@domain.com`) | `[REDACTED_EMAIL]` |
| Phone numbers (US formats: `(555) 123-4567`, `555-123-4567`, `+1 555 123 4567`) | `[REDACTED_PHONE]` |
| Social Security Numbers (`123-45-6789`) | `[REDACTED_SSN]` |
| Credit card numbers (13–19 digit sequences) | `[REDACTED_CC]` |
| IPv4 addresses (`192.168.1.1`) | `[REDACTED_IP]` |

**Storage:** Feedback is stored in `chrome.storage.local` under the key `"pendoHealthCheckFeedback"` and can be exported by reading that key from the extension's background context.

---

## Permissions

| Permission | Why | Scope |
|------------|-----|-------|
| `activeTab` | Access the URL and DOM of the current tab when the user clicks the extension icon | Only the active tab, only on click |
| `scripting` | Inject `runPendoHealthCheck()` and `runPendoSetupAssistant()` into the page's MAIN world | Only the active tab, only on click |
| `storage` | Persist feedback entries in `chrome.storage.local` | Extension-local only, no sync |

No host permissions, no background network access, no persistent content scripts, no cross-origin requests.

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

## License

MIT
