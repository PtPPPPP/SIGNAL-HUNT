# Reliability & Release Engineering

Single source of truth for how SIGNAL HUNT is verified before a trade show.
Covers verification commands, the current reliability baseline, what the stress
and burn-in suites actually prove, the release-readiness matrix, and the
Windows/PowerShell gotchas that have bitten us before.

This is a local-first offline kiosk (AGENTS.md §5). There is **no Electron**
and **no CI**; every gate below is a local npm script. "It builds" is not the
same as "it is verified for the floor" — see the matrix.

---

## 1. Verification commands

| Command | What it runs | When | Approx. time |
| --- | --- | --- | --- |
| `npm run verify:quick` | lint → typecheck → unit tests → production build | every dev iteration | ~30–60 s |
| `npm run verify:release` | verify:quick **+ stress suite** | before tagging a release | ~1–2 min |
| `npm run verify:onsite` | verify:release **+ burn-in short (5 min) + preflight** | before doors open, on the show machine | ~6–7 min |
| `npm run preflight` | static release checks (build, logo, offline, routes) | after `npm run build` | <1 s |
| `npm run burnin:smoke` | 20 s burn-in | quick CI-style soak | ~20 s |
| `npm run burnin:short` | 5 min burn-in (default) | release | ~5 min |
| `npm run burnin:full` | 8 h burn-in | pre-show soak; **do not claim "full passed" unless it actually ran 8 h** | 8 h |

The 5-minute burn-in is deliberately kept out of `verify:quick` and `verify:release`
so a fast check stays fast. It only enters `verify:onsite`.

### Note on `verify:*` and the StaffPage test

`verify:quick` / `verify:release` / `verify:onsite` all run the **full** unit
suite, including `src/pages/staff/StaffPage.test.tsx`. During Phase 10B that test
was red (a duplicate-redemption UI race, fixed by a parallel work stream). With
that fix present in the working tree the suite is fully green (128/0, see §2).
The gate is deliberately strict: if any unit test is red, `verify:*` fails at the
test step and we do **not** skip the failing test to manufacture a green gate.

---

## 2. Current reliability baseline

| Suite | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc -b` |
| `npm run lint` | PASS | eslint flat config |
| `npm test` (unit) | **128 PASS / 0 FAIL** | fully green with the StaffPage fix in the working tree (was 108/1 during Phase 10B before the fix landed) |
| `npm run test:stress` | 5 PASS | adversarial repo-level tests, see §4 |
| `npm run burnin:smoke` (20 s) | PASS | 2074 draws / 0 errors / `passed=true` / throughput 103.6 draws/s |
| `npm run build` | PASS | production build |
| Playwright / E2E | **NONE** | no e2e harness exists (AGENTS §29 wants one); see matrix |

---

## 3. Test architecture

- **Runner**: Vitest, `environment: 'jsdom'`, `globals: true`. `vitest.setup.ts`
  stubs `HTMLCanvasElement.getContext` to `null` so canvas code is exercised
  against the "no context" path.
- **Two configs**:
  - `vite.config.ts` → base suite; **excludes** `src/stress` and `src/burn-in` so
    `npm test` stays fast and deterministic.
  - `vitest.reliability.config.ts` → **includes only** stress + burn-in, invoked
    explicitly by `npm run test:stress` and the burn-in scripts.
- **IndexedDB**: each reliability test imports `fake-indexeddb/auto` and creates
  a fresh Dexie DB per test (`crypto.randomUUID()` name), deleted in `afterEach`.
  This exercises the **real** `drawRepository` commit/recovery path against a
  faithful IndexedDB shim — not a mocked result.

---

## 4. Stress coverage — what the 5 tests actually prove

`src/stress/drawStress.test.ts`, run via `npm run test:stress`. Each test seeds a
real Dexie DB and drives `commitPersistentDraw` / `recoverCommittedDraw`.

| # | Test (it-title) | Category | What it asserts |
| --- | --- | --- | --- |
| 1 | runs 500 sequential draw cycles with no duplicate active draw, no negative inventory, exact record count | **500 draws** · **duplicate active session** | 500 cycles; a second commit before `clearActiveDrawSession` is refused with `ACTIVE_DRAW_EXISTS`; inventory 100000 → 99500; `drawRecords.count() === 500`; no leftover `COMMITTED` sessions. |
| 2 | survives 10 concurrent taps producing exactly one draw | **rapid tap** · **concurrent commit** | 10 simultaneous `commitPersistentDraw` → exactly **1 fulfilled, 9 rejected** (`ACTIVE_DRAW_EXISTS`); inventory decremented exactly once; 1 record. |
| 3 | refresh recovery: a committed draw is recoverable from any post-commit phase without redrawing | **recovery** | `recoverCommittedDraw` returns the **same** record id + session id from `SCANNING` / `SEARCHING` / `RESULT`; a re-commit while active is refused; `drawRecords.count() === 1`. |
| 4 | offline: draws commit and recover with `navigator.onLine === false` | **offline** | Forces `navigator.onLine = false`; commit + recover succeed with no network dependency. |
| 5 | exhausts inventory cleanly | **inventory exhaustion** | Single prize `remaining = 1`; first draw succeeds, second rejected `/No active prize/`; remaining hits 0 (never negative); 1 record preserved. |

So the categories the project cares about map as: rapid tap → #2, concurrent
commit → #2 (+ #1 per-cycle), inventory exhaustion → #5, recovery → #3,
500 draws → #1, duplicate active session → #1 + #2, offline → #4.

---

## 5. Burn-in

`src/burn-in/burnInRunner.ts` + `src/burn-in/burnIn.test.ts`, launched cross-platform
by `scripts/burnin.mjs` (which sets `BURNIN_SECONDS` inside Node — bash-style
`BURNIN_SECONDS=20 npm run ...` does **not** work under PowerShell/cmd).

### Modes

| Mode | Duration | Command |
| --- | --- | --- |
| smoke | 20 s | `npm run burnin:smoke` |
| short | 5 min (default) | `npm run burnin:short` |
| full | 8 h | `npm run burnin:full` |
| custom | any | `$env:BURNIN_SECONDS=60; npm run burnin:short` (PowerShell) · `node scripts/burnin.mjs 60` |

### What it does

Repeatedly commits a real draw and clears the session for the requested
duration against the real repository (no mocks beyond the IndexedDB shim). Each
cycle must decrement exactly one inventory unit and create exactly one record.
This is a **domain + persistence** burn-in, not a visual/Canvas burn-in (that
needs a real browser kiosk and is a manual step).

### Invariants enforced (failure → non-zero exit)

The runner computes a self-describing verdict. `report.passed === true` requires
ALL of:

- `errorCount === 0` (any thrown error — including a duplicate `ACTIVE_DRAW_EXISTS`
  or transient DB error — fails the run)
- `stoppedReason === 'duration'` (ran the full target, not stopped by cap/exhaustion)
- `recordCount === drawCount` (every draw produced exactly one durable record)
- `inventoryDecrement === drawCount` (every draw reserved exactly one unit)
- no negative inventory — aggregate OR per-prize
- ran ≥ 90% of the requested duration

### Report fields (printed as `[burn-in FINAL]` JSON)

`startedAt` · `endedAt` · `durationTargetSeconds` · `durationActualSeconds` ·
`cycles` · `draws` · `success` · `errors` · `errorSamples` · `stoppedReason` ·
`records` · `inventoryDecrement` · `remainingInventorySum` ·
`throughputDrawsPerSec` · `heapDelta` · `passed` · `violations` · `config`.

If `passed` is false, read `violations` for the precise cause.

---

## 6. Preflight — split between CLI (static) and /diagnostics (runtime)

A Node CLI cannot read the browser's IndexedDB, so preflight is intentionally
split. Neither half fakes what it cannot do.

### `npm run preflight` (`scripts/preflight.mjs`) — static checks

- production build exists (`dist/index.html`) — HARD FAIL if missing
- brand logo present at source **and** copied into `dist/` — HARD FAIL if missing at source
- no external `http(s)` URLs baked into the bundle (local-first, AGENTS §5) — WARNING (review)
- core routes present in the bundle (`/display`, `/diagnostics`, `/staff`, `/admin/dashboard`) — WARNING if not found as literals
- `VITE_ENABLE_DEMO_SEED` not set to `true` in any `.env` — WARNING

Exit code: `0` = pass, `1` = hard failure. Warnings do not fail.

### `/diagnostics` → 现场自检 / Preflight panel — runtime checks

Composed from live DB state, with a single **就绪 / 未就绪** verdict. `ready`
requires none of these to fail:

- production build (vs dev mode) — warn
- brand Logo reachable via HEAD request — fail if missing
- database accessible (`database.ok`) — fail
- an active event exists — fail
- ≥ 1 enabled prize with `remaining > 0` — fail
- inventory sane (`0 ≤ remaining ≤ total`) for every prize — fail on violation
- no unresolved committed draw session — warn if one exists
- network status — informational (offline is **not** a failure; the app is local-first)

---

## 7. Release Readiness Matrix

Legend: ✅ Verified by automated test · 🟡 Implemented, manually verified ·
🔶 Implemented, **not** verified · ⛔ Not verified · 🛠 Known issue (fix in progress)

| Capability | Implemented | Automated | Manual | Status |
| --- | --- | --- | --- | --- |
| Secure random (`crypto.getRandomValues`, not `Math.random`) | yes (`drawService.ts`) | drawService tests | — | ✅ |
| Weighted selection (effective weight) | yes | drawService + stress #1 | — | ✅ |
| Inventory decrement (one unit per draw) | yes | drawService + stress #1/#2 | — | ✅ |
| Zero-inventory exclusion from pool | yes | drawService + stress #5 | — | ✅ |
| Active draw guard (one draw per event) | yes (`ACTIVE_DRAW_EXISTS`) | stress #1/#2 | — | ✅ |
| Duplicate active session refused | yes | stress #1/#2 | — | ✅ |
| Refresh recovery (same result, no redraw) | yes | stress #3 | — | ✅ |
| Offline draw + recovery | yes (local-first) | stress #4 | — | ✅ |
| 500-draw soak, exact accounting | yes | stress #1 | — | ✅ |
| Long-run domain/persistence stability | yes | burn-in (smoke/short) | full 8 h | 🟡 |
| Staff redemption | yes | `StaffPage.test.tsx` | — | ✅ (green in working tree; Staff fix from parallel stream, pending commit) |
| Duplicate redemption block | yes | `StaffPage.test.tsx` | — | ✅ (was red during Phase 10B, now green) |
| Result manual stay (no auto-reset) | yes | displayTransition tests | kiosk | 🟡 |
| Prize JSON import | yes | `AdminPrizesPage.test` + `prizeValidation.test` | — | ✅ |
| Prize field validation | yes | `prizeValidation.test` | — | ✅ |
| Probability modes (FIXED / TIME_RELEASE / SMART_PACING) | yes | drawService + pacing | UI | 🟡 |
| Diagnostics page (version/DB/event/canvas/FPS/errors) | yes | — | browser | 🟡 |
| Preflight (static CLI) | yes | — | run `npm run preflight` | 🟡 |
| Touch-screen interaction (one tap → one draw) | yes | — | **no e2e** | 🔶 manual only |
| 1920×1080 target | yes | — | on display machine | 🔶 |
| 2560×1440 / 3840×2160 (4K) | yes | — | on display machine | 🔶 |
| App restart (browser reload) | yes | stress #3 (recovery) | cold reload on kiosk | 🟡 |
| Power-loss / crash recovery | yes (recovery path) | stress #3 (analog) | pull power on kiosk | 🔶 |
| E2E (touch → reveal → reset, no Playwright) | **no** | — | — | ⛔ gap (AGENTS §29) |

**Reading the matrix:** ✅ items are safe to ship on. 🟡 need a sign-off run on
the show machine. 🔶 must be performed manually on the kiosk before doors — they
are not covered by automation. ⛔ is an acknowledged gap. Do not promote 🔶/⛔ to
"verified" by running `npm run build`.

---

## 8. Windows / PowerShell / UTF-8

PowerShell can render Chinese / UTF-8 console output as mojibake. That is a
**console-encoding artifact, not file corruption** — the source files are valid
UTF-8. Rules:

- **Searching Chinese content**: use `rg` (ripgrep), not `Select-String`/`Get-Content`.
  `rg` decodes UTF-8 correctly. (The Claude Code Grep tool uses ripgrep.)
- **Node reading files**: always pass `'utf8'` to `readFileSync` / `readFile`.
- **PowerShell reading files in a script**: set
  `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` and prefer
  `Get-Content -Encoding UTF8` / `Out-File -Encoding utf8`.
- **Passing env vars to npm**: bash `BURNIN_SECONDS=20 npm run ...` does NOT work
  in PowerShell/cmd. Use `$env:BURNIN_SECONDS=20; npm run burnin:short`, or the
  cross-platform `node scripts/burnin.mjs <mode>`.
- Do **not** re-encode source files repo-wide. Do **not** "fix" mojibake by
  editing a file you have not read as UTF-8.

---

## 9. Git workspace safety

The working tree is frequently dirty (in-flight work from multiple streams).
Discipline:

- Before changing anything: `git status --short` — know what is already modified.
- After changing: `git status --short` — confirm only your intended files moved.
- **Never** run destructive operations unless explicitly authorized:
  - `git reset --hard`
  - `git clean -fd`
  - `git checkout .` / `git restore .`
  - `git stash`
- Do **not** auto-commit or auto-push. Commits are manual and intentional.
- Do **not** commit another stream's uncommitted work as a side effect of your own.
- `AGENTS.md` §34 (Change Discipline) already requires the smallest coherent
  change + relevant checks + an exact report of what changed. This section is the
  git-level corollary.
