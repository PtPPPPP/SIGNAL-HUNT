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

  it('seeds only 一等奖 / 二等奖 / 三等奖 with 5 / 25 / 70 weights when no active event exists', async () => {
    await ensureDemoSeed(db);

    const prizes = await listPrizes(db);
    const byName = new Map(prizes.map((prize) => [prize.name, prize]));

    expect([...byName.keys()].sort()).toEqual(['一等奖', '三等奖', '二等奖']);

    expect(byName.get('一等奖')).toMatchObject({
      level: 1,
      inventoryTotal: 1,
      inventoryRemaining: 1,
      weight: 5,
      enabled: true,
    });
    expect(byName.get('二等奖')).toMatchObject({
      level: 2,
      inventoryTotal: 5,
      inventoryRemaining: 5,
      weight: 25,
      enabled: true,
    });
    expect(byName.get('三等奖')).toMatchObject({
      level: 3,
      inventoryTotal: 20,
      inventoryRemaining: 20,
      weight: 70,
      enabled: true,
    });
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
      name: '自定义奖',
      shortName: '自定义',
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
    expect(prizes[0]).toMatchObject({ id: 'prize-custom', name: '自定义奖' });
  });
});
