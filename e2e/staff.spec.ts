import { expect, test } from '@playwright/test';

import { drawAndRevealPrize, readStore } from './db';

type DrawRecord = { id: string; redeemed: boolean; redeemedAt?: string; status: string };

/**
 * E2E 3 — staff redemption + duplicate-redeem block.
 *
 * Confirming redemption marks the record REDEEMED. A second confirm is explicitly
 * intercepted (the repo returns ALREADY_REDEEMED; the UI short-circuits with an
 * already-redeemed message). No second redemption timestamp is ever written.
 */
test('E2E-3 staff redeems once and a duplicate redemption is blocked', async ({ page }) => {
  await page.goto('/display');
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');
  await drawAndRevealPrize(page);

  await page.goto('/staff');
  await expect(page.getByText('未兑奖')).toBeVisible();

  await page.getByRole('button', { name: '确认兑奖' }).click();
  await expect(page.getByText(/兑奖成功/)).toBeVisible();

  // Duplicate confirm -> explicit already-redeemed message.
  await page.getByRole('button', { name: '确认兑奖' }).click();
  await expect(page.getByText(/已经.*兑奖/)).toBeVisible();

  // The persisted record is redeemed exactly once with a single timestamp.
  const records = await readStore<DrawRecord>(page, 'drawRecords');
  const redeemed = records.filter((record) => record.redeemed);
  expect(redeemed).toHaveLength(1);
  expect(redeemed[0]?.redeemedAt).toBeTruthy();
});
