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

    fireEvent.change(screen.getByLabelText('奖品 JSON'), {
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
});
