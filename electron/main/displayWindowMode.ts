import type { BrowserWindow } from 'electron';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  assertDisplayWindowMode,
  type DisplayWindowMode,
} from '../shared/displayWindowMode.js';

const SETTINGS_VERSION = 1;

export const DISPLAY_WINDOW_SETTINGS_FILE = 'display-window-settings.json';

type PersistedDisplayWindowSettings = {
  version: typeof SETTINGS_VERSION;
  mode: DisplayWindowMode;
};

type DisplayWindowModeTarget = Pick<
  BrowserWindow,
  'setFullScreen' | 'setKiosk'
>;

export class DisplayWindowModeStore {
  public constructor(private readonly filePath: string) {}

  public load(defaultMode: DisplayWindowMode): DisplayWindowMode {
    if (!existsSync(this.filePath)) {
      return defaultMode;
    }

    const raw = readFileSync(this.filePath, 'utf8');
    return parsePersistedSettings(raw).mode;
  }

  public save(mode: DisplayWindowMode): void {
    assertDisplayWindowMode(mode);
    mkdirSync(path.dirname(this.filePath), { recursive: true });

    const settings: PersistedDisplayWindowSettings = {
      version: SETTINGS_VERSION,
      mode,
    };
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;

    try {
      writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
      renameSync(temporaryPath, this.filePath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }
}

export function createDisplayWindowModeStore(userDataDirectory: string): DisplayWindowModeStore {
  return new DisplayWindowModeStore(path.join(userDataDirectory, DISPLAY_WINDOW_SETTINGS_FILE));
}

export function applyDisplayWindowMode(
  window: DisplayWindowModeTarget,
  mode: DisplayWindowMode,
): void {
  if (mode === 'KIOSK') {
    window.setKiosk(true);
    return;
  }

  window.setKiosk(false);
  window.setFullScreen(mode === 'FULLSCREEN');
}

function parsePersistedSettings(raw: string): PersistedDisplayWindowSettings {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('Display window settings are not valid JSON.', { cause: error });
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Display window settings must be an object.');
  }

  const settings = parsed as Record<string, unknown>;
  if (settings.version !== SETTINGS_VERSION) {
    throw new Error(`Unsupported display window settings version: ${String(settings.version)}.`);
  }

  assertDisplayWindowMode(settings.mode);
  return {
    version: SETTINGS_VERSION,
    mode: settings.mode,
  };
}
