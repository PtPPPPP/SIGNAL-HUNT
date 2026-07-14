import { expect, test } from '@playwright/test';

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
] as const;

for (const viewport of viewports) {
  test(`probability strategy layout fits ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);

    // Development display boot creates the isolated test context's demo event and prizes.
    await page.goto('/display');
    await expect(page.locator('main')).toHaveAttribute('data-state', 'ATTRACT');
    await page.goto('/admin/pacing');
    await expect(page.getByRole('heading', { name: '逐项配置中奖概率与发放策略' })).toBeVisible();

    await page.getByRole('button', { name: '智能模式' }).click();
    await page.getByLabel('一等奖 发放方式').first().selectOption('EVEN');
    await expect(page.getByLabel('一等奖 最小中奖间隔')).toHaveCount(0);
    await page.getByRole('button', { name: '一等奖 配置智能策略' }).first().click();
    await expect(page.getByRole('region', { name: '一等奖 智能设置' })).toBeVisible();
    await expect(page.getByLabel(/最小中奖间隔/).first()).toBeVisible();
    await expect(page.locator('.strategy-advanced-panel')).toHaveCount(0);

    const layout = await page.evaluate(() => {
      const rootOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
      const visibleElements = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.admin-shell, .admin-workspace, .admin-panel, .probability-table, .probability-table-row, .probability-expanded-panel, input, select, button, label',
        ),
      ).filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });

      return {
        rootOverflow,
        shellColumns: getComputedStyle(document.querySelector('.admin-shell')!).gridTemplateColumns,
        wrappingButtons: Array.from(document.querySelectorAll<HTMLElement>('.admin-button'))
          .filter((button) => {
            const style = getComputedStyle(button);
            return style.whiteSpace !== 'nowrap' || style.wordBreak !== 'keep-all' || style.writingMode !== 'horizontal-tb';
          })
          .map((button) => button.textContent?.trim()),
        outsideViewport: visibleElements
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > window.innerWidth + 1;
          })
          .map((element) => ({
            className: element.className,
            tag: element.tagName,
            text: element.textContent?.trim().slice(0, 40),
          })),
        internallyOverflowing: visibleElements
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => ({ className: element.className, tag: element.tagName })),
      };
    });

    expect(layout.rootOverflow).toBeLessThanOrEqual(1);
    expect(layout.wrappingButtons).toEqual([]);
    expect(layout.outsideViewport).toEqual([]);
    expect(layout.internallyOverflowing).toEqual([]);
    if (viewport.width <= 900) {
      expect(layout.shellColumns.trim().split(/\s+/)).toHaveLength(1);
    }

    if (viewport.width === 1024) {
      const simpleMode = page.getByRole('button', { name: '简单模式' });
      await simpleMode.focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: '智能模式' })).toBeFocused();
    }

    await page.screenshot({
      path: testInfo.outputPath(`pacing-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  });
}
