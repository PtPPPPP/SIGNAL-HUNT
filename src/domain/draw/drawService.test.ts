import { describe, expect, it } from 'vitest';

import {
  commitDraw,
  createSeededSecureRandom,
  getActivePrizePool,
  selectWeightedPrize,
} from './drawService';
import type { Event, Prize } from './types';

const activeEvent: Event = {
  id: 'event-1',
  name: 'SIGNAL HUNT Demo',
  code: 'SIGNAL-HUNT-DEMO',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

function createPrize(overrides: Partial<Prize> = {}): Prize {
  return {
    id: 'prize-1',
    name: '一等奖',
    shortName: '一等奖',
    level: 1,
    inventoryTotal: 3,
    inventoryRemaining: 3,
    weight: 10,
    enabled: true,
    ...overrides,
  };
}

describe('draw domain service', () => {
  it('keeps only enabled prizes with remaining inventory and positive weight', () => {
    const prizes = [
      createPrize({ id: 'active' }),
      createPrize({ id: 'empty', inventoryRemaining: 0 }),
      createPrize({ id: 'disabled', enabled: false }),
      createPrize({ id: 'zero-weight', weight: 0 }),
    ];

    const pool = getActivePrizePool(prizes);

    expect(pool.map((prize) => prize.id)).toEqual(['active']);
  });

  it('selects a weighted prize using secure random boundaries', () => {
    const prizes = [
      createPrize({ id: 'first', weight: 2 }),
      createPrize({ id: 'second', weight: 3 }),
    ];

    const first = selectWeightedPrize(prizes, () => 0);
    const second = selectWeightedPrize(prizes, () => 0.999999);

    expect(first.id).toBe('first');
    expect(second.id).toBe('second');
  });

  it('excludes a pacing-locked prize from the active draw pool', () => {
    const prizes = [
      createPrize({
        id: 'locked',
        probabilityMode: 'TIME_RELEASE',
        pacing: { releaseSchedule: [{ time: '14:00', maxCumulativeWins: 1 }] },
      }),
      createPrize({ id: 'available' }),
    ];

    const pool = getActivePrizePool(prizes, {
      event: activeEvent,
      now: () => '2026-07-06T13:00:00+08:00',
    });

    expect(pool.map((prize) => prize.id)).toEqual(['available']);
  });

  it('creates normalized random values from secure random integers', () => {
    const secureRandom = createSeededSecureRandom(() => 0xffffffff);

    expect(secureRandom()).toBeLessThan(1);
    expect(secureRandom()).toBeGreaterThanOrEqual(0);
  });

  it('commits one draw record and decrements inventory once', () => {
    const prizes = [
      createPrize({ id: 'first', inventoryRemaining: 2, weight: 1 }),
      createPrize({ id: 'second', inventoryRemaining: 2, weight: 1 }),
    ];

    const committed = commitDraw({
      event: activeEvent,
      prizes,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    expect(committed.record).toMatchObject({
      id: 'record-fixed',
      eventId: activeEvent.id,
      sessionId: 'session-fixed',
      prizeId: 'first',
      prizeNameSnapshot: '一等奖',
      status: 'COMMITTED',
      redeemed: false,
    });
    expect(committed.prizes.find((prize) => prize.id === 'first')?.inventoryRemaining).toBe(1);
    expect(committed.prizes.find((prize) => prize.id === 'second')?.inventoryRemaining).toBe(2);
  });

  it('rejects draw commits when no active prize is available', () => {
    expect(() =>
      commitDraw({
        event: activeEvent,
        prizes: [createPrize({ inventoryRemaining: 0 })],
        now: () => '2026-07-06T01:00:00.000Z',
        random: () => 0,
        createId: (prefix) => `${prefix}-fixed`,
      }),
    ).toThrow('No active prize is available.');
  });

  it('rejects draw commits with the stable paused-event code', () => {
    expect.assertions(1);
    try {
      commitDraw({
        event: { ...activeEvent, status: 'PAUSED' },
        prizes: [createPrize()],
        now: () => '2026-07-06T01:00:00.000Z',
        random: () => 0,
        createId: (prefix) => `${prefix}-fixed`,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: 'EVENT_PAUSED' });
    }
  });
});
