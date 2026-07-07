import 'fake-indexeddb/auto';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { commitPersistentDraw, seedEvent, seedPrizes } from '../../db/drawRepository';
import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { Event, Prize } from '../../domain/draw/types';
import { StaffPage } from './StaffPage';

const event: Event = {
  id: 'event-1',
  name: 'SIGNAL HUNT Demo',
  code: 'SIGNAL-HUNT-DEMO',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

const prize: Prize = {
  id: 'first',
  name: '一等奖',
  shortName: '一等奖',
  level: 1,
  inventoryTotal: 2,
  inventoryRemaining: 2,
  weight: 1,
  enabled: true,
};

describe('StaffPage', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-staff-page-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('shows active draw details and redeems the prize without ending display', async () => {
    const user = userEvent.setup();
    await seedEvent(db, event);
    await seedPrizes(db, [prize]);
    const committed = await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    render(<StaffPage db={db} />);

    expect(await screen.findByText(committed.record.id)).toBeInTheDocument();
    expect(screen.getByText('一等奖')).toBeInTheDocument();
    expect(screen.getByText('展示中')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认兑奖' }));

    expect(await screen.findByText(/兑奖成功/)).toBeInTheDocument();
    expect(await screen.findByText(/完成兑奖/)).toBeInTheDocument();
    await expect(db.drawSessions.count()).resolves.toBe(1);
  });

  it('shows an explicit duplicate redemption message', async () => {
    const user = userEvent.setup();
    await seedEvent(db, event);
    await seedPrizes(db, [prize]);
    await commitPersistentDraw(db, {
      eventId: event.id,
      now: () => '2026-07-06T01:00:00.000Z',
      random: () => 0,
      createId: (prefix) => `${prefix}-fixed`,
    });

    render(<StaffPage db={db} />);

    await user.click(await screen.findByRole('button', { name: '确认兑奖' }));
    await user.click(screen.getByRole('button', { name: '确认兑奖' }));

    expect(await screen.findByText(/该奖项已经完成兑奖/)).toBeInTheDocument();
    await waitFor(async () => {
      await expect(db.drawRecords.toArray()).resolves.toHaveLength(1);
    });
  });
});
