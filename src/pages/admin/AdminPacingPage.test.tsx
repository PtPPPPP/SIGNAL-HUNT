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
  name: 'Quantum Materials Expo 2026',
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

  it('edits prize probability inline and saves it as real weight', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('准备就绪');

    fireEvent.change(await screen.findByLabelText('一等奖 中奖概率'), { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: '自动平衡到 100%' }));
    await user.click(screen.getByRole('button', { name: '确认应用' }));
    await user.click(screen.getByRole('button', { name: '保存并应用' }));

    await waitFor(async () => {
      const saved = await listPrizes(db);
      expect(saved.find((item) => item.id === 'prize-first')?.weight).toBe(2);
      expect(saved.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    });
  });

  it('disables save and apply when total probability is not 100%', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('一等奖 中奖概率'), { target: { value: '2' } });

    expect(screen.getAllByText('还差或超出 1.0%').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '保存并应用' })).toBeDisabled();
  });

  it('shows an auto balance preview before changing other probabilities', async () => {
    const user = userEvent.setup();
    renderPage();

    fireEvent.change(await screen.findByLabelText('一等奖 中奖概率'), { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: '自动平衡到 100%' }));

    const dialog = screen.getByRole('dialog', { name: '自动平衡预览' });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('二等奖')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认应用' }));

    expect(screen.getAllByText('配置有效').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('一等奖 中奖概率')).toHaveValue(2);
  });

  it('does not change a locked prize during auto balance', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '一等奖 配置奖项' }));
    await user.click(screen.getByRole('switch', { name: '一等奖 锁定中奖概率' }));
    fireEvent.change(screen.getByLabelText('二等奖 中奖概率'), { target: { value: '10' } });
    await user.click(screen.getByRole('button', { name: '自动平衡到 100%' }));
    await user.click(screen.getByRole('button', { name: '确认应用' }));

    expect(screen.getByLabelText('一等奖 中奖概率')).toHaveValue(1);
    expect(screen.getAllByText('配置有效').length).toBeGreaterThan(0);
  });

  it('shows inventory risk in plain operation language', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('预计参与人数'), { target: { value: '1000' } });

    expect((await screen.findAllByText('库存风险')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/预计需要约 10 件/).length).toBeGreaterThan(0);
  });

  it('keeps simple mode free of advanced algorithm parameters', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: '中奖概率与发放策略', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('准备就绪')).toBeInTheDocument();
    expect(screen.queryByText('高级算法参数')).not.toBeInTheDocument();
    expect(screen.queryByText(/有效权重|响应强度|倍率/)).not.toBeInTheDocument();
  });

  it('shows advanced algorithm parameters only in advanced mode', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '高级模式' }));
    await user.selectOptions(screen.getByLabelText('一等奖 发放方式'), 'EVEN');
    await user.click(screen.getByRole('button', { name: '一等奖 配置智能策略' }));

    expect(screen.getAllByText('高级算法参数').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/基础权重/).length).toBeGreaterThan(0);
  });

  it('shows only the selected smart strategy fields and keeps advanced controls hidden', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '智能模式' }));
    expect(screen.queryByText('高级算法参数')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '一等奖 智能设置' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('一等奖 发放方式'), 'EVEN');
    expect(screen.queryByLabelText('一等奖 最小中奖间隔')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '一等奖 配置智能策略' }));
    expect(screen.getByRole('region', { name: '一等奖 智能设置' })).toBeInTheDocument();
    expect(screen.getByLabelText('一等奖 最小中奖间隔')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('一等奖 发放方式'), 'RANDOM');
    expect(screen.queryByLabelText('一等奖 最小中奖间隔')).not.toBeInTheDocument();
  });

  it('keeps smart settings collapsed and expands only the selected prize', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '智能模式' }));
    const firstPrizeButton = screen.getByRole('button', { name: '一等奖 配置智能策略' });
    const secondPrizeButton = screen.getByRole('button', { name: '二等奖 配置智能策略' });

    expect(firstPrizeButton).toHaveAttribute('aria-expanded', 'false');
    await user.click(firstPrizeButton);
    expect(screen.getByRole('region', { name: '一等奖 智能设置' })).toBeInTheDocument();
    expect(firstPrizeButton).toHaveAttribute('aria-expanded', 'true');

    await user.click(secondPrizeButton);
    expect(screen.queryByRole('region', { name: '一等奖 智能设置' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '二等奖 智能设置' })).toBeInTheDocument();
    expect(firstPrizeButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('warns when the page has unsaved changes', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('一等奖 中奖概率'), { target: { value: '2' } });

    expect(screen.getAllByText('有未保存修改').length).toBeGreaterThan(0);
  });

  it('does not claim absolute effective probability for smart pacing', async () => {
    const user = userEvent.setup();
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
    await user.click(await screen.findByRole('button', { name: '智能模式' }));
    await user.click(screen.getByRole('button', { name: '智能一等奖 配置智能策略' }));

    const panel = await screen.findByRole('region', { name: '智能一等奖 智能设置' });

    expect(within(panel).getByText(/当前相对倍率/)).toBeInTheDocument();
    expect(within(panel).queryByText(/当前有效概率/)).not.toBeInTheDocument();
  });

  function renderPage() {
    render(
      <MemoryRouter initialEntries={['/admin/pacing']}>
        <AdminPacingPage db={db} />
      </MemoryRouter>,
    );
  }
});
