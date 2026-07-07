import 'fake-indexeddb/auto';

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { seedEvent, seedPrizes } from '../../db/drawRepository';
import type { Event, Prize } from '../../domain/draw/types';
import { AdminDashboardPage } from './AdminDashboardPage';

const event: Event = {
  id: 'event-1',
  name: 'Quantum Materials Expo 2026',
  code: 'QD-2026',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

const prizes: Prize[] = [
  {
    id: 'first',
    name: '一等奖',
    shortName: '一等奖',
    level: 1,
    inventoryTotal: 5,
    inventoryRemaining: 2,
    weight: 5,
    enabled: true,
  },
  {
    id: 'second',
    name: '二等奖',
    shortName: '二等奖',
    level: 2,
    inventoryTotal: 20,
    inventoryRemaining: 7,
    weight: 25,
    enabled: true,
  },
];

describe('AdminDashboardPage', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-dashboard-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('displays real remaining inventory from IndexedDB prizes', async () => {
    await seedEvent(db, event);
    await seedPrizes(db, prizes);

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminDashboardPage db={db} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('剩余库存')).toBeInTheDocument();
    expect(await screen.findByText('9')).toBeInTheDocument();
    expect(await screen.findByText('2 / 5 Remaining')).toBeInTheDocument();
    expect(await screen.findByText('7 / 20 Remaining')).toBeInTheDocument();
  });
});
