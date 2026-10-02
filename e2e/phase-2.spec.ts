import { expect, test, type Page } from '@playwright/test';
import { quickSort } from '../src/algorithms/quick-sort';
import { unionFind } from '../src/algorithms/union-find';
import type { UnionFindInput } from '../src/engine/types';

const slider = (page: Page) => page.getByRole('slider', { name: '执行进度' });
const activeCode = (page: Page) => page.locator('[data-statement][data-active="true"]');
async function seek(page: Page, index: number) {
  await slider(page).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, String(value));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, index);
  await expect(slider(page)).toHaveValue(String(index));
}
async function visibleState(page: Page) {
  return {
    code: await activeCode(page).getAttribute('data-statement'),
    data: await page.getByRole('region', { name: '数据演示', exact: true }).innerText(),
    graph: await page.getByRole('img').getAttribute('aria-label'),
    stack: await page.getByRole('region', { name: '调用栈', exact: true }).innerText(),
  };
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
});

test('快速排序在分区、跨层调用和返回时恢复代码、基准、数组与局部变量', async ({ page }) => {
  await page.getByRole('button', { name: /快速排序 Quick Sort/ }).click();
  await page.getByRole('textbox', { name: '数组元素' }).fill('4, 1, 3, 2');
  await page.getByRole('button', { name: '生成演示' }).click();
  const trace = quickSort.execute({ values: [4, 1, 3, 2] });
  const comparison = trace.steps.findIndex(step => step.statementId === 'partition.compare');
  const pivotPlaced = trace.steps.findIndex(step => step.statementId === 'partition.placePivot');
  const returnIndex = trace.steps.findIndex(step => step.statementId === 'partition.return');
  const recursion = trace.steps.findIndex(step => step.statementId === 'quickSort.callLeft');
  for (const index of [comparison, pivotPlaced, returnIndex, recursion]) {
    expect(index).toBeGreaterThan(0);
    await seek(page, index);
    await expect(activeCode(page)).toHaveAttribute('data-statement', trace.steps[index].statementId!);
    await expect(page.getByTestId('step-explanation')).toHaveText(trace.steps[index].explanation);
    const before = await visibleState(page);
    await page.getByRole('button', { name: '上一步', exact: true }).click();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    expect(await visibleState(page)).toEqual(before);
    await seek(page, 0);
    await seek(page, index);
    expect(await visibleState(page)).toEqual(before);
  }
  await seek(page, pivotPlaced);
  const pivot = trace.steps[pivotPlaced].markers.pivot!;
  await expect(page.locator(`[data-item="${pivot.id}"]`)).toHaveAttribute('data-pivot', 'true');
  await expect(page.getByRole('img')).toHaveAccessibleName(/基准元素/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/quick-sort-preview.png', fullPage: true, animations: 'disabled' });
  await slider(page).focus();
  await slider(page).press('End');
  await expect(page.getByRole('region', { name: '数据演示' }).getByRole('status')).toHaveText('排序完成，结果为 [1, 2, 3, 4]。');
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
});

const operationsText = 'union 0 1\nunion 2 3\nunion 0 2\nunion 4 5\nunion 6 7\nunion 4 6\nunion 0 4\nfind 7\nfind 7';
const compressionInput: UnionFindInput = {
  kind: 'union-find', nodeCount: 8, pathCompression: true,
  operations: [
    { kind: 'union', a: 0, b: 1 }, { kind: 'union', a: 2, b: 3 }, { kind: 'union', a: 0, b: 2 },
    { kind: 'union', a: 4, b: 5 }, { kind: 'union', a: 6, b: 7 }, { kind: 'union', a: 4, b: 6 },
    { kind: 'union', a: 0, b: 4 }, { kind: 'find', x: 7 }, { kind: 'find', x: 7 },
  ],
};

test('并查集压缩逐条父连接可回退，跨操作跳转不会提前显示结果', async ({ page }) => {
  await page.getByRole('button', { name: /并查集 Union Find/ }).click();
  await page.getByRole('textbox', { name: '节点数', exact: true }).fill('8');
  await page.getByRole('textbox', { name: '操作序列', exact: true }).fill(operationsText);
  await page.getByRole('checkbox', { name: '启用路径压缩' }).check();
  await page.getByRole('button', { name: '生成演示' }).click();
  const trace = unionFind.execute(compressionInput);
  const compression = trace.steps.findIndex(step => step.kind === 'compress' && step.unionFind?.parentChange?.node === 7);
  expect(compression).toBeGreaterThan(0);
  await seek(page, compression - 1);
  const before = await visibleState(page);
  const beforeOps = await page.getByRole('region', { name: '操作序列', exact: true }).innerText();
  await expect(page.locator('path[data-node="7"][data-parent="6"], line[data-node="7"][data-parent="6"]')).toHaveCount(1);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(activeCode(page)).toHaveAttribute('data-statement', trace.steps[compression].statementId!);
  await expect(page.locator('path[data-node="7"][data-parent="0"], line[data-node="7"][data-parent="0"]')).toHaveCount(1);
  const compressed = await visibleState(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/union-find-preview.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  expect(await visibleState(page)).toEqual(before);
  await seek(page, compression);
  expect(await visibleState(page)).toEqual(compressed);
  await seek(page, trace.steps.length - 1);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: '数据演示' }).getByRole('status')).toContainText(trace.result.message);
  await seek(page, compression - 1);
  expect(await page.getByRole('region', { name: '操作序列', exact: true }).innerText()).toEqual(beforeOps);
  expect(await visibleState(page)).toEqual(before);
  await seek(page, 0);
  const operations = page.getByRole('region', { name: '操作序列', exact: true });
  await expect(operations.locator('[data-result]')).toHaveCount(0);
  await expect(operations).not.toContainText('返回根');
  await expect(operations).not.toContainText('已在同一集合');
});

test('播放中编辑操作、切换压缩和切换四种算法均取消旧任务', async ({ page }) => {
  await page.getByRole('button', { name: /并查集 Union Find/ }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.clock.runFor(1000);
  await page.getByRole('checkbox', { name: '启用路径压缩' }).check();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
  await expect(page.getByRole('img')).toHaveCount(0);
  await page.clock.runFor(5000);
  await expect(slider(page)).toHaveValue('0');
  await page.getByRole('textbox', { name: '操作序列', exact: true }).fill('union 0 99');
  await page.getByRole('button', { name: '生成演示' }).click();
  await expect(page.getByRole('alert')).toContainText('第 1 行');
  for (const name of [/快速排序 Quick Sort/, /二分查找 Binary Search/, /冒泡排序 Bubble Sort/, /并查集 Union Find/]) {
    await page.getByRole('button', { name }).click();
    await expect(slider(page)).toHaveValue('0');
    await expect(activeCode(page)).toHaveCount(0);
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.clock.runFor(1000);
    await expect(slider(page)).toHaveValue('1');
  }
  await page.getByRole('textbox', { name: '操作序列', exact: true }).fill('find 0');
  await page.getByRole('button', { name: '生成演示' }).click();
  await page.clock.runFor(5000);
  await expect(slider(page)).toHaveValue('0');
});
