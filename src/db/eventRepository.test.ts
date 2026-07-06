import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from './database';
import {
  activateEvent,
  createEvent,
  endEvent,
  getLatestEventByStatus,
  listEvents,
  pauseEvent,
} from './eventRepository';
import { EventRepositoryError } from './eventRepository';

describe('event repository lifecycle', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-event-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('creates an event in DRAFT with a generated id and preserves timestamps', async () => {
    const event = await createEvent(db, {
      name: '量子展',
      code: 'Q-2026',
      startAt: '2026-07-06T10:00',
      endAt: '2026-07-06T18:00',
      id: 'event-fixed',
      now: () => '2026-07-06T00:00:00.000Z',
    });

    expect(event).toMatchObject({
      id: 'event-fixed',
      name: '量子展',
      code: 'Q-2026',
      status: 'DRAFT',
      createdAt: '2026-07-06T00:00:00.000Z',
      startAt: '2026-07-06T10:00',
      endAt: '2026-07-06T18:00',
    });
    await expect(db.events.get('event-fixed')).resolves.toEqual(event);
  });

  it('refuses to create two events with the same code', async () => {
    await createEvent(db, { name: 'A', code: 'DUP', now: () => '2026-07-06T00:00:00.000Z' });

    await expect(
      createEvent(db, { name: 'B', code: 'DUP', now: () => '2026-07-06T01:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'EVENT_CODE_TAKEN', name: 'EventRepositoryError' });

    await expect(db.events.count()).resolves.toBe(1);
  });

  it('activates a DRAFT event', async () => {
    const event = await createEvent(db, {
      name: 'A',
      code: 'C1',
      now: () => '2026-07-06T00:00:00.000Z',
    });

    await activateEvent(db, event.id);

    await expect(db.events.get(event.id)).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('refuses to activate a second event without confirmation and leaves both untouched', async () => {
    const first = await createEvent(db, {
      name: 'A',
      code: 'C1',
      status: 'ACTIVE',
      now: () => '2026-07-06T00:00:00.000Z',
    });
    const second = await createEvent(db, {
      name: 'B',
      code: 'C2',
      now: () => '2026-07-06T01:00:00.000Z',
    });

    await expect(activateEvent(db, second.id)).rejects.toMatchObject({
      code: 'ACTIVE_EVENT_EXISTS',
      name: 'EventRepositoryError',
    });

    await expect(db.events.get(first.id)).resolves.toMatchObject({ status: 'ACTIVE' });
    await expect(db.events.get(second.id)).resolves.toMatchObject({ status: 'DRAFT' });
  });

  it('pauses the previously active event when pauseExisting is confirmed', async () => {
    const first = await createEvent(db, {
      name: 'A',
      code: 'C1',
      status: 'ACTIVE',
      now: () => '2026-07-06T00:00:00.000Z',
    });
    const second = await createEvent(db, {
      name: 'B',
      code: 'C2',
      now: () => '2026-07-06T01:00:00.000Z',
    });

    await activateEvent(db, second.id, { pauseExisting: true });

    await expect(db.events.get(first.id)).resolves.toMatchObject({ status: 'PAUSED' });
    await expect(db.events.get(second.id)).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('preserves a committed draw session when its event is paused (recoverable)', async () => {
    const { seedEvent, seedPrizes, commitPersistentDraw, recoverCommittedDraw } = await import(
      './drawRepository'
    );
    const event = await createEvent(db, {
      name: 'A',
      code: 'C1',
      status: 'ACTIVE',
      now: () => '2026-07-06T00:00:00.000Z',
    });
    await seedEvent(db, event);
    await seedPrizes(db, [
      {
        id: 'p1',
        name: '一等奖',
        shortName: '一等',
        level: 1,
        inventoryTotal: 2,
        inventoryRemaining: 2,
        weight: 1,
        enabled: true,
      },
    ]);

    await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T02:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    await pauseEvent(db, event.id);

    await expect(db.events.get(event.id)).resolves.toMatchObject({ status: 'PAUSED' });

    // The committed session must still be recoverable even while paused.
    await expect(recoverCommittedDraw(db, event.id)).resolves.toMatchObject({
      record: { id: 'record-fixed' },
    });
  });

  it('pauses an ACTIVE event and refuses to pause an ENDED one', async () => {
    const active = await createEvent(db, {
      name: 'A',
      code: 'C1',
      status: 'ACTIVE',
      now: () => '2026-07-06T00:00:00.000Z',
    });

    await pauseEvent(db, active.id);
    await expect(db.events.get(active.id)).resolves.toMatchObject({ status: 'PAUSED' });

    await endEvent(db, active.id);
    await expect(
      pauseEvent(db, active.id),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', name: 'EventRepositoryError' });
  });

  it('ends an event idempotently and never deletes history', async () => {
    const event = await createEvent(db, {
      name: 'A',
      code: 'C1',
      status: 'ACTIVE',
      now: () => '2026-07-06T00:00:00.000Z',
    });

    await endEvent(db, event.id);
    await endEvent(db, event.id);

    await expect(db.events.get(event.id)).resolves.toMatchObject({ status: 'ENDED' });
    await expect(db.events.count()).resolves.toBe(1);
  });

  it('lists events newest-first and resolves the latest by status', async () => {
    await createEvent(db, { name: 'old', code: 'OLD', now: () => '2026-07-01T00:00:00.000Z' });
    await createEvent(db, { name: 'new', code: 'NEW', now: () => '2026-07-06T00:00:00.000Z' });

    const list = await listEvents(db);
    expect(list.map((event) => event.code)).toEqual(['NEW', 'OLD']);

    await expect(getLatestEventByStatus(db, 'DRAFT')).resolves.toMatchObject({ code: 'NEW' });
    await expect(getLatestEventByStatus(db, 'ACTIVE')).resolves.toBeUndefined();
  });

  it('exposes typed error codes for the admin UI to branch on', () => {
    const error = new EventRepositoryError('ACTIVE_EVENT_EXISTS', 'msg', { conflictingEventIds: ['e1'] });

    expect(error.code).toBe('ACTIVE_EVENT_EXISTS');
    expect(error.context).toEqual({ conflictingEventIds: ['e1'] });
  });
});
