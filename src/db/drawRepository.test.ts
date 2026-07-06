import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from './database';
import {
  commitPersistentDraw,
  recoverCommittedDraw,
  seedEvent,
  seedPrizes,
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
});
