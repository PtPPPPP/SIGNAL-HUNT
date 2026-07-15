import { expect, test } from '@playwright/test';

import { readStore, setDefaultEventOpenTime } from './db';

const createdAt = '2026-07-14T01:00:00.000Z';
const restoredPrizeName = 'Restore Acceptance Prize';

function backup(inventoryRemaining: number, withActiveDraw = false) {
  return {
    format: 'signal-hunt-backup',
    version: 1,
    appVersion: '0.9.0-beta',
    createdAt,
    data: {
      events: [
        {
          id: 'restore-event',
          name: 'Restore Acceptance Event',
          code: 'RESTORE-E2E',
          status: 'ACTIVE',
          createdAt,
        },
      ],
      prizes: [
        {
          id: 'restore-prize',
          name: restoredPrizeName,
          shortName: 'Restore Prize',
          level: 1,
          inventoryTotal: 2,
          inventoryRemaining,
          weight: 1,
          enabled: true,
          probabilityMode: 'FIXED',
        },
      ],
      drawSessions: withActiveDraw
        ? [
            {
              id: 'restore-session',
              eventId: 'restore-event',
              status: 'COMMITTED',
              committedRecordId: 'restore-record',
              createdAt,
              committedAt: createdAt,
            },
          ]
        : [],
      drawRecords: withActiveDraw
        ? [
            {
              id: 'restore-record',
              eventId: 'restore-event',
              sessionId: 'restore-session',
              prizeId: 'restore-prize',
              prizeNameSnapshot: restoredPrizeName,
              createdAt,
              committedAt: createdAt,
              redeemed: false,
              status: 'COMMITTED',
            },
          ]
        : [],
    },
  };
}

test('invalid backup leaves DB unchanged; valid restore syncs display and admin', async ({ context, page: display }) => {
  await setDefaultEventOpenTime(context);
  await display.goto('/display');
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  const admin = await context.newPage();
  await admin.goto('/admin/system');
  const originalEvents = await readStore<{ id: string }>(admin, 'events');
  const importTextarea = admin.locator('textarea').nth(1);
  const buttons = admin.locator('button.admin-button');
  const parseButton = buttons.nth(3);
  const restoreButton = buttons.nth(4);

  await importTextarea.fill(JSON.stringify(backup(-1)));
  await parseButton.click();
  await expect(restoreButton).toBeDisabled();
  await expect(readStore<{ id: string }>(admin, 'events')).resolves.toEqual(originalEvents);

  await importTextarea.fill(JSON.stringify(backup(1, true)));
  await parseButton.click();
  await expect(restoreButton).toBeEnabled();
  await restoreButton.click();
  await admin.locator('.confirm-button-ok').click();

  await expect(display.locator('main')).toHaveAttribute('data-state', 'RESULT');
  await expect(display.getByText(restoredPrizeName)).toBeVisible();
  await expect(readStore<{ id: string }>(admin, 'drawRecords')).resolves.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'restore-record' })]),
  );
});
