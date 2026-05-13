# Pendo Health Check — Chrome Extension

> **Side project, not an official Pendo product.** Built by a Pendo customer admin, not by Pendo. Not affiliated with or endorsed by Pendo. No SLA, no support contract. If something breaks, file a GitHub issue here; please don't file a Pendo support ticket about it.

A Manifest V3 Chrome extension that helps Pendo operators make decisions faster on any page with [Pendo](https://www.pendo.io/) installed. Click the toolbar icon and get two things at once: a **Quick Copy chip grid** of six values an operator actually pastes into a ticket, Slack, or API call (Visitor ID, Account ID, Subscription ID, Session ID, Agent Version, Realm) and an **A–F installation grade** with a score-diff badge showing the delta from your last visit. The full prioritized findings list lives behind a "Why this grade" drawer that stays collapsed by default.

Companion tool to [pendo-io/ai-setup-assistant](https://github.com/pendo-io/ai-setup-assistant). The ai-setup-assistant helps developers **install** Pendo into a codebase; this extension **validates and triages** the running installation from the browser.

Built for Pendo admins, implementation engineers, and customer success folks. Scope includes Pendo-adjacent problems too (consent management, CSP, CNAME, framework integration), and remediation links point to whichever vendor owns the actual fix.

---

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [What It Checks](#what-it-checks)
- [Extension Architecture](#extension-architecture)
- [File Reference](#file-reference)
- [QA Test Harness](#qa-test-harness)
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

1. **Clone the repo**
   ```bash
   git clone https://github.com/prolitariat/pendo-health-check.git
   cd pendo-health-check
   ```
2. **Open Chrome** and navigate to `chrome://extensions`
3. **Enable Developer mode** (toggle in the top-right corner)
4. **Click "Load unpacked"** and select the cloned directory
5. **Pin the extension** in the toolbar for quick access

No build step, no npm install, no bundler. Pure vanilla JS.

To update later, just `git pull` and click the ↻ reload button on the extension card.

---

## Usage

**Pendo Detected** — Navigate to any page with Pendo installed and click the icon. The popup shows your installation grade, all diagnostics sorted by severity, and Developer Tools (auto-expanded when there's room).

**Pendo Not Detected** — On pages without Pendo, the extension shows a "Pendo Not Detected" message with guidance.

**Restricted Pages** — On `chrome://` pages and the Chrome Web Store, the extension shows an error state explaining the restriction.

**Quick Copy chips** — The chip grid below the header surfaces six values an operator actually pastes into a ticket, Slack, or API call: Visitor ID, Account ID, Subscription ID, Session ID, Agent Version, Realm. Chips for values that aren't set on this page render grayed out and uncopyable so missing data is visible, not hidden. Diagnostic state (Framework, Ready, Active Guides count) stays out of the chip grid because it isn't a copy-paste value — it's already covered by the grade pill and the "Why this grade" drawer.

**Score diff** — The grade pill in the header is paired with a score-diff badge (↑ +12 / ↓ −8 / · 0) showing the delta from your last visit to the same hostname + path. Click the badge for a popover with the last five scores. History is stored locally in `chrome.storage.local`; nothing leaves your browser.

**Copy Issues** — One plain-text output. The preamble identifies the tool, version, and source repo, lists the severity ordering, and notes that Pendo doc URLs in the report are verified Help Center articles. That orientation is enough for both a human reader and an LLM you paste the report into. When issues are detected, the copy button pulses to draw attention.

**CMP consent-gating warning** — If a consent manager is on the page and Pendo is initialized with a non-anonymous visitor while the CMP reports analytics consent denied, the extension flags it with a warning. Actionable detection on Cookiebot, Didomi, Osano, and a narrow OneTrust read. Inform-only on TrustArc and TCF v2.0. The check is conservative: any unknown signal suppresses the flag.

**Icon Badge** — After analysis, the extension icon shows a yellow badge (warnings) or red badge (critical failures). The badge clears automatically when you navigate to a new page and updates correctly when switching tabs. Toggle the badge on or off from the footer.

**Send Feedback** — A feedback button at the bottom lets you report issues or suggest features via GitHub Issue or email. All feedback is PII-scrubbed before it leaves the extension.

---

## What It Checks

### Installation Grade (A–F)

Score starts at 100. Each fail/error deducts 10 points, each warning deducts 3, each info/tip deducts 1. Thresholds: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, F < 40.

### Runtime Health Checks

Injected via `runPendoHealthCheck()` into the page's MAIN world:

| Check | What It Inspects |
|-------|-----------------|
| **Pendo Agent Loaded** | `typeof window.pendo !== "undefined"` |
| **Pendo Ready** | `pendo.isReady()` return value |
| **Visitor ID** | `pendo.getVisitorId()` — flags anonymous IDs |
| **Account ID** | `pendo.getAccountId()` |
| **Active Guides** | `pendo.guides` array length |
| **Pendo Instances** | Detects dual init and multiple agent scripts (excludes debugger/designer) |
| **Agent Version** | `pendo.getVersion()` or `pendo.VERSION` |
| **Data Transmission** | Validates analytics data is reaching Pendo servers |
| **Feature Flags** | Surfaces disabled features (guides off, analytics off, etc.) |

Checks that pass without issues (API Key, Data Host, Pendo Instances) are suppressed to reduce noise — they only appear when there's a problem.

### Setup Analysis

Runs in the background after health checks complete. Findings merge into the same view:

- **Framework detection** — React, Angular, Vue, Ember, Svelte, Next.js, Nuxt, jQuery
- **Snippet analysis** — install method, placement, async loading
- **CSP compatibility** — directive-by-directive check with `strict-dynamic` and nonce awareness; Report-Only CSP detection (won't flag non-enforcing policies as errors)
- **CNAME-aware host detection** — custom CDN and data endpoints
- **CMP/GDPR consent detection** — OneTrust, Cookiebot, Didomi, Osano, TrustArc, TCF v2.0
- **Visitor and account metadata validation** — PII detection, data types, field naming
- **Actionable recommendations** with links to Pendo documentation

### Developer Tools

A collapsible drawer that auto-expands when vertical space allows:

- **Toggle Pendo Debugger** — one click, no DevTools needed
- **Validate Install** — runs `pendo.validateInstall()` with inline results
- **Validate Environment** — runs `pendo.validateEnvironment()` with inline results

### Pendo Service Status

Auto-detects realm (US/EU/US1/JP), shows status badge from `status.pendo.io`, highlights active incidents. Included in copied diagnostic reports.

---

## Extension Architecture

```
popup.html (click extension icon)
  ├── Header (icon + page URL)
  ├── Pendo Service Status (live from status.pendo.io)
  ├── Report panel (scrollable)
  │   ├── Loading indicator ("Analyzing Pendo installation...")
  │   ├── Grade card (A–F, score, summary)
  │   ├── Checks list (severity-sorted: fail → warn → info → pass)
  │   └── Developer Tools drawer (auto-expands if room)
  │       ├── Toggle Pendo Debugger
  │       ├── Validate Install
  │       └── Validate Environment
  ├── Copy Issues to Clipboard (pinned below scroll area)
  └── Footer (version, badge toggle, feedback)

background.js (service worker)
  ├── Clears badge on page navigation
  ├── Caches full-analysis results per tab
  ├── Updates badge on tab switch
  └── Syncs badge preference

popup.js injects into target page via chrome.scripting.executeScript:
  ├── runPendoHealthCheck() → MAIN world → reads window.pendo
  └── runPendoSetupAssistant() → MAIN world → reads CSP, DOM, network
```

**Key design decisions:**

- **No content scripts.** Diagnostics are injected on-demand via `chrome.scripting.executeScript` with `world: "MAIN"`. No broad host permissions required.
- **Single-view layout.** All diagnostics in one scrollable panel — no tabs. Developer Tools auto-expand when there's room, collapse when space is tight.
- **Background badge management.** The service worker clears stale badges on navigation and restores the correct badge when switching tabs.
- **Loading → fade-in transition.** Popup shows "Analyzing Pendo installation…" while checks run, then fades in results for a smooth visual load.
- **Zero external dependencies.** Pure vanilla JS with inline CSS. No build step, no npm, no bundler.
- **Minimal permissions.** `activeTab` + `scripting` + `storage` + `tabs`. No host permissions, no content scripts.

---

## File Reference

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 configuration (v2.2.0) |
| `popup.html` | Popup UI — all CSS inline, flex column layout |
| `popup.js` | All UI logic, both injected diagnostic functions, grade computation, badge messaging, Developer Tools, clipboard export |
| `background.js` | Service worker — badge clearing on navigation, per-tab result cache, tab switching |
| `icons/` | Extension icons (16, 48, 128px PNG + 128px SVG) |
| `test-harness.html` | QA regression test page (not included in CWS submission) |
| `STORE_LISTING.txt` | Chrome Web Store listing copy |
| `CHANGELOG.md` | Version history |

---

## QA Test Harness

`test-harness.html` is a self-contained page for regression-testing every extension check without a live Pendo installation.

**Presets:** 8 one-click scenarios — Healthy, Broken, CSP Blocked, GDPR Waiting, CNAME, Ad Blocked, Partial Setup, React SPA.

**Granular controls:** Sidebar toggles for Pendo agent state, identity/metadata, network/hosting, CSP modes, CMP/GDPR platforms, and frameworks.

**How to use:** Open `test-harness.html` in Chrome, select a preset or configure toggles, then click the extension icon to run diagnostics against the mocked state.

**Note:** Not included in Chrome Web Store submissions.

---

## Feedback System

Two submission options, both PII-scrubbed before leaving the extension:

- **GitHub Issue** — pre-filled issue on this repo (requires GitHub account)
- **Email** — `mailto:` link (no account needed)

Scrubbed patterns: emails, phone numbers, SSNs, credit card numbers, IPv4 addresses.

---

## Permissions

| Permission | Why | Scope |
|------------|-----|-------|
| `activeTab` | Access current tab on click | Only the active tab, only on click |
| `scripting` | Inject diagnostic functions | Only the active tab, only on click |
| `storage` | Persist badge preference | Local only, no sync |
| `tabs` | Clear badge on navigation, restore badge on tab switch | Tab URL change events only |

No host permissions, no background network access, no persistent content scripts.

---

## Extending the Extension

### Adding a new Health Check

In `popup.js`, find `runPendoHealthCheck()` and add before the `return` statement:

```javascript
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
"My New Check": {
  warn: "Actionable fix suggestion.\n  Docs: https://support.pendo.io/..."
}
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
3. Load the extension in Chrome via Developer Mode
4. Make your changes — edit `popup.js`, `popup.html`, or `background.js` directly
5. Test on any page with Pendo installed, and use `test-harness.html` for regression testing
6. Submit a PR

---

## License

[MIT](LICENSE)
