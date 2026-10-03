import { assertValidIntegerInput, validateIntegerDraft } from '../engine/integer-input';
import { createTraceRecorder } from '../engine/trace';
import type { AlgorithmDefinition, CodeLine, DpState, Snapshot } from '../engine/types';

const code: readonly CodeLine[] = [
  { text: 'function fibonacciDP(n) {' },
  { id: 'dp.allocate', text: '  const dp = Array(n + 1).fill(null);' },
  { id: 'dp.zero', text: '  dp[0] = 0;' },
  { id: 'dp.hasOne', text: '  if (n >= 1) {' },
  { id: 'dp.one', text: '    dp[1] = 1;' },
  { text: '  }' },
  { id: 'dp.index', text: '  let i = 2;' },
  { id: 'dp.condition', text: '  while (i <= n) {' },
  { id: 'dp.previous', text: '    const previous = dp[i - 1];' },
  { id: 'dp.beforePrevious', text: '    const beforePrevious = dp[i - 2];' },
  { id: 'dp.write', text: '    dp[i] = previous + beforePrevious;' },
  { id: 'dp.advance', text: '    i += 1;' },
  { text: '  }' },
  { id: 'dp.return', text: '  return dp[n];' },
  { text: '}' },
];

export const dpFibonacci: AlgorithmDefinition = {
  id: 'dp-fibonacci',
  inputKind: 'integer',
  name: 'DP 斐波那契',
  englishName: 'Dynamic Programming Fibonacci',
  category: '动态规划',
  summary: 'F(0) = 0、F(1) = 1；从左到右填表，用已保存的前两项求下一项，每个状态只计算一次。',
  complexity: { time: 'O(n)', space: 'O(n)，保存完整 DP 表' },
  inputHint: '输入 0 到 10 的整数 n，与递归版本使用相同范围。表中 — 代表尚未计算，先读取依赖，再写入结果。',
  requiresTarget: false,
  example: { kind: 'integer', n: '5' },
  examples: [
    { name: '状态复用', draft: { kind: 'integer', n: '5' } },
    { name: '零值边界', draft: { kind: 'integer', n: '0' } },
    { name: '完整填表', draft: { kind: 'integer', n: '10' } },
  ],
  code,
  validate: validateIntegerDraft,
  execute(input, options) {
    assertValidIntegerInput(input);
    const targetN = input.n;
    const recorder = createTraceRecorder('dp-fibonacci', input, code, options);
    let cells: (number | null)[] = [];
    const locals: Record<string, number | string> = {};
    let completed = false;

    function record(
      statementId: string | null,
      kind: Snapshot['kind'],
      explanation: string,
      extra: Omit<DpState, 'cells'> & { readonly condition?: Snapshot['condition']; readonly returnedValue?: number } = { dependencies: [] },
    ) {
      const parameters = [{ name: 'n', value: targetN }];
      const variables = Object.entries(locals).map(([name, value]) => ({ name, value }));
      const { condition, returnedValue, ...state } = extra;
      recorder.record({
        statementId, kind, explanation, items: [], markers: {},
        variables: completed ? [] : [...parameters, ...variables],
        callStack: completed ? [] : [{ id: 'frame-0', functionName: 'fibonacciDP', parentId: null, depth: 0, parameters, locals: variables }],
        dp: { cells, ...state },
        ...(condition ? { condition } : {}),
        ...(statementId ? { execution: {
          event: completed ? 'return' : 'statement', frameId: 'frame-0', functionName: 'fibonacciDP', activeFrameId: completed ? null : 'frame-0',
          ...(returnedValue !== undefined ? { returnedValue } : {}),
        } } : {}),
      });
    }

    function updateTable() { locals.dp = `[${cells.map(value => value ?? 'null').join(', ')}]`; }

    record(null, 'initial', `准备计算 F(${input.n})；尚未执行语句，DP 表尚未分配。`);
    cells = Array<number | null>(input.n + 1).fill(null);
    updateTable();
    record('dp.allocate', 'assign', `分配 ${cells.length} 个状态；null 表示该位置尚未计算。`);
    cells[0] = 0;
    updateTable();
    record('dp.zero', 'assign', '写入边界 dp[0] = 0。', { dependencies: [], activeIndex: 0, writtenIndex: 0 });
    const hasOne = input.n >= 1;
    record('dp.hasOne', 'condition', `n = ${input.n} >= 1 为${hasOne ? '真，初始化第二个边界' : '假，表中只有 dp[0]'}。`, {
      dependencies: [], condition: { expression: 'n >= 1', result: hasOne },
    });
    if (hasOne) {
      cells[1] = 1;
      updateTable();
      record('dp.one', 'assign', '写入边界 dp[1] = 1。', { dependencies: [], activeIndex: 1, writtenIndex: 1 });
    }
    let i = 2;
    locals.i = i;
    record('dp.index', 'assign', '设置 i = 2，从需要状态转移的第一项开始。');
    while (true) {
      const continues = i <= input.n;
      record('dp.condition', 'condition', `i = ${i} <= n = ${input.n} 为${continues ? '真，计算下一项' : '假，所有需要的状态已就绪'}。`, {
        dependencies: [], ...(continues ? { activeIndex: i } : {}), condition: { expression: 'i <= n', result: continues },
      });
      if (!continues) break;
      const previous = cells[i - 1]!;
      locals.previous = previous;
      record('dp.previous', 'assign', `读取已计算的 dp[${i - 1}] = ${previous}，保存到 previous。`, { dependencies: [i - 1], activeIndex: i });
      const beforePrevious = cells[i - 2]!;
      locals.beforePrevious = beforePrevious;
      record('dp.beforePrevious', 'assign', `读取已计算的 dp[${i - 2}] = ${beforePrevious}，保存到 beforePrevious；依赖已全部就绪。`, { dependencies: [i - 1, i - 2], activeIndex: i });
      cells[i] = previous + beforePrevious;
      updateTable();
      record('dp.write', 'assign', `写入 dp[${i}] = ${previous} + ${beforePrevious} = ${cells[i]}，以后可直接复用。`, { dependencies: [i - 1, i - 2], activeIndex: i, writtenIndex: i });
      i += 1;
      locals.i = i;
      record('dp.advance', 'assign', `i 增加到 ${i}，准备检查是否还有状态需要计算。`);
      delete locals.previous;
      delete locals.beforePrevious;
    }
    const value = cells[input.n]!;
    const message = `F(${input.n}) = ${value}；每个 DP 状态只写入一次。`;
    completed = true;
    record('dp.return', 'complete', message, { dependencies: [input.n], returnedValue: value });
    return recorder.finish({ kind: 'number', message, value });
  },
};
