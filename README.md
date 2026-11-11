# Pendo Health Check

A Chrome extension for inspecting the Pendo agent on the current web page. It brings an installation grade, available identifiers, debugger toggle, and diagnostic report into one popup.

**Independent side project built by a Pendo user. It is not an official Pendo product and is not affiliated with or endorsed by Pendo.** Report extension issues here rather than opening a Pendo support ticket.

[Chrome Web Store](https://chromewebstore.google.com/detail/pendo-health-check/clcjdjkhbhigpbcfliedfdielpjfjcmo) | [Report an issue](https://github.com/prolitariat/pendo-health-check/issues) | [Privacy](PRIVACY.md) | [Changelog](CHANGELOG.md)

## Current version: 4.6.1

The opening **Status** view contains the grade, available Visitor ID and Account ID copy rows, and **Toggle Pendo Debugger**. **Copy Issues to Clipboard** appears above the findings when actionable warnings or errors exist.

The **IDs** tab shows available Visitor, Account, Subscription, Session, Agent, and Realm values. Unset rows are hidden. **Copy all as JSON** keeps the full set of identifier fields, including null values.

The **Tools** tab contains the badge and optional automatic-check settings. The footer contains the version and **Send feedback**.

## Install and test

Install the published version from the [Chrome Web Store](https://chromewebstore.google.com/detail/pendo-health-check/clcjdjkhbhigpbcfliedfdielpjfjcmo). A store update becomes available after Google's review and publication; a package upload alone does not update installed copies.

To test the source:

1. Clone this repository, or extract the release ZIP into a folder.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Disable older copies of Pendo Health Check while testing, and pin the test copy.
5. Confirm the extension card and popup both show **4.6.1**.
6. Open a page with Pendo installed, such as `https://help.splunk.com/`, and open the extension.

After replacing files, click **Reload** on the extension card and reopen the popup. The extension itself has no build step or runtime npm dependencies.

## What each view does

| View | Available actions |
| --- | --- |
| Status | Review the grade and findings; copy available Visitor/Account IDs; toggle Pendo's debugger; copy actionable findings; open **Why this grade?** for details. |
| IDs | Copy populated identifiers individually or export all identifier fields as JSON. |
| Tools | Toggle the issue-count badge and opt in to a smaller automatic check after page loads. |

On pages without Pendo, the popup displays **Pendo Not Detected**. Chrome's internal pages and other restricted pages cannot be inspected.

### Validation commands

Opening the popup runs this extension's `runPendoHealthCheck()` and `runPendoSetupAssistant()` functions in the page's main JavaScript context. The grade uses those checks.

Clicking **Copy Issues to Clipboard** also calls `pendo.validateInstall()` when that method is available. Its synchronous `console.log` and `console.warn` output is appended to the report. The extension does not call `pendo.validateEnvironment()` and does not include standalone validation buttons.

The debugger action calls Pendo's `enableDebugging()` or `disableDebugging()` methods. It does not install or initialize the Pendo agent.

## Checks and limits

| Area | Signals inspected |
| --- | --- |
| Agent and identity | Agent presence, readiness, version, Visitor ID, Account ID, and duplicate agent scripts or objects. |
| Hosting and network | Pendo-related resource timing, readiness, configured hosts, and custom-domain/CNAME clues. |
| Configuration | Disabled-feature flags and available visitor/account metadata, including naming, types, and potentially sensitive field names. |
| Setup | Framework clues, snippet placement/loading, CSP headers or meta tags, and supported consent-manager signals. |

Network checks are diagnostic clues. They do not prove that Pendo accepted an event or stored it on the server. Consent findings prompt an implementation review; they are not a legal compliance determination. Some private agent properties and consent-manager APIs vary across versions and deployments.

Anonymous prefixes such as `_PENDO_T_` and `VISITOR-` are recognized. Some identifier findings are grouped into an informational note for anonymous contexts. Raw missing-ID checks can still affect the grade, so a public or anonymous page is not guaranteed a green status.

### Grade and color

The score starts at 100. Each failed/error check deducts 10 points and each warning deducts 3. Informational notes and tips do not deduct points. Scores are limited to 0 through 100.

| Grade | Score |
| --- | --- |
| A | 90 or higher |
| B | 75 through 89 |
| C | 60 through 74 |
| D | 40 through 59 |
| F | Below 40 |

The hero color and status text follow issue severity as well as the grade. A grade of A can appear orange when a warning exists. A critical finding produces the red state. These are the extension's local rules, not Pendo's official validation verdict or a live availability check.

The extension fetches Pendo's public status summary for context in copied reports. Vendor incidents do not determine the grade.

## Optional automatic checks

**Auto-check pages on load** is off by default. Turning it on requests the optional `<all_urls>` permission. With access granted, the background service worker runs a smaller readiness-and-identity probe after page loads to update the badge. Opening the popup runs the fuller analysis.

Turning automatic checks off requests removal of that optional access. Chrome restrictions and permission choices can prevent inspection of a page.

## Privacy and data handling

Diagnostic analysis runs in the browser. Badge and auto-check preferences are stored in `chrome.storage.local`; per-tab badge results are held by the service worker.

The extension also sends usage events to the publisher's Cloudflare Worker. These contain event names and extension version, with basic context such as the selected tab, copied field name, Pendo-detected flag, or check counts. The usage-event payload does not include inspected page URLs, copied ID values, page contents, cookies, or authentication tokens. This version has no analytics opt-out control.

**Copy Issues** and JSON export write to your clipboard. A report can contain the inspected URL, diagnostic details, and values printed by Pendo's validator. Review it before sharing.

**Send feedback** opens a GitHub issue composition page containing extension and agent versions, realm, grade/status, issue severity counts, and browser user agent. It does not send page URLs or visitor/account IDs in that context and does not submit the issue for you. Text you add on GitHub is your responsibility to review.

See [PRIVACY.md](PRIVACY.md) for the data inventory and external services. The analytics Worker source is in `analytics/`; that directory is not included in the extension package.

## Permissions

| Permission | Use |
| --- | --- |
| `activeTab` | Inspect the active page after you invoke the extension. |
| `scripting` | Run the health/setup checks and requested Pendo commands in the page. |
| `storage` | Save badge and automatic-check preferences locally. |
| `tabs` | Read the current URL, respond to navigation/tab changes for badge state, and open the feedback page. |
| Optional `<all_urls>` | Run the smaller automatic probe after page loads when the user opts in. |

## Development and packaging

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 configuration and version. |
| `popup.html`, `popup.css` | Popup structure and styles. |
| `popup.js` | UI, diagnostic extraction, scoring, Pendo command handlers, clipboard export, and usage events. |
| `background.js` | Badge handling and opt-in automatic checks. |
| `icons/` | Packaged extension icons. |
| `test-harness.html`, `tests/` | Development fixtures and legacy diagnostic test tooling. |
| `scripts/package-cws.js` | Create a versioned extension ZIP. |
| `STORE_LISTING.txt`, `CHROMEWEBSTORE.md` | Store copy, metadata, permissions, and release notes. |
| `store-screenshots/v4.6.1/` | Current store screenshots rendered from the popup with sample data. |

With Node.js installed, run `npm run package` to build `pendo-health-check-v4.6.1.zip`. The packaging script excludes development files and old ZIPs.

`test-harness.html` provides eight Pendo/CSP/consent/framework scenarios. The legacy Puppeteer suite needs its expectations updated to match the current diagnostic return shape; it is not evidence that this release passed a full browser regression suite. Targeted identifier-rendering checks cover empty rows, falsey values, rerenders, and copying.

When adding checks, keep `v4BuildIssues()` explanations, scoring, and the report output consistent. Test on a live Pendo page and representative fixtures, and inspect the actual popup before release.

## License

[MIT](LICENSE)
