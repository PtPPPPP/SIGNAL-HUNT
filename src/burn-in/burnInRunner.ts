import { clearActiveDrawSession, commitPersistentDraw } from '../db/drawRepository';
import type { SignalHuntDatabase } from '../db/database';

export interface BurnInConfigSnapshot {
  /** The event the burn-in draws against. */
  eventId: string;
  /** Requested run length. The actual `durationMs` may differ slightly. */
  durationTargetMs: number;
  /** Hard safety cap on iterations so a runaway loop can never hang forever. */
  cycleCap: number;
  /** How often `onProgress` is invoked. */
  progressIntervalMs: number;
}

export interface BurnInReport {
  // Timing — ISO timestamps let the report stand alone outside vitest output.
  startedAtIso: string;
  endedAtIso: string;
  durationTargetMs: number;
  /** Actual elapsed time in ms. */
  durationMs: number;
  // Counts.
  /** Loop iterations attempted. */
  cycles: number;
  /** Draws that committed successfully. */
  drawCount: number;
  /** Explicit alias of `drawCount` — the "success" count, named for readability. */
  successCount: number;
  errorCount: number;
  errors: string[];
  // Integrity.
  /** Total durable draw records in the DB at end of run. */
  recordCount: number;
  initialInventorySum: number;
  remainingInventorySum: number;
  /** initialInventorySum - remainingInventorySum. Must equal drawCount. */
  inventoryDecrement: number;
  /** drawCount / (durationMs / 1000). */
  throughputDrawsPerSec: number;
  // Memory (Node only; undefined in a pure browser context).
  heapUsedStartBytes?: number;
  heapUsedEndBytes?: number;
  // Control.
  stoppedReason: 'duration' | 'cap' | 'exhausted';
  config: BurnInConfigSnapshot;
  // Verdict — computed invariants, so the report is self-describing and a
  // caller can branch on `passed` without re-deriving the rules.
  violations: string[];
  passed: boolean;
}

export interface BurnInOptions {
  durationMs: number;
  /** Hard safety cap on iterations so a runaway loop can never hang forever. */
  cycleCap?: number;
  progressIntervalMs?: number;
  onProgress?: (report: BurnInReport) => void;
}

function heapUsedBytes(): number | undefined {
  if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
    return process.memoryUsage().heapUsed;
  }

  return undefined;
}

async function inventorySum(db: SignalHuntDatabase): Promise<number> {
  const prizes = await db.prizes.toArray();

  return prizes.reduce((sum, prize) => sum + prize.inventoryRemaining, 0);
}

async function negativeInventoryPrizes(db: SignalHuntDatabase): Promise<string[]> {
  const prizes = await db.prizes.toArray();

  return prizes
    .filter((prize) => prize.inventoryRemaining < 0)
    .map((prize) => `${prize.id}=${prize.inventoryRemaining}`);
}

function isoNow(): string {
  return new Date().toISOString();
}

/**
 * The single source of truth for "is this burn-in healthy". Used for both
 * progress snapshots (`final = false`) and the final verdict (`final = true`),
 * so the rules can never drift between the two.
 *
 * Enforced invariants:
 *   - zero errors (a duplicate active draw, transient DB error, or any thrown
 *     failure increments errorCount and fails the run)
 *   - recordCount === drawCount   (every draw produced exactly one durable record)
 *   - inventoryDecrement === drawCount (every draw reserved exactly one unit)
 *   - no negative inventory — aggregate OR per-prize
 *   - ran the full requested duration and stopped on 'duration'
 */
function computeViolations(args: {
  durationTargetMs: number;
  durationMs: number;
  drawCount: number;
  errorCount: number;
  recordCount: number;
  initialInventorySum: number;
  remainingInventorySum: number;
  stoppedReason: BurnInReport['stoppedReason'];
  negativePrizes: string[];
  final: boolean;
}): string[] {
  const violations: string[] = [];
  const {
    durationTargetMs,
    durationMs,
    drawCount,
    errorCount,
    recordCount,
    initialInventorySum,
    remainingInventorySum,
    stoppedReason,
    negativePrizes,
    final,
  } = args;

  if (errorCount > 0) {
    violations.push(`errorCount=${errorCount} (expected 0)`);
  }
  // A duplicate active draw surfaces as ACTIVE_DRAW_EXISTS, which is caught and
  // counted in errorCount above — no separate post-hoc probe is needed.
  if (final && stoppedReason !== 'duration') {
    violations.push(`stoppedReason='${stoppedReason}' (expected 'duration')`);
  }
  if (final && durationTargetMs > 0 && durationMs < durationTargetMs * 0.9) {
    violations.push(
      `durationMs=${durationMs.toFixed(0)} well below target ${durationTargetMs}ms (ran <90%)`,
    );
  }
  if (final && drawCount === 0) {
    violations.push('drawCount=0 (no draws completed)');
  }
  if (recordCount !== drawCount) {
    violations.push(`recordCount=${recordCount} !== drawCount=${drawCount}`);
  }
  const decrement = initialInventorySum - remainingInventorySum;
  if (decrement !== drawCount) {
    violations.push(`inventoryDecrement=${decrement} !== drawCount=${drawCount}`);
  }
  if (remainingInventorySum < 0) {
    violations.push(`remainingInventorySum=${remainingInventorySum} < 0`);
  }
  if (negativePrizes.length > 0) {
    violations.push(`negative inventory on prizes: ${negativePrizes.join(', ')}`);
  }

  return violations;
}

/**
 * Domain + persistence burn-in. Repeatedly commits a real draw and clears the
 * active session for `durationMs`, against the real repository (no mocks beyond
 * the IndexedDB shim). Use it to validate long-running kiosk stability of the
 * draw path: every cycle must decrement exactly one unit of inventory and create
 * exactly one record, with zero errors. The returned report is self-describing:
 * `passed` is true iff every invariant in `computeViolations` holds.
 *
 * This is NOT a visual/Canvas burn-in — that requires a real browser kiosk and
 * is documented as a manual step. There is no Electron shell, so "app restart"
 * here means a browser reload, which boot-time recovery already covers.
 */
export async function runBurnIn(
  db: SignalHuntDatabase,
  eventId: string,
  options: BurnInOptions,
): Promise<BurnInReport> {
  const startedAtIso = isoNow();
  const start = performance.now();
  const initialInventorySum = await inventorySum(db);
  const heapStart = heapUsedBytes();
  const cycleCap = options.cycleCap ?? 200000;
  const progressIntervalMs = options.progressIntervalMs ?? 5000;

  let cycles = 0;
  let drawCount = 0;
  let errorCount = 0;
  let lastProgress = start;
  const errors: string[] = [];
  let stoppedReason: BurnInReport['stoppedReason'] = 'duration';

  const buildReport = async (final: boolean): Promise<BurnInReport> => {
    const remainingInventorySum = await inventorySum(db);
    const negativePrizes = final ? await negativeInventoryPrizes(db) : [];
    const recordCount = final ? await db.drawRecords.count() : drawCount;
    const durationMs = performance.now() - start;
    const violations = computeViolations({
      durationTargetMs: options.durationMs,
      durationMs,
      drawCount,
      errorCount,
      recordCount,
      initialInventorySum,
      remainingInventorySum,
      stoppedReason,
      negativePrizes,
      final,
    });

    return {
      startedAtIso,
      endedAtIso: final ? isoNow() : '',
      durationTargetMs: options.durationMs,
      durationMs,
      cycles,
      drawCount,
      successCount: drawCount,
      errorCount,
      errors,
      recordCount,
      initialInventorySum,
      remainingInventorySum,
      inventoryDecrement: initialInventorySum - remainingInventorySum,
      throughputDrawsPerSec: durationMs > 0 ? drawCount / (durationMs / 1000) : 0,
      heapUsedStartBytes: heapStart,
      heapUsedEndBytes: heapUsedBytes(),
      stoppedReason,
      config: { eventId, durationTargetMs: options.durationMs, cycleCap, progressIntervalMs },
      violations,
      passed: violations.length === 0,
    };
  };

  while (performance.now() - start < options.durationMs) {
    if (cycles >= cycleCap) {
      stoppedReason = 'cap';
      break;
    }

    cycles += 1;

    try {
      await commitPersistentDraw(db, { eventId });
      drawCount += 1;
      await clearActiveDrawSession(db, eventId);
    } catch (error) {
      errorCount += 1;

      if (errors.length < 10) {
        errors.push(error instanceof Error ? error.message : String(error));
      }

      const message = error instanceof Error ? error.message : '';

      if (/No active prize|inventory/i.test(message)) {
        stoppedReason = 'exhausted';
        break;
      }
    }

    if (performance.now() - lastProgress > progressIntervalMs) {
      lastProgress = performance.now();
      options.onProgress?.(await buildReport(false));
    }
  }

  return buildReport(true);
}
