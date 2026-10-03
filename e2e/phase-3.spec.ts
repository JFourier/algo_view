import { expect, test, type Page } from '@playwright/test';
import { insertionSort } from '../src/algorithms/insertion-sort';
import { linearSearch } from '../src/algorithms/linear-search';
import { reverseLinkedList } from '../src/algorithms/reverse-linked-list';
import { recursiveFibonacci } from '../src/algorithms/recursive-fibonacci';
import { dpFibonacci } from '../src/algorithms/dp-fibonacci';
import type { AlgorithmDefinition, Trace } from '../src/engine/types';

const progress = (page: Page) => page.getByRole('slider', { name: '执行进度' });
const activeCode = (page: Page) => page.locator('[data-statement][data-active="true"]');
const data = (page: Page) => page.getByRole('region', { name: '数据演示', exact: true });

async function selectAlgorithm(page: Page, name: string) {
  await page.getByRole('navigation', { name: '选择算法' }).getByRole('button', { name: new RegExp(`^${name} `) }).click();
}

async function seek(page: Page, index: number) {
  expect(index).toBeGreaterThanOrEqual(0);
  await progress(page).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, String(value));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, index);
  await expect(progress(page)).toHaveValue(String(index));
}

async function visibleState(page: Page) {
  return {
    statement: await activeCode(page).getAttribute('data-statement'),
    data: await data(page).innerText(),
    graphics: await data(page).getByRole('img').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label'))),
    stack: await page.getByRole('region', { name: '调用栈', exact: true }).allTextContents(),
  };
}

async function expectReplay(page: Page, trace: Trace, index: number) {
  expect(index).toBeGreaterThan(0);
  await seek(page, index);
  await expect(activeCode(page)).toHaveAttribute('data-statement', trace.steps[index].statementId!);
  await expect(page.getByTestId('step-explanation')).toHaveText(trace.steps[index].explanation);
  const current = await visibleState(page);
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  expect(await visibleState(page)).toEqual(current);
  await seek(page, 0);
  await seek(page, index);
  expect(await visibleState(page)).toEqual(current);
}

async function expectFinished(page: Page, trace: Trace) {
  await seek(page, trace.steps.length - 1);
  await expect(data(page).getByRole('status')).toHaveText(trace.result.message);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
});

test('九种算法按主分类展示，收起分类保持当前演示', async ({ page }) => {
  const navigation = page.getByRole('navigation', { name: '选择算法' });
  await expect(navigation.locator('button[aria-pressed]')).toHaveCount(9);
  await expect(navigation.getByRole('list', { name: '排序分类', exact: true }).getByRole('button')).toHaveCount(3);
  await expect(navigation.getByRole('list', { name: '查找分类', exact: true }).getByRole('button')).toHaveCount(2);
  for (const [category, name] of [['链表', '链表反转'], ['递归与回溯', '递归斐波那契'], ['动态规划', 'DP 斐波那契']]) {
    const group = navigation.getByRole('list', { name: `${category}分类`, exact: true });
    await expect(group.getByRole('button')).toHaveCount(1);
    await group.getByRole('button', { name: new RegExp(`^${name} `) }).click();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    const index = await progress(page).inputValue();
    await navigation.getByRole('button', { name: new RegExp(`^${category} `) }).click();
    await expect(group).toBeHidden();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(progress(page)).toHaveValue(index);
  }
});

test('插入排序保留暂存元素，移位与写入可回放，重复值身份保持稳定', async ({ page }) => {
  await selectAlgorithm(page, '插入排序');
  const values = [2, -2, 2, 1];
  await page.getByRole('textbox', { name: '数组元素' }).fill(values.join(', '));
  await page.getByRole('button', { name: '生成演示' }).click();
  const trace = insertionSort.execute({ values });
  const shift = trace.steps.findIndex(step => step.statementId === 'shift');
  const insert = trace.steps.findIndex(step => step.statementId === 'insert');
  await expectReplay(page, trace, shift);
  await expect(page.getByTestId('insertion-held')).toContainText(String(trace.steps[shift].insertion!.held!.value));
  await expect(data(page).locator('[data-write="true"]')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/insertion-sort-preview.png', fullPage: true, animations: 'disabled' });
  await expectReplay(page, trace, insert);
  await expect(data(page).locator('[data-write="true"]')).toHaveCount(1);
  await expectFinished(page, trace);
  await expect(data(page).getByRole('status')).toHaveText('排序完成，结果为 [-2, 1, 2, 2]。');
  const originalEqualIds = trace.steps[0].items.filter(item => item.value === 2).map(item => item.id);
  const finalEqualIds = await data(page).locator('[data-item]').evaluateAll(elements => elements
    .filter(element => element.querySelector('text')?.textContent === '2')
    .map(element => element.getAttribute('data-item')));
  expect(finalEqualIds).toEqual(originalEqualIds);
});

test('线性查找接受无序输入并返回第一个匹配，支持未找到和空数组', async ({ page }) => {
  await selectAlgorithm(page, '线性查找');
  const values = [9, 2, -3, 2];
  await page.getByRole('textbox', { name: '数组元素' }).fill(values.join(', '));
  await page.getByRole('textbox', { name: '目标值' }).fill('2');
  await page.getByRole('button', { name: '生成演示' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const trace = linearSearch.execute({ values, target: 2 });
  await expectReplay(page, trace, trace.steps.findIndex(step => step.kind === 'compare'));
  await expectFinished(page, trace);
  await expect(data(page).getByRole('status')).toContainText('下标 1');
  await expect(data(page).getByRole('img')).toHaveAccessibleName(/索引 0：9.*索引 1：2，找到目标.*索引 2：-3.*索引 3：2/);
  await expect(page.getByRole('textbox', { name: '数组元素' })).toHaveValue('9, 2, -3, 2');
  for (const input of [[9, 2, -3, 2], []]) {
    await page.getByRole('textbox', { name: '数组元素' }).fill(input.join(', '));
    await page.getByRole('textbox', { name: '目标值' }).fill('7');
    await page.getByRole('button', { name: '生成演示' }).click();
    await expectFinished(page, linearSearch.execute({ values: input, target: 7 }));
    await expect(data(page).getByRole('status')).toHaveText('未找到目标 7，返回 -1。');
  }
});

test('链表反转逐条修改连接，回退与跳转恢复节点身份和指针', async ({ page }) => {
  await selectAlgorithm(page, '链表反转');
  const values = [7, 7, -1];
  await page.getByRole('textbox', { name: '链表节点' }).fill(values.join(', '));
  await page.getByRole('button', { name: '生成演示' }).click();
  const trace = reverseLinkedList.execute({ kind: 'linked-list', values });
  const changed = trace.steps.findIndex(step => step.linkedList?.change?.after !== null && step.linkedList?.change?.after !== undefined);
  const change = trace.steps[changed].linkedList!.change!;
  const node = data(page).locator(`g[data-node="${change.nodeId}"][data-next]`);
  await seek(page, changed - 1);
  await expect(node).toHaveAttribute('data-next', change.before ?? 'null');
  const before = await visibleState(page);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(node).toHaveAttribute('data-next', change.after ?? 'null');
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(node).toHaveAttribute('data-next', change.before ?? 'null');
  expect(await visibleState(page)).toEqual(before);
  await expectReplay(page, trace, changed);
  await expect(node).toHaveAttribute('data-next', change.after ?? 'null');
  await page.screenshot({ path: 'test-results/linked-list-preview.png', fullPage: true, animations: 'disabled' });
  await expectFinished(page, trace);
  expect(trace.result).toMatchObject({ kind: 'linked-list', values: [-1, 7, 7] });
  for (const item of trace.steps.at(-1)!.linkedList!.nodes) {
    await expect(data(page).locator(`g[data-node="${item.id}"][data-next]`)).toHaveAttribute('data-next', item.next ?? 'null');
  }
  await page.getByRole('textbox', { name: '链表节点' }).fill('');
  await page.getByRole('button', { name: '生成演示' }).click();
  await expectFinished(page, reverseLinkedList.execute({ kind: 'linked-list', values: [] }));
  await expect(data(page)).toContainText('null');
});

test('递归斐波那契在返回时恢复调用方，重复调用计数随回放恢复', async ({ page }) => {
  await selectAlgorithm(page, '递归斐波那契');
  await page.getByRole('textbox', { name: '整数 n' }).fill('5');
  await page.getByRole('button', { name: '生成演示' }).click();
  const trace = recursiveFibonacci.execute({ kind: 'integer', n: 5 });
  const returned = trace.steps.findIndex(step => step.execution?.event === 'return' && step.execution.activeFrameId !== null);
  await expectReplay(page, trace, returned);
  const execution = trace.steps[returned].execution!;
  const stack = page.getByRole('region', { name: '调用栈', exact: true });
  await expect(stack.locator('[data-event="return"]')).toHaveAttribute('data-owner', execution.frameId);
  await expect(stack.locator(`[data-frame="${execution.frameId}"]`)).toHaveCount(0);
  await expect(stack.locator('[data-frame][data-active="true"]')).toHaveAttribute('data-frame', execution.activeFrameId!);
  await expect(stack).toContainText('返回值');
  await expect(stack).toContainText(String(execution.returnedValue));
  await page.screenshot({ path: 'test-results/recursive-fibonacci-preview.png', fullPage: true, animations: 'disabled' });
  const repeated = trace.steps.findIndex(step => step.fibonacci?.calls.some(call => call.count > 1));
  await expectReplay(page, trace, repeated);
  for (const call of trace.steps[repeated].fibonacci!.calls) {
    await expect(data(page).locator(`[data-subproblem="${call.n}"]`)).toHaveAttribute('data-call-count', String(call.count));
  }
  await expectFinished(page, trace);
  expect(trace.result).toMatchObject({ kind: 'number', value: 5 });
  await expect(stack.locator('[data-frame]')).toHaveCount(0);
});

test('DP 斐波那契区分未计算、依赖和写入，回退时移除未来结果', async ({ page }) => {
  await selectAlgorithm(page, 'DP 斐波那契');
  await page.getByRole('textbox', { name: '整数 n' }).fill('5');
  await page.getByRole('button', { name: '生成演示' }).click();
  const trace = dpFibonacci.execute({ kind: 'integer', n: 5 });
  const dependency = trace.steps.findIndex(step => (step.dp?.dependencies.length ?? 0) === 2 && step.dp?.writtenIndex === undefined);
  const write = trace.steps.findIndex(step => (step.dp?.writtenIndex ?? -1) >= 2);
  await expectReplay(page, trace, dependency);
  for (const index of trace.steps[dependency].dp!.dependencies) {
    await expect(data(page).locator(`[data-index="${index}"][data-value]`)).toHaveAttribute('data-dependency', 'true');
  }
  const writtenIndex = trace.steps[write].dp!.writtenIndex!;
  const cell = data(page).locator(`[data-index="${writtenIndex}"][data-value]`);
  await seek(page, write - 1);
  await expect(cell).toHaveAttribute('data-value', 'null');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(cell).toHaveAttribute('data-value', String(trace.steps[write].dp!.cells[writtenIndex]));
  await expect(cell).toHaveAttribute('data-written', 'true');
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(cell).toHaveAttribute('data-value', 'null');
  await expectReplay(page, trace, write);
  await page.screenshot({ path: 'test-results/dp-fibonacci-preview.png', fullPage: true, animations: 'disabled' });
  await expectFinished(page, trace);
  await expect(data(page).locator('[data-index="5"][data-value]')).toHaveAttribute('data-value', '5');
  expect(trace.result).toMatchObject({ kind: 'number', value: 5 });
  await seek(page, 0);
  await expect(data(page).getByRole('status')).toHaveCount(0);
  await expect(data(page).locator('[data-index][data-value]')).toHaveCount(0);
  await seek(page, trace.steps.findIndex(step => step.dp?.cells.length === 6));
  await expect(data(page).locator('[data-index="5"][data-value]')).toHaveAttribute('data-value', 'null');
});

test('新算法的输入修改和切换取消旧播放，非法整数和链表不能生成', async ({ page }) => {
  for (const entry of [
    { name: '插入排序', input: '数组元素', value: '3, 1, 2' },
    { name: '线性查找', input: '数组元素', value: '3, 1, 2' },
    { name: '链表反转', input: '链表节点', value: '3, 1, 2' },
    { name: '递归斐波那契', input: '整数 n', value: '6' },
    { name: 'DP 斐波那契', input: '整数 n', value: '6' },
  ]) {
    await selectAlgorithm(page, entry.name);
    await page.clock.runFor(5000);
    await expect(progress(page)).toHaveValue('0');
    await expect(activeCode(page)).toHaveCount(0);
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.clock.runFor(1000);
    await expect(progress(page)).toHaveValue('1');
    await page.getByRole('textbox', { name: entry.input, exact: true }).fill(entry.value);
    await expect(progress(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
    await expect(activeCode(page)).toHaveCount(0);
    await page.clock.runFor(5000);
    await expect(progress(page)).toHaveValue('0');
    await page.getByRole('button', { name: '生成演示' }).click();
    await page.clock.runFor(5000);
    await expect(progress(page)).toHaveValue('0');
    await page.getByRole('button', { name: '播放', exact: true }).click();
  }
  await page.getByRole('textbox', { name: '整数 n' }).fill('11');
  await page.getByRole('button', { name: '生成演示' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(progress(page)).toBeDisabled();
  await selectAlgorithm(page, '链表反转');
  await page.getByRole('textbox', { name: '链表节点' }).fill('1, ,2');
  await page.getByRole('button', { name: '生成演示' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(progress(page)).toBeDisabled();
});

test('展示代码可直接执行，排序、查找及两种斐波那契结果与轨迹一致', () => {
  // Only execute the repository's fixed teaching code; no user code is accepted.
  const compile = (algorithm: AlgorithmDefinition, name: string) => new Function(
    `${algorithm.code.map(line => line.text).join('\n')}\nreturn ${name};`,
  )() as (...input: unknown[]) => unknown;
  const sort = compile(insertionSort, 'insertionSort');
  const search = compile(linearSearch, 'linearSearch');
  for (const values of [[], [3], [2, -2, 2, 1], [9, 8, 7, 6, 5]]) {
    const original = [...values];
    const sorted = insertionSort.execute({ values }).result;
    expect(sorted.kind).toBe('sorted');
    if (sorted.kind === 'sorted') expect(sort(values)).toEqual(sorted.values);
    expect(values).toEqual(original);
    for (const target of [2, 5, 99]) {
      const found = linearSearch.execute({ values, target }).result;
      expect(found.kind === 'found' || found.kind === 'not-found').toBe(true);
      if (found.kind === 'found' || found.kind === 'not-found') {
        expect(search(values, target)).toBe(values.indexOf(target));
        expect(found.index).toBe(search(values, target));
      }
    }
  }
  const expected = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
  for (const [algorithm, name] of [[recursiveFibonacci, 'solve'], [dpFibonacci, 'fibonacciDP']] as const) {
    const calculate = compile(algorithm, name);
    for (const [n, value] of expected.entries()) {
      expect(calculate(n)).toBe(value);
      expect(algorithm.execute({ kind: 'integer', n }).result).toMatchObject({ kind: 'number', value });
    }
  }
});
