# Changelog

All notable changes to the Pendo Health Check Chrome extension are documented here.

## [4.3.0] — 2026-05-14

Implements the README v3 "Status tab anatomy" specification literally. Issue chips are one-liners, the Why-this-grade disclosure carries per-issue explanations, identifiers are owned exclusively by the IDs tab.

### Added

- **Unified Issue data model.** `{ id, sev: 'warn'|'err', title, why, fix, docsUrl }` per the handoff README. One array now drives both the issue chips (title only) and the per-issue blocks inside the closed `<details>` disclosure. Sourced from runtime health-check items (mapped via a new `V4_HC_ISSUE_TEMPLATES` table that holds verified short titles plus longer why/fix/docsUrl) and from `runPendoSetupAssistant` recommendations (parsed from the existing `detail\n  FIX: …\n  Docs: …` shape into the same triple). CSP issues are folded in too so the chip count matches what `computeGrade` sees.
- **`.ph-why-item` blocks.** Each issue contributes one block to the `<details>` body: severity icon + title, a "why" paragraph, and a "Fix: …" line with a "Docs →" link. Backtick spans in the templates render as inline `<code>`. No content lives outside the disclosure; nothing is rendered above the Copy button.
- **CSS for `.ph-why-item`, `.ph-why-item-title`, and `.ph-why-item code`** added to `popup.css` verbatim from `popup_reference.html` v3.

### Changed

- **Issue chips render `title` only.** Previously the chip rendered `c.detail` from the runtime check (which often contained the value itself, e.g. `Anonymous visitor: _PENDO_T_…`). Now the chip is a short, sentence-case title (e.g. `No account ID found`, `Multiple Pendo instances detected`) and the explanation lives in the matching `.ph-why-item` block.
- **`renderChecks` is bookkeeping-only.** Previously it populated `#checks-list` with `.ph-check` rows. README v3 specifies that the disclosure shows per-issue blocks, not the full check list. The function still tracks pass/warn/fail counts, stores `window.__lastChecks`, calls `showView` and `showTabs`, computes the preliminary grade, and pulses the copy button — but no longer touches the DOM directly.

### Removed

- **Quick Copy compact table from the Status panel.** README v3 explicitly: "Quick Copy is owned by the IDs tab. The Status tab does not show identifiers." `#quick-copy-status`, the `V4_CHIPS_STATUS` array, and the corresponding call in `v4RenderAllQuickCopy` are all gone.
- **`#checks-list` element.** Replaced by `#why-items` (the per-issue blocks container inside the `<details>` body). `renderChecks` no longer writes to it.
- **Inline FIX / explanation text on issue rows.** All such text was rerouted to the `.ph-why-item` blocks inside the disclosure. Issue rows are one-liners now.

### Notes

- Anonymous visitor IDs continue to be PASS (not warn/fail), per `project_pendo_anonymous_visitors_legitimate.md`. They therefore never enter the Issue[] pipeline and never appear as chips or why-items.
- Existing helpers (`buildIssuesReport`, CMP consent-gating check, `validateInstall` capture, Copy Issues button) consume the legacy `check[]` shape and were not touched. They produce the same plain-text Copy Issues output as before.
- Render order in the analysis flow: HC analysis → first issue render (HC-only) → setup analysis → final issue render (HC + setup). Both passes use the same `v4BuildIssues` → `v4RenderIssuesList` + `v4RenderWhyItems` path; no rendering happens through `renderChecks` anymore.

## [4.2.0] — 2026-05-13

Literal implementation of `design_handoff_pendo_health_check/popup_reference.html` (v2 of the handoff). Markup and CSS copied verbatim from the reference; no creative interpretation.

### Changed

- **Split CSS into `popup.css`.** Previously `popup.html` carried a 900-line inline `<style>` block. The reference handoff is structured with markup and styles as separate concerns, and that's what's shipped. `popup.html` now has a single `<link rel="stylesheet" href="popup.css">`.
- **All classes prefixed `.ph-*`.** Matches popup_reference.html byte-for-byte: `.ph-header`, `.ph-hero`, `.ph-tabs`, `.ph-tab`, `.ph-tab-count`, `.ph-body`, `.ph-panel`, `.ph-url`, `.ph-subhead`, `.ph-section`, `.ph-issues`, `.ph-issue`, `.ph-ok`, `.ph-btn`, `.ph-btn-primary`, `.ph-btn-ghost`, `.ph-actions`, `.ph-why`, `.ph-ids`, `.ph-id`, `.ph-footer`, etc. Old `.chip`, `.tab`, `.tab-panel`, `.hero`, `.issue-row`, etc. are gone.
- **Hero status driven by `data-status` attribute** on `.ph-hero`. A single attribute change cascades through the CSS to color the grade square and tint the hero title; the letter and color can no longer desync the way they could when each was tracked independently.
- **Issues use `data-sev="warn|err|info|tip"` attribute** instead of severity classes. Same pattern — single source of truth per element.
- **ID rows use `data-empty="true"`** instead of an `qc-empty` class. The `Not set` italic + hidden copy icon is driven entirely from the attribute.
- **Tabs use `aria-selected="true"`** for the active state; panels use `aria-hidden="false"`. No more `.is-active` class on tab elements.
- **"Why this grade?" is now a native `<details>` element.** The custom toggle JS, custom chevron rotation, custom `aria-expanded` management — all replaced by the browser's built-in disclosure widget. Accessible by default, zero JS, the chevron animation is pure CSS off the `:open` state.
- **System fonts only.** Removed the Google Fonts `<link>` (Sora / Inter / JetBrains Mono) introduced in v4.0.0. The handoff README v2 calls this out explicitly: Chrome MV3's popup CSP blocks external font loading without explicit `font-src`/`connect-src` overrides, and the system stack looks excellent at popup scale. `--sans` and `--mono` variables now resolve to the platform default.
- **Body scrolls; hero/tabs/footer don't.** `.ph-body` has `max-height: 360px; overflow-y: auto`, so long issue lists scroll inside the panel while the hero and footer stay visible.

### Removed

- **`#pendo-status` Pendo Service Status banner element.** The hero card is the single source of status truth per the handoff README v2: "Single status display — the hero card replaces the old Pendo Service Status / Degraded row. Do not render both." Pendo statuspage.io incidents still flow into the Copy Issues report via `window.__pendoServiceStatus`, but there is no separate visual banner anymore.
- **Custom "Why this grade" toggle JS, chevron-rotation CSS, and aria-expanded plumbing.** Native `<details>` replaces all of it.
- **`copy-pulse` / `sev-*` / `qc-*` / `is-active` (on tabs)** class names — superseded by the `.ph-*` / attribute-driven equivalents.

### Notes

- This release is purely a UI-layer rewrite. Underlying data extraction (`runPendoHealthCheck`, `runPendoSetupAssistant`), the CMP consent-gating check, the Copy Issues report builder with `validateInstall()` output, the optional proactive badge (4.1) and the anonymous-visitor-is-pass fix (4.1.1 → 4.0.0 lineage) are all unchanged.
- `popup_reference.html` from the design handoff was the authoritative source. The README v2 explicitly says: "The markup inside `.popup` and the CSS rules prefixed `.ph-*` are intended to be copied directly into `popup.html` / `popup.css`." That's what was done.

## [4.1.1] — 2026-05-13

### Fixed

- **Auto-check toggle not persisting after permission grant.** The "Auto-check pages on load" toggle would visually flip on, prompt for `<all_urls>` permission, accept the grant, then revert to off on the next popup open. Root cause: Chrome's native permission prompt closes the popup on some platforms (macOS in particular), destroying the JavaScript context before the `chrome.storage.local.set` call inside the `chrome.permissions.request` callback could run. The intent was lost; the permission was granted but the preference saying "use it" was never written. Fix: write the user's intent to storage *immediately* on toggle change, *before* calling `chrome.permissions.request`. If the user denies the prompt, revert in the callback (the deny path keeps the popup open). On the next popup open, the existing reconciliation logic normalizes any saved/granted mismatch.

## [4.1.0] — 2026-05-13

### Added

- **Optional proactive badge.** New "Auto-check pages on load" toggle in the Tools tab. Off by default. When the user flips it on, Chrome's permission prompt asks for `<all_urls>` host permission at runtime via `chrome.permissions.request`. If granted, `background.js` registers a `chrome.tabs.onUpdated` listener that injects a lightweight Pendo probe on every page-load completion and pushes badge counts to the existing badge code. Operators tab-hopping between several Pendo-instrumented apps can now scan their toolbar to see which tabs have Pendo and roughly how many issues without opening the popup.
- **Lightweight probe in `background.js`.** Intentionally narrower than the popup's full `runPendoHealthCheck` — checks Pendo presence, ready state, visitor ID, account ID, and reports a simple criticals/warnings count. The popup's full analysis still updates the badge with higher fidelity when the user opens it; a popup-source result is never overwritten by a subsequent auto-check result on the same tab.

### Changed

- **`manifest.json` declares `"optional_host_permissions": ["<all_urls>"]`.** The default install footprint stays minimal (`activeTab` + `scripting` + `storage` + `tabs`). Broad host access is only granted at runtime, only on user opt-in, and is revoked automatically when the toggle is turned off.

### Notes

- The auto-check toggle's state is reconciled with Chrome's actual permission state on every popup open: if the user revoked the host permission via Chrome's settings, the toggle snaps back to off and the saved preference is normalized.
- `auto-check-pref-changed` is a new message between popup and background; the service worker uses it to start or stop the proactive listener without a service-worker restart.

## [4.0.0] — 2026-05-13

Visual redesign implementing **Direction C — Compact Dashboard** from the design handoff. Same data, same checks, same CMP consent-gating logic. Different shell.

### Fixed

- **Anonymous visitor IDs no longer flagged as a warning.** Pendo's own Help Center documents anonymous visitor tracking (the `_PENDO_T_*` and `VISITOR-*` prefixes) as the intentional pattern for pre-authentication and public-facing pages: see "Anonymous visitors" (article `360032202751`) and "Install Pendo on a login page" (article `360031861672`). The previous `warn` severity wrongly treated a documented Pendo pattern as a problem. Anonymous visitors now resolve to `pass` with a descriptive detail ("Anonymous visitor (pre-auth pattern): …"). Missing visitor ID entirely is still `fail`. The CMP consent-gating check is unaffected — it still inspects the anonymous prefix independently to avoid false-flagging legitimate pre-consent tracking.

### Changed

- **New brand mark.** Red-cross "Health Check" icon (inline SVG) replaces the Pendo-pink mark in the popup header. The Pendo chevron and other trademarked Pendo assets are not used; this is a third-party extension, not an official Pendo product.
- **New typography.** Sora (display), Inter (UI), JetBrains Mono (IDs / URLs / versions) loaded from Google Fonts with `display=swap` so the popup paints immediately on fallback fonts.
- **New color palette.** Pank (`#EB4778`) as the primary action color; ok/warn/err status ramps (50/200/500/700) drive grade square, hero title color, and issue row backgrounds.
- **Hero grade card** replaces the previous header grade pill. 56×56 grade square (color = status-500), uppercase caption "Pendo Service Status," human-readable hero title ("Pendo is healthy" / "is degraded" / "is not running"), and a short sub-line.
- **Segmented tabs.** Status / IDs / Tools as a pill-track control. Status panel hosts the URL chip, issues list, CTAs, and a compact Quick Copy table. IDs panel hosts a full table including Subscription plus a "Copy all as JSON" button. Tools panel hosts Toggle Pendo Debugger and the badge-on/off switch.
- **Severity-colored issue rows.** Active issues render as ok/warn/err-tinted cards with severity icons (`alert-triangle` for warn, `alert-octagon` for fail) instead of a flat list.
- **All-systems-operational block.** Healthy state replaces the issues list with a soft green dashed card, removing the empty-list feel.
- **"Why this grade?" accordion** replaces the always-visible diagnostics drawer. Ghost button under the CTAs; expands inline to show the full check list when the user wants the technical breakdown.
- **Footer.** Pank dot + version + badge state text + "Send feedback" link (no more checkbox; the badge toggle moves to the Tools tab as a real switch).
- **Refresh button** added to the header. Reloads the popup, re-running the diagnostic without closing and reopening.
- **Popup width** bumped to 384px (was 380px) to match the design's spacing rhythm.

### Removed

- **Score diff badge and per-page score history.** Not in the new design. The `chrome.storage.local` history under `score_history::*` is no longer written; existing entries from v3 remain on disk but are unread.
- **Header grade pill.** Replaced by the hero grade square.
- **Pinned debugger bar.** Toggle Pendo Debugger now lives in the Tools tab.
- **Scroll-fade gradient** at the bottom of the report panel. The new content area uses native overflow.

### Notes

- The `_PENDO_T_` placeholder example in the original handoff README was a sample value, not a real visitor ID — visitor IDs that start with `_PENDO_T_` or `VISITOR-` continue to be flagged as anonymous by the existing visitor check (no change to detection logic).
- This release does not migrate the extension to React. The handoff README assumed React + Tailwind as the default, but the existing codebase is vanilla JS with inline CSS in `popup.html`; the design tokens, layout, and structural composition map cleanly to plain CSS variables without a build step. Decided in conversation with the maintainer before implementation.

## [3.0.0] — 2026-05-13

### Added
- **Quick Copy chip grid.** Six chips, one-click copy: Visitor ID, Account ID, Subscription ID, Session ID, Agent Version, Realm. The values an operator actually pastes into a ticket, Slack, or API call. Diagnostic state (Framework, Ready, Active Guides count) intentionally stays out of the chip grid because it isn't a copy-paste value; it lives in the grade pill and the "Why this grade" drawer. Empty values render grayed out and uncopyable so missing data is visible, not hidden.
- **Subscription ID and Session ID extraction.** Values most often pasted into Pendo support tickets and API calls, surfaced as their own chips. Best-effort across `pendo.getSubscriptionId()` / `pendo._config.subscriptionId` / direct property paths and `pendo.getSessionId()` / `pendo._session.id` / `pendo.sessionId`.
- **Realm chip.** Derives US / EU / US1 / JP / "Custom CNAME" from the detected data host suffix.
- **Self-describing Copy Issues output.** One plain-text format, no dropdown. The report's preamble identifies the tool, version, and source repo, lists the severity ordering, and notes that doc URLs at the bottom are verified Pendo Help Center articles. That's enough orientation for both a human reader and an LLM the user pastes the report into. Drops the "AI prompt" format selector that was briefly added; the dropdown was complexity without clear payoff.
- **Score diff with multi-history.** Per-page score history (last 5 entries, keyed by hostname + pathname) persisted to `chrome.storage.local`. A diff badge next to the grade pill shows the delta from the previous visit; clicking opens a popover with recent history.
- **CMP consent-gating check.** Flags Pendo running with a non-anonymous visitor and `pendo.isReady() === true` while the consent manager reports analytics consent denied. Actionable detection on Cookiebot, Didomi, Osano, and a narrow OneTrust read (C0001-only). Inform-only on TrustArc and TCF v2.0. Five-of-five conditions must hold; any unknown signal suppresses the flag. Vendor remediation links are platform-specific (OneTrust, Cookiebot, Didomi, Osano docs) with Pendo's "Data collection and compliance" article as a supplementary link.

### Changed
- **Header grade pill.** The big in-panel grade card moves into a compact A–F pill in the header. The grade-letter colors port over from the existing `.grade-a` / `.grade-b` / etc. classes.
- **Diagnostics drawer.** The prioritized checks list collapses behind a "Why this grade" drawer. Never auto-expands so the default view stays KISS. Re-uses the same chevron pattern as the existing Developer Tools drawer.
- **Honest framing.** Store listing and manifest description now open with "Side project, not an official Pendo product." Disclaims Pendo affiliation/endorsement up front, redirects bug reports to GitHub, and asks users not to file Pendo support tickets for extension issues.
- **Doc-label accuracy.** Six Pendo Help Center IDs in the sources map were audited against Google's index. Five labels updated to match canonical titles. The CMP doc ID `360031867272` ("Configure Pendo with a Cookie Consent Manager") was removed because no public record of it exists. Replaced with the verified `21326554691227` ("Data collection and compliance") for the CMP-related links.

### Changed
- **Toggle Pendo Debugger is now a top-level pinned button.** The Pendo Debugger is used daily by tagging operators, in-app content authors, and Pendo support — not just developers. It does not belong behind a "Developer Tools" drawer. Now sits directly above Copy Issues, same visual treatment, one click.
- **Validate Install and Validate Environment buttons removed.** Their output overlapped heavily with the extension's own Why-this-grade drawer (CSP and Data Transmission checks already cover the validateEnvironment surface). What was valuable about validateInstall (Pendo's own verdict on the install) is now folded into Copy Issues — see below. The "Developer Tools" drawer goes away entirely.
- **Copy Issues now appends Pendo's `validateInstall()` console output.** When you click Copy Issues, the extension runs `pendo.validateInstall()` in the page, captures its console output, and appends it to the report under a clearly-labeled "Pendo's official validateInstall() output" section. The artifact you hand to engineering now contains both the extension's interpretation and Pendo's own verdict in a single paste.

### Fixed
- **Wrong npm package name in remediation text.** The "agent version outdated" recommendation pointed users to `npm update @pendo-io/agent`. The real npm package is `@pendo/agent` (the org is `pendo-io`, but the npm scope is `pendo`). The wrong command would have failed silently; corrected.

### Notes
- v2.2.0's claim of "CMP/GDPR consent detection across 6 platforms" was vaporware: production code had no CMP read whatsoever (only a help-doc label). v3.0.0 ships actionable detection on 4 platforms and inform-only on 2, and the marketing copy now matches reality.
- The CMP check is intentionally conservative: it errs on the side of saying nothing rather than flagging legitimate patterns (anonymous pre-consent buffering, strictly-necessary classification, opt-out CMP modes whose state we cannot read).
- Every Pendo Help Center doc URL in the codebase was audited against Google's index. Every CSP host, agent API name, and remediation snippet was reviewed for fabrication before the v3 release.

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
