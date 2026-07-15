import { expect, test } from '@playwright/test';

import { countStore, drawAndRevealPrize, readStore, setDefaultEventOpenTime } from './db';

type Prize = { id: string; inventoryTotal: number; inventoryRemaining: number };

/**
 * E2E 1 â€?full draw main flow + refresh recovery.
 *
 * Verifies the core on-site invariant: a touch commits one draw, the result is
 * revealed, and after a reload the SAME prize is recovered from the committed
 * record â€?without ever creating a second DrawRecord or double-decrementing stock.
 */
test('E2E-1 draw commits once and recovers the same prize after reload', async ({ page }) => {
  await setDefaultEventOpenTime(page);
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

  // Still exactly one record and one decrement â€?no second draw happened.
  await expect(countStore(page, 'drawRecords')).resolves.toBe(1);
  const prizesAfter = await readStore<Prize>(page, 'prizes');
  expect(totalDecrements(prizesAfter)).toBe(1);
});

/**
 * E2E 2 â€?operator ends the current display result.
 *
 * Ending the result from the display clears the active session so /display returns to
 * ATTRACT, but it must NOT re-draw or decrement inventory a second time.
 */
test('E2E-2 operator ends the result; display returns to ATTRACT without re-drawing', async ({ page }) => {
  await setDefaultEventOpenTime(page);
  await page.goto('/display');
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');
  await drawAndRevealPrize(page);
  await expect(countStore(page, 'drawRecords')).resolves.toBe(1);

  await page.locator('.next-participant-button').click();
  await page.locator('.confirm-button-ok').click();

  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  // No re-draw: still one record, one decrement.
  await expect(countStore(page, 'drawRecords')).resolves.toBe(1);
  const prizes = await readStore<Prize>(page, 'prizes');
  expect(totalDecrements(prizes)).toBe(1);
});

function totalDecrements(prizes: Prize[]): number {
  return prizes.reduce((sum, prize) => sum + (prize.inventoryTotal - prize.inventoryRemaining), 0);
}

