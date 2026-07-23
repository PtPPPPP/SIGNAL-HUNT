import 'fake-indexeddb/auto';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { commitPersistentDraw, seedEvent, seedPrizes } from '../../db/drawRepository';
import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { Event, Prize } from '../../domain/draw/types';
import { StaffPage } from './StaffPage';

const event: Event = {
  id: 'staff-event',
  name: 'Staff Test',
  code: 'STAFF-TEST',
  status: 'ACTIVE',
  createdAt: '2026-07-15T00:00:00.000Z',
};

const prize: Prize = {
  id: 'staff-prize',
  name: '测试奖品',
  shortName: '测试奖品',
  level: 1,
  inventoryTotal: 2,
  inventoryRemaining: 2,
  weight: 1,
  enabled: true,
};

describe('StaffPage', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    db = createSignalHuntDatabase(`staff-page-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await db.delete();
  });

  it('redeems a result then ends only its display session', async () => {
    const committed = await commitDraw();
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('测试奖品');
    await user.click(screen.getByRole('button', { name: '确认兑奖' }));
    await screen.findByText('已确认兑奖。');
    await expect(db.drawRecords.get(committed.record.id)).resolves.toMatchObject({ status: 'REDEEMED', redeemed: true });

    await user.click(screen.getByRole('button', { name: '结束当前展示' }));
    await screen.findByText('当前没有待处理结果');
    await expect(db.drawSessions.get(committed.session.id)).resolves.toBeUndefined();
    await expect(db.drawRecords.get(committed.record.id)).resolves.toMatchObject({ status: 'REDEEMED', redeemed: true });
  });

  it('requires a reason before voiding and prevents a later redemption', async () => {
    const committed = await commitDraw();
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('测试奖品');
    await user.click(screen.getByRole('button', { name: '作废记录' }));
    expect(screen.getByText('操作未完成：请填写作废原因。')).toBeInTheDocument();

    await user.type(screen.getByLabelText('作废原因'), '现场误触');
    await user.click(screen.getByRole('button', { name: '作废记录' }));
    await screen.findByText('已作废当前记录，大屏将返回待机。');
    await waitFor(async () => {
      await expect(db.drawRecords.get(committed.record.id)).resolves.toMatchObject({
        status: 'VOIDED',
        redeemed: false,
        voidReason: '现场误触',
      });
    });
  });

  async function commitDraw() {
    await seedEvent(db, event);
    await seedPrizes(db, [prize]);
    return commitPersistentDraw(db, {
      eventId: event.id,
      random: () => 0,
      createId: (prefix) => `${prefix}-staff`,
    });
  }

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/staff']}>
        <StaffPage db={db} />
      </MemoryRouter>,
    );
  }
});
