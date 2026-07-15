import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

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

export async function drawAndRevealPrize(page: Page, timeout = 15_000): Promise<string> {
  await page.locator('.primary-touch-target').click();
  const prizeLocator = page.locator('.display-result-prize');
  await expect(prizeLocator).toBeVisible({ timeout });
  const name = (await prizeLocator.textContent())?.trim() ?? '';

  expect(name.length, 'a prize name should be revealed').toBeGreaterThan(0);

  return name;
}

export async function setDefaultEventOpenTime(target: BrowserContext | Page): Promise<void> {
  await target.addInitScript(() => {
    const fixedNow = new Date('2026-07-15T02:00:00.000Z').getTime();
    const RealDate = Date;

    class FixedDate extends RealDate {
      constructor(value?: string | number | Date) {
        if (arguments.length === 0) {
          super(fixedNow);
          return;
        }

        super(value as string | number | Date);
      }

      static now() {
        return fixedNow;
      }
    }

    Object.setPrototypeOf(FixedDate, RealDate);
    FixedDate.prototype = RealDate.prototype;
    window.Date = FixedDate as DateConstructor;
  });
}

export async function seedDemoThenImportPrizes(page: Page, json: string): Promise<void> {
  await setDefaultEventOpenTime(page);
  await page.goto('/display');
  await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  await importPrizeJson(page, json);
}

export async function importPrizeJson(page: Page, json: string): Promise<void> {
  await page.goto('/admin/prizes');
  const jsonField = page.locator('.admin-json-field textarea');
  await expect(jsonField).toBeVisible();
  await jsonField.fill(json);
  await page.locator('.admin-toolbar button').nth(2).click();
}

export const THREE_PRIZE_JSON = JSON.stringify(
  [
    {
      id: 'e2e-first',
      name: 'E2E First Prize',
      shortName: 'E2E First',
      level: 1,
      inventoryTotal: 1,
      inventoryRemaining: 1,
      weight: 5,
      enabled: true,
      probabilityMode: 'FIXED',
    },
    {
      id: 'e2e-second',
      name: 'E2E Second Prize',
      shortName: 'E2E Second',
      level: 2,
      inventoryTotal: 5,
      inventoryRemaining: 5,
      weight: 25,
      enabled: true,
      probabilityMode: 'FIXED',
    },
    {
      id: 'e2e-third',
      name: 'E2E Third Prize',
      shortName: 'E2E Third',
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

export const SINGLE_PRIZE_JSON = JSON.stringify(
  [
    {
      id: 'e2e-only',
      name: 'E2E Only Prize',
      shortName: 'E2E Only',
      level: 1,
      inventoryTotal: 1,
      inventoryRemaining: 1,
      weight: 100,
      enabled: true,
      probabilityMode: 'FIXED',
    },
    {
      id: 'e2e-disabled-a',
      name: 'E2E Disabled A',
      shortName: 'E2E Disabled A',
      level: 2,
      inventoryTotal: 0,
      inventoryRemaining: 0,
      weight: 0,
      enabled: false,
      probabilityMode: 'FIXED',
    },
    {
      id: 'e2e-disabled-b',
      name: 'E2E Disabled B',
      shortName: 'E2E Disabled B',
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
