import { expect, test, type Page } from '@playwright/test';

import { SINGLE_PRIZE_JSON, drawAndRevealPrize, importPrizeJson, setDefaultEventOpenTime } from './db';

test('admin changes sync to display without refresh', async ({ context, page: display }) => {
  const pageErrors: string[] = [];
  display.on('pageerror', (error) => pageErrors.push(error.message));

  await setDefaultEventOpenTime(context);
  await display.goto('/display');
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  const control = await context.newPage();
  await importPrizeJson(control, SINGLE_PRIZE_JSON);

  await control.goto('/admin/event');
  const activeEventRow = control.locator('tbody tr').filter({ hasText: /进行中|ACTIVE/i }).first();
  const pauseButton = activeEventRow.getByRole('button', { name: /暂停|Pause/i });
  await expect(pauseButton).toBeEnabled();
  await pauseButton.click();
  await expect(display.locator('main')).toHaveAttribute('data-state', 'PAUSED');

  await dispatchSyncInvalidations(display, [
    'duplicate-pause',
    'duplicate-pause',
    'extra-pause-1',
    'extra-pause-2',
  ]);
  await expect(display.locator('main')).toHaveAttribute('data-state', 'PAUSED');

  const pausedEventRow = control.locator('tbody tr').filter({ hasText: /暂停|PAUSED|已暂停/ }).first();
  const activateButton = pausedEventRow.getByRole('button', { name: /激活|Activate/i });
  await expect(activateButton).toBeEnabled();
  await activateButton.click();
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  // Change notifications are invalidations, not state commands. A delayed
  // EVENT_PAUSED notification must re-read the ACTIVE database state.
  await dispatchSyncInvalidations(display, ['stale-pause-after-resume']);
  await dispatchMalformedSyncInvalidation(display);
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  await expect(drawAndRevealPrize(display)).resolves.toBe('E2E Only Prize');
  expect(pageErrors).toEqual([]);
});

async function dispatchSyncInvalidations(page: Page, revisions: string[]): Promise<void> {
  await page.evaluate(
    ({ storageKey, revisionValues }) => {
      for (const revision of revisionValues) {
        const change = {
          type: 'EVENT_PAUSED',
          eventId: 'default-event',
          revision,
          timestamp: new Date().toISOString(),
        };
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: storageKey,
            newValue: JSON.stringify(change),
          }),
        );
      }
    },
    {
      storageKey: 'signal-hunt-app-sync:event',
      revisionValues: revisions,
    },
  );
}

async function dispatchMalformedSyncInvalidation(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'signal-hunt-app-sync:event',
        newValue: '{malformed',
      }),
    );
  });
}
