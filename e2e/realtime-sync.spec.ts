import { expect, test } from '@playwright/test';

import { SINGLE_PRIZE_JSON, drawAndRevealPrize } from './db';

test('后台修改活动和奖品后，大屏无需刷新即可使用最新配置', async ({ context, page: display }) => {
  await display.goto('/display');
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  const control = await context.newPage();
  await control.goto('/admin/prizes');
  await control.getByLabel('奖品 JSON').fill(SINGLE_PRIZE_JSON);
  await control.getByRole('button', { name: '导入 JSON' }).click();
  await expect(control.getByText(/奖品 JSON 已导入/)).toBeVisible();

  await control.goto('/admin/event');
  const activeEventRow = control.getByRole('row').filter({ hasText: '进行中' });
  await activeEventRow.getByRole('button', { name: '暂停' }).click();
  await expect(display.locator('main')).toHaveAttribute('data-state', 'PAUSED');

  const pausedEventRow = control.getByRole('row').filter({ hasText: '已暂停' });
  await pausedEventRow.getByRole('button', { name: '激活' }).click();
  await expect(display.locator('main')).toHaveAttribute('data-state', 'ATTRACT');

  await expect(drawAndRevealPrize(display)).resolves.toBe('E2E唯一奖');
});
