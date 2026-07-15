import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listPrizes } from '../../db/adminRepository';
import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { seedEvent, seedPrizes } from '../../db/drawRepository';
import type { Event, Prize } from '../../domain/draw/types';
import { ensureDemoSeed } from './displayBootstrap';

describe('ensureDemoSeed', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-bootstrap-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('seeds the confirmed default event and prize pool when no active event exists', async () => {
    await ensureDemoSeed(db);

    const events = await db.events.toArray();
    const prizes = await listPrizes(db);
    const byName = new Map(prizes.map((prize) => [prize.name, prize]));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      code: 'SIGNAL-HUNT-20260715-16',
      status: 'ACTIVE',
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
    });

    expect([...byName.keys()].sort()).toEqual(['一等奖', '三等奖', '二等奖', '谢谢参与']);
    expect(byName.get('一等奖')).toMatchObject({ level: 1, inventoryTotal: 6, weight: 2 });
    expect(byName.get('二等奖')).toMatchObject({ level: 2, inventoryTotal: 30, weight: 10 });
    expect(byName.get('三等奖')).toMatchObject({ level: 3, inventoryTotal: 120, weight: 120 });
    expect(byName.get('谢谢参与')).toMatchObject({
      level: 99,
      inventoryTotal: 1344,
      weight: 868,
      probabilityMode: 'FIXED',
    });
    expect(prizes.every((prize) => prize.inventoryRemaining === prize.inventoryTotal)).toBe(true);
    expect(['一等奖', '二等奖', '三等奖'].every((name) => byName.get(name)?.probabilityMode === 'SMART_PACING')).toBe(true);
  });

  it('does not overwrite prizes when an active event already exists', async () => {
    const event: Event = {
      id: 'event-custom',
      name: 'Custom Event',
      code: 'CUSTOM',
      status: 'ACTIVE',
      createdAt: '2026-07-06T00:00:00.000Z',
    };
    const customPrize: Prize = {
      id: 'prize-custom',
      name: 'Custom Prize',
      shortName: 'Custom',
      level: 1,
      inventoryTotal: 7,
      inventoryRemaining: 7,
      weight: 1,
      enabled: true,
    };

    await seedEvent(db, event);
    await seedPrizes(db, [customPrize]);

    await ensureDemoSeed(db);

    const prizes = await listPrizes(db);
    expect(prizes).toHaveLength(1);
    expect(prizes[0]).toMatchObject({ id: 'prize-custom', name: 'Custom Prize' });
  });
});
