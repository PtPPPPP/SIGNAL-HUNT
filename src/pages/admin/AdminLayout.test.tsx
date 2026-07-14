import 'fake-indexeddb/auto';

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { DrawSession, Event, Prize } from '../../domain/draw/types';
import { readSystemReadiness } from '../../features/admin/systemReadiness';
import { AdminLayout } from './AdminLayout';

const activeEvent: Event = {
  id: 'event-active',
  name: '验收活动',
  code: 'ACCEPTANCE-2026',
  status: 'ACTIVE',
  createdAt: '2026-07-14T00:00:00.000Z',
};

const eligiblePrize: Prize = {
  id: 'prize-1',
  name: '验收奖品',
  shortName: '奖品',
  level: 1,
  inventoryTotal: 10,
  inventoryRemaining: 10,
  weight: 1,
  enabled: true,
};

describe('AdminLayout readiness', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-admin-layout-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('reports the real operating state from persisted data', async () => {
    await expect(readSystemReadiness(db)).resolves.toMatchObject({ label: '无活动' });

    await db.events.put({ ...activeEvent, status: 'PAUSED' });
    await expect(readSystemReadiness(db)).resolves.toMatchObject({ label: '活动暂停' });

    await db.events.put(activeEvent);
    await expect(readSystemReadiness(db)).resolves.toMatchObject({ label: '配置不完整' });

    await db.prizes.put(eligiblePrize);
    await expect(readSystemReadiness(db)).resolves.toMatchObject({ label: '准备就绪' });

    const session: DrawSession = {
      id: 'session-1',
      eventId: activeEvent.id,
      status: 'COMMITTED',
      committedRecordId: 'record-1',
      createdAt: '2026-07-14T00:01:00.000Z',
      committedAt: '2026-07-14T00:01:00.000Z',
    };
    await db.drawSessions.put(session);
    await expect(readSystemReadiness(db)).resolves.toMatchObject({ label: '需要处理' });
  });

  it('does not expose the unfinished appearance entry', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout title="控制台" db={db}>
          <div>页面内容</div>
        </AdminLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: /外观/ })).not.toBeInTheDocument();
    expect(await screen.findByText('无活动')).toBeInTheDocument();
  });

  it('does not claim a healthy or empty state before the database check completes', () => {
    db.close();

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminLayout title="控制台" db={db}>
          <div>页面内容</div>
        </AdminLayout>
      </MemoryRouter>,
    );

    expect(screen.getByText('状态未检查')).toBeInTheDocument();
  });
});
