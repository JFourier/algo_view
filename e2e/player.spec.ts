import { expect, test, type Page } from '@playwright/test';

const activeStatement = (page: Page) => page.locator('span[data-statement][data-active="true"]');
const progress = (page: Page) => page.getByRole('slider', { name: '执行进度' });

async function generate(page: Page, values: string, target?: string) {
  await page.getByRole('textbox', { name: '数组元素' }).fill(values);
  if (target !== undefined) await page.getByRole('textbox', { name: '目标值' }).fill(target);
  await page.getByRole('button', { name: '生成演示' }).click();
}

async function visibleState(page: Page) {
  return {
    statement: await activeStatement(page).getAttribute('data-statement'),
    explanation: await page.getByTestId('step-explanation').innerText(),
    array: await page.getByRole('img').getAttribute('aria-label'),
    details: await page.getByRole('region', { name: '数据演示' }).innerText(),
  };
}

async function stepUntil(page: Page, statement: string) {
  const limit = Number(await progress(page).getAttribute('max'));
  for (let step = 0; step < limit; step += 1) {
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    if (await activeStatement(page).getAttribute('data-statement') === statement) return;
  }
  throw new Error(`执行结束前没有到达语句 ${statement}`);
}

async function jumpToEnd(page: Page) {
  await progress(page).focus();
  await progress(page).press('End');
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeDisabled();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
});

test('比较、交换和回放对应同一份数组、变量与代码状态', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await generate(page, '3, 1, 2');
  await expect(activeStatement(page)).toHaveCount(0);
  await expect(progress(page)).toHaveValue('0');
  await expect(page.getByRole('button', { name: '上一步', exact: true })).toBeDisabled();

  await stepUntil(page, 'compare');
  await expect(page.getByTestId('step-explanation')).toHaveText('3 > 1 为真，需要交换。');
  await expect(page.getByRole('img')).toHaveAccessibleName(/索引 0：3，正在比较；索引 1：1，正在比较；索引 2：2/);
  await expect(activeStatement(page).locator('span[style*="color"]')).not.toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/desktop-preview.png', fullPage: true, animations: 'disabled' });
  const comparison = await visibleState(page);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(activeStatement(page)).toHaveAttribute('data-statement', 'swap');
  await expect(page.getByRole('img')).toHaveAccessibleName(/索引 0：1，刚完成交换；索引 1：3，刚完成交换；索引 2：2/);
  const swapped = await visibleState(page);

  await page.getByRole('button', { name: '上一步', exact: true }).click();
  expect(await visibleState(page)).toEqual(comparison);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  expect(await visibleState(page)).toEqual(swapped);
  await jumpToEnd(page);
  await expect(page.getByRole('region', { name: '数据演示' }).getByRole('status')).toHaveText('排序完成，结果为 [1, 2, 3]。');
  await expect(page.getByRole('img')).toHaveAccessibleName('索引 0：1，已就位；索引 1：2，已就位；索引 2：3，已就位');
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
  await expect(activeStatement(page).locator('span[style*="color"]')).not.toHaveCount(0);

  await generate(page, '-2, -999');
  await stepUntil(page, 'compare');
  await expect(page.getByTestId('step-explanation')).toHaveText('-2 > -999 为真，需要交换。');
  const negativeValue = await page.getByRole('img').getByText('-999', { exact: true }).boundingBox();
  const comparisonLabel = await page.getByRole('img').getByText('比较', { exact: true }).nth(1).boundingBox();
  expect(negativeValue).not.toBeNull();
  expect(comparisonLabel).not.toBeNull();
  expect(negativeValue!.y + negativeValue!.height).toBeLessThan(comparisonLabel!.y);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('img')).toHaveAccessibleName('索引 0：-999，刚完成交换；索引 1：-2，刚完成交换');
});

test('暂停、回退、进度跳转和重置停止旧的播放任务', async ({ page }) => {
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(progress(page)).not.toHaveValue('0');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await progress(page).inputValue();
  await page.clock.runFor(5000);
  await expect(progress(page)).toHaveValue(paused);

  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  const previous = await progress(page).inputValue();
  expect(Number(previous)).toBe(Number(paused) - 1);
  await page.clock.runFor(5000);
  await expect(progress(page)).toHaveValue(previous);

  await page.getByRole('button', { name: '播放', exact: true }).click();
  await progress(page).press('ArrowRight');
  const sought = await progress(page).inputValue();
  await page.clock.runFor(5000);
  await expect(progress(page)).toHaveValue(sought);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();

  await page.getByRole('combobox', { name: '播放速度' }).selectOption('4');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.clock.runFor(250);
  await expect(progress(page)).toHaveValue(String(Number(sought) + 1));
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.clock.runFor(5000);
  await expect(progress(page)).toHaveValue('0');
  await expect(activeStatement(page)).toHaveCount(0);
});

test('修改输入、重新生成和切换算法不会继承旧播放任务', async ({ page }) => {
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.clock.runFor(1000);
  await page.getByRole('textbox', { name: '数组元素' }).fill('4, 2');
  await expect(page.getByRole('img')).toHaveCount(0);
  await expect(activeStatement(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '生成演示' }).click();
  await page.clock.runFor(5000);
  await expect(progress(page)).toHaveValue('0');
  await expect(page.getByRole('img')).toHaveAccessibleName('索引 0：4；索引 1：2');

  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.clock.runFor(1000);
  await page.getByRole('button', { name: /二分查找 Binary Search/ }).click();
  await page.clock.runFor(5000);
  await expect(page.getByRole('heading', { name: '二分查找', exact: true })).toBeVisible();
  await expect(progress(page)).toHaveValue('0');
  await expect(activeStatement(page)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '目标值' })).toHaveValue('16');
  await expect(page.getByTestId('step-explanation')).toContainText('查找 16');
});

test('二分查找校验升序输入并清楚呈现重复值、未找到和空数组结果', async ({ page }) => {
  await page.getByRole('button', { name: /二分查找 Binary Search/ }).click();
  await generate(page, '3, 1, 2', '2');
  await expect(page.getByRole('alert')).toContainText('升序排列');
  await expect(page.getByRole('textbox', { name: '数组元素' })).toHaveValue('3, 1, 2');

  await generate(page, '1, 2, 2, 4', '2');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await stepUntil(page, 'mid');
  await expect(page.getByRole('img')).toHaveAccessibleName(/索引 1：2，当前中点/);
  await jumpToEnd(page);
  await expect(page.getByRole('region', { name: '数据演示' }).getByRole('status')).toHaveText('找到目标 2，返回下标 1（从 0 开始）。');
  await expect(page.getByRole('img')).toHaveAccessibleName(/索引 1：2，找到目标/);
  await expect(activeStatement(page)).toHaveAttribute('data-statement', 'found');

  await generate(page, '1, 2, 2, 4', '3');
  await jumpToEnd(page);
  await expect(page.getByRole('region', { name: '数据演示' }).getByRole('status')).toHaveText('未找到目标 3，返回 -1。');
  await expect(activeStatement(page)).toHaveAttribute('data-statement', 'not-found');

  await generate(page, '', '3');
  await expect(page.getByText('这是一个空数组')).toBeVisible();
  await jumpToEnd(page);
  await expect(page.getByRole('region', { name: '数据演示' }).getByRole('status')).toHaveText('未找到目标 3，返回 -1。');
});

test('播放到结尾自动停止，使用示例重新开始独立演示', async ({ page }) => {
  await generate(page, '1');
  await page.getByRole('combobox', { name: '播放速度' }).selectOption('4');
  const end = Number(await progress(page).getAttribute('max'));
  await page.getByRole('button', { name: '播放', exact: true }).click();
  for (let index = 0; index < end; index += 1) await page.clock.runFor(250);
  await expect(progress(page)).toHaveValue(String(end));
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: '数据演示' }).getByRole('status')).toHaveText('排序完成，结果为 [1]。');
  await page.getByRole('button', { name: '使用示例' }).click();
  await page.clock.runFor(5000);
  await expect(progress(page)).toHaveValue('0');
  await expect(page.getByRole('textbox', { name: '数组元素' })).toHaveValue('8, 3, 6, 2, 5, 1');
  await expect(activeStatement(page)).toHaveCount(0);
});
