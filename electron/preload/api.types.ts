import type { DisplayWindowMode } from '../shared/displayWindowMode.js';

export type DesktopSaveResult = {
  canceled: boolean;
  filePath?: string;
};

export type SignalHuntDesktopApi = {
  control: {
    focusDisplay: () => Promise<void>;
    openAdmin: () => Promise<void>;
    openStaff: () => Promise<void>;
  };
  system: {
    getDisplayWindowMode: () => Promise<DisplayWindowMode>;
    getVersion: () => Promise<string>;
    isPackaged: () => Promise<boolean>;
    setDisplayWindowMode: (mode: DisplayWindowMode) => Promise<DisplayWindowMode>;
  };
  file: {
    exportJson: (defaultFileName: string, contents: string) => Promise<DesktopSaveResult>;
    exportCsv: (defaultFileName: string, contents: string) => Promise<DesktopSaveResult>;
  };
};

export type { DisplayWindowMode } from '../shared/displayWindowMode.js';
