import 'fake-indexeddb/auto';

import Dexie, { type Table } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import type { DrawRecord, DrawSession, Event, Prize } from '../domain/draw/types';
import { createSignalHuntDatabase, DATABASE_VERSION, type SignalHuntDatabase } from './database';

class LegacySignalHuntDatabase extends Dexie {
  events!: Table<Event, string>;
  prizes!: Table<Prize, string>;
  drawSessions!: Table<DrawSession, string>;
  drawRecords!: Table<DrawRecord, string>;

  constructor(name: string) {
    super(name);

    this.version(1).stores({
      events: 'id, status, code',
      prizes: 'id, enabled, level',
      drawSessions: 'id, eventId, status, [eventId+status], committedRecordId',
      drawRecords: 'id, eventId, sessionId, prizeId, status, committedAt',
    });
  }
}

describe('database migrations', () => {
  let db: SignalHuntDatabase | undefined;

  afterEach(async () => {
    if (db) {
      await db.delete();
      db = undefined;
    }
  });

  it('opens a v1 database after the v2 additive DrawRecord fields change', async () => {
    const databaseName = `signal-hunt-migration-${crypto.randomUUID()}`;
    const legacyDb = new LegacySignalHuntDatabase(databaseName);
    await legacyDb.open();
    await legacyDb.drawRecords.put({
      id: 'record-v1',
      eventId: 'event-1',
      sessionId: 'session-1',
      prizeId: 'prize-1',
      prizeNameSnapshot: '一等奖',
      createdAt: '2026-07-06T01:00:00.000Z',
      committedAt: '2026-07-06T01:00:00.000Z',
      redeemed: false,
      status: 'COMMITTED',
    });
    legacyDb.close();

    db = createSignalHuntDatabase(databaseName);
    await db.open();

    expect(DATABASE_VERSION).toBe(2);
    await expect(db.drawRecords.get('record-v1')).resolves.toMatchObject({
      id: 'record-v1',
      status: 'COMMITTED',
      redeemed: false,
    });
  });
});
