import { expect, test } from '@playwright/test';

import { readStore } from './db';

const createdAt = '2026-07-14T01:00:00.000Z';

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
          name: '恢复验收活动',
          code: 'RESTORE-E2E',
          status: 'ACTIVE',
          createdAt,
        },
      ],
      prizes: [
        {
          id: 'restore-prize',
          name: '恢复验收奖品',
          shortName: '恢复奖品',
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
              prizeNameSnapshot: '恢复验收奖品',
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

test('坏备份不改数据库，合法恢复后大屏、工作人员和后台同步更新', async ({ context, page: display }) => {
  await display.goto('/display');
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  const staff = await context.newPage();
  await staff.goto('/staff');
  await expect(staff.getByText('当前没有可处理的中奖结果。')).toBeVisible();

  const admin = await context.newPage();
  await admin.goto('/admin/system');
  const originalEvents = await readStore<{ id: string }>(admin, 'events');

  await admin.getByLabel('备份 JSON').fill(JSON.stringify(backup(-1)));
  await admin.getByRole('button', { name: '解析并预览' }).click();
  await expect(admin.getByText(/阻塞错误 1/)).toBeVisible();
  await expect(admin.getByRole('button', { name: '恢复备份' })).toBeDisabled();
  await expect(readStore<{ id: string }>(admin, 'events')).resolves.toEqual(originalEvents);

  await admin.getByLabel('备份 JSON').fill(JSON.stringify(backup(1, true)));
  await admin.getByRole('button', { name: '解析并预览' }).click();
  await expect(admin.getByText(/阻塞错误 0/)).toBeVisible();
  await admin.getByRole('button', { name: '恢复备份' }).click();
  await admin.getByRole('button', { name: '确认恢复' }).click();

  await expect(admin.getByText(/已恢复备份/)).toBeVisible();
  await expect(admin.getByText('需要处理')).toBeVisible();
  await expect(display.locator('main')).toHaveAttribute('data-state', 'RESULT');
  await expect(display.getByText('恢复验收奖品')).toBeVisible();
  await expect(staff.getByText('恢复验收奖品')).toBeVisible();
  await expect(staff.getByText('restore-record')).toBeVisible();
});
