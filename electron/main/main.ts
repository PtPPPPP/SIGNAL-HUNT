import { app, BrowserWindow } from 'electron';

import {
  applyDisplayWindowMode,
  createDisplayWindowModeStore,
  type DisplayWindowModeStore,
} from './displayWindowMode.js';
import { registerFileIpc } from './ipc/file.ipc.js';
import { registerSystemIpc, type SystemIpcHandlers } from './ipc/system.ipc.js';
import { registerControlIpc, type ControlWindowHandlers } from './ipc/control.ipc.js';
import { rendererUrlMatchesRoute } from './route.js';
import { createControlWindow, createMainWindow, loadRenderer } from './window.js';
import {
  getDefaultDisplayWindowMode,
  type DisplayWindowMode,
} from '../shared/displayWindowMode.js';

let displayWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;
let controlWindowOpening: Promise<BrowserWindow> | null = null;
let displayWindowMode: DisplayWindowMode = getDefaultDisplayWindowMode(app.isPackaged);
let displayWindowModeStore: DisplayWindowModeStore | null = null;

const controlHandlers: ControlWindowHandlers = {
  focusDisplay: () => focusDisplayWindow(),
  openAdmin: () => showControlWindow('/admin/dashboard'),
};

const systemHandlers: SystemIpcHandlers = {
  getDisplayWindowMode: () => displayWindowMode,
  setDisplayWindowMode: (mode) => setDisplayWindowMode(mode),
};

function focusDisplayWindow(): void {
  if (!displayWindow || displayWindow.isDestroyed()) {
    throw new Error('SIGNAL HUNT display window is unavailable.');
  }

  if (displayWindow.isMinimized()) displayWindow.restore();
  applyDisplayWindowMode(displayWindow, displayWindowMode);
  displayWindow.show();
  displayWindow.focus();
  hideControlWindow();
}

function hideControlWindow(): void {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.hide();
  }
}

function closeControlWindow(): void {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.close();
  }
}

function quitApplication(): void {
  app.quit();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  quitApplication();
} else {
  app.setName('SIGNAL HUNT');

  app.on('second-instance', () => {
    const windowToFocus = displayWindow ?? controlWindow;
    if (!windowToFocus) {
      return;
    }

    if (windowToFocus.isMinimized()) {
      windowToFocus.restore();
    }

    windowToFocus.focus();
  });

  void app.whenReady().then(async () => {
    displayWindowModeStore = createDisplayWindowModeStore(app.getPath('userData'));
    displayWindowMode = displayWindowModeStore.load(getDefaultDisplayWindowMode(app.isPackaged));

    registerSystemIpc(systemHandlers);
    registerFileIpc();
    registerControlIpc(controlHandlers);

    displayWindow = await createMainWindow('/display', controlHandlers, displayWindowMode);
    displayWindow.on('closed', () => {
      displayWindow = null;
      closeControlWindow();
    });
  }).catch((error: unknown) => {
    console.error('Failed to start SIGNAL HUNT.', error);
    quitApplication();
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      displayWindow = await createMainWindow('/display', controlHandlers, displayWindowMode);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      quitApplication();
    }
  });
}

function setDisplayWindowMode(mode: DisplayWindowMode): DisplayWindowMode {
  if (!displayWindowModeStore) {
    throw new Error('Display window mode store is unavailable.');
  }

  if (!displayWindow || displayWindow.isDestroyed()) {
    throw new Error('SIGNAL HUNT display window is unavailable.');
  }

  const previousMode = displayWindowMode;
  applyDisplayWindowMode(displayWindow, mode);

  try {
    displayWindowModeStore.save(mode);
    displayWindowMode = mode;
    return mode;
  } catch (error) {
    applyDisplayWindowMode(displayWindow, previousMode);
    throw error;
  }
}

async function showControlWindow(route: '/admin/dashboard'): Promise<void> {
  try {
    if (controlWindow && !controlWindow.isDestroyed()) {
      await loadControlRouteIfNeeded(controlWindow, route);
      if (controlWindow.isMinimized()) controlWindow.restore();
      controlWindow.show();
      controlWindow.focus();
      return;
    }

    if (controlWindowOpening) {
      controlWindow = await controlWindowOpening;
      await loadControlRouteIfNeeded(controlWindow, route);
      controlWindow.show();
      controlWindow.focus();
      return;
    }

    controlWindowOpening = createControlWindow(route, controlHandlers);

    controlWindow = await controlWindowOpening;
    controlWindowOpening = null;
    controlWindow.on('closed', () => {
      controlWindow = null;
    });
    controlWindow.focus();
  } catch (error) {
    controlWindowOpening = null;
    console.error('Failed to open SIGNAL HUNT control window.', error);
  }
}

async function loadControlRouteIfNeeded(window: BrowserWindow, route: string): Promise<void> {
  if (!rendererUrlMatchesRoute(window.webContents.getURL(), route)) {
    await loadRenderer(window, route);
  }
}
