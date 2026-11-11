# Chrome Web Store release metadata

Last checked: November 11, 2026. Extension version: **4.6.1**.

## Package

- Extension ID: `clcjdjkhbhigpbcfliedfdielpjfjcmo`.
- Publisher ID: `d2505d7b-95bf-4809-baa0-f344774e23e2`.
- Package: `pendo-health-check-v4.6.1.zip`.
- Uploaded package SHA-256: `5b45ef5e7286250cd644b18af9841ee30ee424845416927f6a8b7b47eaba93e1`.
- The publisher confirmed uploading this package on November 11. The dashboard state has not been independently verified during this documentation update.
- The package's runtime files match version 4.6.1 in this repository. This metadata update does not change or replace that uploaded ZIP.

[Developer Dashboard](https://chrome.google.com/webstore/devconsole/d2505d7b-95bf-4809-baa0-f344774e23e2/clcjdjkhbhigpbcfliedfdielpjfjcmo/edit)

## Listing fields

Use the exact field blocks in [STORE_LISTING.txt](STORE_LISTING.txt).

| Field | Value |
| --- | --- |
| Name from package | Pendo Health Check |
| Summary from package | Side project, not an official Pendo product. Compact dashboard, A-F install grade, Quick Copy IDs, optional auto-check badge. |
| Category | Developer Tools |
| Language | English |
| Homepage | https://github.com/prolitariat/pendo-health-check |
| Support | https://github.com/prolitariat/pendo-health-check/issues |
| Privacy policy | https://github.com/prolitariat/pendo-health-check/blob/main/PRIVACY.md |

The package summary is 125 characters. It is derived from `manifest.json`, so changing it requires a package update. The current detailed description is 2,614 characters after trimming outer whitespace and fits the 16,000-character field.

## Screenshot order

1. `store-screenshots/v4.6.1/01-status.png`: opening actions and actionable findings.
2. `store-screenshots/v4.6.1/02-identifiers.png`: populated identifiers and JSON export.
3. `store-screenshots/v4.6.1/03-tools.png`: badge and optional automatic-check settings.

Each screenshot is 1280 by 800 pixels, opaque RGB PNG. Screenshots use sample data and the extension's actual popup structure and styles. They are illustrations of the product, not diagnostic evidence from a customer's environment. Replace the old v2.2 screenshots when updating the listing.

## Single purpose

Inspect the Pendo agent on a web page, show an installation grade and diagnostic findings, copy available identifiers and reports, and toggle Pendo debugging. Optional automatic checks update the toolbar badge after page loads.

## Permission justifications

| Permission | Justification |
| --- | --- |
| `activeTab` | Inspect the Pendo agent and related setup signals on the page the user invokes the extension on. |
| `scripting` | Execute health/setup diagnostic functions and user-requested Pendo debugger or validation commands in that page's main JavaScript context. |
| `storage` | Save the toolbar-badge and optional automatic-check preferences locally in Chrome. |
| `tabs` | Read the current page URL for diagnostic context, respond to navigation and tab changes to keep badge state current, and open the user-requested GitHub feedback page. |
| Optional host permission `<all_urls>` | Allow an opt-in, smaller Pendo readiness-and-identity probe after website page loads. This access is requested when automatic checks are enabled and removal is requested when disabled. It is not required for the default popup-only workflow. |

## Privacy-practices evidence

Do not reuse a blanket "no data handled" or "nothing leaves the extension" declaration. [PRIVACY.md](PRIVACY.md) describes the current source behavior.

| Data | Current use |
| --- | --- |
| Current URL, page resources, and Pendo metadata | Inspected locally for the requested diagnostics. IDs and metadata can contain personal or organizational identifiers. |
| Extension interactions and check counts | Sent as usage-event payloads to the publisher's Cloudflare Worker. No inspected URL, ID value, page content, cookie, or token is included in those payloads. |
| Copied IDs, JSON, and reports | Written to the user's clipboard. Reports can contain the inspected URL and Pendo validation output. |
| Technical feedback context | Sent to GitHub in the issue-composition URL when the user clicks Send feedback. The issue is not submitted automatically. |
| Badge and automatic-check preferences | Saved locally with `chrome.storage.local`. |

Map this evidence to the dashboard's current category wording, including local handling of website content, current-page activity, potentially identifying Pendo fields, and extension usage activity. The form's certifications and saved selections must be reviewed in the actual dashboard; this document is not evidence they were changed or accepted.

## Submission state

Package upload, listing edits, review submission, and public release are separate steps. The publisher confirmed the package upload. Saved listing fields, privacy selections, and review status still need verification in the authenticated Developer Dashboard. No public release should be inferred from the package upload or this file.

For ordinary publication, keep automatic publishing after review enabled. The release becomes public only after Google's review and publication.
