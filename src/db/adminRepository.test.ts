import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from './database';
import { getDashboardSummary, listPrizes, normalizeLegacyPrizeLabels, savePrize } from './adminRepository';
import { seedEvent, seedPrizes } from './drawRepository';
import type { Event, Prize } from '../domain/draw/types';

const event: Event = {
  id: 'event-1',
  name: 'SIGNAL HUNT Demo',
  code: 'SIGNAL-HUNT-DEMO',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

const prize: Prize = {
  id: 'prize-1',
  name: '一等奖',
  shortName: '一等奖',
  level: 1,
  inventoryTotal: 2,
  inventoryRemaining: 2,
  weight: 1,
  enabled: true,
};

describe('admin repository', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-admin-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('saves and lists prizes ordered by level', async () => {
    await savePrize(db, { ...prize, id: 'second', level: 2 });
    await savePrize(db, { ...prize, id: 'first', level: 1 });

    await expect(listPrizes(db)).resolves.toMatchObject([{ id: 'first' }, { id: 'second' }]);
  });

  it('rejects invalid prizes at the database write boundary', async () => {
    await expect(savePrize(db, { ...prize, id: 'bad', inventoryRemaining: -1 })).rejects.toThrow('奖品数据无效');
    await expect(db.prizes.toArray()).resolves.toHaveLength(0);
  });

  it('returns dashboard summary from IndexedDB tables', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, [prize, { ...prize, id: 'empty', inventoryRemaining: 0 }]);

    const summary = await getDashboardSummary(db);

    expect(summary).toEqual({
      eventCount: 1,
      prizeCount: 2,
      enabledPrizeCount: 2,
      remainingInventory: 2,
      drawRecordCount: 0,
    });
  });

  it('normalizes legacy non-winning prize labels to thanks participation', async () => {
    await seedPrizes(db, [
      { ...prize, id: 'first', name: '一等奖', shortName: '一等奖', level: 1 },
      { ...prize, id: 'legacy-thanks', name: '参与奖', shortName: '参与奖', level: 4, inventoryTotal: 10, inventoryRemaining: 8 },
    ]);
    await db.drawRecords.put({
      id: 'record-legacy',
      eventId: event.id,
      sessionId: 'session-legacy',
      prizeId: 'legacy-thanks',
      prizeNameSnapshot: '参与奖',
      createdAt: '2026-07-15T01:00:00.000Z',
      committedAt: '2026-07-15T01:00:00.000Z',
      redeemed: false,
      status: 'COMMITTED',
    });

    await expect(normalizeLegacyPrizeLabels(db)).resolves.toBe(true);

    await expect(db.prizes.get('legacy-thanks')).resolves.toMatchObject({
      name: '谢谢参与',
      shortName: '谢谢参与',
      level: 99,
      inventoryTotal: 10,
      inventoryRemaining: 8,
    });
    await expect(db.drawRecords.get('record-legacy')).resolves.toMatchObject({
      prizeNameSnapshot: '谢谢参与',
    });
  });
});
