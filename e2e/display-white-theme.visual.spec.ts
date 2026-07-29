import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import {
  importPrizeJson,
  setDefaultEventOpenTime,
} from './db';
import { POST_COMMIT_TIMELINE_STEPS } from '../src/features/display/displayTimeline';

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
] as const;

const screenshotRoot = path.resolve('test-results', 'display-white-theme');
const longPrizeName = '量子测量系统精密信号分析纪念套装';
const fixedEventTime = new Date('2026-07-15T02:00:00.000Z');
const timelinePauseLeadMs = 250;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

for (const viewport of viewports) {
  test(`captures Display white theme states at ${viewport.width}x${viewport.height}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const outputDirectory = path.join(screenshotRoot, `${viewport.width}x${viewport.height}`);
    await mkdir(outputDirectory, { recursive: true });

    await captureDrawFlow(browser, viewport, outputDirectory);
    await captureNoWin(browser, viewport, outputDirectory);
    await captureLifecycleState(browser, viewport, outputDirectory, 'PAUSED', 'paused');
    await captureLifecycleState(browser, viewport, outputDirectory, 'ENDED', 'ended');
    await captureErrorBoundary(browser, viewport, outputDirectory);
  });
}

test('removes focus motion when reduced motion is requested', async ({ context, page }) => {
  await setDefaultEventOpenTime(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/display');
  await page.locator('.primary-touch-target').click();
  await expect(page.locator('.display-screen')).toHaveAttribute('data-state', 'SCANNING');

  const motion = await page.getByTestId('display-focus-instrument').evaluate((instrument) => {
    const aperture = instrument.querySelector<HTMLElement>('.display-focus-aperture');
    const ring = instrument.querySelector<HTMLElement>('.display-focus-ring');
    const apertureStyle = aperture ? getComputedStyle(aperture) : null;
    const ringStyle = ring ? getComputedStyle(ring) : null;

    return {
      animationName: apertureStyle?.animationName,
      transitionDuration: ringStyle?.transitionDuration,
    };
  });

  expect(motion.animationName).toBe('none');
  expect(motion.transitionDuration).toBe('0s');
});

async function captureDrawFlow(
  browser: Browser,
  viewport: (typeof viewports)[number],
  outputDirectory: string,
): Promise<void> {
  const { context, page, errors } = await openDisplay(browser, viewport, {
    manualTimeline: true,
  });

  try {
    await expect(page.locator('.display-screen')).toHaveAttribute('data-view', 'idle');
    await capture(page, path.join(outputDirectory, 'idle.png'));

    await importVisualPrize(page, prizeJson(longPrizeName, 'visual-long-prize'));
    await page.goto('/display');
    await page.locator('.primary-touch-target').click();
    await expectFocusStage(page, 'SCANNING', 'scanning');
    let timelineAtMs = await pauseTimeline(page);
    await capture(page, path.join(outputDirectory, 'scanning.png'));
    await capture(page, path.join(outputDirectory, 'drawing.png'));
    timelineAtMs = await advanceToTimelineEvent(page, timelineAtMs, 'SCAN_COMPLETE');
    await captureFocusStage(page, outputDirectory, 'SEARCHING', 'focusing', 'focusing.png');
    timelineAtMs = await advanceToTimelineEvent(page, timelineAtMs, 'SEARCH_COMPLETE');
    await captureFocusStage(page, outputDirectory, 'PEAK_DETECTED', 'acquired', 'acquired.png');
    timelineAtMs = await advanceToTimelineEvent(page, timelineAtMs, 'PEAK_CONFIRMED');
    await captureFocusStage(page, outputDirectory, 'LOCKING', 'locked', 'locked.png');
    timelineAtMs = await advanceToTimelineEvent(page, timelineAtMs, 'LOCK_COMPLETE');
    await captureFocusStage(page, outputDirectory, 'REVEALING', 'resolving', 'resolving.png');
    await advanceToTimelineEvent(page, timelineAtMs, 'REVEAL_COMPLETE');

    await expect(drawAndRevealPrizeFromCurrentDraw(page)).resolves.toBe(longPrizeName);
    await expect(page.locator('.display-screen')).toHaveAttribute('data-view', 'winner');
    await capture(page, path.join(outputDirectory, 'winner.png'));
    await capture(page, path.join(outputDirectory, 'long-prize.png'));

    await page.getByRole('button', { name: '下一位参与者' }).click();
    await expect(page.getByRole('alertdialog', { name: '确认结束当前中奖结果' })).toBeVisible();
    await capture(page, path.join(outputDirectory, 'confirmation-dialog.png'));

    await page.getByRole('button', { name: '确认并返回' }).click();
    await expect(page.locator('.display-screen')).toHaveAttribute('data-view', 'recovering');
    await capture(page, path.join(outputDirectory, 'recovering.png'));

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

async function captureNoWin(
  browser: Browser,
  viewport: (typeof viewports)[number],
  outputDirectory: string,
): Promise<void> {
  const { context, page, errors } = await openDisplay(browser, viewport);

  try {
    await importVisualPrize(page, prizeJson('谢谢参与', 'visual-no-win', 99));
    await page.goto('/display');
    await page.locator('.primary-touch-target').click();
    await expect(page.locator('.display-screen')).toHaveAttribute('data-state', 'SCANNING');
    await expect(page.getByTestId('display-focus-instrument')).toHaveAttribute(
      'data-focus-phase',
      'scanning',
    );
    await expect(page.locator('.display-result--no-win')).toHaveCount(0);
    await expect(drawAndRevealPrizeFromCurrentDraw(page)).resolves.toBe('未发现有效结果');
    await expect(page.locator('.display-screen')).toHaveAttribute('data-view', 'no-win');
    await capture(page, path.join(outputDirectory, 'no-win.png'));
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

async function captureLifecycleState(
  browser: Browser,
  viewport: (typeof viewports)[number],
  outputDirectory: string,
  status: 'PAUSED' | 'ENDED',
  filename: 'paused' | 'ended',
): Promise<void> {
  const { context, page, errors } = await openDisplay(browser, viewport);

  try {
    await updateConfiguredEventStatus(page, status);
    await expect(page.locator('.display-screen')).toHaveAttribute('data-view', filename);
    await capture(page, path.join(outputDirectory, `${filename}.png`));
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

async function captureErrorBoundary(
  browser: Browser,
  viewport: (typeof viewports)[number],
  outputDirectory: string,
): Promise<void> {
  const context = await browser.newContext({ viewport });
  await setDefaultEventOpenTime(context);
  await context.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => {
        throw new Error('visual acceptance boundary trigger');
      },
    });
  });
  const page = await context.newPage();

  try {
    await page.goto('/display');
    await expect(page.getByText('错误编号：DISPLAY_RENDER_FAILED')).toBeVisible();
    await capture(page, path.join(outputDirectory, 'error-boundary.png'));
  } finally {
    await context.close();
  }
}

async function openDisplay(
  browser: Browser,
  viewport: (typeof viewports)[number],
  options: { manualTimeline?: boolean } = {},
): Promise<{
  context: BrowserContext;
  page: Page;
  errors: string[];
}> {
  const context = await browser.newContext({ viewport });
  if (!options.manualTimeline) {
    await setDefaultEventOpenTime(context);
  }
  await context.addInitScript(() => {
    localStorage.setItem('signal-hunt:staticSignalCanvas', 'true');
  });

  const page = await context.newPage();
  if (options.manualTimeline) {
    await page.clock.install({ time: fixedEventTime });
  }
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await page.goto('/display');
  await expect(page.locator('.display-screen')).toHaveAttribute('data-view', 'idle');
  await expectRedWhiteDisplayPalette(page);

  return { context, page, errors };
}

async function pauseTimeline(page: Page): Promise<number> {
  const currentTime = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(currentTime + timelinePauseLeadMs);
  return timelinePauseLeadMs;
}

async function advanceToTimelineEvent(
  page: Page,
  previousTimelineAtMs: number,
  eventType: (typeof POST_COMMIT_TIMELINE_STEPS)[number]['event']['type'],
): Promise<number> {
  const step = POST_COMMIT_TIMELINE_STEPS.find(({ event }) => event.type === eventType);
  expect(step, `timeline step ${eventType} should exist`).toBeDefined();

  const deltaMs = (step?.atMs ?? previousTimelineAtMs) - previousTimelineAtMs;
  await page.clock.runFor(deltaMs);
  return step?.atMs ?? previousTimelineAtMs;
}

async function captureFocusStage(
  page: Page,
  outputDirectory: string,
  state: 'SCANNING' | 'SEARCHING' | 'PEAK_DETECTED' | 'LOCKING' | 'REVEALING',
  phase: 'scanning' | 'focusing' | 'acquired' | 'locked' | 'resolving',
  filename: string,
): Promise<void> {
  await expectFocusStage(page, state, phase);
  await capture(page, path.join(outputDirectory, filename));
}

async function expectFocusStage(
  page: Page,
  state: 'SCANNING' | 'SEARCHING' | 'PEAK_DETECTED' | 'LOCKING' | 'REVEALING',
  phase: 'scanning' | 'focusing' | 'acquired' | 'locked' | 'resolving',
): Promise<void> {
  const instrument = page.locator(
    `.display-screen[data-state='${state}'] [data-testid='display-focus-instrument'][data-focus-phase='${phase}']`,
  );
  await expect(instrument).toBeVisible();
}

async function expectRedWhiteDisplayPalette(page: Page): Promise<void> {
  const palette = await page.locator('.display-screen').evaluate((screen) => {
    const style = getComputedStyle(screen);
    return {
      primary: style.getPropertyValue('--display-primary').trim(),
      grid: style.getPropertyValue('--display-grid').trim(),
      signal: style.getPropertyValue('--display-wave-color').trim(),
      text: style.getPropertyValue('--display-text-primary').trim(),
    };
  });

  expect(palette.primary.toLowerCase()).toBe('#c83232');
  expect(JSON.stringify(palette)).not.toMatch(/22,\s*124,\s*146|50,\s*89,\s*105|69,\s*108,\s*124/i);
}

async function capture(page: Page, targetPath: string): Promise<void> {
  const layout = await page.locator('.display-screen').evaluate((screen) => {
    const rect = screen.getBoundingClientRect();
    return {
      horizontalOverflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        window.innerWidth,
      verticalOverflow:
        Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) -
        window.innerHeight,
      screenFits:
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= window.innerWidth &&
        rect.bottom <= window.innerHeight,
    };
  });

  expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(layout.verticalOverflow).toBeLessThanOrEqual(1);
  expect(layout.screenFits).toBe(true);
  await page.screenshot({ path: targetPath });
}

async function drawAndRevealPrizeFromCurrentDraw(page: Page): Promise<string> {
  const prizeLocator = page.locator('.display-result-prize');
  await expect(prizeLocator).toBeVisible({ timeout: 15_000 });
  return (await prizeLocator.textContent())?.trim() ?? '';
}

async function importVisualPrize(page: Page, json: string): Promise<void> {
  await importPrizeJson(page, json);
  await expect(page.getByText('奖品 JSON 已导入。')).toBeVisible();
}

async function updateConfiguredEventStatus(
  page: Page,
  status: 'PAUSED' | 'ENDED',
): Promise<void> {
  await page.evaluate(async (nextStatus) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('signal-hunt');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('events', 'readwrite');
      const store = transaction.objectStore('events');
      const request = store.getAll();
      request.onsuccess = () => {
        const configuredEvent = (request.result as Array<Record<string, unknown>>).find(
          (event) => event.status === 'ACTIVE',
        );
        if (!configuredEvent) {
          reject(new Error('Active visual-test event was not found.'));
          return;
        }
        store.put({ ...configuredEvent, status: nextStatus });
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    database.close();
    const change = {
      type: nextStatus === 'PAUSED' ? 'EVENT_PAUSED' : 'EVENT_ENDED',
      revision: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'signal-hunt-app-sync:event',
        newValue: JSON.stringify(change),
      }),
    );
  }, status);
}

function prizeJson(name: string, id: string, level = 1): string {
  return JSON.stringify([
    {
      id,
      name,
      shortName: name,
      level,
      inventoryTotal: 1,
      inventoryRemaining: 1,
      weight: 100,
      enabled: true,
      probabilityMode: 'FIXED',
    },
  ]);
}
