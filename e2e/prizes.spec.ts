import { expect, test } from '@playwright/test';

import {
  countStore,
  drawAndRevealPrize,
  getRecord,
  readStore,
  seedDemoThenImportPrizes,
  SINGLE_PRIZE_JSON,
  THREE_PRIZE_JSON,
} from './db';

type Prize = { id: string; name: string; inventoryRemaining: number; inventoryTotal: number; enabled: boolean };

/**
 * E2E 4 — prize configuration persistence.
 *
 * Imported config must survive a full reload (real IndexedDB persistence). We do
 * NOT assert on a single random draw here (per the brief, never assert probability
 * from one random outcome); instead E2E-5 covers "the draw pool honors config"
 * deterministically with a single-prize pool. Pacing-console UI (/admin/pacing)
 * is intentionally not driven here — it is the other agent's active refactor area.
 */
test('E2E-4 imported prize config persists across reload', async ({ page }) => {
  await page.goto('/admin/prizes');
  await expect(page.getByRole('heading', { name: '奖品列表' })).toBeVisible();

  await page.getByLabel('奖品 JSON').fill(THREE_PRIZE_JSON);
  await page.getByRole('button', { name: '导入 JSON' }).click();
  await expect(page.getByText(/奖品 JSON 已导入/)).toBeVisible();
  await expect(countStore(page, 'prizes')).resolves.toBe(3);

  // Reload — config must still be there (persisted in IndexedDB).
  await page.reload();
  await expect(page.getByRole('row', { name: /E2E一等奖/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /E2E三等奖/ })).toBeVisible();
  await expect(countStore(page, 'prizes')).resolves.toBe(3);
});

/**
 * E2E 5 — draw pool honors config + inventory exhaustion.
 *
 * A single enabled prize with one unit of stock makes the draw deterministic
 * (the pool has exactly one drawable prize, so it must win) — this proves the
 * pool uses the imported config without modifying production crypto random.
 * After that draw the prize is depleted and leaves the pool, so a second draw
 * hits the staff-assist ERROR state instead of over-awarding stock.
 */
test('E2E-5 depleted prize leaves the pool; next draw errors out', async ({ page }) => {
  await seedDemoThenImportPrizes(page, SINGLE_PRIZE_JSON);

  await page.goto('/display');
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');
  const prizeName = await drawAndRevealPrize(page);
  expect(prizeName).toBe('E2E唯一奖');

  // Stock depleted to zero exactly once.
  const only = await getRecord<Prize>(page, 'prizes', 'e2e-only');
  expect(only).toMatchObject({ inventoryRemaining: 0, inventoryTotal: 1 });

  // End the result so we can attempt another draw.
  await page.goto('/staff');
  await page.getByRole('button', { name: '结束当前结果并返回待机' }).click();
  await expect(page.getByText(/已结束当前结果/)).toBeVisible();

  // Next draw -> no active prize in the pool -> ERROR (staff assist), no over-award.
  await page.goto('/display');
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');
  await page.getByRole('button', { name: '点亮好运' }).click();
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ERROR');

  // Still exactly one record and one unit consumed.
  await expect(countStore(page, 'drawRecords')).resolves.toBe(1);
  const prizes = await readStore<Prize>(page, 'prizes');
  const decrements = prizes.reduce((sum, p) => sum + (p.inventoryTotal - p.inventoryRemaining), 0);
  expect(decrements).toBe(1);
});

/**
 * E2E 6 — JSON prize import validation.
 *
 * Valid JSON is applied. Invalid JSON is rejected by Zod and the prize table is
 * NOT partially polluted — replacePrizes is transactional and validation throws
 * before any write, so the row count is unchanged.
 */
test('E2E-6 valid JSON imports; invalid JSON is rejected without polluting the table', async ({ page }) => {
  await page.goto('/admin/prizes');
  await expect(page.getByRole('heading', { name: '奖品列表' })).toBeVisible();
  const baseline = await countStore(page, 'prizes');

  // Invalid JSON -> rejected, table unchanged.
  await page.getByLabel('奖品 JSON').fill('{ "this": "is not a prize array"');
  await page.getByRole('button', { name: '导入 JSON' }).click();
  await expect(page.getByText(/奖品 JSON 无效/)).toBeVisible();
  await expect(countStore(page, 'prizes')).resolves.toBe(baseline);

  // Malformed-but-array JSON (missing required fields) -> also rejected by Zod.
  await page.getByLabel('奖品 JSON').fill('[{ "id": "x" }]');
  await page.getByRole('button', { name: '导入 JSON' }).click();
  await expect(page.getByText(/奖品 JSON 无效/)).toBeVisible();
  await expect(countStore(page, 'prizes')).resolves.toBe(baseline);

  // Valid JSON -> applied, replaces the table.
  await page.getByLabel('奖品 JSON').fill(THREE_PRIZE_JSON);
  await page.getByRole('button', { name: '导入 JSON' }).click();
  await expect(page.getByText(/奖品 JSON 已导入/)).toBeVisible();
  await expect(countStore(page, 'prizes')).resolves.toBe(3);
  await expect(page.getByRole('row', { name: /E2E二等奖/ })).toBeVisible();
});
