import type { Event, EventParticipationWindow } from './types';

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
  const windows = normalizeParticipationWindows(event.participationWindows);

  if (event.participationWindows && !windows) {
    return { code: 'EVENT_INACTIVE' };
  }

  if (windows && windows.length > 0) {
    return getWindowedParticipationDecision(windows, nowMs);
  }

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
    participationWindows: event.participationWindows?.map((window) => ({
      startAt: toUtcIsoTimestamp(window.startAt) ?? window.startAt,
      endAt: toUtcIsoTimestamp(window.endAt) ?? window.endAt,
    })),
  };
}

export function getEventParticipationProgress(
  event: Event | undefined,
  now: string | number | Date = Date.now(),
): number {
  if (!event) {
    return 0;
  }

  const nowMs = parseRequiredTimestamp(now, 'current time');
  const windows = normalizeParticipationWindows(event.participationWindows);

  if (windows && windows.length > 0) {
    const totalMs = windows.reduce((sum, window) => sum + (window.endMs - window.startMs), 0);

    if (totalMs <= 0) {
      return 0;
    }

    const elapsedMs = windows.reduce((sum, window) => {
      if (nowMs <= window.startMs) {
        return sum;
      }

      return sum + Math.min(nowMs, window.endMs) - window.startMs;
    }, 0);

    return clamp(elapsedMs / totalMs, 0, 1);
  }

  if (!event.startAt || !event.endAt) {
    return 0;
  }

  const startMs = Date.parse(event.startAt);
  const endMs = Date.parse(event.endAt);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }

  return clamp((nowMs - startMs) / (endMs - startMs), 0, 1);
}

function getWindowedParticipationDecision(
  windows: NormalizedParticipationWindow[],
  nowMs: number,
): EventParticipationDecision {
  const currentWindow = windows.find((window) => window.startMs <= nowMs && nowMs < window.endMs);

  if (currentWindow) {
    return { code: 'ALLOWED', nextBoundaryAt: currentWindow.endAt };
  }

  const nextWindow = windows.find((window) => nowMs < window.startMs);

  if (nextWindow) {
    return { code: 'EVENT_NOT_STARTED', nextBoundaryAt: nextWindow.startAt };
  }

  return { code: 'EVENT_ENDED' };
}

type NormalizedParticipationWindow = EventParticipationWindow & {
  startMs: number;
  endMs: number;
};

function normalizeParticipationWindows(
  windows: readonly EventParticipationWindow[] | undefined,
): NormalizedParticipationWindow[] | undefined {
  if (!windows) {
    return undefined;
  }

  const normalized = windows.map((window) => {
    const startMs = Date.parse(window.startAt);
    const endMs = Date.parse(window.endAt);

    return {
      ...window,
      startMs,
      endMs,
    };
  });

  if (normalized.some((window) => !Number.isFinite(window.startMs) || !Number.isFinite(window.endMs))) {
    return undefined;
  }

  if (normalized.some((window) => window.endMs <= window.startMs)) {
    return undefined;
  }

  return normalized.sort((left, right) => left.startMs - right.startMs);
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
