import { expect, test } from '@playwright/test';

import { SINGLE_PRIZE_JSON, drawAndRevealPrize, importPrizeJson, setDefaultEventOpenTime } from './db';

test('admin changes sync to display without refresh', async ({ context, page: display }) => {
  await setDefaultEventOpenTime(context);
  await display.goto('/display');
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  const control = await context.newPage();
  await importPrizeJson(control, SINGLE_PRIZE_JSON);

  await control.goto('/admin/event');
  const activeEventRow = control.locator('tbody tr').filter({ has: control.locator('.status-badge') }).first();
  await activeEventRow.locator('button').filter({ hasText: /暂停|Pause/i }).click();
  await expect(display.locator('main')).toHaveAttribute('data-state', 'PAUSED');

  const pausedEventRow = control.locator('tbody tr').filter({ hasText: /暂停|PAUSED|已暂停/ }).first();
  await pausedEventRow.locator('button').filter({ hasText: /激活|Activate/i }).click();
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  await expect(drawAndRevealPrize(display)).resolves.toBe('E2E Only Prize');
});
