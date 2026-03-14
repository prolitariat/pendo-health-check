# Changelog

All notable changes to the Pendo Health Check Chrome extension are documented here.

## [2.2.0] — 2026-03-14

### Changed
- **Single-view layout** — removed two-tab layout (Report + Tools). Everything is now in one scrollable panel with no tab switching. Developer Tools are in a collapsible drawer that auto-expands when vertical space allows.
- **Loading transition** — popup now shows "Analyzing Pendo installation…" with a pulsing dot while checks run, then fades in results (200ms ease-in). Eliminates the empty-then-snap-in feel.
- **Background badge management** — badge now clears automatically when you navigate to a new page (no stale data). Updates correctly when switching between tabs. Background service worker caches results per tab.
- **Red vs yellow badge** — red badge for critical failures, yellow for warnings only.
- **Removed onboarding tour** — was adding cognitive load, not reducing it.
- **Removed redundant summary line** — grade card already shows the breakdown.
- **Plain language** — replaced SDK jargon (`window.pendo is present`, `pendo.isReady() returned true`) with plain text (`Pendo is installed on this page`, `Pendo is initialized and running`).
- **Feature Flags narrowed** — only surfaces disabled user-facing features (guides off, analytics off, etc.). Removed debugging mode and SDK config internals that don't help admins.
- **Pass-state noise suppressed** — API Key, Data Host, and Pendo Instances checks only appear when there's a problem.

### Fixed
- **CSP false positives** — `transferSize === 0` for cross-origin resources is timing redaction (security spec), not evidence of CSP blocking. Added `pendo.isReady()` gate: if Pendo is working, don't flag CSP as blocking.
- **CSP strict-dynamic awareness** — when `strict-dynamic` is present in `script-src`, host-based allowlists are irrelevant. Pendo's snippet is typically nonced.
- **CSP Report-Only detection** — `Content-Security-Policy-Report-Only` headers are non-enforcing. Downgrades issues from these to info-level with a `[Report-Only]` prefix.
- **Data Transmission false positive** — same `transferSize === 0` bug in a separate code path. Now checks `pendo.isReady()` first.
- **Pendo Instances false positive** — `script[src*="pendo"]` was matching guide content scripts, debugger scripts, and designer scripts. Now filters to agent-only scripts.
- **CNAME recommendation noise** — was firing on every non-CNAME site. Now gated on actual Pendo functionality and ad blocker detection.
- **Snippet analysis wrong script** — same broad selector was evaluating content/tooling scripts instead of the agent.
- **Dead Pendo support links** — replaced 3 dead article URLs (`21362607043355`, `21397042498571`, `360032207332`) with live replacements.
- **sendMessage error** — silenced "Receiving end does not exist" error when MV3 service worker is asleep during popup load.

### Added
- `tabs` permission for badge clearing on navigation and tab switching.

## [2.1.0] — 2026-03-13

### Changed
- **Trimmed report** — removed 6 checks that added noise without diagnostic value, merged ad blocker detection into Data Transmission.
- **Data Transmission rewrite** — single check that diagnoses blocked requests, ad blockers, and network failures coherently.

## [2.0.0] — 2026-03-12

### Changed
- **Unified Report view** — Health Check and Setup Assistant merged into a single "Report" tab with one prioritized list.
- **Installation Grade** — instant letter grade (A–F) from runtime checks and setup analysis.
- **Two-tab layout** — simplified from three tabs to two (Report, Tools).
- **Icon badge** — shows issue count on the extension icon.
- **Inline Validate results** — output renders in the popup, no DevTools needed.

### Fixed
- **Debugger toggle** — replaced DOM detection with `data-pendo-debug-active` attribute.

## [1.6.0] — 2026-03-12

### Changed
- Copy Issues promoted to Health Check tab.
- Smarter network request messaging.
- Tab layout redesigned.

### Removed
- Easy Mode / Glassmorphism UI.

## [1.5.0] — 2026-03-07

### Added
- QA Test Harness (`test-harness.html`) with 8 preset scenarios.
- First-Run Onboarding Tour (5-step spotlight).
- Copy Button Pulse animation.

## [1.4.0] — 2026-03-07

### Added
- CNAME-aware host detection.
- CMP / GDPR consent detection (6 platforms).
- CORS error detection.
- Priority-sorted clipboard.

## [1.3.4] — 2026-03-06

### Changed
- Complete clipboard remediation rewrite with context-aware fix text.

## [1.3.1 – 1.3.3] — 2026-03-06

### Added
- Full keyboard accessibility (focus-visible, ARIA roles).
- Pendo yellow in dark mode.
- Unified hover states.

## [1.2.0] — 2026-03-05

### Added
- Pendo Service Status (live from status.pendo.io).
- Network Request Validation (Check #10).
- Feature Flag Detection (Check #11).
- Per-directive CSP fix instructions.
- Tools tab with Pendo console commands.
- Feedback system with PII scrubbing.

## [1.1.0] — 2026-03-04

### Added
- Setup Assistant tab (framework detection, snippet analysis, CSP analysis, metadata validation).

## [1.0.0] — 2026-03-03

### Added
- Initial release with 9 health checks, tab-based UI, and copy results.
