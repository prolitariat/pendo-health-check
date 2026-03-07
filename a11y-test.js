#!/usr/bin/env node
/**
 * WCAG 2.1 Contrast Ratio Checker for Pendo Health Check Extension
 * Tests all foreground/background color combinations used in popup.html
 * against AA (4.5:1 normal, 3:1 large) and AAA (7:1 normal, 4.5:1 large) standards.
 */

// ─── Color utilities ────────────────────────────────────────
function hexToRGB(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRGB(hex);
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function gradeContrast(ratio) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'FAIL';
}

// ─── Color tokens ───────────────────────────────────────────
const lightTokens = {
  'pendo-pink':           '#c8385d',
  'pendo-pink-btn':       '#c8385d',
  'pendo-pink-light':     '#fff1f4',
  'pendo-pink-mid':       '#ffe0e8',
  'pendo-highlight':      '#FEF484',
  'pendo-highlight-light':'#fffde6',
  'pendo-dark':           '#000000',
  'background':           '#ffffff',
  'foreground':           '#09090b',
  'card':                 '#ffffff',
  'card-foreground':      '#09090b',
  'muted':                '#f4f4f5',
  'muted-foreground':     '#6c6c75',
  'border':               '#e4e4e7',
  'input':                '#e4e4e7',
  'primary':              '#000000',
  'primary-foreground':   '#fafafa',
  'secondary':            '#f4f4f5',
  'secondary-foreground': '#18181b',
  'accent':               '#c8385d',
  'accent-foreground':    '#ffffff',
  'accent-subtle':        '#fff1f4',
  'destructive':          '#c93939',
  'success':              '#117f39',
  'warning':              '#a55a05',
};

const darkTokens = {
  'pendo-pink':           '#FF4876',
  'pendo-pink-btn':       '#d13b61',
  'pendo-pink-light':     '#2a1019',
  'pendo-pink-mid':       '#3d1525',
  'pendo-highlight-light':'#2a2810',
  'pendo-dark':           '#ffffff',
  'background':           '#09090b',
  'foreground':           '#fafafa',
  'card':                 '#111113',
  'card-foreground':      '#fafafa',
  'muted':                '#1c1c1f',
  'muted-foreground':     '#a1a1aa',
  'border':               '#27272a',
  'input':                '#27272a',
  'primary':              '#fafafa',
  'primary-foreground':   '#09090b',
  'secondary':            '#1c1c1f',
  'secondary-foreground': '#fafafa',
  'accent-subtle':        '#2a1019',
  'accent':               '#FF4876',
  'destructive':          '#f87171',
  'success':              '#22c55e',
  'warning':              '#fbbf24',
};

// ─── Hardcoded color combos found in CSS ────────────────────
// These are every foreground-on-background pair actually used in popup.html
const combos = [
  // === LIGHT MODE ===
  { mode: 'light', context: 'Body text', fg: 'foreground', bg: 'background', size: 'normal' },
  { mode: 'light', context: 'Header text', fg: '#fafafa', bg: '#000000', size: 'normal' },
  { mode: 'light', context: 'Muted text on background', fg: 'muted-foreground', bg: 'background', size: 'normal' },
  { mode: 'light', context: 'Muted text on muted bg', fg: 'muted-foreground', bg: 'muted', size: 'normal' },
  { mode: 'light', context: 'Tab text (active)', fg: 'foreground', bg: 'background', size: 'normal' },
  { mode: 'light', context: 'Tab text (inactive)', fg: 'muted-foreground', bg: 'background', size: 'normal' },
  { mode: 'light', context: 'Pendo pink on background', fg: 'pendo-pink', bg: 'background', size: 'normal' },
  { mode: 'light', context: 'Pendo pink on pink-light', fg: 'pendo-pink', bg: 'pendo-pink-light', size: 'normal' },
  { mode: 'light', context: 'Destructive on background', fg: 'destructive', bg: 'background', size: 'normal' },
  { mode: 'light', context: 'Success on background', fg: 'success', bg: 'background', size: 'normal' },
  { mode: 'light', context: 'Warning on background', fg: 'warning', bg: 'background', size: 'normal' },
  { mode: 'light', context: 'Success on muted', fg: 'success', bg: 'muted', size: 'normal' },
  { mode: 'light', context: 'Warning on muted', fg: 'warning', bg: 'muted', size: 'normal' },
  { mode: 'light', context: 'Destructive on muted', fg: 'destructive', bg: 'muted', size: 'normal' },
  { mode: 'light', context: 'Primary btn (white on pink)', fg: '#ffffff', bg: 'pendo-pink-btn', size: 'normal' },
  { mode: 'light', context: 'Secondary btn (bg on foreground)', fg: 'background', bg: 'foreground', size: 'normal' },
  { mode: 'light', context: 'Feedback textarea text on card', fg: 'foreground', bg: 'card', size: 'normal' },
  // Badge colors (hardcoded in CSS)
  { mode: 'light', context: 'Badge pass: green on green bg', fg: '#15803d', bg: '#dcfce7', size: 'small' },
  { mode: 'light', context: 'Badge warn: amber on yellow bg', fg: '#92600a', bg: 'pendo-highlight-light', size: 'small' },
  { mode: 'light', context: 'Badge fail: red on red bg', fg: '#b91c1c', bg: '#fee2e2', size: 'small' },
  { mode: 'light', context: 'Badge info: blue on blue bg', fg: '#1d4ed8', bg: '#dbeafe', size: 'small' },
  { mode: 'light', context: 'Badge pendo: pink on pink bg', fg: '#c0274e', bg: 'pendo-pink-light', size: 'small' },
  // Highlight box
  { mode: 'light', context: 'Highlight text amber on highlight bg', fg: '#854d0e', bg: 'pendo-highlight-light', size: 'normal' },
  // Muted-foreground on card
  { mode: 'light', context: 'Muted text on card', fg: 'muted-foreground', bg: 'card', size: 'small' },
  { mode: 'light', context: 'Version label (muted on muted)', fg: 'muted-foreground', bg: 'muted', size: 'small' },

  // === DARK MODE ===
  { mode: 'dark', context: 'Body text', fg: 'foreground', bg: 'background', size: 'normal' },
  { mode: 'dark', context: 'Header text', fg: '#fafafa', bg: '#18181b', size: 'normal' },
  { mode: 'dark', context: 'Muted text on background', fg: 'muted-foreground', bg: 'background', size: 'normal' },
  { mode: 'dark', context: 'Muted text on muted bg', fg: 'muted-foreground', bg: 'muted', size: 'normal' },
  { mode: 'dark', context: 'Muted text on card', fg: 'muted-foreground', bg: 'card', size: 'normal' },
  { mode: 'dark', context: 'Tab text (active)', fg: 'foreground', bg: 'background', size: 'normal' },
  { mode: 'dark', context: 'Tab text (inactive)', fg: 'muted-foreground', bg: 'background', size: 'normal' },
  { mode: 'dark', context: 'Pendo pink on background', fg: 'pendo-pink', bg: 'background', size: 'normal' },
  { mode: 'dark', context: 'Pendo pink on pink-light', fg: 'pendo-pink', bg: 'pendo-pink-light', size: 'normal' },
  { mode: 'dark', context: 'Destructive on background', fg: 'destructive', bg: 'background', size: 'normal' },
  { mode: 'dark', context: 'Success on background', fg: 'success', bg: 'background', size: 'normal' },
  { mode: 'dark', context: 'Warning on background', fg: 'warning', bg: 'background', size: 'normal' },
  { mode: 'dark', context: 'Success on muted', fg: 'success', bg: 'muted', size: 'normal' },
  { mode: 'dark', context: 'Warning on muted', fg: 'warning', bg: 'muted', size: 'normal' },
  { mode: 'dark', context: 'Destructive on muted', fg: 'destructive', bg: 'muted', size: 'normal' },
  { mode: 'dark', context: 'Primary btn (white on pink)', fg: '#ffffff', bg: 'pendo-pink-btn', size: 'normal' },
  { mode: 'dark', context: 'Secondary btn (bg on foreground)', fg: 'background', bg: 'foreground', size: 'normal' },
  { mode: 'dark', context: 'Feedback textarea text on card', fg: 'foreground', bg: 'card', size: 'normal' },
  // Badge colors — dark mode overrides with accessible colors
  { mode: 'dark', context: 'Badge pass: green on dark green bg', fg: '#4ade80', bg: '#052e16', size: 'small' },
  { mode: 'dark', context: 'Badge warn: amber on dark yellow bg', fg: '#af8b4c', bg: 'pendo-highlight-light', size: 'small' },
  { mode: 'dark', context: 'Badge fail: red on dark red bg', fg: '#fca5a5', bg: '#450a0a', size: 'small' },
  { mode: 'dark', context: 'Badge info: blue on dark blue bg', fg: '#93c5fd', bg: '#172554', size: 'small' },
  { mode: 'dark', context: 'Badge pendo: pink on dark pink bg', fg: '#d05d7a', bg: 'pendo-pink-light', size: 'small' },
  // Highlight box in dark mode
  { mode: 'dark', context: 'Highlight text amber on highlight bg', fg: '#ae8a60', bg: 'pendo-highlight-light', size: 'normal' },
  // Developer console text
  { mode: 'dark', context: 'Dev console label (muted on muted)', fg: 'muted-foreground', bg: 'muted', size: 'small' },
  // Foreground on card (check results)
  { mode: 'dark', context: 'Check result text on card', fg: 'foreground', bg: 'card', size: 'normal' },
];

// ─── Resolve token to hex ───────────────────────────────────
function resolve(colorRef, mode) {
  if (colorRef.startsWith('#')) return colorRef;
  const tokens = mode === 'dark' ? darkTokens : lightTokens;
  return tokens[colorRef] || colorRef;
}

// ─── Run tests ──────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║         WCAG 2.1 Color Contrast Audit — Pendo Health Check Extension       ║');
console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
console.log('║  AA normal text:  4.5:1    AA large text:  3.0:1                            ║');
console.log('║  AAA normal text: 7.0:1    AAA large text: 4.5:1                            ║');
console.log('║  "small" = <14px bold / <18px = needs 4.5:1 minimum for AA                 ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
console.log('');

const results = { pass: [], warn: [], fail: [] };

for (const combo of combos) {
  const fgHex = resolve(combo.fg, combo.mode);
  const bgHex = resolve(combo.bg, combo.mode);
  const ratio = contrastRatio(fgHex, bgHex);
  const grade = gradeContrast(ratio);

  // Determine required minimum based on text size
  const isLarge = combo.size === 'large';
  const isSmall = combo.size === 'small'; // small text = stricter
  const aaMin = isLarge ? 3.0 : 4.5;
  const aaaMin = isLarge ? 4.5 : 7.0;

  const passesAA = ratio >= aaMin;
  const passesAAA = ratio >= aaaMin;

  const entry = {
    mode: combo.mode.toUpperCase().padEnd(5),
    context: combo.context,
    fg: `${combo.fg} (${fgHex})`,
    bg: `${combo.bg} (${bgHex})`,
    ratio: ratio.toFixed(2),
    grade,
    passesAA,
    passesAAA,
    size: combo.size,
  };

  if (!passesAA) {
    results.fail.push(entry);
  } else if (!passesAAA) {
    results.warn.push(entry);
  } else {
    results.pass.push(entry);
  }
}

// ─── Print results ──────────────────────────────────────────
function printEntry(e, symbol) {
  console.log(`  ${symbol} [${e.mode}] ${e.context}`);
  console.log(`       FG: ${e.fg}`);
  console.log(`       BG: ${e.bg}`);
  console.log(`       Ratio: ${e.ratio}:1  →  ${e.grade}  (text: ${e.size})`);
  console.log('');
}

if (results.fail.length > 0) {
  console.log(`\n❌ FAILURES (below AA ${results.fail.length}):`);
  console.log('─'.repeat(70));
  for (const e of results.fail) printEntry(e, '❌');
}

if (results.warn.length > 0) {
  console.log(`\n⚠️  AA PASS / AAA FAIL (${results.warn.length}):`);
  console.log('─'.repeat(70));
  for (const e of results.warn) printEntry(e, '⚠️');
}

console.log(`\n✅ FULL PASS — AA + AAA (${results.pass.length}):`);
console.log('─'.repeat(70));
for (const e of results.pass) printEntry(e, '✅');

// ─── Summary ────────────────────────────────────────────────
console.log('\n' + '═'.repeat(70));
console.log('SUMMARY');
console.log('═'.repeat(70));
console.log(`  Total combinations tested: ${combos.length}`);
console.log(`  ✅ AAA pass:               ${results.pass.length}`);
console.log(`  ⚠️  AA pass / AAA fail:     ${results.warn.length}`);
console.log(`  ❌ Below AA:               ${results.fail.length}`);
console.log('═'.repeat(70));

if (results.fail.length > 0) {
  console.log('\n🔧 RECOMMENDED FIXES:');
  console.log('─'.repeat(70));
  for (const e of results.fail) {
    console.log(`  • ${e.context} [${e.mode.trim()}]: ${e.ratio}:1 — needs ≥4.5:1`);
    // Suggest direction
    const fgLum = relativeLuminance(resolve(e.fg.split(' ')[0], e.mode.trim().toLowerCase()));
    const bgLum = relativeLuminance(resolve(e.bg.split(' ')[0], e.mode.trim().toLowerCase()));
    if (fgLum > bgLum) {
      console.log(`    → Lighten the foreground or darken the background`);
    } else {
      console.log(`    → Darken the foreground or lighten the background`);
    }
  }
}

process.exit(results.fail.length > 0 ? 1 : 0);
