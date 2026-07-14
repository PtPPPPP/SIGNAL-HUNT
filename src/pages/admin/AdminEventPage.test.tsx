import 'fake-indexeddb/auto';

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { createEvent } from '../../db/eventRepository';
import { AdminEventPage } from './AdminEventPage';

describe('AdminEventPage', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-admin-event-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('does not offer activation for an ENDED event', async () => {
    await createEvent(db, {
      id: 'ended-event',
      name: '已结束展会',
      code: 'ENDED-2026',
      status: 'ENDED',
    });

    render(
      <MemoryRouter initialEntries={['/admin/event']}>
        <AdminEventPage db={db} />
      </MemoryRouter>,
    );

    const row = await screen.findByRole('row', { name: /已结束展会/ });

    expect(within(row).getByText('已结束')).toBeInTheDocument();
    expect(within(row).getByText('活动已结束，不能重新激活')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: '激活' })).not.toBeInTheDocument();
  });
});
