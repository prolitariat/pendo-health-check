# Changelog

All notable changes to the Pendo Health Check Chrome extension are documented here.

## [2.0.0] — 2026-03-12

### Changed
- **Unified Report view** — Health Check and Setup Assistant merged into a single "Report" tab. All runtime checks and setup analysis findings appear in one prioritized list. No more switching between tabs to understand your Pendo installation.
- **Installation Grade** — every popup open now shows an instant letter grade (A–F) computed from runtime health checks and setup analysis. Graded on a curve so F means "badly broken" — fail/error = −10, warn = −3, info/tip = −1; thresholds: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, F < 40.
- **Two-tab layout** — simplified from three tabs (Health Check, Setup Assistant, Tools) to two (Report, Tools). The Report tab is the default landing view.
- **Icon badge** — the extension icon now shows a red badge with the count of critical issues, or an orange badge for warnings. Clears automatically when no issues are detected.
- **Inline Validate results** — Validate Install and Validate Environment output now renders inline in the Tools tab instead of requiring DevTools (Cmd+Option+J).
- **Onboarding tour updated** — reduced from 5 steps to 4 steps to match the new two-tab layout.
- **Updated Pendo doc link** — replaced dead `support.pendo.io/hc/en-us/articles/21374706009883` link with working Developer's Guide URL.

### Fixed
- **Debugger toggle only works once** — replaced unreliable DOM element detection with `data-pendo-debug-active` attribute on `document.body` that persists between `executeScript` injections.

## [1.6.0] — 2026-03-12

### Changed
- **Copy Issues promoted to Health Check tab** — the "Copy Issues to Clipboard" button is now pinned at the bottom of the Health Check tab (the first tab you see), rather than buried in the Tools tab. One click copies every problem and fix as plain text.
- **Smarter network request messaging** — when all Pendo requests are blocked (CORS, ad blocker, firewall), the extension shows a single diagnosis instead of repeating every individual failure count.
- **Tab layout redesigned** — tabs reordered: Health Check → Setup Assistant → Tools. The Tools tab is now focused solely on interactive Pendo commands (debugger toggle, validate install, validate environment).
- **Onboarding tour updated** — tour steps reordered to match the new tab layout; Copy Issues step now highlights the Health Check tab button.

### Fixed
- **CI workflow stabilized** — GitHub Actions QA workflow switched to manual-only (`workflow_dispatch`). Puppeteer tests require Chrome with extension sideloading, which standard GH Actions runners don't support.
- **Defensive `renderSetup` guards** — Setup Assistant renderer handles partial or malformed data objects without crashing.
- **Tour arrow positioning** — fixed CSS for tour tooltip arrows.

### Removed
- **Easy Mode / Glassmorphism UI** — experimental feature removed before release. Chrome extension popups are opaque OS-level windows, making `backdrop-filter: blur()` ineffective.

## [1.5.0] — 2026-03-07

### Added
- **QA Test Harness** (`test-harness.html`) — self-hosted HTML page for regression testing every extension check without a live Pendo installation. 8 preset scenarios (Healthy, Broken, CSP Blocked, GDPR Waiting, CNAME, Ad Blocked, Partial Setup, React SPA) with granular sidebar toggles for Pendo agent state, identity/metadata, network/hosting, CSP modes, CMP/GDPR platforms, EU locale, and framework globals.
- **First-Run Onboarding Tour** — 5-step spotlight tour on first install covering each tab and the copy button. Persisted via `chrome.storage.local`. Supports keyboard navigation (arrows, Escape, Enter).
- **Copy Button Pulse** — when the health check detects warnings or failures, the "Copy Issues" button pulses pink (3 cycles) to draw attention.
- `storage` permission added to `manifest.json` for tour state persistence.

## [1.4.0] — 2026-03-07

### Added
- **CNAME-Aware Host Detection** — Setup Assistant recognizes custom CNAME domains for Pendo CDN and data endpoints by inspecting `performance.getEntriesByType` and `pendo._config`.
- **CMP / GDPR Consent Detection** — detects 6 Consent Management Platforms (OneTrust, Cookiebot, Didomi, Osano, TrustArc, TCF v2.0), generic cookie banners, and EU locale. Reports platform, readiness state, and potential Pendo blocking.
- **CORS Error Detection** — inspects resource timing entries for `transferSize === 0` and `responseStatus === 0` (CORS fingerprint). Warns with actionable remediation.
- **Priority-Sorted Clipboard** — clipboard report now sorts issues: critical failures first, then warnings, then passes.

## [1.3.4] — 2026-03-06

### Changed
- **Complete clipboard remediation rewrite.** Every check now includes context-aware remediation text. CSP violations include per-directive fix instructions with auto-detected subscription IDs. Reports structured as plain text suitable for Slack, Jira, or email.

## [1.3.3] — 2026-03-06

### Changed
- Use Pendo yellow (`#FEF484`) in dark mode for warnings and badges.

## [1.3.2] — 2026-03-06

### Changed
- Unified hover states across all interactive elements.

## [1.3.1] — 2026-03-06

### Added
- Full keyboard accessibility: `focus-visible` rings on all interactive elements.
- ARIA `role="tablist"` / `role="tab"` / `role="tabpanel"` attributes.
- Section-level keyboard navigation.
- Centered equal-width tab layout.
- Tab hover states: pink background wash + underline preview on inactive tabs.

## [1.2.0] — 2026-03-05

### Added
- **Pendo Service Status** — live service status badge from `status.pendo.io` with auto-detected realm (US/EU/US1/JP).
- **Network Request Validation** (Check #10) — inspects `performance.getEntriesByType('resource')` for Pendo network traffic.
- **Feature Flag Detection** (Check #11) — inspects `pendo.getOptions()` for non-default settings.
- **Per-Directive CSP Fix Instructions** — maps blocked Pendo domains to specific CSP directives with copy-pasteable fixes. Auto-detects subscription IDs.
- **Tools Tab** — third tab with Pendo console commands: Validate Install, Validate Environment, Enable/Disable Debugger.
- **Smart Remediation** — copied reports include per-check remediation suggestions from curated `REMEDIATION_MAP`.
- **Feedback System** — PII-scrubbed feedback via GitHub Issues or email.

## [1.1.0] — 2026-03-04

### Added
- Setup Assistant tab with framework detection, snippet analysis, initialization audit, CSP analysis, and metadata field validation.
- Copy Report functionality for Setup Assistant.
- Background pre-loading of Setup Assistant results.

## [1.0.0] — 2026-03-03

### Added
- Initial release.
- 9 health checks: Pendo Agent Loaded, Pendo Ready, Visitor ID, Account ID, Active Guides, Pendo Instances, Agent Version, API Key, Data Host.
- Tab-based UI with Health Check tab.
- Copy Results to clipboard.
- Manifest V3 with `activeTab` and `scripting` permissions.

## Post-1.5.0 Patches

### [1.5.0+fix1] — 2026-03-07
- **Health Check single-column layout** — removed 2-column CSS grid that created dead space on odd item counts.
- **Fixed header/tabs with scrollable panels** — restructured from `max-height + overflow-y` on body to flex column layout. Header, tab bar, and footer are pinned; only the active tab panel scrolls.
