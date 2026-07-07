import 'fake-indexeddb/auto';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listPrizes } from '../../db/adminRepository';
import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { seedEvent, seedPrizes } from '../../db/drawRepository';
import type { Event, Prize } from '../../domain/draw/types';
import { AdminPacingPage } from './AdminPacingPage';

const event: Event = {
  id: 'event-1',
  name: 'QD Expo',
  code: 'QD-2026',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
  startAt: '2026-07-06T09:00:00.000Z',
  endAt: '2026-07-06T17:00:00.000Z',
};

function prize(overrides: Partial<Prize> = {}): Prize {
  return {
    id: 'prize-first',
    name: '一等奖',
    shortName: '一等奖',
    level: 1,
    inventoryTotal: 5,
    inventoryRemaining: 5,
    weight: 1,
    enabled: true,
    ...overrides,
  };
}

describe('AdminPacingPage', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-pacing-page-test-${crypto.randomUUID()}`);
    await db.open();
    await seedEvent(db, event);
    await seedPrizes(db, [
      prize({ id: 'prize-first', name: '一等奖', shortName: '一等奖', level: 1, inventoryTotal: 5, inventoryRemaining: 5, weight: 1 }),
      prize({ id: 'prize-second', name: '二等奖', shortName: '二等奖', level: 2, inventoryTotal: 20, inventoryRemaining: 20, weight: 5 }),
      prize({ id: 'prize-third', name: '三等奖', shortName: '三等奖', level: 3, inventoryTotal: 80, inventoryRemaining: 80, weight: 15 }),
      prize({ id: 'prize-souvenir', name: '纪念奖', shortName: '纪念奖', level: 4, inventoryTotal: 395, inventoryRemaining: 395, weight: 79 }),
    ]);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('edits first prize probability as a percentage and saves it as real weight', async () => {
    const user = userEvent.setup();
    renderPage();

    fireEvent.change(await screen.findByLabelText('一等奖中奖概率'), { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: '自动平衡' }));
    await user.click(screen.getByRole('button', { name: '保存并应用' }));

    await waitFor(async () => {
      const saved = await listPrizes(db);
      expect(saved.find((item) => item.id === 'prize-first')?.weight).toBe(2);
      expect(saved.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    });
  });

  it('disables save and apply when total probability is not 100%', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('一等奖中奖概率'), { target: { value: '2' } });

    expect(screen.getAllByText('超出 1.0%').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '保存并应用' })).toBeDisabled();
  });

  it('auto balances total probability back to 100%', async () => {
    const user = userEvent.setup();
    renderPage();

    fireEvent.change(await screen.findByLabelText('一等奖中奖概率'), { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: '自动平衡' }));

    expect(screen.getAllByText('配置有效').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('一等奖中奖概率')).toHaveValue(2);
  });

  it('does not change a locked prize during auto balance', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '锁定 一等奖' }));
    fireEvent.change(screen.getByLabelText('二等奖中奖概率'), { target: { value: '10' } });
    await user.click(screen.getByRole('button', { name: '自动平衡' }));

    expect(screen.getByLabelText('一等奖中奖概率')).toHaveValue(1);
    expect(screen.getAllByText('配置有效').length).toBeGreaterThan(0);
  });

  it('shows inventory warning when estimated wins exceed remaining inventory', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('预计参与人数'), { target: { value: '1000' } });

    expect(await screen.findByText('当前配置预计需要约 10 件一等奖奖品，但当前库存只有 5 件')).toBeInTheDocument();
  });

  it('hides advanced algorithm parameters in simple mode and shows them in advanced mode', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: '抽奖概率与发放策略', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('高级算法参数')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '高级模式' }));

    expect(screen.getAllByText('高级算法参数').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Base Weight/).length).toBeGreaterThan(0);
  });

  it('does not claim absolute effective probability for smart pacing', async () => {
    await seedPrizes(db, [
      prize({
        id: 'prize-smart',
        name: '智能一等奖',
        shortName: '智能一等奖',
        probabilityMode: 'SMART_PACING',
        pacing: { minMultiplier: 0.2, maxMultiplier: 3, sensitivity: 0.5 },
      }),
    ]);
    renderPage();

    const row = await screen.findByRole('row', { name: /智能一等奖/ });

    expect(within(row).getByText(/当前有效权重/)).toBeInTheDocument();
    expect(within(row).queryByText(/当前有效概率/)).not.toBeInTheDocument();
  });

  function renderPage() {
    render(
      <MemoryRouter initialEntries={['/admin/pacing']}>
        <AdminPacingPage db={db} />
      </MemoryRouter>,
    );
  }
});
