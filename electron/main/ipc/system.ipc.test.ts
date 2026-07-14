import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.9.0-test',
    isPackaged: true,
  },
  ipcMain: {
    handle: electronMocks.handle,
  },
}));

import { registerSystemIpc, SYSTEM_IPC_CHANNELS } from './system.ipc';

describe('system IPC display window mode contract', () => {
  beforeEach(() => {
    electronMocks.handle.mockReset();
  });

  it('registers mode reads and validates mode writes before calling main window handlers', () => {
    const getDisplayWindowMode = vi.fn(() => 'FULLSCREEN' as const);
    const setDisplayWindowMode = vi.fn((mode) => mode);
    registerSystemIpc({ getDisplayWindowMode, setDisplayWindowMode });

    const getHandler = findHandler(SYSTEM_IPC_CHANNELS.getDisplayWindowMode);
    const setHandler = findHandler(SYSTEM_IPC_CHANNELS.setDisplayWindowMode);

    expect(getHandler()).toBe('FULLSCREEN');
    expect(setHandler(undefined, 'KIOSK')).toBe('KIOSK');
    expect(setDisplayWindowMode).toHaveBeenCalledWith('KIOSK');
    expect(() => setHandler(undefined, 'INVALID')).toThrow('Invalid display window mode: INVALID.');
  });
});

function findHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = electronMocks.handle.mock.calls.find(([registeredChannel]) => registeredChannel === channel);
  if (!registration) {
    throw new Error(`IPC handler was not registered: ${channel}`);
  }

  return registration[1] as (...args: unknown[]) => unknown;
}
