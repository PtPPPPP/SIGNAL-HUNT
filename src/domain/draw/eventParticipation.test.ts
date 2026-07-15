import { describe, expect, it } from 'vitest';

import {
  EventParticipationError,
  assertEventParticipationAllowed,
  getEventParticipationProgress,
  getEventParticipationDecision,
  toUtcIsoTimestamp,
} from './eventParticipation';
import type { Event } from './types';

const event: Event = {
  id: 'event-1',
  name: '边界活动',
  code: 'BOUNDARY',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
  startAt: '2026-07-06T01:00:00.000Z',
  endAt: '2026-07-06T09:00:00.000Z',
};

describe('event participation decision', () => {
  it.each([
    ['start minus 1 ms', '2026-07-06T00:59:59.999Z', 'EVENT_NOT_STARTED'],
    ['exact start', '2026-07-06T01:00:00.000Z', 'ALLOWED'],
    ['end minus 1 ms', '2026-07-06T08:59:59.999Z', 'ALLOWED'],
    ['exact end', '2026-07-06T09:00:00.000Z', 'EVENT_ENDED'],
  ] as const)('uses a half-open activity window at %s', (_label, now, expected) => {
    expect(getEventParticipationDecision(event, now).code).toBe(expected);
  });

  it.each([
    ['DRAFT', 'EVENT_INACTIVE'],
    ['PAUSED', 'EVENT_PAUSED'],
    ['ENDED', 'EVENT_ENDED'],
  ] as const)('blocks the %s lifecycle status', (status, expected) => {
    expect(getEventParticipationDecision({ ...event, status }, event.startAt!).code).toBe(expected);
  });

  it('throws a stable error code for callers that must stop a real draw', () => {
    expect(() => assertEventParticipationAllowed(event, '2026-07-06T00:59:59.999Z')).toThrow(
      EventParticipationError,
    );

    try {
      assertEventParticipationAllowed(event, '2026-07-06T00:59:59.999Z');
    } catch (error) {
      expect(error).toMatchObject({ code: 'EVENT_NOT_STARTED' });
    }
  });

  it('treats an inverted legacy activity window as inactive', () => {
    expect(
      getEventParticipationDecision({ ...event, startAt: event.endAt, endAt: event.startAt }, event.startAt!).code,
    ).toBe('EVENT_INACTIVE');
  });

  it('canonicalizes offset and datetime-local values to UTC ISO storage', () => {
    expect(toUtcIsoTimestamp('2026-07-06T10:00:00+08:00')).toBe('2026-07-06T02:00:00.000Z');
    expect(toUtcIsoTimestamp('2026-07-06T10:00')).toBe(new Date('2026-07-06T10:00').toISOString());
  });

  it('allows participation only inside configured daily windows', () => {
    const windowedEvent: Event = {
      ...event,
      startAt: '2026-07-15T01:00:00.000Z',
      endAt: '2026-07-16T09:00:00.000Z',
      participationWindows: [
        { startAt: '2026-07-15T01:00:00.000Z', endAt: '2026-07-15T09:00:00.000Z' },
        { startAt: '2026-07-16T01:00:00.000Z', endAt: '2026-07-16T09:00:00.000Z' },
      ],
    };

    expect(getEventParticipationDecision(windowedEvent, '2026-07-15T00:59:59.999Z')).toMatchObject({
      code: 'EVENT_NOT_STARTED',
      nextBoundaryAt: '2026-07-15T01:00:00.000Z',
    });
    expect(getEventParticipationDecision(windowedEvent, '2026-07-15T05:00:00.000Z')).toMatchObject({
      code: 'ALLOWED',
      nextBoundaryAt: '2026-07-15T09:00:00.000Z',
    });
    expect(getEventParticipationDecision(windowedEvent, '2026-07-15T09:00:00.000Z')).toMatchObject({
      code: 'EVENT_NOT_STARTED',
      nextBoundaryAt: '2026-07-16T01:00:00.000Z',
    });
    expect(getEventParticipationDecision(windowedEvent, '2026-07-16T01:00:00.000Z').code).toBe('ALLOWED');
    expect(getEventParticipationDecision(windowedEvent, '2026-07-16T09:00:00.000Z').code).toBe('EVENT_ENDED');
  });

  it('calculates progress from active participation windows only', () => {
    const windowedEvent: Event = {
      ...event,
      participationWindows: [
        { startAt: '2026-07-15T01:00:00.000Z', endAt: '2026-07-15T09:00:00.000Z' },
        { startAt: '2026-07-16T01:00:00.000Z', endAt: '2026-07-16T09:00:00.000Z' },
      ],
    };

    expect(getEventParticipationProgress(windowedEvent, '2026-07-15T09:00:00.000Z')).toBe(0.5);
    expect(getEventParticipationProgress(windowedEvent, '2026-07-15T17:00:00.000Z')).toBe(0.5);
    expect(getEventParticipationProgress(windowedEvent, '2026-07-16T09:00:00.000Z')).toBe(1);
  });
});
