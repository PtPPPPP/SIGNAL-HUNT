import 'fake-indexeddb/auto';

import Dexie, { type Table } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import type { DrawRecord, DrawSession, Event, Prize } from '../domain/draw/types';
import type { DiagnosticLogRecord } from '../features/diagnostics/diagnosticLogStore';
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

/** Pre-v3 schema (v2): identical stores, no compound drawRecord indexes, no logs. */
class V2SignalHuntDatabase extends Dexie {
  events!: Table<Event, string>;
  prizes!: Table<Prize, string>;
  drawSessions!: Table<DrawSession, string>;
  drawRecords!: Table<DrawRecord, string>;

  constructor(name: string) {
    super(name);

    this.version(2).stores({
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

  it('opens a v1 database after the additive DrawRecord fields change', async () => {
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

    expect(DATABASE_VERSION).toBe(4);
    await expect(db.drawRecords.get('record-v1')).resolves.toMatchObject({
      id: 'record-v1',
      status: 'COMMITTED',
      redeemed: false,
    });
  });

  it('migrates v2 to the current schema without losing data and normalizes event times', async () => {
    const databaseName = `signal-hunt-v2-to-v3-${crypto.randomUUID()}`;
    const v2 = new V2SignalHuntDatabase(databaseName);
    await v2.open();
    await v2.drawRecords.bulkPut([
      {
        id: 'record-a',
        eventId: 'event-1',
        sessionId: 'session-a',
        prizeId: 'prize-1',
        prizeNameSnapshot: '一等奖',
        createdAt: '2026-07-06T01:00:00.000Z',
        committedAt: '2026-07-06T01:00:00.000Z',
        redeemed: true,
        redeemedAt: '2026-07-06T01:05:00.000Z',
        status: 'REDEEMED',
      },
      {
        id: 'record-b',
        eventId: 'event-1',
        sessionId: 'session-b',
        prizeId: 'prize-2',
        prizeNameSnapshot: '二等奖',
        createdAt: '2026-07-06T02:00:00.000Z',
        committedAt: '2026-07-06T02:00:00.000Z',
        redeemed: false,
        status: 'COMMITTED',
      },
    ]);
    await v2.events.put({
      id: 'event-1',
      name: '旧活动',
      code: 'LEGACY',
      status: 'ACTIVE',
      createdAt: '2026-07-06T00:00:00.000Z',
      startAt: '2026-07-06T10:00',
      endAt: '2026-07-06T18:00',
    });
    v2.close();

    db = createSignalHuntDatabase(databaseName);
    await db.open();

    // Existing rows are preserved verbatim.
    await expect(db.drawRecords.count()).resolves.toBe(2);
    await expect(db.drawRecords.get('record-a')).resolves.toMatchObject({ status: 'REDEEMED' });
    await expect(db.events.get('event-1')).resolves.toMatchObject({
      startAt: new Date('2026-07-06T10:00').toISOString(),
      endAt: new Date('2026-07-06T18:00').toISOString(),
    });

    // The new [eventId+prizeId] compound index is usable.
    await expect(
      db.drawRecords.where('[eventId+prizeId]').equals(['event-1', 'prize-1']).count(),
    ).resolves.toBe(1);

    // The new [eventId+status] compound index is usable.
    await expect(
      db.drawRecords.where('[eventId+status]').equals(['event-1', 'REDEEMED']).count(),
    ).resolves.toBe(1);

    // The diagnosticLogs table exists and is writable.
    await db.diagnosticLogs.put({
      id: 'log-1',
      timestamp: '2026-07-06T03:00:00.000Z',
      level: 'info',
      code: 'INFO',
      message: 'migration smoke',
      appVersion: 'test',
    } satisfies DiagnosticLogRecord);
    await expect(db.diagnosticLogs.count()).resolves.toBe(1);
  });
});
