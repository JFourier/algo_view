import { describe, expect, it } from 'vitest';
import { createStatementMap, validateStatementMapping } from '../engine/code';
import { MAX_FIBONACCI_N } from '../engine/integer-input';
import { DEFAULT_MAX_STEPS } from '../engine/trace';
import type { AlgorithmInput, CallFrame, Snapshot, Variable } from '../engine/types';
import { createPlayerState, playerReducer } from '../player/reducer';
import { dpFibonacci } from './dp-fibonacci';
import { recursiveFibonacci } from './recursive-fibonacci';

const sequence = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
const algorithms = [recursiveFibonacci, dpFibonacci];
const variables = (values: readonly Variable[]) => Object.fromEntries(values.map(({ name, value }) => [name, value]));
const current = (step: Snapshot) => step.callStack!.at(-1)!;

function expectFrozen(value: unknown): void {
  if (value && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(expectFrozen);
  }
}

describe('Fibonacci results and common definition', () => {
  it.each(sequence.map((value, n) => ({ n, value })))('computes F($n) = $value with both methods within the trace limit', ({ n, value }) => {
    for (const algorithm of algorithms) {
      const trace = algorithm.execute({ kind: 'integer', n });
      expect(trace.result).toMatchObject({ kind: 'number', value });
      expect(trace.steps[0]).toMatchObject({ kind: 'initial', statementId: null });
      expect(trace.steps.length).toBeLessThan(DEFAULT_MAX_STEPS);
      const final = trace.steps.at(-1)!;
      expect(trace.steps.filter(({ kind }) => kind === 'complete')).toEqual([final]);
      expect(final.callStack).toEqual([]);
      expect(final.variables).toEqual([]);
      expect(final.execution).toMatchObject({ event: 'return', activeFrameId: null, returnedValue: value });
      expect(() => validateStatementMapping(algorithm.code, trace.steps)).not.toThrow();
    }
  });

  it('tracks actual recursive entries, including repeated subproblems, without counting the wrapper', () => {
    const trace = recursiveFibonacci.execute({ kind: 'integer', n: MAX_FIBONACCI_N });
    const counts = Array<number>(MAX_FIBONACCI_N + 1).fill(0);
    const initial = trace.steps[0];
    expect(initial.fibonacci!.calls.every(({ count }) => count === 0)).toBe(true);
    expect(initial.fibonacci!.result).toBeUndefined();
    for (const step of trace.steps) {
      if (step.kind === 'call') counts[Number(variables(current(step).parameters).n)] += 1;
      expect(step.fibonacci!.calls).toEqual(counts.map((count, n) => ({ n, count })));
    }
    expect(counts).toEqual([34, 55, 34, 21, 13, 8, 5, 3, 2, 1, 1]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(177);
    expect(trace.steps).toHaveLength(710);
    expect(dpFibonacci.execute({ kind: 'integer', n: MAX_FIBONACCI_N }).steps).toHaveLength(53);
    expect(trace.steps.at(-1)!.fibonacci!.result).toBe(55);
  });
});

describe('recursive Fibonacci call and local-variable lifetime', () => {
  it('keeps independent frames, enters the left subtree first and receives values only after return', () => {
    const trace = recursiveFibonacci.execute({ kind: 'integer', n: 6 });
    const entered = new Map<string, CallFrame>();
    const returned = new Set<string>();
    const callOrder = new Map<string, string[]>();
    for (let index = 1; index < trace.steps.length; index += 1) {
      const step = trace.steps[index];
      const previous = trace.steps[index - 1];
      if (step.kind === 'call') {
        const child = current(step);
        const parent = previous.callStack!.at(-1)!;
        expect(entered.has(child.id)).toBe(false);
        entered.set(child.id, child);
        expect(child).toMatchObject({ parentId: parent.id, depth: parent.depth + 1, locals: [] });
        expect(step.callStack!.slice(0, -1)).toEqual(previous.callStack);
        expect(step.execution).toMatchObject({ event: 'call', frameId: parent.id, activeFrameId: child.id });
        const parentN = Number(variables(parent.parameters).n);
        const childN = Number(variables(child.parameters).n);
        expect(childN).toBe(parent.functionName === 'solve' ? parentN : parentN - (step.statementId === 'fibonacci.left' ? 1 : 2));
        if (parent.functionName === 'fibonacci') {
          const order = callOrder.get(parent.id) ?? [];
          order.push(step.statementId!);
          callOrder.set(parent.id, order);
        }
        const target = step.statementId === 'solve.call' ? 'result' : step.statementId === 'fibonacci.left' ? 'left' : 'right';
        expect(variables(parent.locals)).not.toHaveProperty(target);
      }
      if (step.kind === 'return') {
        const callee = current(previous);
        expect(step.execution).toMatchObject({ event: 'return', frameId: callee.id, activeFrameId: callee.parentId });
        expect(returned.has(callee.id)).toBe(false);
        returned.add(callee.id);
        expect(step.callStack).toEqual(previous.callStack!.slice(0, -1));
        const value = sequence[Number(variables(callee.parameters).n)];
        expect(step.execution!.returnedValue).toBe(value);
        const caller = current(step);
        const next = trace.steps[index + 1];
        const nextCaller = current(next);
        expect(next.kind).toBe('assign');
        expect(nextCaller.id).toBe(caller.id);
        const target = next.statementId === 'solve.call' ? 'result' : next.statementId === 'fibonacci.left' ? 'left' : 'right';
        expect(variables(caller.locals)).not.toHaveProperty(target);
        expect(variables(nextCaller.locals)).toEqual({ ...variables(caller.locals), [target]: value });
        expect(next.execution).toMatchObject({ event: 'statement', frameId: caller.id, activeFrameId: caller.id });
      }
    }
    expect(returned).toEqual(new Set(entered.keys()));
    expect(callOrder.size).toBeGreaterThan(1);
    for (const order of callOrder.values()) expect(order).toEqual(['fibonacci.left', 'fibonacci.right']);
    const nonBaseFrames = [...entered.values()].filter(frame => Number(variables(frame.parameters).n) > 1);
    expect(callOrder.size).toBe(nonBaseFrames.length);
  });
});

describe('DP Fibonacci allocation, dependencies and writes', () => {
  it.each([0, 1, 2, 5, 10])('fills n = %i without showing future states or changing a cell twice', n => {
    const trace = dpFibonacci.execute({ kind: 'integer', n });
    expect(trace.steps[0].dp).toEqual({ cells: [], dependencies: [] });
    expect(trace.steps[0].callStack![0].locals).toEqual([]);
    const allocation = trace.steps.find(step => step.statementId === 'dp.allocate')!;
    expect(allocation.dp!.cells).toEqual(Array(n + 1).fill(null));
    const writes = new Set<number>();
    for (let index = 2; index < trace.steps.length; index += 1) {
      const step = trace.steps[index];
      const previous = trace.steps[index - 1];
      const state = step.dp!;
      expect(state.cells).toHaveLength(n + 1);
      for (const dependency of state.dependencies) {
        expect(dependency).toBeGreaterThanOrEqual(0);
        expect(dependency).toBeLessThanOrEqual(n);
        expect(state.cells[dependency]).toBe(sequence[dependency]);
      }
      const changed = state.cells.flatMap((value, cell) => value !== previous.dp!.cells[cell] ? [cell] : []);
      if (state.writtenIndex === undefined) expect(changed).toEqual([]);
      else {
        expect(changed).toEqual([state.writtenIndex]);
        expect(writes.has(state.writtenIndex)).toBe(false);
        expect(previous.dp!.cells[state.writtenIndex]).toBeNull();
        expect(state.cells[state.writtenIndex]).toBe(sequence[state.writtenIndex]);
        writes.add(state.writtenIndex);
      }
      if (step.statementId === 'dp.previous') {
        const i = state.activeIndex!;
        expect(state.cells[i]).toBeNull();
        expect(state.dependencies).toEqual([i - 1]);
        expect(variables(current(step).locals)).toMatchObject({ previous: sequence[i - 1] });
        expect(variables(current(step).locals)).not.toHaveProperty('beforePrevious');
      }
      if (step.statementId === 'dp.beforePrevious') {
        const i = state.activeIndex!;
        expect(state.cells[i]).toBeNull();
        expect(state.dependencies).toEqual([i - 1, i - 2]);
        expect(variables(current(step).locals)).toMatchObject({ previous: sequence[i - 1], beforePrevious: sequence[i - 2] });
      }
      if (step.statementId === 'dp.write') {
        expect(previous.statementId).toBe('dp.beforePrevious');
        expect(state.dependencies).toEqual(previous.dp!.dependencies);
        expect(state.writtenIndex).toBe(state.activeIndex);
      }
      if (step.statementId === 'dp.condition') {
        expect(variables(current(step).locals)).not.toHaveProperty('previous');
        expect(variables(current(step).locals)).not.toHaveProperty('beforePrevious');
      }
    }
    expect([...writes]).toEqual(Array.from({ length: n + 1 }, (_, index) => index));
    expect(trace.steps.at(-1)!.dp!.cells).toEqual(sequence.slice(0, n + 1));
    if (n === 0) expect(trace.steps.some(step => step.statementId === 'dp.one')).toBe(false);
  });
});

describe.each(algorithms)('$name trace guarantees and input boundaries', algorithm => {
  it('does not mutate input and freezes independent, deterministic snapshots', () => {
    const input = { kind: 'integer' as const, n: 5 };
    const trace = algorithm.execute(input);
    expect(input).toEqual({ kind: 'integer', n: 5 });
    expect(Object.isFrozen(input)).toBe(false);
    expectFrozen(trace);
    expect(algorithm.execute(input)).toEqual(trace);
    for (let index = 1; index < trace.steps.length; index += 1) {
      const step = trace.steps[index];
      const previous = trace.steps[index - 1];
      expect(step.callStack).not.toBe(previous.callStack);
      if (step.dp) expect(step.dp.cells).not.toBe(previous.dp!.cells);
      if (step.fibonacci) expect(step.fibonacci.calls).not.toBe(previous.fibonacci!.calls);
    }
    input.n = 10;
    expect(trace.input).toEqual({ kind: 'integer', n: 5 });
  });

  it('replays call, return, dependency and write boundaries through reverse and direct navigation', () => {
    const trace = algorithm.execute({ kind: 'integer', n: 5 });
    const before = JSON.stringify(trace);
    let sequential = createPlayerState(trace);
    for (let index = 1; index < trace.steps.length; index += 1) {
      sequential = playerReducer(sequential, { type: 'next' });
      const reverse = playerReducer(playerReducer(sequential, { type: 'previous' }), { type: 'next' });
      const direct = playerReducer(createPlayerState(trace), { type: 'seek', index });
      for (const state of [sequential, reverse, direct]) expect(state.trace.steps[state.index]).toBe(trace.steps[index]);
    }
    expect(JSON.stringify(trace)).toBe(before);
  });

  it('executes every registered statement across its examples and honors the exact snapshot budget', () => {
    const input = { kind: 'integer' as const, n: 5 };
    const trace = algorithm.execute(input);
    for (const id of createStatementMap(algorithm.code).keys()) expect(trace.steps.some(step => step.statementId === id)).toBe(true);
    expect(algorithm.execute(input, { maxSteps: trace.steps.length })).toEqual(trace);
    for (const maxSteps of [1, trace.steps.length - 1]) expect(() => algorithm.execute(input, { maxSteps })).toThrow(/步上限/);
    for (const maxSteps of [0, -1, 1.1, NaN, Infinity]) expect(() => algorithm.execute(input, { maxSteps })).toThrow(/正整数/);
  });

  it('validates integer input and examples at both boundaries and rejects other input kinds', () => {
    for (const { draft } of algorithm.examples!) expect(algorithm.validate(draft).ok).toBe(true);
    for (const n of ['0', '1', '10', ' 5 ', '+3']) {
      expect(algorithm.validate({ kind: 'integer', n })).toEqual({ ok: true, input: { kind: 'integer', n: Number(n) } });
    }
    for (const n of ['', ' ', '-1', '11', '1.1', '1e1', 'Infinity', 'NaN', '0x2', '1,2', '9007199254740993']) {
      expect(algorithm.validate({ kind: 'integer', n }).ok).toBe(false);
    }
    for (const n of [-1, 11, NaN, Infinity, 1.1, '5', null, undefined]) {
      expect(() => algorithm.execute({ kind: 'integer', n } as AlgorithmInput)).toThrow(/整数/);
    }
    expect(algorithm.validate({ values: '5', target: '' }).ok).toBe(false);
    expect(algorithm.validate({ kind: 'union-find', nodeCount: '1', operations: '', pathCompression: false }).ok).toBe(false);
    expect(() => algorithm.execute({ values: [5] })).toThrow(/整数 n/);
    expect(() => algorithm.execute({ kind: 'union-find', nodeCount: 1, operations: [], pathCompression: false })).toThrow(/整数 n/);
  });
});
