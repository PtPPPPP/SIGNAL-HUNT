import { expect, test } from '@playwright/test';

import { countStore, setDefaultEventOpenTime } from './db';

const targetViewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
] as const;

for (const viewport of targetViewports) {
  test(`admin tables and pacing actions remain readable at ${viewport.width}x${viewport.height}`, async ({
    context,
    page,
  }) => {
    await setDefaultEventOpenTime(context);
    await page.setViewportSize(viewport);
    await page.goto('/display');
    await page.locator('.primary-touch-target').click();
    await expect.poll(() => countStore(page, 'drawRecords')).toBe(1);

    for (const route of ['/admin/event', '/admin/prizes', '/admin/records']) {
      await page.goto(route);
      const tableRegion = page.locator('.ui-table-scroll').first();
      await expect(tableRegion).toBeVisible();
      const layout = await tableRegion.evaluate((region) => {
        const table = region.querySelector('table');
        const nowrapCells = [...region.querySelectorAll<HTMLElement>('[data-nowrap]')];
        return {
          regionWidth: region.clientWidth,
          tableWidth: table?.scrollWidth ?? 0,
          nowrap: nowrapCells.every(
            (cell) => getComputedStyle(cell).whiteSpace === 'nowrap',
          ),
        };
      });
      expect(layout.tableWidth).toBeGreaterThanOrEqual(layout.regionWidth);
      expect(layout.nowrap).toBe(true);
    }

    await page.goto('/admin/pacing');
    const actionBar = page.locator('.pacing-action-bar');
    await expect(actionBar).toBeVisible();
    expect(await actionBar.evaluate((bar) => getComputedStyle(bar).position)).toBe(
      'static',
    );
  });
}
