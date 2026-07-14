import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from './database';
import { commitPersistentDraw, getActiveEvent, seedEvent, seedPrizes } from './drawRepository';
import type { Event, Prize } from '../domain/draw/types';

const timedEvent: Event = {
  id: 'event-timed',
  name: '限时活动',
  code: 'TIMED',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
  startAt: '2026-07-06T01:00:00.000Z',
  endAt: '2026-07-06T09:00:00.000Z',
};

const pacedPrize: Prize = {
  id: 'prize-1',
  name: '一等奖',
  shortName: '一等',
  level: 1,
  inventoryTotal: 3,
  inventoryRemaining: 3,
  weight: 1,
  enabled: true,
  probabilityMode: 'SMART_PACING',
  pacing: { minMultiplier: 0.5, maxMultiplier: 2, sensitivity: 1 },
};

describe('draw repository event availability gate', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-availability-${crypto.randomUUID()}`);
    await db.open();
    await seedEvent(db, timedEvent);
    await seedPrizes(db, [pacedPrize]);
  });

  afterEach(async () => {
    await db.delete();
  });

  it.each([
    ['exact start', '2026-07-06T01:00:00.000Z'],
    ['end minus 1 ms', '2026-07-06T08:59:59.999Z'],
  ])('allows a real draw at %s', async (_label, now) => {
    const committed = await commitPersistentDraw(db, {
      eventId: timedEvent.id,
      now: () => now,
      random: () => 0,
      createId: (prefix) => `${prefix}-allowed`,
    });

    expect(committed.record.committedAt).toBe(now);
    await expect(db.prizes.get(pacedPrize.id)).resolves.toMatchObject({ inventoryRemaining: 2 });
    await expect(db.drawRecords.count()).resolves.toBe(1);
  });

  it.each([
    ['start minus 1 ms', timedEvent, '2026-07-06T00:59:59.999Z', 'EVENT_NOT_STARTED'],
    ['exact end', timedEvent, '2026-07-06T09:00:00.000Z', 'EVENT_ENDED'],
    ['inactive', { ...timedEvent, status: 'DRAFT' as const }, '2026-07-06T01:00:00.000Z', 'EVENT_INACTIVE'],
    ['paused', { ...timedEvent, status: 'PAUSED' as const }, '2026-07-06T01:00:00.000Z', 'EVENT_PAUSED'],
    ['manually ended', { ...timedEvent, status: 'ENDED' as const }, '2026-07-06T01:00:00.000Z', 'EVENT_ENDED'],
  ])('rejects %s before random selection or any persistent change', async (_label, event, now, code) => {
    await seedEvent(db, event);
    const before = await readBusinessSnapshot(db);
    const random = vi.fn(() => 0);
    const createId = vi.fn((prefix: 'session' | 'record') => `${prefix}-blocked`);

    await expect(
      commitPersistentDraw(db, { eventId: event.id, now: () => now, random, createId }),
    ).rejects.toMatchObject({ code });

    expect(random).not.toHaveBeenCalled();
    expect(createId).not.toHaveBeenCalled();
    expect(await readBusinessSnapshot(db)).toEqual(before);
  });

  it('does not trust a cached front-end ACTIVE state when the direct repository call is too early', async () => {
    const cachedEvent = { ...timedEvent, status: 'ACTIVE' as const };
    expect(cachedEvent.status).toBe('ACTIVE');

    await expect(
      commitPersistentDraw(db, {
        eventId: cachedEvent.id,
        now: () => '2026-07-06T00:59:59.999Z',
        random: () => 0,
      }),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_STARTED' });
    await expect(db.drawRecords.count()).resolves.toBe(0);
  });

  it('applies the same time rule to the current drawable-event query', async () => {
    await expect(getActiveEvent(db, '2026-07-06T00:59:59.999Z')).resolves.toBeUndefined();
    await expect(getActiveEvent(db, '2026-07-06T01:00:00.000Z')).resolves.toMatchObject({ id: timedEvent.id });
    await expect(getActiveEvent(db, '2026-07-06T09:00:00.000Z')).resolves.toBeUndefined();
  });

  it('rejects two windows consistently at the end boundary', async () => {
    const secondWindow = createSignalHuntDatabase(db.name);
    await secondWindow.open();

    try {
      const attempts = await Promise.allSettled([
        commitPersistentDraw(db, {
          eventId: timedEvent.id,
          now: () => '2026-07-06T09:00:00.000Z',
          random: () => 0,
        }),
        commitPersistentDraw(secondWindow, {
          eventId: timedEvent.id,
          now: () => '2026-07-06T09:00:00.000Z',
          random: () => 0,
        }),
      ]);

      expect(attempts.every((attempt) => attempt.status === 'rejected')).toBe(true);
      expect(
        attempts.every(
          (attempt) => attempt.status === 'rejected' && (attempt.reason as { code?: string }).code === 'EVENT_ENDED',
        ),
      ).toBe(true);
      expect(await readBusinessSnapshot(db)).toMatchObject({
        prizes: [{ inventoryRemaining: 3 }],
        records: [],
        sessions: [],
      });
    } finally {
      secondWindow.close();
    }
  });
});

async function readBusinessSnapshot(db: SignalHuntDatabase) {
  const [prizes, records, sessions] = await Promise.all([
    db.prizes.orderBy('id').toArray(),
    db.drawRecords.orderBy('id').toArray(),
    db.drawSessions.orderBy('id').toArray(),
  ]);

  return { prizes, records, sessions };
}
