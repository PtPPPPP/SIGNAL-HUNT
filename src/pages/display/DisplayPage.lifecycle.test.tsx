import 'fake-indexeddb/auto';

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { commitPersistentDraw, recoverCommittedDraw, seedEvent, seedPrizes } from '../../db/drawRepository';
import { pauseEvent } from '../../db/eventRepository';
import type { Event, Prize } from '../../domain/draw/types';
import { DisplayPage } from './DisplayPage';

const event: Event = {
  id: 'event-1',
  name: 'SIGNAL HUNT Demo',
  code: 'SIGNAL-HUNT-DEMO',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

function prize(overrides: Partial<Prize> = {}): Prize {
  return {
    id: 'prize-1',
    name: '一等奖',
    shortName: '一等奖',
    level: 1,
    inventoryTotal: 3,
    inventoryRemaining: 3,
    weight: 1,
    enabled: true,
    ...overrides,
  };
}

describe('DisplayPage event-status lifecycle (production mode, demo seed disabled)', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-lifecycle-${crypto.randomUUID()}`);
    await db.open();
    vi.stubEnv('VITE_ENABLE_DEMO_SEED', 'false');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.delete();
  });

  it('shows the not-configured panel when the database is empty', async () => {
    render(<DisplayPage db={db} />);

    expect(await screen.findByRole('heading', { name: /尚未配置活动/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /触碰屏幕/ })).not.toBeInTheDocument();
  });

  it('enters PAUSED when the only event is paused, and never offers a draw', async () => {
    await seedEvent(db, { ...event, status: 'PAUSED' });
    await seedPrizes(db, [prize()]);

    render(<DisplayPage db={db} />);

    expect(await screen.findByRole('heading', { name: /系统已暂停/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /触碰屏幕/ })).not.toBeInTheDocument();
  });

  it('preserves a committed draw session while its event is paused (still recoverable)', async () => {
    // Realistic flow: commit while ACTIVE, THEN staff pause the event.
    await seedEvent(db, { ...event, status: 'ACTIVE' });
    await seedPrizes(db, [prize({ id: 'first', inventoryRemaining: 2 })]);

    await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    await pauseEvent(db, event.id);

    render(<DisplayPage db={db} />);

    expect(await screen.findByRole('heading', { name: /系统已暂停/ })).toBeInTheDocument();

    // The committed session must remain recoverable even though the kiosk is paused.
    await expect(recoverCommittedDraw(db, event.id)).resolves.toMatchObject({
      record: { id: 'record-fixed' },
    });
  });

  it('shows the ended panel when only ENDED events exist', async () => {
    await seedEvent(db, { ...event, id: 'ended-event', status: 'ENDED' });

    render(<DisplayPage db={db} />);

    expect(await screen.findByRole('heading', { name: /活动已结束/ })).toBeInTheDocument();
  });
});
