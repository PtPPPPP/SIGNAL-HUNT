import 'fake-indexeddb/auto';

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import {
  clearActiveDrawSession,
  commitPersistentDraw,
  seedEvent,
  seedPrizes,
} from '../../db/drawRepository';
import type { Event, Prize } from '../../domain/draw/types';
import { DisplayPage } from './DisplayPage';

const prize: Prize = {
  id: 'prize-1',
  name: '一等奖',
  shortName: '一等',
  level: 1,
  inventoryTotal: 2,
  inventoryRemaining: 2,
  weight: 1,
  enabled: true,
};

describe('DisplayPage activity window', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    vi.stubEnv('VITE_ENABLE_DEMO_SEED', 'false');
    db = createSignalHuntDatabase(`signal-hunt-display-window-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    await db.delete();
  });

  it('shows the configured start time and no draw entry before the event starts', async () => {
    const startAt = '2026-07-06T01:00:00.000Z';
    await seedTimedEvent(db, startAt, '2026-07-06T09:00:00.000Z');

    render(<DisplayPage db={db} now={() => Date.parse('2026-07-06T00:59:59.999Z')} />);

    expect(await screen.findByRole('heading', { name: '活动尚未开始' })).toBeInTheDocument();
    expect(screen.getByText(/开始时间：/)).toBeInTheDocument();
    expect(screen.getByText(/距离开始还有/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /点亮好运/ })).not.toBeInTheDocument();
  });

  it('automatically removes a stale draw entry when an open page crosses the end boundary', async () => {
    const startTime = Date.now() - 60_000;
    const endTime = Date.now() + 1_000;
    await seedTimedEvent(db, new Date(startTime).toISOString(), new Date(endTime).toISOString());

    render(<DisplayPage db={db} />);
    expect(await screen.findByRole('button', { name: /点亮好运/ })).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    });
    expect(await screen.findByRole('heading', { name: '活动已结束' }, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /点亮好运/ })).not.toBeInTheDocument();
    await expect(db.drawRecords.count()).resolves.toBe(0);
    await expect(db.prizes.get(prize.id)).resolves.toMatchObject({ inventoryRemaining: 2 });
  });

  it('shows the ended panel when a result held past closing is cleared', async () => {
    const startTime = Date.now() - 60_000;
    const endTime = Date.now() + 1_000;
    await seedTimedEvent(db, new Date(startTime).toISOString(), new Date(endTime).toISOString());
    await commitPersistentDraw(db, {
      eventId: 'event-timed',
      now: () => new Date(startTime + 1_000).toISOString(),
      random: () => 0,
      createId: (prefix) => `${prefix}-held-result`,
    });

    render(<DisplayPage db={db} />);
    expect(await screen.findByText('一等奖')).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      await clearActiveDrawSession(db, 'event-timed');
    });

    expect(await screen.findByRole('heading', { name: '活动已结束' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /点亮好运/ })).not.toBeInTheDocument();
  });
});

async function seedTimedEvent(db: SignalHuntDatabase, startAt: string, endAt: string): Promise<void> {
  const event: Event = {
    id: 'event-timed',
    name: '限时活动',
    code: 'TIMED',
    status: 'ACTIVE',
    createdAt: '2026-07-06T00:00:00.000Z',
    startAt,
    endAt,
  };

  await seedEvent(db, event);
  await seedPrizes(db, [prize]);
}
