import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from '../db/database';
import {
  clearActiveDrawSession,
  commitPersistentDraw,
  recoverCommittedDraw,
  seedEvent,
  seedPrizes,
} from '../db/drawRepository';
import type { Event, Prize } from '../domain/draw/types';

const event: Event = {
  id: 'event-stress',
  name: 'Stress Event',
  code: 'STRESS',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

function prize(overrides: Partial<Prize> = {}): Prize {
  return {
    id: 'prize-stress',
    name: '一等奖',
    shortName: '一等奖',
    level: 1,
    inventoryTotal: 100000,
    inventoryRemaining: 100000,
    weight: 1,
    enabled: true,
    ...overrides,
  };
}

describe('draw stress & adversarial scenarios', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-stress-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('runs 500 sequential draw cycles with no duplicate active draw, no negative inventory, exact record count', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'big', inventoryRemaining: 100000, inventoryTotal: 100000 })]);

    for (let cycle = 0; cycle < 500; cycle += 1) {
      const result = await commitPersistentDraw(db, {
        eventId: event.id,
        createId: (prefix) => `${prefix}-${cycle}`,
      });

      expect(result.record).toBeDefined();
      expect(result.session).toBeDefined();

      // A second concurrent commit must be refused before the first is cleared.
      await expect(
        commitPersistentDraw(db, {
          eventId: event.id,
          createId: (prefix) => `${prefix}-dup-${cycle}`,
        }),
      ).rejects.toMatchObject({ code: 'ACTIVE_DRAW_EXISTS' });

      await clearActiveDrawSession(db, event.id);
    }

    const prizes = await db.prizes.toArray();
    const big = prizes.find((item) => item.id === 'big');

    expect(big?.inventoryRemaining).toBe(99500);
    expect(big?.inventoryRemaining).toBeGreaterThanOrEqual(0);
    await expect(db.drawRecords.count()).resolves.toBe(500);
    await expect(db.drawSessions.where('[eventId+status]').equals([event.id, 'COMMITTED']).count()).resolves.toBe(0);
  });

  it('survives 10 concurrent taps producing exactly one draw (no duplicate inventory decrement)', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'big', inventoryRemaining: 100000 })]);

    let counter = 0;
    const createId = (prefix: 'session' | 'record') => `${prefix}-tap-${(counter += 1)}`;
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => commitPersistentDraw(db, { eventId: event.id, createId })),
    );

    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    expect(rejected.every((attempt) => attempt.status === 'rejected' && attempt.reason.code === 'ACTIVE_DRAW_EXISTS')).toBe(true);

    const big = await db.prizes.get('big');
    expect(big?.inventoryRemaining).toBe(99999);
    await expect(db.drawRecords.count()).resolves.toBe(1);
  });

  it('refresh recovery: a committed draw is recoverable from any post-commit phase without redrawing', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'big', inventoryRemaining: 100000 })]);

    const committed = await commitPersistentDraw(db, {
      eventId: event.id,
      createId: (prefix) => `${prefix}-fixed`,
    });

    // The display UI phase (SCANNING / SEARCHING / RESULT) is in-memory and lost on
    // refresh; the committed result lives in IndexedDB. Recovery must return the
    // SAME record from any of these phases.
    for (const phase of ['SCANNING', 'SEARCHING', 'RESULT'] as const) {
      const recovered = await recoverCommittedDraw(db, event.id);

      expect(recovered, `recovery after refresh during ${phase}`).toBeDefined();
      expect(recovered?.record.id).toBe(committed.record.id);
      expect(recovered?.session.id).toBe(committed.session.id);
    }

    // A re-commit while the session is active is still refused — recovery never redraws.
    await expect(
      commitPersistentDraw(db, { eventId: event.id, createId: (prefix) => `${prefix}-again` }),
    ).rejects.toMatchObject({ code: 'ACTIVE_DRAW_EXISTS' });

    await expect(db.drawRecords.count()).resolves.toBe(1);
  });

  it('offline: draws commit and recover with navigator.onLine === false (no network dependency)', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    try {
      await seedEvent(db, event);
      await seedPrizes(db, [prize({ id: 'big', inventoryRemaining: 100000 })]);

      expect(navigator.onLine).toBe(false);

      const committed = await commitPersistentDraw(db, {
        eventId: event.id,
        createId: (prefix) => `${prefix}-offline`,
      });

      expect(committed.record).toBeDefined();
      const recovered = await recoverCommittedDraw(db, event.id);
      expect(recovered?.record.id).toBe(committed.record.id);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(navigator, 'onLine', originalDescriptor);
      } else {
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      }
    }
  });

  it('exhausts inventory cleanly: when all prizes hit 0 remaining, draws are refused and records are preserved', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'last', inventoryRemaining: 1, inventoryTotal: 1 })]);

    const first = await commitPersistentDraw(db, {
      eventId: event.id,
      createId: (prefix) => `${prefix}-first`,
    });
    await clearActiveDrawSession(db, event.id);
    expect(first.record).toBeDefined();

    await expect(
      commitPersistentDraw(db, { eventId: event.id, createId: (prefix) => `${prefix}-second` }),
    ).rejects.toThrow(/No active prize/);

    const last = await db.prizes.get('last');
    expect(last?.inventoryRemaining).toBe(0);
    await expect(db.drawRecords.count()).resolves.toBe(1);
  });
});
