import Dexie, { type Table } from 'dexie';

import type { DrawRecord, DrawSession, Event, Prize } from '../domain/draw/types';

export const DATABASE_NAME = 'signal-hunt';
export const DATABASE_VERSION = 1;

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
