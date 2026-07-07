import { describe, expect, it } from 'vitest';

import { calculatePrizePacing } from './prizePacing';
import type { DrawRecord, Event, Prize } from './types';

const event: Event = {
  id: 'event-1',
  name: 'Expo',
  code: 'QD-2026',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
  startAt: '2026-07-06T09:00:00.000Z',
  endAt: '2026-07-06T17:00:00.000Z',
};

const prize: Prize = {
  id: 'prize-1',
  name: '一等奖',
  shortName: '一等奖',
  level: 1,
  inventoryTotal: 4,
  inventoryRemaining: 4,
  weight: 2,
  enabled: true,
};

const record: DrawRecord = {
  id: 'record-1',
  eventId: event.id,
  sessionId: 'session-1',
  prizeId: prize.id,
  prizeNameSnapshot: prize.name,
  createdAt: '2026-07-06T10:00:00.000Z',
  committedAt: '2026-07-06T10:00:00.000Z',
  redeemed: false,
  status: 'COMMITTED',
};

describe('prize pacing domain', () => {
  it('keeps fixed mode equal to base weight', () => {
    const snapshot = calculatePrizePacing({
      prize,
      event,
      records: [],
      now: () => '2026-07-06T13:00:00+08:00',
    });

    expect(snapshot).toMatchObject({
      status: 'FIXED',
      multiplier: 1,
      effectiveWeight: 2,
    });
  });

  it('locks time release prizes before the next release point', () => {
    const snapshot = calculatePrizePacing({
      prize: {
        ...prize,
        probabilityMode: 'TIME_RELEASE',
        pacing: { releaseSchedule: [{ time: '00:00', maxCumulativeWins: 0 }] },
      },
      event,
      records: [],
      now: () => '2026-07-06T13:00:00.000Z',
    });

    expect(snapshot.status).toBe('LOCKED');
    expect(snapshot.effectiveWeight).toBe(0);
    expect(snapshot.nextReleaseAt).toBeUndefined();
  });

  it('uses smart pacing to increase effective weight when behind pace', () => {
    const snapshot = calculatePrizePacing({
      prize: {
        ...prize,
        probabilityMode: 'SMART_PACING',
        pacing: { minMultiplier: 0.2, maxMultiplier: 3, sensitivity: 0.5 },
      },
      event,
      records: [record],
      now: () => '2026-07-06T15:00:00.000Z',
    });

    expect(snapshot.status).toBe('BEHIND');
    expect(snapshot.effectiveWeight).toBeGreaterThan(prize.weight);
  });
});
