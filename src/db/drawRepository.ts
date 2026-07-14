import { commitDraw } from '../domain/draw/drawService';
import type { CommitDrawResult, Event, Prize } from '../domain/draw/types';
import type { DrawRecord, DrawSession } from '../domain/draw/types';
import type { SignalHuntDatabase } from './database';

export type DrawRepositoryErrorCode =
  | 'ACTIVE_DRAW_EXISTS'
  | 'ACTIVE_DRAW_NOT_FOUND'
  | 'DRAW_RECORD_NOT_FOUND'
  | 'DRAW_ALREADY_REDEEMED'
  | 'DRAW_ALREADY_VOIDED'
  | 'DRAW_RECORD_MISMATCH'
  | 'VOID_REASON_REQUIRED';

export class DrawRepositoryError extends Error {
  constructor(
    public readonly code: DrawRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DrawRepositoryError';
  }
}

export type CommitPersistentDrawInput = {
  eventId: string;
  participantId?: string;
  now?: () => string;
  random?: () => number;
  createId?: (prefix: 'session' | 'record') => string;
};

export type RedeemDrawResult =
  | { status: 'REDEEMED'; record: DrawRecord }
  | { status: 'ALREADY_REDEEMED'; record: DrawRecord };

export type RevealDrawResult =
  | { status: 'REVEALED'; record: DrawRecord }
  | { status: 'ALREADY_REVEALED'; record: DrawRecord }
  | { status: 'TERMINAL_STATE'; record: DrawRecord };

export type VoidDrawResult =
  | { status: 'VOIDED'; record: DrawRecord }
  | { status: 'ALREADY_VOIDED'; record: DrawRecord };

export type VoidActiveDrawInput = {
  eventId: string;
  recordId?: string;
  reason: string;
  now?: () => string;
};

export async function seedEvent(db: SignalHuntDatabase, event: Event): Promise<void> {
  await db.events.put(event);
}

export async function seedPrizes(db: SignalHuntDatabase, prizes: readonly Prize[]): Promise<void> {
  await db.prizes.bulkPut([...prizes]);
}

export async function commitPersistentDraw(
  db: SignalHuntDatabase,
  input: CommitPersistentDrawInput,
): Promise<CommitDrawResult> {
  return db.transaction('rw', db.events, db.prizes, db.drawSessions, db.drawRecords, async () => {
    const event = await db.events.get(input.eventId);

    if (!event) {
      throw new Error('Event was not found.');
    }

    const activeSession = await db.drawSessions
      .where('[eventId+status]')
      .equals([input.eventId, 'COMMITTED'])
      .first();

    if (activeSession) {
      throw new DrawRepositoryError('ACTIVE_DRAW_EXISTS', 'An active draw already exists for this event.');
    }

    // Load only the active event's records via the indexed `eventId` column.
    // Pacing (countWins / min-interval) is per-event, so reading the whole table
    // across every event was both slower than necessary and semantically leaky
    // (a later event would inherit an earlier event's win history). The prizes
    // table is tiny and must be returned in full, so it stays a toArray().
    const [prizes, records] = await Promise.all([db.prizes.toArray(), getRecordsByEvent(db, input.eventId)]);
    const committed = commitDraw({
      event,
      prizes,
      records,
      participantId: input.participantId,
      now: input.now,
      random: input.random,
      createId: input.createId,
    });

    await db.prizes.bulkPut(committed.prizes);
    await db.drawSessions.put(committed.session);
    await db.drawRecords.put(committed.record);

    return committed;
  });
}

export async function recoverCommittedDraw(
  db: SignalHuntDatabase,
  eventId: string,
): Promise<CommitDrawResult | undefined> {
  return db.transaction('r', db.prizes, db.drawSessions, db.drawRecords, async () => {
    const session = await db.drawSessions
      .where('[eventId+status]')
      .equals([eventId, 'COMMITTED'])
      .first();

    if (!session) {
      return undefined;
    }

    const record = await db.drawRecords.get(session.committedRecordId);

    if (!record) {
      throw new Error('Committed draw record was not found.');
    }

    const prizes = await db.prizes.toArray();

    return {
      session,
      record,
      prizes,
    };
  });
}

/**
 * All draw records for one event, resolved via the indexed `eventId` column
 * instead of a full-table scan. This is the scoped read pacing and the commit
 * path now use; prefer it over `drawRecords.toArray()` whenever the caller knows
 * the event.
 */
export async function getRecordsByEvent(db: SignalHuntDatabase, eventId: string): Promise<DrawRecord[]> {
  return db.drawRecords.where('eventId').equals(eventId).toArray();
}

/**
 * Indexed win count for a single prize within an event, excluding voided draws.
 * Uses the [eventId+prizeId] compound index (schema v3) to avoid loading rows.
 */
export async function countWinsByPrize(
  db: SignalHuntDatabase,
  eventId: string,
  prizeId: string,
): Promise<number> {
  const rows = await db.drawRecords.where('[eventId+prizeId]').equals([eventId, prizeId]).toArray();

  return rows.filter((record) => record.status !== 'VOIDED').length;
}

/**
 * Indexed count of redeemed records for an event via the [eventId+status] compound
 * index (schema v3). AVOIDS scanning the whole records table for redemption stats.
 */
export async function countRedeemedByEvent(db: SignalHuntDatabase, eventId: string): Promise<number> {
  return db.drawRecords.where('[eventId+status]').equals([eventId, 'REDEEMED']).count();
}

/** The most recently committed record for an event (newest committedAt), if any. */
export async function getLatestRecord(db: SignalHuntDatabase, eventId: string): Promise<DrawRecord | undefined> {
  const records = await db.drawRecords.where('eventId').equals(eventId).sortBy('committedAt');

  return records.at(-1);
}

export async function getActiveEvent(db: SignalHuntDatabase): Promise<Event | undefined> {  const activeEvents = await db.events.where('status').equals('ACTIVE').toArray();

  if (activeEvents.length === 0) {
    return undefined;
  }

  return [...activeEvents].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

export async function markDrawRevealed(
  db: SignalHuntDatabase,
  recordId: string,
  now: () => string = () => new Date().toISOString(),
): Promise<RevealDrawResult> {
  return db.transaction('rw', db.drawRecords, async () => {
    const record = await db.drawRecords.get(recordId);

    if (!record) {
      throw new DrawRepositoryError('DRAW_RECORD_NOT_FOUND', 'Draw record was not found.');
    }

    if (record.status === 'REDEEMED' || record.status === 'VOIDED') {
      return { status: 'TERMINAL_STATE', record };
    }

    if (record.status === 'REVEALED') {
      return { status: 'ALREADY_REVEALED', record };
    }

    const revealedRecord: DrawRecord = {
      ...record,
      status: 'REVEALED',
      revealedAt: now(),
    };

    await db.drawRecords.put(revealedRecord);

    return { status: 'REVEALED', record: revealedRecord };
  });
}

export async function clearActiveDrawSession(db: SignalHuntDatabase, eventId: string): Promise<void> {
  await db.transaction('rw', db.drawSessions, async () => {
    const activeSessions = await db.drawSessions
      .where('[eventId+status]')
      .equals([eventId, 'COMMITTED'])
      .toArray();

    await Promise.all(activeSessions.map((session: DrawSession) => db.drawSessions.delete(session.id)));
  });
}

export async function redeemDrawRecord(
  db: SignalHuntDatabase,
  recordId: string,
  now: () => string = () => new Date().toISOString(),
): Promise<RedeemDrawResult> {
  return db.transaction('rw', db.drawRecords, async () => {
    const record = await db.drawRecords.get(recordId);

    if (!record) {
      throw new DrawRepositoryError('DRAW_RECORD_NOT_FOUND', 'Draw record was not found.');
    }

    if (record.redeemed) {
      return {
        status: 'ALREADY_REDEEMED',
        record,
      };
    }

    if (record.status === 'VOIDED') {
      throw new DrawRepositoryError('DRAW_ALREADY_VOIDED', 'Voided draw cannot be redeemed.');
    }

    const redeemedRecord: DrawRecord = {
      ...record,
      redeemed: true,
      redeemedAt: now(),
      status: 'REDEEMED',
    };

    await db.drawRecords.put(redeemedRecord);

    return {
      status: 'REDEEMED',
      record: redeemedRecord,
    };
  });
}

export async function voidActiveDraw(
  db: SignalHuntDatabase,
  input: VoidActiveDrawInput,
): Promise<VoidDrawResult> {
  const reason = input.reason.trim();

  if (!reason) {
    throw new DrawRepositoryError('VOID_REASON_REQUIRED', 'Void reason is required.');
  }

  return db.transaction('rw', db.drawSessions, db.drawRecords, async () => {
    const session = await db.drawSessions
      .where('[eventId+status]')
      .equals([input.eventId, 'COMMITTED'])
      .first();

    if (!session && input.recordId) {
      const existingRecord = await db.drawRecords.get(input.recordId);

      if (!existingRecord) {
        throw new DrawRepositoryError('DRAW_RECORD_NOT_FOUND', 'Draw record was not found.');
      }

      if (existingRecord.status === 'VOIDED') {
        return { status: 'ALREADY_VOIDED', record: existingRecord };
      }

      if (existingRecord.status === 'REDEEMED' || existingRecord.redeemed) {
        throw new DrawRepositoryError('DRAW_ALREADY_REDEEMED', 'Redeemed draw cannot be voided.');
      }

      throw new DrawRepositoryError('ACTIVE_DRAW_NOT_FOUND', 'Active draw was not found.');
    }

    if (!session) {
      throw new DrawRepositoryError('ACTIVE_DRAW_NOT_FOUND', 'Active draw was not found.');
    }

    if (input.recordId && input.recordId !== session.committedRecordId) {
      throw new DrawRepositoryError(
        'DRAW_RECORD_MISMATCH',
        'The requested draw is no longer the active draw.',
      );
    }

    const record = await db.drawRecords.get(session.committedRecordId);

    if (!record) {
      throw new DrawRepositoryError('DRAW_RECORD_NOT_FOUND', 'Draw record was not found.');
    }

    if (record.status === 'VOIDED') {
      await db.drawSessions.delete(session.id);
      return { status: 'ALREADY_VOIDED', record };
    }

    if (record.status === 'REDEEMED' || record.redeemed) {
      throw new DrawRepositoryError('DRAW_ALREADY_REDEEMED', 'Redeemed draw cannot be voided.');
    }

    const voidedRecord: DrawRecord = {
      ...record,
      status: 'VOIDED',
      voidedAt: input.now?.() ?? new Date().toISOString(),
      voidReason: reason,
    };

    await db.drawRecords.put(voidedRecord);
    await db.drawSessions.delete(session.id);

    return { status: 'VOIDED', record: voidedRecord };
  });
}
