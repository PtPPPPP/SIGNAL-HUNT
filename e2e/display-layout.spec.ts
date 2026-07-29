import { expect, test } from '@playwright/test';

import {
  drawAndRevealPrize,
  seedDemoThenImportPrizes,
  setDefaultEventOpenTime,
} from './db';

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
] as const;

for (const viewport of viewports) {
  test(`display attract screen fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await setDefaultEventOpenTime(page);
    await page.setViewportSize(viewport);
    await page.goto('/display');
    await expect(page.locator('.display-screen')).toHaveAttribute('data-state', 'ATTRACT');
    await expect(page.locator('.display-brandbar .brand-logo')).toBeVisible();
    await expect(page.locator('.primary-touch-target')).toBeVisible();

    const layout = await page.evaluate(() => {
      const title = document.querySelector<HTMLElement>('.display-panel h1');
      const rootOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;

      if (!title) {
        throw new Error('Display title was not rendered.');
      }

      const titleStyle = getComputedStyle(title);
      const titleRect = title.getBoundingClientRect();
      return {
        rootOverflow,
        titleIsSingleLine: titleStyle.whiteSpace === 'nowrap',
        titleFitsViewport: titleRect.left >= 0 && titleRect.right <= window.innerWidth,
      };
    });

    expect(layout.rootOverflow).toBeLessThanOrEqual(1);
    expect(layout.titleIsSingleLine).toBe(true);
    expect(layout.titleFitsViewport).toBe(true);
  });
}

test('display result and confirmation fit 1280x800 with a long prize name', async ({ page }) => {
  const longPrizeName = '量子测量系统精密信号分析纪念套装';
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedDemoThenImportPrizes(
    page,
    JSON.stringify([
      {
        id: 'long-display-prize',
        name: longPrizeName,
        shortName: '信号分析套装',
        level: 1,
        inventoryTotal: 1,
        inventoryRemaining: 1,
        weight: 1,
        enabled: true,
      },
    ]),
  );

  await page.goto('/display');
  await expect(drawAndRevealPrize(page)).resolves.toBe(longPrizeName);

  const resultLayout = await page.locator('.display-result').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(resultLayout.left).toBeGreaterThanOrEqual(0);
  expect(resultLayout.top).toBeGreaterThanOrEqual(0);
  expect(resultLayout.right).toBeLessThanOrEqual(resultLayout.viewportWidth);
  expect(resultLayout.bottom).toBeLessThanOrEqual(resultLayout.viewportHeight);

  await page.getByRole('button', { name: '下一位参与者' }).click();
  const confirmation = page.getByRole('alertdialog', { name: '确认结束当前中奖结果' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toBeInViewport();
});
