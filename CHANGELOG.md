# Changelog

All notable changes to the Pendo Health Check Chrome extension are documented here.

## [3.0.0] — 2026-05-13

### Added
- **Quick Copy chip grid.** Six chips, one-click copy: Visitor ID, Account ID, Subscription ID, Session ID, Agent Version, Realm. The values an operator actually pastes into a ticket, Slack, or API call. Diagnostic state (Framework, Ready, Active Guides count) intentionally stays out of the chip grid because it isn't a copy-paste value; it lives in the grade pill and the "Why this grade" drawer. Empty values render grayed out and uncopyable so missing data is visible, not hidden.
- **Subscription ID and Session ID extraction.** Values most often pasted into Pendo support tickets and API calls, surfaced as their own chips. Best-effort across `pendo.getSubscriptionId()` / `pendo._config.subscriptionId` / direct property paths and `pendo.getSessionId()` / `pendo._session.id` / `pendo.sessionId`.
- **Realm chip.** Derives US / EU / US1 / JP / "Custom CNAME" from the detected data host suffix.
- **AI prompt mode for Copy Issues.** Format selector next to the copy button. "AI prompt" wraps the existing report with a triage preamble for Claude / ChatGPT. Preamble explicitly tells the model not to invent URLs. Plain text remains the default. Last-used format persists across popup opens.
- **Score diff with multi-history.** Per-page score history (last 5 entries, keyed by hostname + pathname) persisted to `chrome.storage.local`. A diff badge next to the grade pill shows the delta from the previous visit; clicking opens a popover with recent history.
- **CMP consent-gating check.** Flags Pendo running with a non-anonymous visitor and `pendo.isReady() === true` while the consent manager reports analytics consent denied. Actionable detection on Cookiebot, Didomi, Osano, and a narrow OneTrust read (C0001-only). Inform-only on TrustArc and TCF v2.0. Five-of-five conditions must hold; any unknown signal suppresses the flag. Vendor remediation links are platform-specific (OneTrust, Cookiebot, Didomi, Osano docs) with Pendo's "Data collection and compliance" article as a supplementary link.

### Changed
- **Header grade pill.** The big in-panel grade card moves into a compact A–F pill in the header. The grade-letter colors port over from the existing `.grade-a` / `.grade-b` / etc. classes.
- **Diagnostics drawer.** The prioritized checks list collapses behind a "Why this grade" drawer. Never auto-expands so the default view stays KISS. Re-uses the same chevron pattern as the existing Developer Tools drawer.
- **Honest framing.** Store listing and manifest description now open with "Side project, not an official Pendo product." Disclaims Pendo affiliation/endorsement up front, redirects bug reports to GitHub, and asks users not to file Pendo support tickets for extension issues.
- **Doc-label accuracy.** Six Pendo Help Center IDs in the sources map were audited against Google's index. Five labels updated to match canonical titles. The CMP doc ID `360031867272` ("Configure Pendo with a Cookie Consent Manager") was removed because no public record of it exists. Replaced with the verified `21326554691227` ("Data collection and compliance") for the CMP-related links.

### Notes
- v2.2.0's claim of "CMP/GDPR consent detection across 6 platforms" was vaporware: production code had no CMP read whatsoever (only a help-doc label). v3.0.0 ships actionable detection on 4 platforms and inform-only on 2, and the marketing copy now matches reality.
- The CMP check is intentionally conservative: it errs on the side of saying nothing rather than flagging legitimate patterns (anonymous pre-consent buffering, strictly-necessary classification, opt-out CMP modes whose state we cannot read).

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
