import 'fake-indexeddb/auto';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { listPrizes } from '../../db/adminRepository';
import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { AdminPrizesPage } from './AdminPrizesPage';

describe('AdminPrizesPage', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-prizes-page-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('imports valid prize JSON into IndexedDB', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/admin/prizes']}>
        <AdminPrizesPage db={db} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Prize JSON'), {
      target: {
        value: JSON.stringify([
        {
          id: 'imported-prize',
          name: 'Imported Prize',
          shortName: 'Imported',
          level: 1,
          inventoryTotal: 3,
          inventoryRemaining: 3,
          weight: 2,
          enabled: true,
        },
      ]),
      },
    });
    await user.click(screen.getByRole('button', { name: '导入 JSON' }));

    await waitFor(async () => {
      await expect(listPrizes(db)).resolves.toMatchObject([{ id: 'imported-prize' }]);
    });
    expect(await screen.findByText('Imported Prize')).toBeInTheDocument();
  });

  it('shows field errors when manual prize form is invalid', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/admin/prizes']}>
        <AdminPrizesPage db={db} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('奖项名称'), { target: { value: 'Invalid Prize' } });
    fireEvent.change(screen.getByLabelText('简称'), { target: { value: 'Invalid' } });
    fireEvent.change(screen.getByLabelText('总量'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('剩余'), { target: { value: '2' } });

    await user.click(screen.getByRole('button', { name: '保存奖品' }));

    expect(await screen.findByText('剩余库存不能大于总库存')).toBeInTheDocument();
    await expect(listPrizes(db)).resolves.toHaveLength(0);
  });

  it('persists smart pacing parameters and reads them back', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/admin/prizes']}>
        <AdminPrizesPage db={db} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('奖项名称'), { target: { value: 'Smart Prize' } });
    fireEvent.change(screen.getByLabelText('简称'), { target: { value: 'Smart' } });
    await user.selectOptions(screen.getByLabelText('Probability Mode'), 'SMART_PACING');
    fireEvent.change(screen.getByLabelText('总量'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('剩余'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Base Weight'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Minimum Multiplier'), { target: { value: '0.3' } });
    fireEvent.change(screen.getByLabelText('Maximum Multiplier'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('Sensitivity'), { target: { value: '0.7' } });
    fireEvent.change(screen.getByLabelText('Release Schedule'), { target: { value: '09:00,1\n11:00,2' } });

    await user.click(screen.getByRole('button', { name: '保存奖品' }));

    await waitFor(async () => {
      const saved = await listPrizes(db);
      expect(saved[0]).toMatchObject({
        probabilityMode: 'SMART_PACING',
        pacing: {
          minMultiplier: 0.3,
          maxMultiplier: 2.5,
          sensitivity: 0.7,
          releaseSchedule: [
            { time: '09:00', maxCumulativeWins: 1 },
            { time: '11:00', maxCumulativeWins: 2 },
          ],
        },
      });
    });
  });

  it('rejects a release schedule with decreasing max wins', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/admin/prizes']}>
        <AdminPrizesPage db={db} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('奖项名称'), { target: { value: 'Bad Schedule' } });
    fireEvent.change(screen.getByLabelText('简称'), { target: { value: 'Bad' } });
    await user.selectOptions(screen.getByLabelText('Probability Mode'), 'TIME_RELEASE');
    fireEvent.change(screen.getByLabelText('总量'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('剩余'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Release Schedule'), { target: { value: '09:00,2\n11:00,1' } });

    await user.click(screen.getByRole('button', { name: '保存奖品' }));

    expect(await screen.findByText('累计中奖数不能下降')).toBeInTheDocument();
    await expect(listPrizes(db)).resolves.toHaveLength(0);
  });

  it('shows live preview output from the pacing domain', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/admin/prizes']}>
        <AdminPrizesPage db={db} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('奖项名称'), { target: { value: 'Locked Prize' } });
    fireEvent.change(screen.getByLabelText('简称'), { target: { value: 'Locked' } });
    await user.selectOptions(screen.getByLabelText('Probability Mode'), 'TIME_RELEASE');
    fireEvent.change(screen.getByLabelText('Base Weight'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Release Schedule'), { target: { value: '00:00,0' } });

    expect(await screen.findByText('LOCKED')).toBeInTheDocument();
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
  });
});
