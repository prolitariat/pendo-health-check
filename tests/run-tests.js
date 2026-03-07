#!/usr/bin/env node
/**
 * Pendo Health Check — Automated QA Test Suite
 *
 * Runs Puppeteer against test-harness.html, triggers each preset,
 * then executes the extension's diagnostic functions (runPendoHealthCheck,
 * runPendoSetupAssistant) directly in the page context and asserts
 * expected results.
 *
 * Usage: node tests/run-tests.js
 * Requires: npm install (puppeteer)
 */

const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

// ─── Config ──────────────────────────────────────────────────────────────────

const HARNESS_PATH = path.resolve(__dirname, "..", "test-harness.html");
const POPUP_JS_PATH = path.resolve(__dirname, "..", "popup.js");
const HARNESS_URL = "file://" + HARNESS_PATH;

// ─── Expected outcomes per preset ────────────────────────────────────────────
// Each preset defines expected health check results.
// Format: { label: expected_status } where status is "pass", "warn", or "fail"
// Omitted labels = don't care (won't assert)

const PRESET_EXPECTATIONS = {
  healthy: {
    description: "All systems nominal — Pendo fully functional",
    healthCheck: {
      "Pendo Agent Loaded": "pass",
      "Pendo Ready": "pass",
      "Visitor ID": "pass",
      "Account ID": "pass",
      "Active Guides": "pass",
      "Agent Version": "pass",
      "API Key": "pass",
    },
    setup: {
      cspIssueCount: 0,
    },
    minPass: 7,
    maxFail: 0,
    maxWarn: 2, // network/feature flags may vary
  },
  broken: {
    description: "Pendo completely absent",
    healthCheck: {
      "Pendo Agent Loaded": "fail",
    },
    minFail: 1,
  },
  "csp-blocked": {
    description: "CSP blocks Pendo scripts",
    healthCheck: {
      "Pendo Agent Loaded": "pass",
      "Pendo Ready": "warn", // ready=false due to CSP
    },
    setup: {
      cspHasIssues: true,
    },
  },
  "gdpr-waiting": {
    description: "CMP present, consent not yet given, EU locale",
    healthCheck: {
      "Pendo Agent Loaded": "pass",
      "Pendo Ready": "warn",
      "Visitor ID": "warn",  // no visitor
    },
    setup: {
      hasCmp: true,
    },
  },
  cname: {
    description: "Custom CNAME for Pendo CDN and data",
    healthCheck: {
      "Pendo Agent Loaded": "pass",
      "Pendo Ready": "pass",
      "Visitor ID": "pass",
      "Account ID": "pass",
    },
    minPass: 6,
    maxFail: 0,
  },
  "ad-blocked": {
    description: "Ad blocker interfering with Pendo",
    healthCheck: {
      "Pendo Agent Loaded": "pass",
      "Pendo Ready": "warn",
    },
  },
  partial: {
    description: "Pendo partially configured — sensitive metadata, no account, sync loading",
    healthCheck: {
      "Pendo Agent Loaded": "pass",
      "Pendo Ready": "pass",
      "Account ID": "warn",
    },
  },
  "react-spa": {
    description: "React SPA with incomplete Pendo setup",
    healthCheck: {
      "Pendo Agent Loaded": "pass",
      "Pendo Ready": "warn",
      "Visitor ID": "warn",
    },
    setup: {
      frameworkDetected: true,
    },
  },
};

// ─── Test runner ──────────────────────────────────────────────────────────────

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, detail) {
  totalTests++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    const msg = `  ✗ ${testName}${detail ? " — " + detail : ""}`;
    console.log(msg);
    failures.push(msg);
  }
}

// Extract a top-level function from popup.js source.
// Handles strings, template literals, regex literals, and comments.
function extractFunction(source, funcName) {
  const startPattern = `function ${funcName}()`;
  const startIdx = source.indexOf(startPattern);
  if (startIdx === -1) throw new Error(`Could not find ${funcName} in popup.js`);

  let depth = 0;
  let i = source.indexOf("{", startIdx);

  while (i < source.length) {
    const ch = source[i];

    // Skip single-line comments
    if (ch === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i === -1) break;
      i++;
      continue;
    }
    // Skip multi-line comments
    if (ch === "/" && source[i + 1] === "*") {
      i = source.indexOf("*/", i + 2);
      if (i === -1) break;
      i += 2;
      continue;
    }
    // Skip double-quoted strings
    if (ch === '"') {
      i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    // Skip single-quoted strings
    if (ch === "'") {
      i++;
      while (i < source.length && source[i] !== "'") {
        if (source[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    // Skip template literals (backtick) with nested ${}
    if (ch === "`") {
      i++;
      let tmplDepth = 0;
      while (i < source.length) {
        if (source[i] === "\\") { i += 2; continue; }
        if (source[i] === "`" && tmplDepth === 0) { i++; break; }
        if (source[i] === "$" && source[i + 1] === "{") { tmplDepth++; i += 2; continue; }
        if (source[i] === "}" && tmplDepth > 0) { tmplDepth--; i++; continue; }
        i++;
      }
      continue;
    }
    // Skip regex literals (heuristic based on preceding token)
    if (ch === "/") {
      const before = source.substring(Math.max(0, i - 20), i).trimEnd();
      const lastChar = before[before.length - 1];
      const regexPrecedes = "=(!&|:;,?[{(+-~*/%<>^";
      if (regexPrecedes.includes(lastChar) || before.endsWith("return") || before.endsWith("typeof") || before.endsWith("in") || before.endsWith("case")) {
        i++;
        while (i < source.length && source[i] !== "/") {
          if (source[i] === "\\") i++;
          if (source[i] === "\n") break;
          i++;
        }
        i++;
        while (i < source.length && /[gimsuy]/.test(source[i])) i++;
        continue;
      }
    }

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.substring(startIdx, i + 1);
    }
    i++;
  }
  throw new Error(`Could not find closing brace for ${funcName}`);
}

async function runPresetTest(page, presetName, expectations) {
  console.log(`\n━━ Preset: ${presetName} ━━`);
  console.log(`   ${expectations.description}`);

  // Load preset: click the button via JS
  await page.evaluate((preset) => {
    // Reset first
    if (typeof resetAll === "function") resetAll();
    // Load the preset
    loadPreset(preset);
  }, presetName);

  // Small wait for mocks to apply
  await new Promise((r) => setTimeout(r, 100));

  // Read popup.js and extract the health check function
  const popupSource = fs.readFileSync(POPUP_JS_PATH, "utf-8");
  const healthCheckFn = extractFunction(popupSource, "runPendoHealthCheck");

  // Run health check in page context
  const healthResults = await page.evaluate((fnSource) => {
    // Define the function in page scope and run it
    const fn = new Function(fnSource + "; return runPendoHealthCheck();");
    return fn();
  }, healthCheckFn);

  // Validate health check results
  if (!healthResults || !Array.isArray(healthResults)) {
    assert(false, "Health check returned results", "Got: " + JSON.stringify(healthResults));
    return;
  }

  assert(healthResults.length > 0, "Health check returned at least 1 check");

  // Count statuses
  const counts = { pass: 0, warn: 0, fail: 0 };
  const byLabel = {};
  healthResults.forEach((c) => {
    counts[c.status] = (counts[c.status] || 0) + 1;
    byLabel[c.label] = c;
  });

  // Assert specific check statuses
  if (expectations.healthCheck) {
    for (const [label, expectedStatus] of Object.entries(expectations.healthCheck)) {
      const check = byLabel[label];
      if (!check) {
        assert(false, `${label} exists in results`, "Not found in health check output");
      } else {
        assert(
          check.status === expectedStatus,
          `${label} = ${expectedStatus}`,
          `Got: ${check.status} ("${check.detail}")`
        );
      }
    }
  }

  // Assert aggregate counts
  if (expectations.minPass !== undefined) {
    assert(counts.pass >= expectations.minPass, `≥${expectations.minPass} passes`, `Got: ${counts.pass}`);
  }
  if (expectations.maxFail !== undefined) {
    assert(counts.fail <= expectations.maxFail, `≤${expectations.maxFail} fails`, `Got: ${counts.fail}`);
  }
  if (expectations.maxWarn !== undefined) {
    assert(counts.warn <= expectations.maxWarn, `≤${expectations.maxWarn} warns`, `Got: ${counts.warn}`);
  }
  if (expectations.minFail !== undefined) {
    assert(counts.fail >= expectations.minFail, `≥${expectations.minFail} fails`, `Got: ${counts.fail}`);
  }

  // Run setup assistant if we have expectations for it
  if (expectations.setup) {
    const setupFn = extractFunction(popupSource, "runPendoSetupAssistant");
    const setupResults = await page.evaluate((fnSource) => {
      const fn = new Function(fnSource + "; return runPendoSetupAssistant();");
      return fn();
    }, setupFn);

    if (setupResults) {
      if (expectations.setup.cspIssueCount !== undefined) {
        const cspCount = (setupResults.csp && setupResults.csp.issues) ? setupResults.csp.issues.length : 0;
        assert(
          cspCount === expectations.setup.cspIssueCount,
          `CSP issues = ${expectations.setup.cspIssueCount}`,
          `Got: ${cspCount}`
        );
      }
      if (expectations.setup.cspHasIssues !== undefined) {
        const hasIssues = setupResults.csp && setupResults.csp.issues && setupResults.csp.issues.length > 0;
        assert(hasIssues === expectations.setup.cspHasIssues, `CSP has issues = ${expectations.setup.cspHasIssues}`);
      }
      if (expectations.setup.hasCmp !== undefined) {
        // CMP detection shows up in recommendations or a cmp section
        const recTexts = (setupResults.recommendations || []).map((r) => r.title.toLowerCase()).join(" ");
        const hasCmpMention = recTexts.includes("consent") || recTexts.includes("cmp") || recTexts.includes("gdpr");
        assert(hasCmpMention === expectations.setup.hasCmp, `CMP detected = ${expectations.setup.hasCmp}`);
      }
      if (expectations.setup.frameworkDetected !== undefined) {
        const fw = setupResults.framework && setupResults.framework.name !== "Unknown";
        assert(fw === expectations.setup.frameworkDetected, `Framework detected = ${expectations.setup.frameworkDetected}`, `Got: ${setupResults.framework?.name}`);
      }
    }
  }

  // Print summary line
  console.log(`   Results: ${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail`);
}

// ─── Clipboard format test ───────────────────────────────────────────────────

async function testClipboardFormat(page) {
  console.log("\n━━ Clipboard Format Tests ━━");

  // Load the "csp-blocked" preset (has SUB_ID references)
  await page.evaluate(() => {
    if (typeof resetAll === "function") resetAll();
    loadPreset("csp-blocked");
  });
  await new Promise((r) => setTimeout(r, 100));

  // We can't test the full buildIssuesReport (needs popup.js UI context),
  // but we can verify the REMEDIATION_MAP doesn't have inline SUB_ID instructions
  const popupSource = fs.readFileSync(POPUP_JS_PATH, "utf-8");

  // Count occurrences of the old inline SUB_ID boilerplate
  const subIdBoilerplate = "→ To find your SUB_ID: log in to app.pendo.io";
  const boilerplateCount = (popupSource.match(new RegExp(subIdBoilerplate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  assert(boilerplateCount === 0, "No inline SUB_ID boilerplate in source", `Found ${boilerplateCount} occurrences`);

  // Verify the footer-based SUB_ID note exists in buildIssuesReport
  const hasFooterNote = popupSource.includes("── Note: YOUR_SUB_ID ──");
  assert(hasFooterNote, "Footer-based SUB_ID note exists in buildIssuesReport");

  // Verify fix text normalization exists
  const hasNormalization = popupSource.includes('.replace(/\\n\\s*/g, "\\n   ")');
  assert(hasNormalization, "Fix text whitespace normalization present");
}

// ─── Source quality checks ───────────────────────────────────────────────────

function testSourceQuality() {
  console.log("\n━━ Source Quality Tests ━━");

  const popupSource = fs.readFileSync(POPUP_JS_PATH, "utf-8");
  const htmlSource = fs.readFileSync(path.resolve(__dirname, "..", "popup.html"), "utf-8");
  const manifestSource = fs.readFileSync(path.resolve(__dirname, "..", "manifest.json"), "utf-8");
  const manifest = JSON.parse(manifestSource);

  // Manifest checks
  assert(manifest.manifest_version === 3, "Manifest V3");
  assert(manifest.permissions.includes("activeTab"), "Has activeTab permission");
  assert(manifest.permissions.includes("scripting"), "Has scripting permission");
  assert(manifest.permissions.includes("storage"), "Has storage permission");
  assert(manifest.permissions.length === 3, "Exactly 3 permissions", `Got: ${manifest.permissions.length}`);

  // HTML structure checks
  assert(htmlSource.includes('role="tablist"'), "ARIA tablist present");
  assert(htmlSource.includes('role="tab"'), "ARIA tab roles present");
  assert(htmlSource.includes('role="tabpanel"'), "ARIA tabpanel present");
  assert(htmlSource.includes("position: fixed"), "Tour uses fixed positioning");
  assert(!htmlSource.includes("tour-tooltip.arrow-left"), "Removed unused arrow-left variant" );

  // JS checks
  assert(popupSource.includes("function runPendoHealthCheck"), "Health check function exists");
  assert(popupSource.includes("function runPendoSetupAssistant"), "Setup assistant function exists");
  assert(popupSource.includes("REMEDIATION_MAP"), "Remediation map exists");
  assert(popupSource.includes("SEVERITY_ORDER"), "Severity ordering exists");
  assert(popupSource.includes("maybeStartTour"), "Tour integration exists");

  // WCAG checks
  assert(htmlSource.includes("focus-visible"), "focus-visible styles present");

  // No console.log left in production code (except intentional debug)
  const consoleLogCount = (popupSource.match(/console\.log\(/g) || []).length;
  assert(consoleLogCount <= 2, "Minimal console.log usage", `Found ${consoleLogCount}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Pendo Health Check — QA Test Suite             ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`Harness: ${HARNESS_URL}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Source quality (no browser needed)
  testSourceQuality();

  // Browser tests
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    // Navigate to test harness
    await page.goto(HARNESS_URL, { waitUntil: "domcontentloaded" });

    // Verify harness loaded
    const title = await page.title();
    assert(title.includes("QA Test Harness"), "Test harness page loaded", `Title: ${title}`);

    // Run all preset tests
    for (const [presetName, expectations] of Object.entries(PRESET_EXPECTATIONS)) {
      await runPresetTest(page, presetName, expectations);
    }

    // Clipboard format tests
    await testClipboardFormat(page);

  } catch (err) {
    console.error("\nFATAL:", err.message);
    failed++;
  } finally {
    if (browser) await browser.close();
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log(`Results: ${passed} passed, ${failed} failed, ${totalTests} total`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(f));
  }

  console.log("══════════════════════════════════════════════════");
  process.exit(failed > 0 ? 1 : 0);
})();
