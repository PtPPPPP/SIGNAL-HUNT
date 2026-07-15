import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const forgeConfig = require('../forge.config.cjs');
const productName = forgeConfig.packagerConfig.name ?? packageJson.productName;
const executableName = forgeConfig.packagerConfig.executableName ?? productName;
const executablePath = path.resolve(
  'out',
  `${productName}-${process.platform}-${process.arch}`,
  `${executableName}.exe`,
);
const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'signal-hunt-smoke-'));
let app = await electron.launch({
  executablePath,
  args: [`--user-data-dir=${userDataDirectory}`],
});

try {
  const displayWindow = await waitForRoute('/display');
  await sendControlShortcut('A');
  const adminWindow = await waitForRoute('/admin/dashboard');
  await assertLogoLoaded(displayWindow, '展会大屏');
  await assertLogoLoaded(adminWindow, '后台');

  await adminWindow.getByRole('link', { name: '系统设置' }).click();
  await waitForRoute('/admin/system');
  await verifyDisplayWindowModes(adminWindow);

  const controlWindowId = await getControlWindowId();
  await adminWindow.evaluate(() => {
    globalThis.__signalHuntLifecycleProbe = 'preserved';
  });

  await adminWindow.getByRole('button', { name: /返回展会大屏/ }).click();
  await waitForDisplayFocus();

  await sendControlShortcut('A');
  const reopenedAdminWindow = await waitForRoute('/admin/system');
  const reopenedControlWindowId = await getControlWindowId();
  const lifecycleProbe = await reopenedAdminWindow.evaluate(
    () => globalThis.__signalHuntLifecycleProbe ?? null,
  );
  if (reopenedControlWindowId !== controlWindowId) {
    throw new Error(`Control BrowserWindow changed from ${controlWindowId} to ${reopenedControlWindowId}.`);
  }
  if (lifecycleProbe !== 'preserved') {
    throw new Error('Control renderer state was lost after returning to the display and reopening admin.');
  }

  await sendControlShortcut('A');
  await waitForRoute('/admin/dashboard');

  const windowCount = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  if (windowCount !== 2) {
    throw new Error(`Expected exactly 2 BrowserWindows after shortcut checks; found ${windowCount}.`);
  }

  await adminWindow.getByRole('link', { name: '系统设置' }).click();
  await waitForRoute('/admin/system');
  await setDisplayWindowMode(adminWindow, 'WINDOWED');
  await app.close();

  app = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userDataDirectory}`],
  });
  await waitForRoute('/display');
  await waitForDisplayWindowMode('WINDOWED');

  console.log('Packaged Electron smoke passed: display mode switching and restart persistence, preserved control window lifecycle, display shortcut, admin shortcut, logos.');
} finally {
  await app.close();
  await rm(userDataDirectory, { force: true, recursive: true });
}

async function getControlWindowId() {
  return app.evaluate(({ BrowserWindow }) => {
    const control = BrowserWindow.getAllWindows().find(
      (window) => !window.webContents.getURL().endsWith('#/display'),
    );
    if (!control) throw new Error('Control window was not found.');
    if (control.isDestroyed()) throw new Error('Control window was destroyed.');
    return control.id;
  });
}

async function waitForRoute(route) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const matchingWindow = app.windows().find((window) => new URL(window.url()).hash === `#${route}`);
    if (matchingWindow) return matchingWindow;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const routes = app.windows().map((window) => window.url());
  throw new Error(`Timed out waiting for ${route}. Open windows: ${routes.join(', ') || '(none)'}`);
}

async function sendControlShortcut(keyCode) {
  await app.evaluate(
    ({ BrowserWindow }, key) => {
      const display = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('#/display'));
      if (!display) throw new Error('Display window was not found.');

      display.focus();
      display.webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: ['control', 'shift'] });
      display.webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: ['control', 'shift'] });
    },
    keyCode,
  );
}

async function waitForDisplayFocus() {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const state = await app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      const display = windows.find((window) => window.webContents.getURL().endsWith('#/display'));
      const control = windows.find((window) => !window.webContents.getURL().endsWith('#/display'));
      return { displayFocused: display?.isFocused() ?? false, controlVisible: control?.isVisible() ?? false };
    });

    if (state.displayFocused && !state.controlVisible) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for the display window to be focused and the control window to be hidden.');
}

async function verifyDisplayWindowModes(adminWindow) {
  const modeSelect = adminWindow.getByRole('combobox', { name: '显示模式' });
  await modeSelect.waitFor({ state: 'visible' });

  const initialMode = await modeSelect.inputValue();
  if (initialMode !== 'FULLSCREEN') {
    throw new Error(`Expected first packaged launch to use FULLSCREEN; found ${initialMode}.`);
  }
  await waitForDisplayWindowMode('FULLSCREEN');

  await setDisplayWindowMode(adminWindow, 'WINDOWED');
  await setDisplayWindowMode(adminWindow, 'KIOSK');
  await setDisplayWindowMode(adminWindow, 'FULLSCREEN');
}

async function setDisplayWindowMode(adminWindow, mode) {
  const modeSelect = adminWindow.getByRole('combobox', { name: '显示模式' });
  const applyButton = adminWindow.getByRole('button', { name: '应用显示模式' });
  await modeSelect.selectOption(mode);
  await applyButton.click();
  await waitForDisplayWindowMode(mode);

  const persistedMode = await adminWindow.evaluate(() =>
    globalThis.signalHuntDesktop?.system.getDisplayWindowMode(),
  );
  if (persistedMode !== mode) {
    throw new Error(`Expected persisted display mode ${mode}; found ${persistedMode}.`);
  }
}

async function waitForDisplayWindowMode(expectedMode) {
  const deadline = Date.now() + 5_000;
  let lastState;

  while (Date.now() < deadline) {
    const state = await app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      const display = windows.find((window) => window.webContents.getURL().endsWith('#/display'));
      const control = windows.find((window) => !window.webContents.getURL().endsWith('#/display'));

      return {
        controlFullscreen: control?.isFullScreen() ?? false,
        controlKiosk: control?.isKiosk() ?? false,
        controlUrl: control?.webContents.getURL() ?? null,
        displayBounds: display?.getBounds() ?? null,
        displayFullscreen: display?.isFullScreen() ?? false,
        displayKiosk: display?.isKiosk() ?? false,
        displayUrl: display?.webContents.getURL() ?? null,
        displayVisible: display?.isVisible() ?? false,
      };
    });
    lastState = state;

    // Electron 43 on Windows reports isKiosk() as true for a normal fullscreen window.
    // The persisted API mode distinguishes FULLSCREEN from KIOSK; these flags verify the physical state.
    const displayMatches =
      (expectedMode === 'WINDOWED' && !state.displayFullscreen && !state.displayKiosk) ||
      (expectedMode === 'FULLSCREEN' && state.displayFullscreen) ||
      (expectedMode === 'KIOSK' && state.displayKiosk);

    if (displayMatches && !state.controlFullscreen && !state.controlKiosk) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Timed out waiting for display window mode ${expectedMode}. Last state: ${JSON.stringify(lastState)}.`,
  );
}

async function assertLogoLoaded(window, context) {
  const logo = window.locator('img[alt="Quantum Design"]');
  await logo.waitFor({ state: 'visible', timeout: 15_000 });
  const loaded = await logo.evaluate((image) => image.complete && image.naturalWidth > 0);
  if (!loaded) throw new Error(`${context} Quantum Design Logo 未能加载。`);
}
