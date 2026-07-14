import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyDisplayWindowMode,
  DISPLAY_WINDOW_SETTINGS_FILE,
  DisplayWindowModeStore,
} from './displayWindowMode';
import {
  getDefaultDisplayWindowMode,
  getDisplayWindowModeFlags,
} from '../shared/displayWindowMode';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('display window mode settings', () => {
  it('uses explicit first-run defaults and maps every mode to BrowserWindow flags', () => {
    expect(getDefaultDisplayWindowMode(false)).toBe('WINDOWED');
    expect(getDefaultDisplayWindowMode(true)).toBe('FULLSCREEN');
    expect(getDisplayWindowModeFlags('WINDOWED')).toEqual({ fullscreen: false, kiosk: false });
    expect(getDisplayWindowModeFlags('FULLSCREEN')).toEqual({ fullscreen: true, kiosk: false });
    expect(getDisplayWindowModeFlags('KIOSK')).toEqual({ fullscreen: false, kiosk: true });
  });

  it('persists the selected mode and loads it in a new store instance', () => {
    const filePath = createSettingsPath();
    const store = new DisplayWindowModeStore(filePath);

    expect(store.load('FULLSCREEN')).toBe('FULLSCREEN');
    store.save('KIOSK');
    store.save('WINDOWED');

    expect(new DisplayWindowModeStore(filePath).load('FULLSCREEN')).toBe('WINDOWED');
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ version: 1, mode: 'WINDOWED' });
  });

  it('rejects damaged or unsupported persisted settings instead of guessing a mode', () => {
    const filePath = createSettingsPath();
    writeFileSync(filePath, JSON.stringify({ version: 1, mode: 'UNKNOWN' }), 'utf8');

    expect(() => new DisplayWindowModeStore(filePath).load('WINDOWED')).toThrow(
      'Invalid display window mode: UNKNOWN.',
    );
  });

  it('switches only the requested display window between windowed, fullscreen and kiosk', () => {
    let fullscreen = false;
    let kiosk = false;
    const target = {
      isFullScreen: () => fullscreen,
      isKiosk: () => kiosk,
      setFullScreen: (value: boolean) => {
        fullscreen = value;
      },
      setKiosk: (value: boolean) => {
        kiosk = value;
        if (value) fullscreen = true;
      },
    };

    applyDisplayWindowMode(target, 'KIOSK');
    expect({ fullscreen, kiosk }).toEqual({ fullscreen: true, kiosk: true });

    applyDisplayWindowMode(target, 'FULLSCREEN');
    expect({ fullscreen, kiosk }).toEqual({ fullscreen: true, kiosk: false });

    applyDisplayWindowMode(target, 'WINDOWED');
    expect({ fullscreen, kiosk }).toEqual({ fullscreen: false, kiosk: false });
  });
});

function createSettingsPath(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'signal-hunt-window-mode-'));
  temporaryDirectories.push(directory);
  return path.join(directory, DISPLAY_WINDOW_SETTINGS_FILE);
}
