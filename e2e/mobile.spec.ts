import { expect, test, type Locator, type Page } from '@playwright/test';
import { quickSort } from '../src/algorithms/quick-sort';
import { unionFind } from '../src/algorithms/union-find';
import { reverseLinkedList } from '../src/algorithms/reverse-linked-list';
import { dpFibonacci } from '../src/algorithms/dp-fibonacci';
import type { UnionFindInput } from '../src/engine/types';

const progress = (page: Page) => page.getByRole('slider', { name: '执行进度' });

async function seek(page: Page, index: number) {
  await progress(page).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, String(value));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, index);
  await expect(progress(page)).toHaveValue(String(index));
}

async function expectContainedHorizontalScroll(page: Page, scroller: Locator) {
  const bounds = await scroller.evaluate(element => {
    element.scrollLeft = element.scrollWidth;
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollLeft: element.scrollLeft,
      overflowX: getComputedStyle(element).overflowX,
    };
  });
  expect(bounds.scrollWidth).toBeGreaterThan(bounds.clientWidth);
  expect(bounds.scrollLeft).toBeGreaterThan(0);
  expect(bounds.overflowX).toBe('auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

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

test('手机快速排序支持 24 个元素、深调用栈、键盘控制和减少动态效果', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await page.getByRole('button', { name: /快速排序 Quick Sort/ }).click();
  const values = Array.from({ length: 24 }, (_, index) => index + 1);
  await page.getByRole('textbox', { name: '数组元素' }).fill(values.join(', '));
  await page.getByRole('button', { name: '生成演示' }).click();
  const stack = page.getByRole('region', { name: '调用栈', exact: true });
  await expect(stack.locator('[data-frame][data-active="true"]')).toContainText('sort');
  await expect(stack.locator('[data-frame][data-active="true"]')).toContainText('当前调用');
  const array = page.getByRole('img');
  await expect(array.locator('[data-item]')).toHaveCount(24);
  await expectContainedHorizontalScroll(page, array.locator('..'));

  const trace = quickSort.execute({ values });
  const deepest = trace.steps.reduce((best, step, index) => (step.callStack?.length ?? 0) > (trace.steps[best].callStack?.length ?? 0) ? index : best, 0);
  await seek(page, deepest);
  await expect(stack.locator('[data-frame]')).toHaveCount(trace.steps[deepest].callStack!.length);
  const stackList = stack.getByRole('list');
  const stackBounds = await stackList.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(stackBounds.height).toBeLessThanOrEqual(450);
  expect(stackBounds.scrollHeight).toBeGreaterThan(stackBounds.height);
  await expect(stack.locator('[data-frame]').first()).toHaveAttribute('data-active', 'true');

  await stackList.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(progress(page)).toHaveValue(String(deepest - 1));
  await page.keyboard.press('ArrowRight');
  await expect(progress(page)).toHaveValue(String(deepest));
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  expect(await array.locator('[data-item]').evaluateAll(elements => elements.every(element => getComputedStyle(element).transitionDuration === '0s'))).toBe(true);
  await page.clock.runFor(1000);
  await expect(progress(page)).not.toHaveValue(String(deepest));
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await progress(page).press('End');
  await expect(page.getByRole('region', { name: '数据演示', exact: true }).getByRole('status')).toContainText('排序完成');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('手机并查集将 16 节点与 32 操作限制在各自滚动区，压缩开关修改后重建演示', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await page.getByRole('button', { name: /并查集 Union Find/ }).click();
  const input: UnionFindInput = {
    kind: 'union-find', nodeCount: 16, pathCompression: false,
    operations: [{ kind: 'union', a: 14, b: 15 }, ...Array.from({ length: 31 }, (_, index) => ({ kind: 'find' as const, x: index % 16 }))],
  };
  await page.getByRole('textbox', { name: '节点数', exact: true }).fill('16');
  await page.getByRole('textbox', { name: '操作序列', exact: true }).fill(input.operations.map(operation => operation.kind === 'union' ? `union ${operation.a} ${operation.b}` : `find ${operation.x}`).join('\n'));
  await page.getByRole('button', { name: '生成演示' }).click();
  await expect(page.getByRole('table', { name: '父节点数组', exact: true }).locator('td[data-parent]')).toHaveCount(16);
  await expect(page.getByRole('img', { name: /当前并查集森林/ }).locator('g[data-node]')).toHaveCount(16);
  await expectContainedHorizontalScroll(page, page.getByRole('region', { name: '父节点数组，可横向滚动', exact: true }));
  await expectContainedHorizontalScroll(page, page.getByRole('region', { name: '并查集森林，可横向滚动', exact: true }));

  const trace = unionFind.execute(input);
  const finalOperation = trace.steps.findIndex(step => step.unionFind?.operationIndex === 31 && step.unionFind.results.length === 31);
  const pageScrollBefore = await page.evaluate(() => window.scrollY);
  await seek(page, finalOperation);
  const operations = page.getByRole('list', { name: '并查集操作进度' });
  const currentOperation = operations.locator('[aria-current="step"]');
  await expect(currentOperation).toHaveAttribute('data-operation-index', '31');
  const listBounds = await operations.boundingBox();
  const currentBounds = await currentOperation.boundingBox();
  expect(currentBounds!.y).toBeGreaterThanOrEqual(listBounds!.y);
  expect(currentBounds!.y + currentBounds!.height).toBeLessThanOrEqual(listBounds!.y + listBounds!.height);
  expect(await operations.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);

  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('checkbox', { name: '启用路径压缩' }).check();
  await expect(page.getByRole('status').filter({ hasText: '输入已修改' })).toBeVisible();
  await expect(progress(page)).toBeDisabled();
  await expect(progress(page)).toHaveValue('0');
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
  await expect(page.getByRole('img')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '操作序列', exact: true })).toHaveCount(0);
  await page.clock.runFor(5000);
  await page.getByRole('button', { name: '生成演示' }).click();
  await expect(page.getByRole('checkbox', { name: '启用路径压缩' })).toBeChecked();
  await expect(progress(page)).toBeEnabled();
  await expect(page.getByRole('table', { name: '父节点数组', exact: true }).locator('td[data-node="15"][data-parent="15"]')).toHaveCount(1);
  await page.clock.runFor(5000);
  await expect(progress(page)).toHaveValue('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('手机链表反转将 24 节点限制在连接滚动区，末端改边仍可回退', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^链表反转 / }).click();
  const values = Array.from({ length: 24 }, (_, index) => index % 2 ? -999 : 999);
  await page.getByRole('textbox', { name: '链表节点' }).fill(values.join(', '));
  await page.getByRole('button', { name: '生成演示' }).click();
  const scroller = page.getByRole('region', { name: '链表连接，可横向滚动', exact: true });
  await expect(scroller.locator('g[data-node]')).toHaveCount(24);
  await expectContainedHorizontalScroll(page, scroller);
  const trace = reverseLinkedList.execute({ kind: 'linked-list', values });
  const changed = trace.steps.findIndex(step => step.linkedList?.change?.nodeId === 'node-23');
  await seek(page, changed);
  await expect(scroller.locator('g[data-node="node-23"]')).toHaveAttribute('data-next', 'node-22');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/mobile-linked-list-preview.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(scroller.locator('g[data-node="node-23"]')).toHaveAttribute('data-next', 'null');
  await seek(page, trace.steps.length - 1);
  await expect(page.getByTestId('list-head')).toHaveText('node-23');
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('手机 DP 最大输入可横向查看全部状态，写入与依赖不撑宽页面', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^DP 斐波那契 / }).click();
  await page.getByRole('textbox', { name: '整数 n' }).fill('10');
  await page.getByRole('button', { name: '生成演示' }).click();
  const trace = dpFibonacci.execute({ kind: 'integer', n: 10 });
  await seek(page, trace.steps.findIndex(step => step.dp?.cells.length === 11));
  const scroller = page.getByRole('region', { name: 'DP 状态表，可横向滚动', exact: true });
  await expect(scroller.locator('[data-index][data-value]')).toHaveCount(11);
  await expectContainedHorizontalScroll(page, scroller);
  const write = trace.steps.findIndex(step => step.dp?.writtenIndex === 10);
  await seek(page, write);
  await expect(scroller.locator('[data-index="10"][data-value]')).toHaveAttribute('data-value', '55');
  await expect(scroller.locator('[data-index="10"][data-value]')).toHaveAttribute('data-written', 'true');
  await expect(scroller.locator('[data-dependency="true"]')).toHaveCount(2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/mobile-dp-fibonacci-preview.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(scroller.locator('[data-index="10"][data-value]')).toHaveAttribute('data-value', 'null');
  await seek(page, trace.steps.length - 1);
  await expect(page.getByRole('region', { name: '数据演示', exact: true }).getByRole('status')).toHaveText(trace.result.message);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
