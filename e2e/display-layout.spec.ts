import { expect, test } from '@playwright/test';

import { setDefaultEventOpenTime } from './db';

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
