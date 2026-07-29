import 'fake-indexeddb/auto';

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createSignalHuntDatabase,
  type SignalHuntDatabase,
} from '../../db/database';
import { AdminRecordsPage } from './AdminRecordsPage';

describe('AdminRecordsPage', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`records-page-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  it('shows an explicit empty state', async () => {
    renderPage();
    expect(await screen.findByText('暂无匹配记录')).toBeInTheDocument();
  });

  it('renders records in the table and filters by terminal status', async () => {
    await db.prizes.put({
      id: 'prize-1',
      name: '一等奖',
      shortName: '一等',
      level: 1,
      inventoryTotal: 2,
      inventoryRemaining: 1,
      weight: 1,
      enabled: true,
    });
    await db.drawRecords.bulkPut([
      {
        id: 'record-1',
        eventId: 'event-1',
        sessionId: 'session-1',
        prizeId: 'prize-1',
        prizeNameSnapshot: '一等奖',
        createdAt: '2026-07-29T08:00:00.000Z',
        committedAt: '2026-07-29T08:00:00.000Z',
        redeemed: true,
        redeemedAt: '2026-07-29T08:01:00.000Z',
        status: 'REDEEMED',
      },
      {
        id: 'record-2',
        eventId: 'event-1',
        sessionId: 'session-2',
        prizeId: 'prize-1',
        prizeNameSnapshot: '一等奖',
        createdAt: '2026-07-29T09:00:00.000Z',
        committedAt: '2026-07-29T09:00:00.000Z',
        redeemed: false,
        status: 'COMMITTED',
      },
    ]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('region', { name: '抽奖记录表格' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('记录状态'), 'REDEEMED');
    expect(screen.getByText('共 1 条')).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: '抽奖记录表格' }),
      ).getAllByText('已兑奖'),
    ).toHaveLength(2);
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/admin/records']}>
        <AdminRecordsPage db={db} />
      </MemoryRouter>,
    );
  }
});
