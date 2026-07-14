import 'fake-indexeddb/auto';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSignalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import { seedEvent, seedPrizes } from '../../db/drawRepository';
import type { Event, Prize } from '../../domain/draw/types';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, type BackupManifest } from '../../features/admin/backupRestore';
import { AdminSystemPage } from './AdminSystemPage';

const activeEvent: Event = {
  id: 'event-1',
  name: '量子展',
  code: 'QD-2026',
  status: 'ACTIVE',
  createdAt: '2026-07-06T00:00:00.000Z',
};

const activePrize: Prize = {
  id: 'prize-1',
  name: '一等奖',
  shortName: '一等',
  level: 1,
  inventoryTotal: 2,
  inventoryRemaining: 2,
  weight: 100,
  enabled: true,
};

function manifest(): BackupManifest {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    appVersion: '0.9.0-beta',
    createdAt: '2026-07-06T01:00:00.000Z',
    data: {
      events: [{ ...activeEvent }],
      prizes: [{ ...activePrize }],
      drawSessions: [],
      drawRecords: [],
    },
  };
}

describe('AdminSystemPage backup precheck', () => {
  let db: SignalHuntDatabase;

  beforeEach(async () => {
    db = createSignalHuntDatabase(`signal-hunt-admin-system-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    delete window.signalHuntDesktop;
    await db.delete();
  });

  it('shows desktop display modes as unavailable outside Electron', async () => {
    renderPage(db);

    expect(screen.getByLabelText('显示模式')).toBeDisabled();
    expect(screen.getByText('当前不是 Electron 桌面环境，不能修改桌面窗口模式。')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('备份预览')).not.toHaveValue(''));
  });

  it('loads and applies a display mode through the desktop API', async () => {
    const user = userEvent.setup();
    const getDisplayWindowMode = vi.fn().mockResolvedValue('FULLSCREEN');
    const setDisplayWindowMode = vi.fn().mockResolvedValue('WINDOWED');
    window.signalHuntDesktop = {
      system: {
        getDisplayWindowMode,
        setDisplayWindowMode,
      },
    } as unknown as Window['signalHuntDesktop'];
    renderPage(db);

    expect(await screen.findByText('当前模式：全屏模式')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('显示模式'), 'WINDOWED');
    await user.click(screen.getByRole('button', { name: '应用显示模式' }));

    expect(setDisplayWindowMode).toHaveBeenCalledWith('WINDOWED');
    expect(await screen.findByText('显示模式已切换为窗口模式。')).toBeInTheDocument();
    expect(screen.getByText('当前模式：窗口模式')).toBeInTheDocument();
  });

  it('shows blocking errors and disables restore for damaged backup data', async () => {
    const user = userEvent.setup();
    const backup = manifest();
    backup.data.prizes[0].inventoryRemaining = -1;
    renderPage(db);

    fireEvent.change(screen.getByLabelText('备份 JSON'), { target: { value: JSON.stringify(backup) } });
    await user.click(screen.getByRole('button', { name: '解析并预览' }));

    expect(await screen.findByText(/阻塞错误 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '恢复备份' })).toBeDisabled();
    expect(screen.getByText('剩余库存不能为负数')).toBeInTheDocument();
  });

  it('blocks a backup that attempts to revive an existing ENDED event', async () => {
    const user = userEvent.setup();
    await seedEvent(db, { ...activeEvent, status: 'ENDED' });
    await seedPrizes(db, [activePrize]);
    renderPage(db);

    fireEvent.change(screen.getByLabelText('备份 JSON'), { target: { value: JSON.stringify(manifest()) } });
    await user.click(screen.getByRole('button', { name: '解析并预览' }));

    expect(await screen.findByText(/已经结束，不能通过备份恢复/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '恢复备份' })).toBeDisabled();
  });

  it('restores a valid backup only after preview and confirmation', async () => {
    const user = userEvent.setup();
    renderPage(db);

    fireEvent.change(screen.getByLabelText('备份 JSON'), { target: { value: JSON.stringify(manifest()) } });
    await user.click(screen.getByRole('button', { name: '解析并预览' }));

    expect(await screen.findByText(/警告 0 · 阻塞错误 0/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '恢复备份' }));
    await user.click(screen.getByRole('button', { name: '确认恢复' }));

    expect(await screen.findByText(/已恢复备份/)).toBeInTheDocument();
    await expect(db.events.get('event-1')).resolves.toMatchObject({ status: 'ACTIVE' });
    await expect(db.prizes.get('prize-1')).resolves.toMatchObject({ inventoryRemaining: 2 });
  });
});

function renderPage(db: SignalHuntDatabase) {
  return render(
    <MemoryRouter initialEntries={['/admin/system']}>
      <AdminSystemPage db={db} />
    </MemoryRouter>,
  );
}
