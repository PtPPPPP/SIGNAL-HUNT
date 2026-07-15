import Dexie, { type Table } from 'dexie';

import { normalizeEventTimestamps } from '../domain/draw/eventParticipation';
import type { DrawRecord, DrawSession, Event, Prize } from '../domain/draw/types';
import type { DiagnosticLogRecord } from '../features/diagnostics/diagnosticLogStore';

export const DATABASE_NAME = 'signal-hunt';

/**
 * Schema version history.
 *
 * v1 — initial schema: events, prizes, drawSessions, drawRecords.
 * v2 — additive only, no index changes, no data transformation. Existing v1
 *      records stay valid untouched. Adds optional non-indexed fields:
 *      - DrawRecord.voidedAt / voidReason  (traceable operator void operations)
 *      - Event.startAt / endAt             (exhibition window)
 * v3 — additive indexes + one new table. No existing field is renamed, removed,
 *      or transformed, so v2 records stay valid untouched. Dexie rebuilds the new
 *      indexes over existing rows automatically on first open:
 *      - drawRecords gains [eventId+prizeId] and [eventId+status] compound indexes
 *        so per-event / per-prize pacing and redemption counts resolve via an index
 *        instead of a full-table scan (the hot path is commitPersistentDraw, which
 *        previously loaded every record across every event).
 *      - diagnosticLogs: persisted structured log ring buffer (see diagnosticLogStore),
 *        survives reloads/crashes for the /diagnostics page. Not part of backups.
 * v4 — normalizes optional event windows to UTC ISO strings. Older datetime-local
 *      values are interpreted in the machine's local timezone once during upgrade.
 */
export const DATABASE_VERSION = 4;

export class SignalHuntDatabase extends Dexie {
  events!: Table<Event, string>;
  prizes!: Table<Prize, string>;
  drawSessions!: Table<DrawSession, string>;
  drawRecords!: Table<DrawRecord, string>;
  diagnosticLogs!: Table<DiagnosticLogRecord, string>;

  constructor(name = DATABASE_NAME) {
    super(name);

    this.version(2).stores({
      events: 'id, status, code',
      prizes: 'id, enabled, level',
      drawSessions: 'id, eventId, status, [eventId+status], committedRecordId',
      drawRecords: 'id, eventId, sessionId, prizeId, status, committedAt',
    });

    // v3 superset of v2 indexes. Declaring all stores again (Dexie requires the
    // full store list per version) lets Dexie diff against v2 and only add the new
    // drawRecords compound indexes plus the new diagnosticLogs table.
    this.version(3).stores({
      events: 'id, status, code',
      prizes: 'id, enabled, level',
      drawSessions: 'id, eventId, status, [eventId+status], committedRecordId',
      drawRecords:
        'id, eventId, sessionId, prizeId, status, committedAt, [eventId+prizeId], [eventId+status]',
      diagnosticLogs: 'id, timestamp, level, code',
    });

    this.version(DATABASE_VERSION)
      .stores({
        events: 'id, status, code',
        prizes: 'id, enabled, level',
        drawSessions: 'id, eventId, status, [eventId+status], committedRecordId',
        drawRecords:
          'id, eventId, sessionId, prizeId, status, committedAt, [eventId+prizeId], [eventId+status]',
        diagnosticLogs: 'id, timestamp, level, code',
      })
      .upgrade(async (transaction) => {
        await transaction.table<Event, string>('events').toCollection().modify((event) => {
          const normalized = normalizeEventTimestamps(event);
          event.startAt = normalized.startAt;
          event.endAt = normalized.endAt;
        });
      });
  }
}

export function createSignalHuntDatabase(name?: string): SignalHuntDatabase {
  return new SignalHuntDatabase(name);
}

export const signalHuntDatabase = createSignalHuntDatabase();
