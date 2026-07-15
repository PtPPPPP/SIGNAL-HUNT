import { ipcMain } from 'electron';

export type ControlWindowHandlers = {
  focusDisplay: () => void;
  openAdmin: () => Promise<void>;
};

export function registerControlIpc(handlers: ControlWindowHandlers): void {
  ipcMain.handle('desktop:control:focus-display', () => handlers.focusDisplay());
  ipcMain.handle('desktop:control:open-admin', () => handlers.openAdmin());
}
