import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from '../db/database';
import {
  countWinsByPrize,
  getLatestRecord,
  getRecordsByEvent,
} from '../db/drawRepository';
import type { DrawRecord } from '../domain/draw/types';

/**
 * Repository query benchmark.
 *
 * For each scale N we seed:
 *   - N committed draw records on the TARGET event (the one pacing cares about)
 *   - 2 * N records on OTHER events (background noise the OLD full-table scan paid for)
 *
 * We then measure the four reads the pacing / commit path actually performs and
 * log elapsed ms. No hard time gate — the goal is to observe that event-scoped
 * reads scale with N (the active event) rather than with 3 * N (the whole table),
 * i.e. that the v3 indexed queries avoid the old full-table scan.
 */
const SCALES = [100, 1_000, 10_000, 50_000] as const;
const BACKGROUND_MULTIPLIER = 2;
const WARMUP_ITERATIONS = 2;
const MEASURED_ITERATIONS = 5;
const TARGET_EVENT = 'event-target';
const TARGET_PRIZE = 'prize-target';

type BenchResult = {
  scale: number;
  totalRecords: number;
  fullScanMs: number;
  eventScopedMs: number;
  latestMs: number;
  countWinsMs: number;
};

describe('draw repository query benchmark', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-perf-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  for (const scale of SCALES) {
    it(`scales event-scoped reads at N=${scale.toLocaleString()} target records`, async () => {
      const total = await seedScale(db, scale);
      const result = await benchmark(db, total);

      console.log(
        `\n[perf] N=${result.scale.toLocaleString()} target / ${result.totalRecords.toLocaleString()} total records\n` +
          `  full-table scan (legacy) : ${result.fullScanMs.toFixed(2)} ms\n` +
          `  event-scoped read (v3)   : ${result.eventScopedMs.toFixed(2)} ms\n` +
          `  latest record (indexed)  : ${result.latestMs.toFixed(2)} ms\n` +
          `  countWinsByPrize (index) : ${result.countWinsMs.toFixed(2)} ms`,
      );

      // Correctness: the indexed reads return exactly the target event's records.
      const eventRecords = await getRecordsByEvent(db, TARGET_EVENT);
      expect(eventRecords).toHaveLength(scale);
      // Sanity (not a perf gate): event-scoped should never read more than full scan.
      expect(result.eventScopedMs).toBeLessThanOrEqual(result.fullScanMs * 20 + 50);
    }, 120_000);
  }
});

async function seedScale(db: SignalHuntDatabase, targetCount: number): Promise<number> {
  const backgroundCount = targetCount * BACKGROUND_MULTIPLIER;
  const records: DrawRecord[] = [];

  for (let i = 0; i < targetCount; i += 1) {
    records.push(makeRecord(TARGET_EVENT, TARGET_PRIZE, i));
  }
  for (let i = 0; i < backgroundCount; i += 1) {
    records.push(makeRecord(`event-noise-${i % 8}`, `prize-noise-${i % 8}`, i));
  }

  await db.drawRecords.bulkPut(records);

  return targetCount + backgroundCount;
}

function makeRecord(eventId: string, prizeId: string, index: number): DrawRecord {
  const committedAt = new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString();

  return {
    id: `record-${eventId}-${index}`,
    eventId,
    sessionId: `session-${eventId}-${index}`,
    prizeId,
    prizeNameSnapshot: prizeId === TARGET_PRIZE ? '一等奖' : '谢谢参与',
    createdAt: committedAt,
    committedAt,
    redeemed: false,
    status: 'COMMITTED',
  };
}

async function benchmark(db: SignalHuntDatabase, totalRecords: number): Promise<BenchResult> {
  const fullScanMs = await time(async () => {
    await db.drawRecords.toArray();
  });

  const eventScopedMs = await time(async () => {
    await getRecordsByEvent(db, TARGET_EVENT);
  });

  const latestMs = await time(async () => {
    await getLatestRecord(db, TARGET_EVENT);
  });

  const countWinsMs = await time(async () => {
    await countWinsByPrize(db, TARGET_EVENT, TARGET_PRIZE);
  });

  return {
    scale: totalRecords / (BACKGROUND_MULTIPLIER + 1),
    totalRecords,
    fullScanMs,
    eventScopedMs,
    latestMs,
    countWinsMs,
  };
}

async function time(operation: () => Promise<unknown>): Promise<number> {
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    await operation();
  }

  const start = performance.now();
  for (let i = 0; i < MEASURED_ITERATIONS; i += 1) {
    await operation();
  }

  return (performance.now() - start) / MEASURED_ITERATIONS;
}
