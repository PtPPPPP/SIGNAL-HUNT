import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from './database';
import {
  clearActiveDrawSession,
  commitPersistentDraw,
  recoverCommittedDraw,
  redeemDrawRecord,
  seedEvent,
  seedPrizes,
  voidActiveDraw,
} from './drawRepository';
import type { Event, Prize } from '../domain/draw/types';

const event: Event = {
  id: 'event-1',
  name: 'SIGNAL HUNT Demo',
  code: 'SIGNAL-HUNT-DEMO',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

function prize(overrides: Partial<Prize> = {}): Prize {
  return {
    id: 'prize-1',
    name: '一等奖',
    shortName: '一等奖',
    level: 1,
    inventoryTotal: 2,
    inventoryRemaining: 2,
    weight: 1,
    enabled: true,
    ...overrides,
  };
}

describe('draw persistence repository', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('stores event and prize seed data in IndexedDB', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first' }), prize({ id: 'second' })]);

    await expect(db.events.get(event.id)).resolves.toEqual(event);
    await expect(db.prizes.orderBy('id').toArray()).resolves.toHaveLength(2);
  });

  it('commits a draw atomically and persists inventory, session, and record', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);

    const result = await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    await expect(db.prizes.get('first')).resolves.toMatchObject({ inventoryRemaining: 1 });
    await expect(db.drawSessions.get(result.session.id)).resolves.toEqual(result.session);
    await expect(db.drawRecords.get(result.record.id)).resolves.toEqual(result.record);
  });

  it('recovers an active committed draw without creating another record', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);

    const committed = await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    const recovered = await recoverCommittedDraw(db, event.id);

    await expect(db.drawRecords.toArray()).resolves.toHaveLength(1);
    expect(recovered).toEqual(committed);
  });

  it('blocks a second commit while an active draw exists', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);

    await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-first`,
    });

    await expect(
      commitPersistentDraw(db, {
        eventId: event.id,
        now: () => '2026-07-06T01:01:00.000Z',
        random: () => 0,
        createId: (prefix) => `${prefix}-second`,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVE_DRAW_EXISTS' });

    await expect(db.prizes.get('first')).resolves.toMatchObject({ inventoryRemaining: 1 });
    await expect(db.drawRecords.toArray()).resolves.toHaveLength(1);
  });

  it('allows at most one concurrent commit for the same event', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);

    let idCounter = 0;
    const createId = (prefix: 'session' | 'record') => `${prefix}-parallel-${(idCounter += 1)}`;
    const attempts = await Promise.allSettled([
      commitPersistentDraw(db, {
        eventId: event.id,
        now: () => '2026-07-06T01:00:00.000Z',
        random: () => 0,
        createId,
      }),
      commitPersistentDraw(db, {
        eventId: event.id,
        now: () => '2026-07-06T01:00:01.000Z',
        random: () => 0,
        createId,
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    await expect(db.prizes.get('first')).resolves.toMatchObject({ inventoryRemaining: 1 });
    await expect(db.drawRecords.toArray()).resolves.toHaveLength(1);
    await expect(recoverCommittedDraw(db, event.id)).resolves.toBeDefined();
  });

  it('does not change inventory or records when active draw already exists', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);

    await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-first`,
    });

    await expect(
      commitPersistentDraw(db, {
        eventId: event.id,
        now: () => '2026-07-06T01:01:00.000Z',
        random: () => 0,
        createId: (prefix) => `${prefix}-second`,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVE_DRAW_EXISTS' });

    await expect(db.prizes.get('first')).resolves.toMatchObject({ inventoryRemaining: 1 });
    await expect(db.drawRecords.toArray()).resolves.toHaveLength(1);
    await expect(db.drawSessions.toArray()).resolves.toHaveLength(1);
  });

  it('allows a new commit after the active draw session is cleared', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);

    await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-first`,
    });
    await clearActiveDrawSession(db, event.id);

    await expect(
      commitPersistentDraw(db, {
        eventId: event.id,
        now: () => '2026-07-06T01:02:00.000Z',
        random: () => 0,
        createId: (prefix) => `${prefix}-second`,
      }),
    ).resolves.toMatchObject({ record: { id: 'record-second' } });

    await expect(db.prizes.get('first')).resolves.toMatchObject({ inventoryRemaining: 0 });
    await expect(db.drawRecords.toArray()).resolves.toHaveLength(2);
  });

  it('redeems an active draw record without ending the display session', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);
    const committed = await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    const result = await redeemDrawRecord(db, committed.record.id, () => '2026-07-06T01:02:00.000Z');

    expect(result.status).toBe('REDEEMED');
    expect(result.record).toMatchObject({
      id: committed.record.id,
      redeemed: true,
      redeemedAt: '2026-07-06T01:02:00.000Z',
      status: 'REDEEMED',
    });
    await expect(recoverCommittedDraw(db, event.id)).resolves.toBeDefined();
  });

  it('returns an explicit already redeemed result on duplicate redemption', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);
    const committed = await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    await redeemDrawRecord(db, committed.record.id, () => '2026-07-06T01:02:00.000Z');
    const result = await redeemDrawRecord(db, committed.record.id, () => '2026-07-06T01:03:00.000Z');

    expect(result.status).toBe('ALREADY_REDEEMED');
    expect(result.record.redeemedAt).toBe('2026-07-06T01:02:00.000Z');
  });

  it('voids an unredeemed active draw with a reason without restoring inventory', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);
    const committed = await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    const result = await voidActiveDraw(db, {
      eventId: event.id,
      reason: '现场误触',
      now: () => '2026-07-06T01:04:00.000Z',
    });

    expect(result.record).toMatchObject({
      id: committed.record.id,
      status: 'VOIDED',
      voidedAt: '2026-07-06T01:04:00.000Z',
      voidReason: '现场误触',
    });
    await expect(db.prizes.get('first')).resolves.toMatchObject({ inventoryRemaining: 1 });
    await expect(recoverCommittedDraw(db, event.id)).resolves.toBeUndefined();
  });

  it('does not void a redeemed active draw', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);
    const committed = await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });
    await redeemDrawRecord(db, committed.record.id, () => '2026-07-06T01:02:00.000Z');

    await expect(
      voidActiveDraw(db, {
        eventId: event.id,
        reason: '已兑奖后误操作',
        now: () => '2026-07-06T01:04:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'DRAW_ALREADY_REDEEMED' });

    await expect(db.drawRecords.get(committed.record.id)).resolves.toMatchObject({ status: 'REDEEMED' });
  });
});
