import { contextBridge, ipcRenderer } from 'electron';

import type { SignalHuntDesktopApi } from './api.types.js';

const desktopApi: SignalHuntDesktopApi = {
  control: {
    focusDisplay: () => ipcRenderer.invoke('desktop:control:focus-display'),
    openAdmin: () => ipcRenderer.invoke('desktop:control:open-admin'),
  },
  file: {
    exportCsv: (defaultFileName, contents) =>
      ipcRenderer.invoke('desktop:file:export-csv', defaultFileName, contents),
    exportJson: (defaultFileName, contents) =>
      ipcRenderer.invoke('desktop:file:export-json', defaultFileName, contents),
  },
  system: {
    getDisplayWindowMode: () => ipcRenderer.invoke('desktop:system:get-display-window-mode'),
    getVersion: () => ipcRenderer.invoke('desktop:system:get-version'),
    isPackaged: () => ipcRenderer.invoke('desktop:system:is-packaged'),
    setDisplayWindowMode: (mode) => ipcRenderer.invoke('desktop:system:set-display-window-mode', mode),
  },
};

contextBridge.exposeInMainWorld('signalHuntDesktop', desktopApi);
