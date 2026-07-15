import { expect, test } from '@playwright/test';

import {
  countStore,
  drawAndRevealPrize,
  getRecord,
  importPrizeJson,
  readStore,
  seedDemoThenImportPrizes,
  SINGLE_PRIZE_JSON,
  THREE_PRIZE_JSON,
  setDefaultEventOpenTime,
} from './db';

type Prize = { id: string; name: string; inventoryRemaining: number; inventoryTotal: number; enabled: boolean };

test('E2E-4 imported prize config persists across reload', async ({ page }) => {
  await importPrizeJson(page, THREE_PRIZE_JSON);
  await expect(countStore(page, 'prizes')).resolves.toBe(3);

  await page.reload();
  const prizes = await readStore<Prize>(page, 'prizes');
  expect(prizes.map((prize) => prize.name).sort()).toEqual([
    'E2E First Prize',
    'E2E Second Prize',
    'E2E Third Prize',
  ]);
});

test('E2E-5 depleted prize leaves the pool; next draw errors out', async ({ page }) => {
  await setDefaultEventOpenTime(page);
  await seedDemoThenImportPrizes(page, SINGLE_PRIZE_JSON);

  await page.goto('/display');
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');
  const prizeName = await drawAndRevealPrize(page);
  expect(prizeName).toBe('E2E Only Prize');

  const only = await getRecord<Prize>(page, 'prizes', 'e2e-only');
  expect(only).toMatchObject({ inventoryRemaining: 0, inventoryTotal: 1 });

  await page.locator('.next-participant-button').click();
  await page.locator('.confirm-button-ok').click();

  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');
  await page.locator('.primary-touch-target').click();
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ERROR');

  await expect(countStore(page, 'drawRecords')).resolves.toBe(1);
  const prizes = await readStore<Prize>(page, 'prizes');
  const decrements = prizes.reduce((sum, p) => sum + (p.inventoryTotal - p.inventoryRemaining), 0);
  expect(decrements).toBe(1);
});

test('E2E-6 valid JSON imports; invalid JSON is rejected without polluting the table', async ({ page }) => {
  await page.goto('/admin/prizes');
  const baseline = await countStore(page, 'prizes');
  const jsonField = page.locator('.admin-json-field textarea');
  await expect(jsonField).toBeVisible();
  const importButton = page.locator('.admin-toolbar button').nth(2);

  await jsonField.fill('{ "this": "is not a prize array"');
  await importButton.click();
  await expect(countStore(page, 'prizes')).resolves.toBe(baseline);

  await jsonField.fill('[{ "id": "x" }]');
  await importButton.click();
  await expect(countStore(page, 'prizes')).resolves.toBe(baseline);

  await jsonField.fill(THREE_PRIZE_JSON);
  await importButton.click();
  await expect(countStore(page, 'prizes')).resolves.toBe(3);
  const prizes = await readStore<Prize>(page, 'prizes');
  expect(prizes.some((prize) => prize.name === 'E2E Second Prize')).toBe(true);
});
