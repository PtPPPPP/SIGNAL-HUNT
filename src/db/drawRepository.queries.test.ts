import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from './database';
import {
  clearActiveDrawSession,
  commitPersistentDraw,
  countRedeemedByEvent,
  countWinsByPrize,
  getLatestRecord,
  getRecordsByEvent,
  readDisplayDatabaseSnapshot,
  redeemDrawRecord,
  seedEvent,
  seedPrizes,
} from './drawRepository';
import type { Event, Prize } from '../domain/draw/types';

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: 'event-1',
    name: 'SIGNAL HUNT Demo',
    code: 'SIGNAL-HUNT-DEMO',
    status: 'ACTIVE',
    createdAt: '2026-07-06T00:00:00.000Z',
    ...overrides,
  };
}

function prize(overrides: Partial<Prize> = {}): Prize {
  return {
    id: 'prize-1',
    name: '一等奖',
    shortName: '一等奖',
    level: 1,
    inventoryTotal: 10,
    inventoryRemaining: 10,
    weight: 1,
    enabled: true,
    ...overrides,
  };
}

describe('draw repository indexed queries', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-queries-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('getRecordsByEvent returns only the requested event via the eventId index', async () => {
    await seedEvent(db, event({ id: 'event-a' }));
    await seedEvent(db, event({ id: 'event-b', code: 'B', name: 'B' }));
    await seedPrizes(db, [prize({ id: 'p', inventoryRemaining: 10 })]);

    await commitPersistentDraw(db, {
      eventId: 'event-a',
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-a`,
    });
    await clearActiveDrawSession(db, 'event-a');
    await commitPersistentDraw(db, {
      eventId: 'event-b',
      now: () => '2026-07-06T02:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-b`,
    });

    await expect(getRecordsByEvent(db, 'event-a')).resolves.toHaveLength(1);
    await expect(getRecordsByEvent(db, 'event-b')).resolves.toHaveLength(1);
    await expect(db.drawRecords.count()).resolves.toBe(2);
  });

  it('countWinsByPrize counts non-voided wins for one prize via the compound index', async () => {
    await seedEvent(db, event({ id: 'event-a' }));
    await seedPrizes(db, [
      prize({ id: 'p1', inventoryRemaining: 10 }),
      prize({ id: 'p2', name: '二等奖', shortName: '二等奖', inventoryRemaining: 10 }),
    ]);

    for (let i = 0; i < 3; i += 1) {
      await commitPersistentDraw(db, {
        eventId: 'event-a',
        now: () => `2026-07-06T0${i + 1}:00:00.000Z`,
        random: () => 0,
        createId: (prefix) => `${prefix}-p1-${i}`,
      });
      await clearActiveDrawSession(db, 'event-a');
    }

    await expect(countWinsByPrize(db, 'event-a', 'p1')).resolves.toBe(3);
    await expect(countWinsByPrize(db, 'event-a', 'p2')).resolves.toBe(0);
  });

  it('countRedeemedByEvent counts only redeemed records via the compound index', async () => {
    await seedEvent(db, event());
    await seedPrizes(db, [prize({ id: 'p', inventoryRemaining: 10 })]);

    const a = await commitPersistentDraw(db, {
      eventId: 'event-1',
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-a`,
    });
    await redeemDrawRecord(db, a.record.id, () => '2026-07-06T01:02:00.000Z');
    // second draw stays unredeemed
    await clearActiveDrawSession(db, 'event-1');
    await commitPersistentDraw(db, {
      eventId: 'event-1',
      now: () => '2026-07-06T02:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-b`,
    });

    await expect(countRedeemedByEvent(db, 'event-1')).resolves.toBe(1);
  });

  it('getLatestRecord returns the newest committedAt record for the event', async () => {
    await seedEvent(db, event());
    await seedPrizes(db, [prize({ id: 'p', inventoryRemaining: 10 })]);

    await commitPersistentDraw(db, {
      eventId: 'event-1',
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-first`,
    });
    await clearActiveDrawSession(db, 'event-1');
    await commitPersistentDraw(db, {
      eventId: 'event-1',
      now: () => '2026-07-06T09:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-last`,
    });

    const latest = await getLatestRecord(db, 'event-1');
    expect(latest?.id).toBe('record-last');
  });

  it('reads display state from the active event before paused or draft events', async () => {
    await seedEvent(db, event({ id: 'draft', code: 'DRAFT', status: 'DRAFT', createdAt: '2026-07-06T03:00:00.000Z' }));
    await seedEvent(db, event({ id: 'paused', code: 'PAUSED', status: 'PAUSED', createdAt: '2026-07-06T02:00:00.000Z' }));
    await seedEvent(db, event({ id: 'active', code: 'ACTIVE', status: 'ACTIVE', createdAt: '2026-07-06T01:00:00.000Z' }));
    await seedPrizes(db, [prize()]);
    const committed = await commitPersistentDraw(db, {
      eventId: 'active',
      random: () => 0,
      createId: (prefix) => `${prefix}-active`,
    });

    const snapshot = await readDisplayDatabaseSnapshot(db, undefined, Date.parse('2026-07-06T04:00:00.000Z'));

    expect(snapshot).toMatchObject({
      configuredEvent: { id: 'active' },
      eventCount: 3,
      participation: { code: 'ALLOWED' },
      session: { eventId: 'active' },
      record: { id: committed.record.id },
    });
  });

  it('commit counts wins scoped to the active event, not across events', async () => {
    // Event A accumulates wins for prize p; event B must not inherit them.
    await seedEvent(db, event({ id: 'event-a' }));
    await seedEvent(db, event({ id: 'event-b', code: 'B', name: 'B' }));
    await seedPrizes(db, [prize({ id: 'p', inventoryRemaining: 10 })]);

    for (let i = 0; i < 4; i += 1) {
      await commitPersistentDraw(db, {
        eventId: 'event-a',
        now: () => `2026-07-06T0${i + 1}:00:00.000Z`,
        random: () => 0,
        createId: (prefix) => `${prefix}-a-${i}`,
      });
      await clearActiveDrawSession(db, 'event-a');
    }

    await expect(getRecordsByEvent(db, 'event-a')).resolves.toHaveLength(4);
    await expect(getRecordsByEvent(db, 'event-b')).resolves.toHaveLength(0);
    await expect(countWinsByPrize(db, 'event-a', 'p')).resolves.toBe(4);
    await expect(countWinsByPrize(db, 'event-b', 'p')).resolves.toBe(0);
  });
});
