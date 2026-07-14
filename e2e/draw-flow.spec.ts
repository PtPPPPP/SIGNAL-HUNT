import { expect, test } from '@playwright/test';

import { countStore, drawAndRevealPrize, readStore } from './db';

type Prize = { id: string; inventoryTotal: number; inventoryRemaining: number };

/**
 * E2E 1 — full draw main flow + refresh recovery.
 *
 * Verifies the core on-site invariant: a touch commits one draw, the result is
 * revealed, and after a reload the SAME prize is recovered from the committed
 * record — without ever creating a second DrawRecord or double-decrementing stock.
 */
test('E2E-1 draw commits once and recovers the same prize after reload', async ({ page }) => {
  await page.goto('/display');
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  const prizeName = await drawAndRevealPrize(page);
  await expect(countStore(page, 'drawRecords')).resolves.toBe(1);

  // Inventory decremented exactly once across all prizes.
  const prizesBefore = await readStore<Prize>(page, 'prizes');
  const decrementsBefore = totalDecrements(prizesBefore);
  expect(decrementsBefore).toBe(1);

  // Reload mid-result: recovery must restore the SAME prize, not re-draw.
  await page.reload();
  await expect(page.locator('main')).toHaveAttribute('data-state', 'RESULT');
  await expect(page.locator('.display-result-prize')).toHaveText(prizeName);

  // Still exactly one record and one decrement — no second draw happened.
  await expect(countStore(page, 'drawRecords')).resolves.toBe(1);
  const prizesAfter = await readStore<Prize>(page, 'prizes');
  expect(totalDecrements(prizesAfter)).toBe(1);
});

/**
 * E2E 2 — staff ends the current display result.
 *
 * Ending the result on /staff clears the active session so /display returns to
 * ATTRACT, but it must NOT re-draw or decrement inventory a second time.
 */
test('E2E-2 staff ends the result; display returns to ATTRACT without re-drawing', async ({ page }) => {
  await page.goto('/display');
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');
  const prizeName = await drawAndRevealPrize(page);
  await expect(countStore(page, 'drawRecords')).resolves.toBe(1);

  await page.goto('/staff');
  await expect(page.getByText(prizeName)).toBeVisible();
  await page.getByRole('button', { name: '结束当前结果并返回待机' }).click();
  await expect(page.getByText(/已结束当前结果/)).toBeVisible();

  await page.goto('/display');
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  // No re-draw: still one record, one decrement.
  await expect(countStore(page, 'drawRecords')).resolves.toBe(1);
  const prizes = await readStore<Prize>(page, 'prizes');
  expect(totalDecrements(prizes)).toBe(1);
});

function totalDecrements(prizes: Prize[]): number {
  return prizes.reduce((sum, prize) => sum + (prize.inventoryTotal - prize.inventoryRemaining), 0);
}
