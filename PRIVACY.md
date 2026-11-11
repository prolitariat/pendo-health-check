# Pendo Health Check privacy and data handling

Updated November 11, 2026. Applies to extension version 4.6.1.

Pendo Health Check is an independent Chrome extension published by Brandon Noskoviak. It is not an official Pendo product. Contact: noskoviak@gmail.com.

## Page diagnostics

When you open the popup, the extension reads the active page's URL, Pendo agent state, available identifiers and metadata, script elements, resource timing, and configuration signals needed for its checks. It can make a request to that same page to inspect response headers for CSP analysis.

Visitor IDs, account IDs, and metadata can contain personal or organizational information supplied by the inspected application. Diagnostic analysis happens in the browser. The extension's usage-event payload does not include inspected URLs, identifier values, page contents, cookies, or authentication tokens.

Badge and automatic-check preferences are stored in Chrome's local extension storage. The service worker keeps per-tab badge results in memory. Removing the extension removes its local extension storage through Chrome's normal uninstall process.

## Usage analytics

The extension sends best-effort HTTPS usage events to the publisher's Cloudflare Worker at `https://phc-analytics.noskoviak.workers.dev/event`. The events help the publisher understand use of the extension's features and diagnostic outcomes.

The event payload contains the event name and extension version. Depending on the action, it can also include a selected tab name, the name of a copied field, a Pendo-detected flag, and counts of passed, warning, and failed checks. It contains no persistent installation identifier. A copied field's value is not sent with its field name.

The analytics Worker source in this repository stores event names, versions, check counts, the Pendo-detected flag, and a server timestamp in Cloudflare D1. Its schema also supports a realm field, which the current extension event call sites do not populate. The source has no automatic deletion job or fixed event-retention period. Network providers may process standard connection details, including an IP address, while serving requests; this document makes no claim that infrastructure logs are disabled.

Version 4.6.1 has no analytics opt-out setting. Turning off the toolbar badge or automatic checks does not disable popup usage events. For data-handling questions, contact noskoviak@gmail.com. Usage events do not include an identifier that lets the publisher reliably associate an event with a particular person.

## Clipboard and reports

Copy actions write to your system clipboard. Individual ID copies and JSON export can contain the displayed identifiers. A diagnostic report can contain the inspected page URL, diagnostic details, and output from `pendo.validateInstall()`.

The extension does not automatically submit copied reports to Pendo, GitHub, or another recipient. Review the report before pasting it into a ticket, message, or AI service. Reports are not automatically scrubbed for personal information.

## External services and feedback

The extension requests `https://status.pendo.io/api/v2/summary.json` for public service-status context in copied reports.

Selecting **Send feedback** opens a GitHub issue composition page. Its URL contains extension version, Pendo agent version, realm, local grade/status, issue count and severities, and browser user agent. The generated context excludes inspected page URLs and visitor/account IDs. Opening the page sends that context to GitHub; the extension does not submit the issue. Review any text you add before posting it publicly.

Cloudflare, Pendo's public status service, and GitHub handle requests under their own policies. The Pendo agent already installed by the website has its own data collection behavior, which this extension does not replace.

## Optional website access

Automatic checks are off by default. Enabling them asks Chrome for optional access to websites using `<all_urls>`. With permission granted, a smaller probe checks agent readiness and available IDs after page loads to update the badge. Disabling the setting requests removal of that optional access.

You can change extension permissions, disable it, or remove it through Chrome. Chrome may prevent inspection of internal or otherwise restricted pages.

## Source

The relevant implementation is available in [popup.js](popup.js), [background.js](background.js), and [analytics/worker.js](analytics/worker.js). Changes to data handling should be reflected here and in the Chrome Web Store disclosures before a future release.
