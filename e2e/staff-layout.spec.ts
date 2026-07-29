import { expect, test } from '@playwright/test';

import { drawAndRevealPrize, setDefaultEventOpenTime } from './db';

const targetViewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
] as const;

for (const viewport of targetViewports) {
  test(`staff console fits ${viewport.width}x${viewport.height}`, async ({
    context,
    page: display,
  }) => {
    await setDefaultEventOpenTime(context);
    await display.setViewportSize(viewport);
    await display.goto('/display');
    await drawAndRevealPrize(display);

    const staff = await context.newPage();
    await staff.setViewportSize(viewport);
    await staff.goto('/staff');
    await expect(staff.locator('.staff-current-draw')).toBeVisible();
    await expect(
      staff.getByRole('button', { name: '确认兑奖' }),
    ).toBeVisible();

    const overflow = await staff.evaluate(() => ({
      horizontal:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - window.innerWidth,
      vertical:
        Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        ) - window.innerHeight,
    }));

    expect(overflow.horizontal).toBeLessThanOrEqual(1);
    expect(overflow.vertical).toBeLessThanOrEqual(1);
  });
}
