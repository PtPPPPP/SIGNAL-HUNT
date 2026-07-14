import type { Event } from './types';

export type EventParticipationErrorCode =
  | 'EVENT_NOT_STARTED'
  | 'EVENT_ENDED'
  | 'EVENT_INACTIVE'
  | 'EVENT_PAUSED';

export type EventParticipationDecision =
  | { code: 'ALLOWED'; nextBoundaryAt?: string }
  | { code: EventParticipationErrorCode; nextBoundaryAt?: string };

export class EventParticipationError extends Error {
  constructor(
    public readonly code: EventParticipationErrorCode,
    public readonly event: Event,
  ) {
    super(messageByCode[code]);
    this.name = 'EventParticipationError';
  }
}

const messageByCode: Record<EventParticipationErrorCode, string> = {
  EVENT_NOT_STARTED: '活动尚未开始。',
  EVENT_ENDED: '活动已结束。',
  EVENT_INACTIVE: '活动暂不可参与。',
  EVENT_PAUSED: '活动已暂停。',
};

/**
 * One authoritative participation rule shared by repositories, domain logic,
 * and the display. The window is half-open: startAt <= now < endAt.
 */
export function getEventParticipationDecision(
  event: Event,
  now: string | number | Date = Date.now(),
): EventParticipationDecision {
  if (event.status === 'PAUSED') return { code: 'EVENT_PAUSED' };
  if (event.status === 'ENDED') return { code: 'EVENT_ENDED' };
  if (event.status !== 'ACTIVE') return { code: 'EVENT_INACTIVE' };

  const nowMs = parseRequiredTimestamp(now, 'current time');
  const startAtMs = parseOptionalTimestamp(event.startAt);
  const endAtMs = parseOptionalTimestamp(event.endAt);

  if ((event.startAt && startAtMs === undefined) || (event.endAt && endAtMs === undefined)) {
    return { code: 'EVENT_INACTIVE' };
  }

  if (startAtMs !== undefined && endAtMs !== undefined && endAtMs < startAtMs) {
    return { code: 'EVENT_INACTIVE' };
  }

  if (startAtMs !== undefined && nowMs < startAtMs) {
    return { code: 'EVENT_NOT_STARTED', nextBoundaryAt: event.startAt };
  }

  if (endAtMs !== undefined && nowMs >= endAtMs) {
    return { code: 'EVENT_ENDED' };
  }

  return { code: 'ALLOWED', nextBoundaryAt: event.endAt };
}

export function assertEventParticipationAllowed(event: Event, now: string | number | Date): void {
  const decision = getEventParticipationDecision(event, now);

  if (decision.code !== 'ALLOWED') {
    throw new EventParticipationError(decision.code, event);
  }
}

/** Converts datetime-local or offset timestamps to the canonical UTC ISO form. */
export function toUtcIsoTimestamp(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    throw new RangeError(`Invalid event timestamp: ${trimmed}`);
  }

  return new Date(timestamp).toISOString();
}

export function normalizeEventTimestamps(event: Event): Event {
  return {
    ...event,
    startAt: toUtcIsoTimestamp(event.startAt),
    endAt: toUtcIsoTimestamp(event.endAt),
  };
}

function parseOptionalTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function parseRequiredTimestamp(value: string | number | Date, label: string): number {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new RangeError(`Invalid ${label}.`);
  }

  return timestamp;
}
