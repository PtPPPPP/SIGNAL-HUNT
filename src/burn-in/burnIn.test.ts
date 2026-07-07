import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from '../db/database';
import { seedEvent, seedPrizes } from '../db/drawRepository';
import type { Event, Prize } from '../domain/draw/types';
import { runBurnIn } from './burnInRunner';

/**
 * Duration is driven by the BURNIN_SECONDS env var so the same runner serves a
 * quick smoke check, the documented 5-minute short mode, and an 8-hour soak:
 *
 *   BURNIN_SECONDS=20   npm run burnin:short   # quick smoke
 *   npm run burnin:short                       # default short mode (5 min)
 *   BURNIN_SECONDS=28800 npm run burnin:short  # 8-hour soak
 *
 * Default is 5 minutes per the burn-in plan. This file is excluded from the
 * normal `npm test` run (see vite.config.ts test.exclude) so the unit suite
 * stays fast; invoke it explicitly via npm run burnin:short.
 */
const BURNIN_SECONDS = Number(process.env.BURNIN_SECONDS ?? '300');

const event: Event = {
  id: 'event-burnin',
  name: 'Burn-In',
  code: 'BURNIN',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

const prizes: Prize[] = [
  {
    id: 'burn-first',
    name: '一等奖',
    shortName: '一等',
    level: 1,
    inventoryTotal: 1_000_000,
    inventoryRemaining: 1_000_000,
    weight: 5,
    enabled: true,
  },
  {
    id: 'burn-second',
    name: '二等奖',
    shortName: '二等',
    level: 2,
    inventoryTotal: 1_000_000,
    inventoryRemaining: 1_000_000,
    weight: 25,
    enabled: true,
  },
  {
    id: 'burn-third',
    name: '三等奖',
    shortName: '三等',
    level: 3,
    inventoryTotal: 1_000_000,
    inventoryRemaining: 1_000_000,
    weight: 70,
    enabled: true,
  },
];

describe('burn-in runner', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-burnin-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it(
    `runs ${BURNIN_SECONDS}s of continuous draws with zero errors and exact inventory accounting`,
    async () => {
      await seedEvent(db, event);
      await seedPrizes(db, prizes);

      const report = await runBurnIn(db, event.id, {
        durationMs: BURNIN_SECONDS * 1000,
        onProgress: (current) => {
          const seconds = Math.round(current.durationMs / 1000);
          const heapMb = current.heapUsedEndBytes != null
            ? `${(current.heapUsedEndBytes / 1024 / 1024).toFixed(1)} MB`
            : 'n/a';
          console.log(
            `[burn-in progress] ${seconds}s · draws=${current.drawCount} errors=${current.errorCount} heap=${heapMb}`,
          );
        },
      });

      const heapDeltaMb =
        report.heapUsedStartBytes != null && report.heapUsedEndBytes != null
          ? `${((report.heapUsedEndBytes - report.heapUsedStartBytes) / 1024 / 1024).toFixed(1)} MB`
          : 'n/a';

      console.log(
        '[burn-in FINAL]\n' +
          JSON.stringify(
            {
              mode: `BURNIN_SECONDS=${BURNIN_SECONDS}`,
              startedAt: report.startedAtIso,
              endedAt: report.endedAtIso,
              durationTargetSeconds: Number((report.durationTargetMs / 1000).toFixed(1)),
              durationActualSeconds: Number((report.durationMs / 1000).toFixed(1)),
              cycles: report.cycles,
              draws: report.drawCount,
              success: report.successCount,
              errors: report.errorCount,
              errorSamples: report.errors,
              stoppedReason: report.stoppedReason,
              records: report.recordCount,
              inventoryDecrement: report.inventoryDecrement,
              remainingInventorySum: report.remainingInventorySum,
              throughputDrawsPerSec: Number(report.throughputDrawsPerSec.toFixed(1)),
              heapDelta: heapDeltaMb,
              passed: report.passed,
              violations: report.violations,
              config: report.config,
            },
            null,
            2,
          ),
      );

      // Hard reliability invariants.
      expect(report.errorCount).toBe(0);
      expect(report.stoppedReason).toBe('duration');
      expect(report.drawCount).toBeGreaterThan(0);
      // Each successful draw decrements exactly one inventory unit, and every draw
      // produces exactly one durable record.
      expect(report.initialInventorySum - report.remainingInventorySum).toBe(report.drawCount);
      expect(report.recordCount).toBe(report.drawCount);
      // Inventory must never go negative (aggregate or per-prize — the per-prize
      // scan lives in the runner's computeViolations).
      expect(report.remainingInventorySum).toBeGreaterThanOrEqual(0);
      // The runner's self-describing verdict must agree: if this fails, read
      // `report.violations` in the FINAL print above for the precise cause.
      expect(report.passed).toBe(true);
    },
    (BURNIN_SECONDS + 60) * 1000,
  );
});
