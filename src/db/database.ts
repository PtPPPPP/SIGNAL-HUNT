import Dexie, { type Table } from 'dexie';

import type { DrawRecord, DrawSession, Event, Prize } from '../domain/draw/types';

export const DATABASE_NAME = 'signal-hunt';

/**
 * Schema version history.
 *
 * v1 — initial schema: events, prizes, drawSessions, drawRecords.
 * v2 — additive only, no index changes, no data transformation. Existing v1
 *      records stay valid untouched. Adds optional non-indexed fields:
 *      - DrawRecord.voidedAt / voidReason  (traceable staff void operations)
 *      - Event.startAt / endAt             (exhibition window)
 */
export const DATABASE_VERSION = 2;

export class SignalHuntDatabase extends Dexie {
  events!: Table<Event, string>;
  prizes!: Table<Prize, string>;
  drawSessions!: Table<DrawSession, string>;
  drawRecords!: Table<DrawRecord, string>;

  constructor(name = DATABASE_NAME) {
    super(name);

    this.version(DATABASE_VERSION).stores({
      events: 'id, status, code',
      prizes: 'id, enabled, level',
      drawSessions: 'id, eventId, status, [eventId+status], committedRecordId',
      drawRecords: 'id, eventId, sessionId, prizeId, status, committedAt',
    });
  }
}

export function createSignalHuntDatabase(name?: string): SignalHuntDatabase {
  return new SignalHuntDatabase(name);
}

export const signalHuntDatabase = createSignalHuntDatabase();
