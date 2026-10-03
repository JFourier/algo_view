import { assertValidIntegerInput, validateIntegerDraft } from '../engine/integer-input';
import { createTraceRecorder } from '../engine/trace';
import type { AlgorithmDefinition, CallFrame, CodeLine, ExecutionContext, Snapshot } from '../engine/types';

const code: readonly CodeLine[] = [
  { text: 'function solve(n) {' },
  { id: 'solve.call', text: '  const result = fibonacci(n);' },
  { id: 'solve.return', text: '  return result;' },
  { text: '}' },
  { text: '' },
  { text: 'function fibonacci(n) {' },
  { id: 'fibonacci.base', text: '  if (n <= 1) {' },
  { id: 'fibonacci.baseReturn', text: '    return n;' },
  { text: '  }' },
  { id: 'fibonacci.left', text: '  const left = fibonacci(n - 1);' },
  { id: 'fibonacci.right', text: '  const right = fibonacci(n - 2);' },
  { id: 'fibonacci.return', text: '  return left + right;' },
  { text: '}' },
];

interface Frame {
  readonly id: string;
  readonly functionName: 'solve' | 'fibonacci';
  readonly parentId: string | null;
  readonly depth: number;
  readonly n: number;
  readonly locals: Record<string, number>;
}

const entries = (values: Readonly<Record<string, number>>) => Object.entries(values).map(([name, value]) => ({ name, value }));

export const recursiveFibonacci: AlgorithmDefinition = {
  id: 'recursive-fibonacci',
  inputKind: 'integer',
  name: '递归斐波那契',
  englishName: 'Recursive Fibonacci',
  category: '递归与回溯',
  summary: 'F(0) = 0、F(1) = 1；先求 F(n − 1)，再求 F(n − 2)。逐层传递返回值，观察同一子问题的重复调用。',
  complexity: { time: 'O(2ⁿ)', space: 'O(n)，递归调用栈' },
  inputHint: '输入 0 到 10 的整数 n。与 DP 版本使用相同边界；上限保证完整递归轨迹可逐步回放。',
  requiresTarget: false,
  example: { kind: 'integer', n: '5' },
  examples: [
    { name: '重复求解', draft: { kind: 'integer', n: '5' } },
    { name: '零值边界', draft: { kind: 'integer', n: '0' } },
    { name: '更深递归', draft: { kind: 'integer', n: '8' } },
  ],
  code,
  validate: validateIntegerDraft,
  execute(input, options) {
    assertValidIntegerInput(input);
    const targetN = input.n;
    const recorder = createTraceRecorder('recursive-fibonacci', input, code, options);
    const stack: Frame[] = [];
    const counts = Array<number>(input.n + 1).fill(0);
    let nextFrame = 0;
    let result: number | undefined;

    function push(functionName: Frame['functionName'], n: number): Frame {
      const frame: Frame = {
        id: `frame-${nextFrame++}`, functionName, n, locals: {},
        parentId: stack.at(-1)?.id ?? null, depth: stack.length,
      };
      stack.push(frame);
      if (functionName === 'fibonacci') counts[n] += 1;
      return frame;
    }

    function record(
      statementId: string | null,
      kind: Snapshot['kind'],
      explanation: string,
      owner?: Frame,
      event: ExecutionContext['event'] = 'statement',
      extra: { readonly condition?: Snapshot['condition']; readonly returnedValue?: number } = {},
    ) {
      const active = stack.at(-1);
      const callStack: CallFrame[] = stack.map(frame => ({
        id: frame.id, functionName: frame.functionName, parentId: frame.parentId, depth: frame.depth,
        parameters: [{ name: 'n', value: frame.n }], locals: entries(frame.locals),
      }));
      recorder.record({
        statementId, kind, explanation, items: [], markers: {}, callStack,
        variables: active ? [{ name: 'n', value: active.n }, ...entries(active.locals)] : [],
        fibonacci: {
          n: targetN, calls: counts.map((count, n) => ({ n, count })),
          ...(result !== undefined ? { result } : {}),
        },
        ...(extra.condition ? { condition: extra.condition } : {}),
        ...(owner ? { execution: {
          event, frameId: owner.id, functionName: owner.functionName, activeFrameId: active?.id ?? null,
          ...(extra.returnedValue !== undefined ? { returnedValue: extra.returnedValue } : {}),
        } } : {}),
      });
    }

    function enter(owner: Frame, statementId: string, n: number): Frame {
      const child = push('fibonacci', n);
      record(statementId, 'call', `进入 fibonacci(${n})（${child.id}），这是 F(${n}) 的第 ${counts[n]} 次调用；调用方等待返回。`, owner, 'call');
      return child;
    }

    function leave(frame: Frame, statementId: string, value: number, explanation: string): number {
      stack.pop();
      record(statementId, 'return', `${explanation}返回 ${value}，恢复 ${stack.at(-1)!.id}；调用方尚未接收赋值。`, frame, 'return', { returnedValue: value });
      return value;
    }

    function recurse(frame: Frame): number {
      const { n } = frame;
      const baseCase = n <= 1;
      record('fibonacci.base', 'condition', `n = ${n} <= 1 为${baseCase ? '真，命中递推边界' : '假，需要求解两个子问题'}。`, frame, 'statement', {
        condition: { expression: 'n <= 1', result: baseCase },
      });
      if (baseCase) return leave(frame, 'fibonacci.baseReturn', n, `F(${n}) = ${n}。`);

      const left = recurse(enter(frame, 'fibonacci.left', n - 1));
      frame.locals.left = left;
      record('fibonacci.left', 'assign', `${frame.id} 接收 F(${n - 1}) = ${left}，完成 left 的赋值。`, frame);
      const right = recurse(enter(frame, 'fibonacci.right', n - 2));
      frame.locals.right = right;
      record('fibonacci.right', 'assign', `${frame.id} 接收 F(${n - 2}) = ${right}，完成 right 的赋值。`, frame);
      return leave(frame, 'fibonacci.return', left + right, `F(${n}) = left + right = ${left} + ${right}。`);
    }

    const root = push('solve', input.n);
    record(null, 'initial', `准备计算 F(${input.n})；尚未执行语句，也尚未调用 fibonacci。`);
    result = recurse(enter(root, 'solve.call', input.n));
    root.locals.result = result;
    record('solve.call', 'assign', `接收 fibonacci 的返回值，完成 result = ${result} 的赋值。`, root);
    stack.pop();
    const message = `F(${input.n}) = ${result}；共调用 fibonacci ${counts.reduce((sum, count) => sum + count, 0)} 次。`;
    record('solve.return', 'complete', message, root, 'return', { returnedValue: result });
    return recorder.finish({ kind: 'number', message, value: result });
  },
};
