import { getConfiguredActiveEvent, seedEvent, seedPrizes } from '../../db/drawRepository';
import type { SignalHuntDatabase } from '../../db/database';
import type { Event, Prize } from '../../domain/draw/types';

const DEMO_EVENT: Event = {
  id: 'event-demo',
  name: 'SIGNAL HUNT Demo',
  code: 'SIGNAL-HUNT-DEMO',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

function createDemoPrizes(): Prize[] {
  const specs: Array<Omit<Prize, 'id'> & { idPrefix: string }> = [
    {
      idPrefix: 'demo-first',
      name: '一等奖',
      shortName: '一等奖',
      level: 1,
      inventoryTotal: 1,
      inventoryRemaining: 1,
      weight: 5,
      enabled: true,
    },
    {
      idPrefix: 'demo-second',
      name: '二等奖',
      shortName: '二等奖',
      level: 2,
      inventoryTotal: 5,
      inventoryRemaining: 5,
      weight: 25,
      enabled: true,
    },
    {
      idPrefix: 'demo-third',
      name: '三等奖',
      shortName: '三等奖',
      level: 3,
      inventoryTotal: 20,
      inventoryRemaining: 20,
      weight: 70,
      enabled: true,
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

/**
 * Whether the demo seed may auto-create a demo event + prizes.
 *
 * - `VITE_ENABLE_DEMO_SEED='true'`  → always allowed (use to test a prod build locally).
 * - `VITE_ENABLE_DEMO_SEED='false'` → never allowed, even in dev/test (exercises the
 *   empty-database "no event configured" path).
 * - unset                         → allowed in dev/test, forbidden in production builds.
 *
 * Production kiosks must NEVER silently fabricate demo prizes for a real exhibition,
 * so the production default is off. Operators are expected to create/import the real
 * event via /admin/event and /admin/prizes.
 */
export function isDemoSeedEnabled(): boolean {
  const flag = import.meta.env.VITE_ENABLE_DEMO_SEED;

  if (flag === 'true') {
    return true;
  }

  if (flag === 'false') {
    return false;
  }

  return import.meta.env.DEV;
}

/**
 * Ensures the kiosk has an active event with a prize pool to draw from — but ONLY
 * when demo seeding is enabled (see isDemoSeedEnabled). Seeds a demo event + prizes
 * only when no ACTIVE event exists yet, so it never overwrites data an operator has
 * imported through the admin tools. In production this is a no-op.
 */
export async function ensureDemoSeed(db: SignalHuntDatabase): Promise<void> {
  if (!isDemoSeedEnabled()) {
    return;
  }

  const activeEvent = await getConfiguredActiveEvent(db);

  if (activeEvent) {
    return;
  }

  await seedEvent(db, DEMO_EVENT);
  await seedPrizes(db, createDemoPrizes());
}
