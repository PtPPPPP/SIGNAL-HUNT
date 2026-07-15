import { BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRendererEntry } from './route.js';
import { applyDisplayWindowMode } from './displayWindowMode.js';
import { attachWindowSecurity } from './security.js';
import { resolveDesktopShortcut } from './shortcuts.js';
import type { ControlWindowHandlers } from './ipc/control.ipc.js';
import {
  getDisplayWindowModeFlags,
  type DisplayWindowMode,
} from '../shared/displayWindowMode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..', '..');
const distIndexHtml = path.join(appRoot, 'dist', 'index.html');
const preloadScript = path.join(appRoot, '.vite-electron', 'preload', 'preload.cjs');

export async function createMainWindow(
  route = '/display',
  controlHandlers?: ControlWindowHandlers,
  displayMode: DisplayWindowMode = 'WINDOWED',
): Promise<BrowserWindow> {
  const modeFlags = getDisplayWindowModeFlags(displayMode);
  const window = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: '#05070a',
    center: true,
    fullscreen: modeFlags.fullscreen,
    fullscreenable: true,
    height: 900,
    kiosk: modeFlags.kiosk,
    minHeight: 720,
    minWidth: 1024,
    show: false,
    title: 'SIGNAL HUNT',
    useContentSize: true,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadScript,
      sandbox: true,
      webSecurity: true,
    },
    width: 1440,
  });

  attachWindowSecurity(window, process.env.SIGNAL_HUNT_DEV_SERVER_URL);
  attachControlShortcuts(window, controlHandlers);

  window.once('ready-to-show', () => {
    window.show();
    applyDisplayWindowMode(window, displayMode);
  });

  await loadRenderer(window, route);
  return window;
}

export async function createControlWindow(
  route = '/admin/dashboard',
  controlHandlers?: ControlWindowHandlers,
): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: '#f4f6f8',
    height: 900,
    minHeight: 720,
    minWidth: 1024,
    show: false,
    title: 'SIGNAL HUNT Control',
    useContentSize: true,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadScript,
      sandbox: true,
      webSecurity: true,
    },
    width: 1440,
  });

  attachWindowSecurity(window, process.env.SIGNAL_HUNT_DEV_SERVER_URL);
  attachControlShortcuts(window, controlHandlers);
  window.once('ready-to-show', () => window.show());

  await loadRenderer(window, route);
  return window;
}

export async function loadRenderer(window: BrowserWindow, route: string): Promise<void> {
  const entry = buildRendererEntry({
    devServerUrl: process.env.SIGNAL_HUNT_DEV_SERVER_URL,
    distIndexHtml,
    route,
  });

  if (entry.kind === 'url') {
    await window.loadURL(entry.value);
    return;
  }

  await window.loadFile(entry.value, { hash: entry.hash });
}

function attachControlShortcuts(window: BrowserWindow, handlers?: ControlWindowHandlers): void {
  if (!handlers) return;

  window.webContents.on('before-input-event', (event, input) => {
    const action = resolveDesktopShortcut(input);
    if (!action) return;

    event.preventDefault();
    if (action === 'OPEN_ADMIN') void handlers.openAdmin();
  });
}
