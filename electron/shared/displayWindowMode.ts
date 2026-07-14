export const DISPLAY_WINDOW_MODES = ['WINDOWED', 'FULLSCREEN', 'KIOSK'] as const;

export type DisplayWindowMode = (typeof DISPLAY_WINDOW_MODES)[number];

export type DisplayWindowModeFlags = {
  fullscreen: boolean;
  kiosk: boolean;
};

export function isDisplayWindowMode(value: unknown): value is DisplayWindowMode {
  return typeof value === 'string' && DISPLAY_WINDOW_MODES.includes(value as DisplayWindowMode);
}

export function assertDisplayWindowMode(value: unknown): asserts value is DisplayWindowMode {
  if (!isDisplayWindowMode(value)) {
    throw new Error(`Invalid display window mode: ${String(value)}.`);
  }
}

export function getDefaultDisplayWindowMode(isPackaged: boolean): DisplayWindowMode {
  return isPackaged ? 'FULLSCREEN' : 'WINDOWED';
}

export function getDisplayWindowModeFlags(mode: DisplayWindowMode): DisplayWindowModeFlags {
  return {
    fullscreen: mode === 'FULLSCREEN',
    kiosk: mode === 'KIOSK',
  };
}
