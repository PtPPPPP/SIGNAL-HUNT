#!/usr/bin/env node
/**
 * Onsite preflight — static release-readiness checks a Node CLI can perform
 * WITHOUT a browser. Run after `npm run build`.
 *
 * What this CAN check (static, file-system level):
 *   - production build (dist/) exists
 *   - brand logo asset present (source + copied into the build)
 *   - no obvious external network dependencies baked into the bundle
 *     (local-first requirement, AGENTS.md §5)
 *   - core routes present in the built bundle
 *   - VITE_ENABLE_DEMO_SEED not enabled for production
 *
 * What this CANNOT check (needs the real browser IndexedDB) — review at
 * /diagnostics, whose 现场自检 panel composes these from live DB state:
 *   - active event exists
 *   - at least one enabled prize with remaining > 0
 *   - inventory sanity (remaining <= total, >= 0) per prize
 *   - no unresolved invalid draw session
 *   - database accessible
 *
 * Exit code: 0 = pass, 1 = at least one HARD check failed. Warnings do not fail.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const distAssets = join(distDir, 'assets');
const publicDir = join(root, 'public');

const LOGO_SRC = join(publicDir, 'brand', 'quantum-design-logo.png');
const LOGO_DIST = join(distDir, 'brand', 'quantum-design-logo.png');

let hardFailures = 0;
const warnings = [];
const passes = [];

const ok = (label) => passes.push(label);
const warn = (label) => warnings.push(label);
const fail = (label) => {
  hardFailures += 1;
  warnings.push(`HARD FAIL: ${label}`);
};

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// Avoid Date in module top-level evaluation order issues; this is a CLI, fine.
const startedAt = new Date().toISOString();
console.log(`\nPREFLIGHT — SIGNAL HUNT v${pkg.version} — ${startedAt}`);
console.log('='.repeat(60));

// 1. production build
if (!existsSync(join(distDir, 'index.html'))) {
  fail('production build missing — run `npm run build` first (no dist/index.html).');
} else {
  ok('production build exists (dist/index.html).');
}

// 2. logo asset (source + copied into build)
if (!existsSync(LOGO_SRC)) {
  fail('brand logo missing at source: public/brand/quantum-design-logo.png');
} else {
  ok('brand logo present at source (public/brand/quantum-design-logo.png).');
}
if (existsSync(join(distDir, 'index.html')) && !existsSync(LOGO_DIST)) {
  warn('logo NOT copied into dist/ — build is stale; rebuild after adding the logo.');
} else if (existsSync(LOGO_DIST)) {
  ok('brand logo copied into build (dist/brand/...).');
}

// Gather built JS once (only if a build exists).
let bundleText = '';
if (existsSync(distAssets)) {
  const assetFiles = readdirSync(distAssets).filter((f) => f.endsWith('.js'));
  bundleText = assetFiles.map((f) => readFileSync(join(distAssets, f), 'utf8')).join('\n');
}

// 3. local-first: no external http(s) URLs baked into the bundle.
if (bundleText) {
  const urlMatches = bundleText.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
  const external = urlMatches.filter(
    (u) => !/^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])/i.test(u),
  );
  const uniq = [...new Set(external)];
  if (uniq.length === 0) {
    ok('no external http(s) URLs found in bundle (offline-friendly).');
  } else {
    warn(
      `bundle contains ${uniq.length} external URL(s) — review for runtime network calls (AGENTS.md §5):`,
    );
    uniq.slice(0, 10).forEach((u) => console.log(`      ${u}`));
    if (uniq.length > 10) console.log(`      ...and ${uniq.length - 10} more`);
  }
}

// 4. core routes present in the bundle.
if (bundleText) {
  const expectedRoutes = ['/display', '/diagnostics', '/admin/dashboard'];
  const missing = expectedRoutes.filter(
    (r) => !bundleText.includes(`"${r}"`) && !bundleText.includes(`'${r}'`),
  );
  if (missing.length === 0) {
    ok(`all ${expectedRoutes.length} core routes present in bundle.`);
  } else {
    warn(
      `route literals not found in main bundle (may be code-split — verify manually): ${missing.join(', ')}`,
    );
  }
}

// 5. demo seed off for production.
const envFiles = ['.env', '.env.production', '.env.local', '.env.production.local'];
let demoSeedFlagged = false;
for (const f of envFiles) {
  const p = join(root, f);
  if (existsSync(p)) {
    const txt = readFileSync(p, 'utf8');
    if (/^\s*VITE_ENABLE_DEMO_SEED\s*=\s*true\s*$/m.test(txt)) {
      warn(`${f} sets VITE_ENABLE_DEMO_SEED=true — must be OFF for production.`);
      demoSeedFlagged = true;
    }
  }
}
if (!demoSeedFlagged) ok('VITE_ENABLE_DEMO_SEED not enabled in env files.');

// Report.
console.log('-'.repeat(60));
for (const p of passes) console.log(`  ✓ ${p}`);
for (const w of warnings) console.log(`  ⚠ ${w}`);

console.log('-'.repeat(60));
console.log('Runtime DB checks (Node cannot read browser IndexedDB) — open /diagnostics:');
console.log('    • active event exists');
console.log('    • ≥1 enabled prize with remaining > 0');
console.log('    • inventory remaining <= total and >= 0 for every prize');
console.log('    • no unresolved invalid draw session');
console.log('    • database accessible');
console.log('');

if (hardFailures > 0) {
  console.log(`PREFLIGHT: FAIL — ${hardFailures} hard failure(s).`);
  process.exit(1);
}
console.log(`PREFLIGHT: PASS — ${passes.length} ok, ${warnings.length} warning(s).`);
process.exit(0);
