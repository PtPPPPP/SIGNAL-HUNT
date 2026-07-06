import { getActiveEvent, seedEvent, seedPrizes } from '../../db/drawRepository';
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
      weight: 1,
      enabled: true,
    },
    {
      idPrefix: 'demo-second',
      name: '二等奖',
      shortName: '二等奖',
      level: 2,
      inventoryTotal: 5,
      inventoryRemaining: 5,
      weight: 4,
      enabled: true,
    },
    {
      idPrefix: 'demo-third',
      name: '三等奖',
      shortName: '三等奖',
      level: 3,
      inventoryTotal: 20,
      inventoryRemaining: 20,
      weight: 9,
      enabled: true,
    },
    {
      idPrefix: 'demo-thanks',
      name: '谢谢参与',
      shortName: '谢谢参与',
      level: 9,
      inventoryTotal: 999,
      inventoryRemaining: 999,
      weight: 86,
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
 * Ensures the kiosk has an active event with a prize pool to draw from.
 *
 * Seeds a demo event + prizes only when no ACTIVE event exists yet, so it never
 * overwrites data an operator has imported through the admin tools. Remove once
 * event management exists in the admin UI.
 */
export async function ensureDemoSeed(db: SignalHuntDatabase): Promise<void> {
  const activeEvent = await getActiveEvent(db);

  if (activeEvent) {
    return;
  }

  await seedEvent(db, DEMO_EVENT);
  await seedPrizes(db, createDemoPrizes());
}
