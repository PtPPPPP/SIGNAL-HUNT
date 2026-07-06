import { clearActiveDrawSession, commitPersistentDraw } from '../db/drawRepository';
import type { SignalHuntDatabase } from '../db/database';

export interface BurnInReport {
  durationMs: number;
  cycles: number;
  drawCount: number;
  errorCount: number;
  errors: string[];
  heapUsedStartBytes?: number;
  heapUsedEndBytes?: number;
  recordCount: number;
  remainingInventorySum: number;
  initialInventorySum: number;
  stoppedReason: 'duration' | 'cap' | 'exhausted';
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

/**
 * Domain + persistence burn-in. Repeatedly commits a real draw and clears the
 * active session for `durationMs`, against the real repository (no mocks beyond
 * the IndexedDB shim). Use it to validate long-running kiosk stability of the
 * draw path: every cycle must decrement exactly one unit of inventory and create
 * exactly one record, with zero errors.
 *
 * This is NOT a visual/Canvas burn-in — that requires a real browser kiosk and is
 * documented as a manual step. There is no Electron shell, so "app restart" here
 * means a browser reload, which boot-time recovery already covers.
 */
export async function runBurnIn(
  db: SignalHuntDatabase,
  eventId: string,
  options: BurnInOptions,
): Promise<BurnInReport> {
  const start = performance.now();
  const initialInventorySum = await inventorySum(db);
  const heapStart = heapUsedBytes();
  const cap = options.cycleCap ?? 200000;
  const progressIntervalMs = options.progressIntervalMs ?? 5000;

  let cycles = 0;
  let drawCount = 0;
  let errorCount = 0;
  let lastProgress = start;
  const errors: string[] = [];
  let stoppedReason: BurnInReport['stoppedReason'] = 'duration';

  while (performance.now() - start < options.durationMs) {
    if (cycles >= cap) {
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
      options.onProgress?.({
        durationMs: performance.now() - start,
        cycles,
        drawCount,
        errorCount,
        errors,
        heapUsedStartBytes: heapStart,
        heapUsedEndBytes: heapUsedBytes(),
        recordCount: drawCount,
        remainingInventorySum: await inventorySum(db),
        initialInventorySum,
        stoppedReason: 'duration',
      });
    }
  }

  return {
    durationMs: performance.now() - start,
    cycles,
    drawCount,
    errorCount,
    errors,
    heapUsedStartBytes: heapStart,
    heapUsedEndBytes: heapUsedBytes(),
    recordCount: await db.drawRecords.count(),
    remainingInventorySum: await inventorySum(db),
    initialInventorySum,
    stoppedReason,
  };
}
