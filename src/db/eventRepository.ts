import type { Event, EventStatus } from '../domain/draw/types';
import type { SignalHuntDatabase } from './database';

export type EventRepositoryErrorCode =
  | 'ACTIVE_EVENT_EXISTS'
  | 'EVENT_NOT_FOUND'
  | 'EVENT_CODE_TAKEN'
  | 'INVALID_TRANSITION';

export class EventRepositoryError extends Error {
  constructor(
    public readonly code: EventRepositoryErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'EventRepositoryError';
  }
}

export type CreateEventInput = {
  name: string;
  code: string;
  startAt?: string;
  endAt?: string;
  /** Defaults to DRAFT. Pass ACTIVE to create-and-activate in one step. */
  status?: EventStatus;
  id?: string;
  now?: () => string;
};

export type ActivateEventOptions = {
  /**
   * When another event is already ACTIVE, pause it instead of throwing
   * ACTIVE_EVENT_EXISTS. Without this flag a conflicting activation is refused
   * so the UI can prompt the operator for explicit confirmation.
   */
  pauseExisting?: boolean;
};

function createId(): string {
  if (!crypto.randomUUID) {
    throw new Error('crypto.randomUUID is required to create event identifiers.');
  }

  return `event-${crypto.randomUUID()}`;
}

function normalizeTimestamp(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

export async function listEvents(db: SignalHuntDatabase): Promise<Event[]> {
  const events = await db.events.toArray();

  return [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getEvent(db: SignalHuntDatabase, id: string): Promise<Event | undefined> {
  return db.events.get(id);
}

export async function getLatestEventByStatus(
  db: SignalHuntDatabase,
  status: EventStatus,
): Promise<Event | undefined> {
  const found = await db.events.where('status').equals(status).toArray();

  if (found.length === 0) {
    return undefined;
  }

  return [...found].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

export async function createEvent(db: SignalHuntDatabase, input: CreateEventInput): Promise<Event> {
  return db.transaction('rw', db.events, async () => {
    const code = input.code.trim();

    const existingWithCode = await db.events.where('code').equals(code).first();

    if (existingWithCode) {
      throw new EventRepositoryError('EVENT_CODE_TAKEN', '活动代码已被占用。', { code });
    }

    const now = input.now ?? (() => new Date().toISOString());
    const event: Event = {
      id: input.id ?? createId(),
      name: input.name.trim(),
      code,
      status: input.status ?? 'DRAFT',
      createdAt: now(),
      startAt: normalizeTimestamp(input.startAt),
      endAt: normalizeTimestamp(input.endAt),
    };

    await db.events.put(event);

    return event;
  });
}

export async function activateEvent(
  db: SignalHuntDatabase,
  eventId: string,
  options: ActivateEventOptions = {},
): Promise<void> {
  return db.transaction('rw', db.events, async () => {
    const target = await db.events.get(eventId);

    if (!target) {
      throw new EventRepositoryError('EVENT_NOT_FOUND', '活动不存在。', { eventId });
    }

    const activeOthers = (await db.events.where('status').equals('ACTIVE').toArray()).filter(
      (event) => event.id !== eventId,
    );

    if (activeOthers.length > 0) {
      if (!options.pauseExisting) {
        throw new EventRepositoryError(
          'ACTIVE_EVENT_EXISTS',
          '已存在激活中的活动，需要先暂停旧活动。',
          { conflictingEventIds: activeOthers.map((event) => event.id) },
        );
      }

      await Promise.all(
        activeOthers.map((event) => db.events.put({ ...event, status: 'PAUSED' })),
      );
    }

    await db.events.put({ ...target, status: 'ACTIVE' });
  });
}

export async function pauseEvent(db: SignalHuntDatabase, eventId: string): Promise<void> {
  return db.transaction('rw', db.events, async () => {
    const target = await db.events.get(eventId);

    if (!target) {
      throw new EventRepositoryError('EVENT_NOT_FOUND', '活动不存在。', { eventId });
    }

    if (target.status !== 'ACTIVE' && target.status !== 'DRAFT') {
      throw new EventRepositoryError(
        'INVALID_TRANSITION',
        `不能从「${target.status}」暂停。`,
        { from: target.status },
      );
    }

    await db.events.put({ ...target, status: 'PAUSED' });
  });
}

export async function endEvent(db: SignalHuntDatabase, eventId: string): Promise<void> {
  return db.transaction('rw', db.events, async () => {
    const target = await db.events.get(eventId);

    if (!target) {
      throw new EventRepositoryError('EVENT_NOT_FOUND', '活动不存在。', { eventId });
    }

    if (target.status === 'ENDED') {
      return;
    }

    await db.events.put({ ...target, status: 'ENDED' });
  });
}
