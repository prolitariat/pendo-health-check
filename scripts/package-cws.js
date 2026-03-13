#!/usr/bin/env node
/**
 * Package the extension for Chrome Web Store submission.
 * Creates a ZIP excluding dev-only files.
 *
 * Usage: node scripts/package-cws.js
 * Output: pendo-health-check-vX.Y.Z.zip in project root
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf-8"));
const version = manifest.version;
const outFile = `pendo-health-check-v${version}.zip`;

// Files and directories to EXCLUDE from CWS submission
const EXCLUDE = [
  "tests/",
  "scripts/",
  ".github/",
  "analytics/",
  "store-screenshots/",
  "node_modules/",
  "test-harness.html",
  "a11y-test.js",
  "CHANGELOG.md",
  "STORE_LISTING.txt",
  "package.json",
  "package-lock.json",
  ".gitignore",
  ".DS_Store",
  "*.bak",
  "*.b64",
  "write_chunk1.py",
  "*.zip",
  ".git/",
];

// Expand directory patterns to match zip's path format (./ prefix)
const excludeFlags = EXCLUDE.flatMap((p) => {
  if (p.endsWith("/")) {
    // Directory: exclude the dir itself and everything inside
    return ["-x", `./${p}*`];
  }
  return ["-x", `./${p}`];
});

console.log(`Packaging Pendo Health Check v${version}...`);
console.log(`Excluding: ${EXCLUDE.join(", ")}\n`);

try {
  // Remove old zip if exists
  const zipPath = path.join(ROOT, outFile);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  // Create zip from project root using spawn for proper argument handling
  const { execFileSync } = require("child_process");
  execFileSync("zip", ["-r", outFile, ".", ...excludeFlags], { cwd: ROOT, stdio: "inherit" });

  // Report
  const stats = fs.statSync(zipPath);
  const sizeKB = (stats.size / 1024).toFixed(1);
  console.log(`\n✓ Created ${outFile} (${sizeKB} KB)`);
  console.log(`  Ready for upload to Chrome Web Store Developer Dashboard`);
} catch (err) {
  console.error("Packaging failed:", err.message);
  process.exit(1);
}
