import { app, ipcMain } from 'electron';

import {
  assertDisplayWindowMode,
  type DisplayWindowMode,
} from '../../shared/displayWindowMode.js';

export const SYSTEM_IPC_CHANNELS = {
  getDisplayWindowMode: 'desktop:system:get-display-window-mode',
  getVersion: 'desktop:system:get-version',
  isPackaged: 'desktop:system:is-packaged',
  setDisplayWindowMode: 'desktop:system:set-display-window-mode',
} as const;

export type SystemIpcHandlers = {
  getDisplayWindowMode: () => DisplayWindowMode;
  setDisplayWindowMode: (mode: DisplayWindowMode) => DisplayWindowMode;
};

export function registerSystemIpc(handlers: SystemIpcHandlers): void {
  ipcMain.handle(SYSTEM_IPC_CHANNELS.getVersion, () => app.getVersion());
  ipcMain.handle(SYSTEM_IPC_CHANNELS.isPackaged, () => app.isPackaged);
  ipcMain.handle(SYSTEM_IPC_CHANNELS.getDisplayWindowMode, () => handlers.getDisplayWindowMode());
  ipcMain.handle(SYSTEM_IPC_CHANNELS.setDisplayWindowMode, (_event, mode: unknown) => {
    assertDisplayWindowMode(mode);
    return handlers.setDisplayWindowMode(mode);
  });
}
