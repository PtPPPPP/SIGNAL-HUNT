import 'fake-indexeddb/auto';

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  commitPersistentDraw,
  seedEvent,
  seedPrizes,
} from '../../db/drawRepository';
import {
  createSignalHuntDatabase,
  type SignalHuntDatabase,
} from '../../db/database';
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
    db = createSignalHuntDatabase(`staff-page-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  it('shows the empty state when there is no current result', async () => {
    renderPage();
    expect(await screen.findByText('当前没有待处理结果')).toBeInTheDocument();
  });

  it('shows a pending result with its primary action enabled', async () => {
    await commitDraw();
    renderPage();

    expect(await screen.findByText('测试奖品')).toBeInTheDocument();
    expect(screen.getByText('等待工作人员处理')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '确认兑奖' }),
    ).toBeEnabled();
  });

  it('locks invalid actions for a redeemed result', async () => {
    const committed = await commitDraw();
    await db.drawRecords.update(committed.record.id, {
      status: 'REDEEMED',
      redeemed: true,
      redeemedAt: '2026-07-29T08:00:00.000Z',
    });
    renderPage();

    expect(await screen.findByText('兑奖已完成')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认兑奖' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '作废记录' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '结束当前展示' }),
    ).toBeEnabled();
  });

  it('shows a voided result and its reason as a locked terminal state', async () => {
    const committed = await commitDraw();
    await db.drawRecords.update(committed.record.id, {
      status: 'VOIDED',
      voidReason: '现场误触',
      voidedAt: '2026-07-29T08:00:00.000Z',
    });
    renderPage();

    expect(await screen.findByText('记录已锁定')).toBeInTheDocument();
    expect(screen.getByText('作废原因：现场误触')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认兑奖' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '作废记录' })).toBeDisabled();
  });

  it('redeems a result only after confirmation', async () => {
    const committed = await commitDraw();
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('测试奖品');
    await user.click(screen.getByRole('button', { name: '确认兑奖' }));
    const dialog = screen.getByRole('dialog', {
      name: '确认已完成兑奖？',
    });
    await user.click(within(dialog).getByRole('button', { name: '确认兑奖' }));

    expect(await screen.findByText('已确认兑奖。')).toBeInTheDocument();
    await expect(db.drawRecords.get(committed.record.id)).resolves.toMatchObject(
      { status: 'REDEEMED', redeemed: true },
    );
  });

  it('requires a valid reason in the void dialog', async () => {
    const user = userEvent.setup();
    await commitDraw();
    renderPage();

    await screen.findByText('测试奖品');
    await user.click(screen.getByRole('button', { name: '作废记录' }));
    const dialog = screen.getByRole('alertdialog', {
      name: '确认作废当前记录',
    });
    await user.click(within(dialog).getByRole('button', { name: '确认作废' }));
    expect(screen.getByText('请选择作废原因。')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('作废原因'), '其他');
    await user.click(within(dialog).getByRole('button', { name: '确认作废' }));
    expect(
      screen.getByText('选择“其他”时必须填写补充说明。'),
    ).toBeInTheDocument();
  });

  it('cancels voiding without changing the record', async () => {
    const committed = await commitDraw();
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('测试奖品');
    await user.click(screen.getByRole('button', { name: '作废记录' }));
    await user.selectOptions(screen.getByLabelText('作废原因'), '现场误触');
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(
      screen.queryByRole('alertdialog', { name: '确认作废当前记录' }),
    ).not.toBeInTheDocument();
    await expect(db.drawRecords.get(committed.record.id)).resolves.toMatchObject(
      { status: 'COMMITTED' },
    );
  });

  it('voids with a preset reason and prevents later redemption', async () => {
    const committed = await commitDraw();
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('测试奖品');
    await user.click(screen.getByRole('button', { name: '作废记录' }));
    await user.selectOptions(screen.getByLabelText('作废原因'), '现场误触');
    await user.click(screen.getByRole('button', { name: '确认作废' }));

    expect(
      await screen.findByText('结果已作废，当前展示已结束。'),
    ).toBeInTheDocument();
    await waitFor(async () => {
      await expect(db.drawRecords.get(committed.record.id)).resolves.toMatchObject(
        {
          status: 'VOIDED',
          redeemed: false,
          voidReason: '现场误触',
        },
      );
    });
    await expect(db.drawSessions.get(committed.session.id)).resolves.toBeUndefined();
    expect(await screen.findByText('当前没有待处理结果')).toBeInTheDocument();
  });

  it('ends only the display session after confirmation', async () => {
    const committed = await commitDraw();
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('测试奖品');
    await user.click(
      screen.getByRole('button', { name: '结束当前展示' }),
    );
    const dialog = screen.getByRole('dialog', { name: '结束当前展示？' });
    await user.click(within(dialog).getByRole('button', { name: '结束展示' }));

    expect(await screen.findByText('当前没有待处理结果')).toBeInTheDocument();
    await expect(db.drawSessions.get(committed.session.id)).resolves.toBeUndefined();
    await expect(db.drawRecords.get(committed.record.id)).resolves.toMatchObject(
      { status: 'COMMITTED' },
    );
  });

  it('shows explicit feedback when an operation fails', async () => {
    await commitDraw();
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('测试奖品');
    await user.click(screen.getByRole('button', { name: '确认兑奖' }));
    db.close();
    const dialog = screen.getByRole('dialog', {
      name: '确认已完成兑奖？',
    });
    await user.click(within(dialog).getByRole('button', { name: '确认兑奖' }));

    expect(await screen.findByText(/操作未完成：/)).toBeInTheDocument();
  });

  it('keeps the console structure at the smallest target viewport', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    });
    await commitDraw();
    renderPage();

    const prizeHeading = await screen.findByRole('heading', {
      name: '测试奖品',
    });
    expect(prizeHeading.closest('.staff-current-draw')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '确认兑奖' }).closest(
        '.ui-sticky-action-bar',
      ),
    ).toBeInTheDocument();
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
