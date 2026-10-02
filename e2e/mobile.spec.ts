import { expect, test } from '@playwright/test';

test('手机上没有页面横向溢出，输入、执行和算法切换均可操作', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '数组元素' }).fill('3, 1, 2');
  await page.getByRole('button', { name: '生成演示' }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('slider', { name: '执行进度' })).toHaveValue('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/mobile-preview.png', fullPage: true, animations: 'disabled' });

  await page.getByRole('button', { name: /二分查找 Binary Search/ }).click();
  await expect(page.getByRole('textbox', { name: '目标值' })).toHaveValue('16');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.locator('span[data-statement][data-active="true"]')).toHaveAttribute('data-statement', 'left-init');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
