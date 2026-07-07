#!/usr/bin/env node
/**
 * Cross-platform burn-in mode launcher.
 *
 * Why this exists: `BURNIN_SECONDS=20 npm run burnin:short` is bash syntax and
 * does NOT work under Windows PowerShell or cmd.exe. This launcher sets the env
 * var inside Node (cross-platform) and then spawns the vitest burn-in suite,
 * forwarding stdio and the exit code. The single source of truth for reading
 * BURNIN_SECONDS stays in burnIn.test.ts.
 *
 * Modes:
 *   smoke  20 s       — fast CI / pre-commit-style check
 *   short  300 s      — ~5 minutes, the documented default
 *   full   28800 s    — 8-hour soak. Do NOT claim "full passed" unless it
 *                       actually ran the full 8 hours.
 *
 * Precedence (first wins):
 *   1. BURNIN_SECONDS env (if already set, respect it — enables ad-hoc overrides
 *      like `$env:BURNIN_SECONDS=60; npm run burnin:short` on PowerShell)
 *   2. numeric argv: `node scripts/burnin.mjs 60`
 *   3. mode argv: `node scripts/burnin.mjs smoke|short|full`
 */
import { spawnSync } from 'node:child_process';

const MODES = {
  smoke: 20,
  short: 300,
  full: 28800,
};

const arg = process.argv[2];

let seconds;
let label;

if (process.env.BURNIN_SECONDS !== undefined && process.env.BURNIN_SECONDS !== '') {
  seconds = Number(process.env.BURNIN_SECONDS);
  label = `custom (BURNIN_SECONDS=${process.env.BURNIN_SECONDS})`;
} else if (/^\d+$/.test(arg ?? '')) {
  seconds = Number(arg);
  label = `custom (${seconds}s)`;
} else if (arg && Object.prototype.hasOwnProperty.call(MODES, arg)) {
  seconds = MODES[arg];
  label = arg;
} else {
  console.error('Usage: node scripts/burnin.mjs <smoke|short|full|seconds>');
  console.error('   or: set BURNIN_SECONDS env, then run any burnin:<mode> script.');
  console.error('Modes: smoke=20s  short=300s (~5min)  full=28800s (8h).');
  process.exit(2);
}

if (!Number.isFinite(seconds) || seconds <= 0) {
  console.error(`Invalid duration: ${seconds}`);
  process.exit(2);
}

// Hand the duration to the test wrapper via the env var it already reads.
process.env.BURNIN_SECONDS = String(seconds);

const targetMin = (seconds / 60).toFixed(seconds % 60 === 0 ? 0 : 1);
const startedAt = new Date().toISOString();
console.log(
  `[burn-in] mode=${label} target=${seconds}s (${targetMin} min) started=${startedAt}\n` +
    `[burn-in] vitest will timeout at ${(seconds + 60)}s as a safety guard.\n`,
);

const result = spawnSync(
  'npx vitest run src/burn-in --config vitest.reliability.config.ts',
  {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  },
);

// Forward vitest's exit code so `npm run burnin:smoke` fails the CI/gate on red.
process.exit(result.status ?? 1);
