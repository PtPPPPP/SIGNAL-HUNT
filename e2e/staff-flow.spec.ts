import { expect, test } from '@playwright/test';

import { drawAndRevealPrize, readStore, setDefaultEventOpenTime } from './db';

type DrawRecord = { status: string; redeemed: boolean; voidReason?: string };

test('staff redeems a result then ends its display without changing redemption', async ({ context, page: display }) => {
  await setDefaultEventOpenTime(context);
  await display.goto('/display');
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');
  const prizeName = await drawAndRevealPrize(display);

  const staff = await context.newPage();
  await staff.goto('/staff');
  await expect(staff.getByRole('heading', { name: prizeName })).toBeVisible();

  await staff.getByRole('button', { name: '确认兑奖' }).click();
  await staff
    .getByRole('dialog', { name: '确认已完成兑奖？' })
    .getByRole('button', { name: '确认兑奖' })
    .click();
  await expect(staff.getByText('已确认兑奖。')).toBeVisible();
  await staff.getByRole('button', { name: '结束当前展示' }).click();
  await staff
    .getByRole('dialog', { name: '结束当前展示？' })
    .getByRole('button', { name: '结束展示' })
    .click();

  const records = await readStore<DrawRecord>(display, 'drawRecords');
  const sessions = await readStore(display, 'drawSessions');
  expect(records).toHaveLength(1);
  expect(sessions).toHaveLength(0);
  expect(records[0]).toMatchObject({ status: 'REDEEMED', redeemed: true });
  await display.reload();
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');
});

test('staff voids the active result with a reason and ends the active session', async ({ context, page: display }) => {
  await setDefaultEventOpenTime(context);
  await display.goto('/display');
  await drawAndRevealPrize(display);

  const staff = await context.newPage();
  await staff.goto('/staff');
  await staff.getByRole('button', { name: '作废记录' }).click();
  await staff.getByLabel('作废原因').selectOption('现场误触');
  await staff.getByRole('button', { name: '确认作废' }).click();

  await expect(staff.getByText('结果已作废，当前展示已结束。')).toBeVisible();
  const records = await readStore<DrawRecord>(display, 'drawRecords');
  expect(records[0]).toMatchObject({ status: 'VOIDED', redeemed: false, voidReason: '现场误触' });
  await display.reload();
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');
});
