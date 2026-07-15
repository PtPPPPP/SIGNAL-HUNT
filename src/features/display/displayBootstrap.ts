import { normalizeLegacyPrizeLabels } from '../../db/adminRepository';
import { getConfiguredActiveEvent, seedEvent, seedPrizes } from '../../db/drawRepository';
import type { SignalHuntDatabase } from '../../db/database';
import type { Event, Prize } from '../../domain/draw/types';

const DEFAULT_EVENT: Event = {
  id: 'event-default-20260715-16',
  name: 'SIGNAL HUNT 抽奖活动',
  code: 'SIGNAL-HUNT-20260715-16',
  status: 'ACTIVE',
  createdAt: '2026-07-14T00:00:00.000Z',
  startAt: '2026-07-15T01:00:00.000Z',
  endAt: '2026-07-16T09:00:00.000Z',
  participationWindows: [
    {
      startAt: '2026-07-15T01:00:00.000Z',
      endAt: '2026-07-15T09:00:00.000Z',
    },
    {
      startAt: '2026-07-16T01:00:00.000Z',
      endAt: '2026-07-16T09:00:00.000Z',
    },
  ],
};

export function createDefaultPrizePool(): Prize[] {
  const specs: Array<Omit<Prize, 'id'> & { idPrefix: string }> = [
    {
      idPrefix: 'default-first',
      name: '一等奖',
      shortName: '一等奖',
      level: 1,
      inventoryTotal: 6,
      inventoryRemaining: 6,
      weight: 2,
      enabled: true,
      probabilityMode: 'SMART_PACING',
      pacing: createDefaultPacingConfig(),
    },
    {
      idPrefix: 'default-second',
      name: '二等奖',
      shortName: '二等奖',
      level: 2,
      inventoryTotal: 30,
      inventoryRemaining: 30,
      weight: 10,
      enabled: true,
      probabilityMode: 'SMART_PACING',
      pacing: createDefaultPacingConfig(),
    },
    {
      idPrefix: 'default-third',
      name: '三等奖',
      shortName: '三等奖',
      level: 3,
      inventoryTotal: 120,
      inventoryRemaining: 120,
      weight: 120,
      enabled: true,
      probabilityMode: 'SMART_PACING',
      pacing: createDefaultPacingConfig(),
    },
    {
      idPrefix: 'default-thanks',
      name: '谢谢参与',
      shortName: '谢谢参与',
      level: 99,
      inventoryTotal: 1344,
      inventoryRemaining: 1344,
      weight: 868,
      enabled: true,
      probabilityMode: 'FIXED',
    },
  ];

  return specs.map((spec) => {
    const { idPrefix, ...rest } = spec;

    return {
      id: `${idPrefix}-${crypto.randomUUID()}`,
      ...rest,
    };
  });
}

function createDefaultPacingConfig(): NonNullable<Prize['pacing']> {
  return {
    minMultiplier: 0.05,
    maxMultiplier: 8,
    sensitivity: 0.75,
    catchUpEnabled: true,
    catchUpStartBeforeEndMinutes: 60,
    catchUpMaxMultiplier: 20,
  };
}

/**
 * Whether the packaged default seed may auto-create the confirmed event + prizes.
 *
 * - `VITE_ENABLE_DEMO_SEED='true'`  -> always allowed.
 * - `VITE_ENABLE_DEMO_SEED='false'` -> never allowed.
 * - unset                           -> allowed, including packaged builds.
 *
 * Existing operator data is never overwritten.
 */
export function isDemoSeedEnabled(): boolean {
  const flag = import.meta.env.VITE_ENABLE_DEMO_SEED;

  if (flag === 'true') {
    return true;
  }

  if (flag === 'false') {
    return false;
  }

  return true;
}

/**
 * Ensures the kiosk has an active event with a prize pool to draw from. Seeds the
 * confirmed default only when no ACTIVE event exists yet.
 */
export async function ensureDemoSeed(db: SignalHuntDatabase): Promise<void> {
  if (!isDemoSeedEnabled()) {
    return;
  }

  await normalizeLegacyPrizeLabels(db);

  const activeEvent = await getConfiguredActiveEvent(db);

  if (activeEvent) {
    return;
  }

  await seedEvent(db, DEFAULT_EVENT);
  await seedPrizes(db, createDefaultPrizePool());
}
