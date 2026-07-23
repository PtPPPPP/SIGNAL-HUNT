import { ipcMain } from 'electron';

export type ControlWindowHandlers = {
  focusDisplay: () => void;
  openAdmin: () => Promise<void>;
  openStaff: () => Promise<void>;
  requestDisplaySync: () => void;
};

export function registerControlIpc(handlers: ControlWindowHandlers): void {
  ipcMain.handle('desktop:control:focus-display', () => handlers.focusDisplay());
  ipcMain.handle('desktop:control:open-admin', () => handlers.openAdmin());
  ipcMain.handle('desktop:control:open-staff', () => handlers.openStaff());
  ipcMain.handle('desktop:control:request-display-sync', () => handlers.requestDisplaySync());
}
