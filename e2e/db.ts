import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Raw IndexedDB read helpers for E2E assertions.
 *
 * The app uses Dexie, but Dexie stores are plain IndexedDB object stores, so we
 * can read them directly from the page without exposing any test hook in the app
 * bundle. This lets E2E assert on the real persisted state (record counts, prize
 * inventory, redemption flag) at the data layer — which is exactly what
 * "database not polluted" / "no second record" checks need.
 *
 * The database name matches DATABASE_NAME in src/db/database.ts ('signal-hunt').
 */

/** Count rows in a given store (e.g. 'drawRecords', 'prizes'). */
export async function countStore(page: Page, store: string): Promise<number> {
  return page.evaluate(async (storeName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('signal-hunt');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return new Promise<number>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }, store);
}

/** Read a single record by id from a store. */
export async function getRecord<T>(page: Page, store: string, id: string): Promise<T | undefined> {
  return page.evaluate(
    async ({ storeName, key }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('signal-hunt');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      return new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      });
    },
    { storeName: store, key: id },
  );
}

/** Read every row of a store (small tables only — prizes, drawSessions). */
export async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(async (storeName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('signal-hunt');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }, store);
}

/**
 * Touch the display to start a draw and resolve with the revealed prize name.
 * Assumes the page is already on /display in the ATTRACT state with a drawable
 * event. RESULT appears ~5s after the commit succeeds (see displayTimeline).
 */
export async function drawAndRevealPrize(page: Page, timeout = 15_000): Promise<string> {
  await page.getByRole('button', { name: '触碰屏幕 · 开始捕获' }).click();
  const prizeLocator = page.locator('.display-result-prize');
  await expect(prizeLocator).toBeVisible({ timeout });
  const name = (await prizeLocator.textContent())?.trim() ?? '';

  expect(name.length, 'a prize name should be revealed').toBeGreaterThan(0);

  return name;
}

/**
 * Seed the demo event (by visiting /display once in DEV, which auto-seeds), then
 * replace the prize table with `json`. After this the active demo event is
 * drawable with exactly the imported prizes — the demo prizes are wiped by the
 * transactional replace, so the pool is deterministic.
 */
export async function seedDemoThenImportPrizes(page: Page, json: string): Promise<void> {
  await page.goto('/display');
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  await page.goto('/admin/prizes');
  await expect(page.getByRole('heading', { name: '奖品列表' })).toBeVisible();
  await page.getByLabel('奖品 JSON').fill(json);
  await page.getByRole('button', { name: '导入 JSON' }).click();
  await expect(page.getByText(/奖品 JSON 已导入/)).toBeVisible();
}

/** A valid three-tier prize config used by import + persistence tests. */
export const THREE_PRIZE_JSON = JSON.stringify(
  [
    {
      id: 'e2e-first',
      name: 'E2E一等奖',
      shortName: 'E2E一等奖',
      level: 1,
      inventoryTotal: 1,
      inventoryRemaining: 1,
      weight: 5,
      enabled: true,
      probabilityMode: 'FIXED',
    },
    {
      id: 'e2e-second',
      name: 'E2E二等奖',
      shortName: 'E2E二等奖',
      level: 2,
      inventoryTotal: 5,
      inventoryRemaining: 5,
      weight: 25,
      enabled: true,
      probabilityMode: 'FIXED',
    },
    {
      id: 'e2e-third',
      name: 'E2E三等奖',
      shortName: 'E2E三等奖',
      level: 3,
      inventoryTotal: 20,
      inventoryRemaining: 20,
      weight: 70,
      enabled: true,
      probabilityMode: 'FIXED',
    },
  ],
  null,
  2,
);

/**
 * A single enabled prize with one unit of stock — used to make a draw
 * deterministic (only one prize is drawable, so it must win) and to test
 * inventory exhaustion. The other two tiers are disabled with zero stock.
 */
export const SINGLE_PRIZE_JSON = JSON.stringify(
  [
    {
      id: 'e2e-only',
      name: 'E2E唯一奖',
      shortName: 'E2E唯一奖',
      level: 1,
      inventoryTotal: 1,
      inventoryRemaining: 1,
      weight: 100,
      enabled: true,
      probabilityMode: 'FIXED',
    },
    {
      id: 'e2e-disabled-a',
      name: 'E2E禁用A',
      shortName: 'E2E禁用A',
      level: 2,
      inventoryTotal: 0,
      inventoryRemaining: 0,
      weight: 0,
      enabled: false,
      probabilityMode: 'FIXED',
    },
    {
      id: 'e2e-disabled-b',
      name: 'E2E禁用B',
      shortName: 'E2E禁用B',
      level: 3,
      inventoryTotal: 0,
      inventoryRemaining: 0,
      weight: 0,
      enabled: false,
      probabilityMode: 'FIXED',
    },
  ],
  null,
  2,
);
