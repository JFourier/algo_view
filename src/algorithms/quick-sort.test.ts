import { describe, expect, it } from 'vitest';
import { createStatementMap, validateStatementMapping } from '../engine/code';
import { DEFAULT_MAX_STEPS } from '../engine/trace';
import type { CallFrame, Snapshot, Variable } from '../engine/types';
import { createPlayerState, playerReducer } from '../player/reducer';
import { quickSort } from './quick-sort';

const variables = (list: readonly Variable[]) => Object.fromEntries(list.map(({ name, value }) => [name, value]));
const current = (step: Snapshot) => step.callStack!.at(-1)!;
const finalValues = (steps: readonly Snapshot[]) => steps.at(-1)!.items.map(({ value }) => value);

function expectFrozen(value: unknown): void {
  if (value && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(expectFrozen);
  }
}

const ascending = Array.from({ length: 24 }, (_, index) => index - 12);
const cases = [[], [7], [3, 1, 4, 2], [3, 1, 3, 2, 1], [-999, 999, 0, -1], ascending, [...ascending].reverse(), Array<number>(24).fill(4)];

describe('quick sort results and partitions', () => {
  it.each(cases.map((values) => ({ values })))('sorts $values without losing identities or prematurely marking positions', ({ values }) => {
    const trace = quickSort.execute({ values });
    const expected = [...values].sort((a, b) => a - b);
    const original = new Map(trace.steps[0].items.map(({ id, value }) => [id, value]));
    const final = trace.steps.at(-1)!;
    expect(finalValues(trace.steps)).toEqual(expected);
    expect(trace.result).toMatchObject({ kind: 'sorted', values: expected });
    expect(trace.steps.length).toBeLessThan(DEFAULT_MAX_STEPS);
    expect(trace.steps.filter(({ kind }) => kind === 'complete')).toEqual([final]);
    expect(final.markers.sorted).toEqual(values.map((_, index) => index));
    expect(final.callStack).toEqual([]);
    expect(final.variables).toEqual([]);
    expect(final.execution).toMatchObject({ event: 'return', functionName: 'sort', activeFrameId: null });
    for (const step of trace.steps) {
      expect(step.items).toHaveLength(values.length);
      expect(new Set(step.items.map(({ id }) => id)).size).toBe(values.length);
      expect(step.items.every(({ id, value }) => original.get(id) === value)).toBe(true);
      for (const index of step.markers.sorted ?? []) expect(step.items[index]).toEqual(final.items[index]);
      if (step.markers.pivot) {
        const { id, value, index } = step.markers.pivot;
        expect(step.items[index]).toEqual({ id, value });
      }
      if (step.statementId === 'partition.placePivot') {
        const { low, high } = variables(current(step).parameters);
        const { index, value } = step.markers.pivot!;
        expect(step.items.slice(Number(low), index).every((item) => item.value < value)).toBe(true);
        expect(step.items.slice(index + 1, Number(high) + 1).every((item) => item.value >= value)).toBe(true);
        expect(step.markers.sorted).toContain(index);
      }
    }
  });

  it('checks all short arrays over three values against an independent numeric sort', () => {
    for (let length = 0; length <= 4; length += 1) {
      for (let encoded = 0; encoded < 3 ** length; encoded += 1) {
        const values = Array.from({ length }, (_, index) => Math.floor(encoded / 3 ** index) % 3 - 1);
        expect(finalValues(quickSort.execute({ values }).steps)).toEqual([...values].sort((a, b) => a - b));
      }
    }
  });

  it('keeps decisions, swaps (including self swaps), and each pointer assignment separate', () => {
    const trace = quickSort.execute({ values: [1, 3, 2, 4] });
    const comparisons = trace.steps.filter(({ statementId }) => statementId === 'partition.compare');
    expect(comparisons.some(({ condition }) => condition?.result)).toBe(true);
    expect(comparisons.some(({ condition }) => condition?.result === false)).toBe(true);
    let selfSwaps = 0;
    for (const [index, step] of trace.steps.entries()) {
      if (index === 0) continue;
      const before = trace.steps[index - 1];
      const locals = variables(step.variables);
      if (step.statementId === 'partition.compare') {
        const expected = step.items[Number(locals.j)].value < Number(locals.pivot);
        expect(step.condition).toEqual({ expression: 'a[j] < pivot', result: expected });
        expect(step.items).toEqual(before.items);
        expect(trace.steps[index + 1].statementId).toBe(expected ? 'partition.swap' : 'partition.advanceJ');
      }
      if (step.kind === 'swap') {
        const [left, right] = step.markers.active!;
        const expected = [...before.items];
        [expected[left], expected[right]] = [expected[right], expected[left]];
        expect(step.items).toEqual(expected);
        if (left === right) {
          selfSwaps += 1;
          expect(step.explanation).toContain('位置未变化');
        }
      }
      if (step.statementId === 'partition.advanceI' || step.statementId === 'partition.advanceJ') {
        const name = step.statementId === 'partition.advanceI' ? 'i' : 'j';
        expect(locals[name]).toBe(Number(variables(before.variables)[name]) + 1);
        expect(step.items).toEqual(before.items);
      }
    }
    expect(selfSwaps).toBeGreaterThan(0);
  });

  it('retains the chosen rightmost pivot identity even with duplicates and after its move', () => {
    const trace = quickSort.execute({ values: [3, 1, 3, 1, 2] });
    const pivots = new Map<string, string>();
    let moved = false;
    for (const step of trace.steps) {
      if (step.statementId === 'partition.pivot') {
        const frame = current(step);
        const high = Number(variables(frame.parameters).high);
        expect(step.markers.pivot).toEqual({ ...step.items[high], index: high });
        pivots.set(frame.id, step.items[high].id);
      }
      if (step.execution?.functionName === 'partition' && step.execution.event === 'statement') {
        expect(step.markers.pivot?.id).toBe(pivots.get(step.execution.frameId));
        if (step.statementId === 'partition.placePivot') {
          moved ||= step.markers.pivot!.index !== Number(variables(current(step).parameters).high);
        }
      }
    }
    expect(moved).toBe(true);
  });
});

describe('quick sort call context and lifetime', () => {
  it('records call owners separately from active frames and pops returns before restoring caller state', () => {
    const trace = quickSort.execute({ values: [4, 1, 3, 2] });
    const seen = new Map<string, CallFrame>();
    for (const [index, step] of trace.steps.entries()) {
      const frames = step.callStack!;
      expect(new Set(frames.map(({ id }) => id)).size).toBe(frames.length);
      for (const [depth, frame] of frames.entries()) {
        expect(frame.depth).toBe(depth);
        expect(frame.parentId).toBe(depth === 0 ? null : frames[depth - 1].id);
        const original = seen.get(frame.id);
        if (original) {
          expect(frame.functionName).toBe(original.functionName);
          expect(frame.parameters).toEqual(original.parameters);
        } else seen.set(frame.id, frame);
        if (frame.functionName === 'quickSort') {
          expect(frame.locals.every(({ name }) => name === 'p')).toBe(true);
        }
        if (frame.functionName === 'partition') expect(variables(frame.locals)).not.toHaveProperty('p');
      }
      const active = frames.at(-1);
      expect(step.variables).toEqual(active ? [...active.parameters, ...active.locals] : []);
      if (!step.execution) continue;
      expect(step.execution.activeFrameId).toBe(active?.id ?? null);
      const before = trace.steps[index - 1];
      if (step.execution.event === 'call') {
        expect(step.execution.frameId).toBe(current(before).id);
        expect(step.execution.frameId).not.toBe(active!.id);
        expect(frames.slice(0, -1)).toEqual(before.callStack);
        expect(active!.locals).toEqual([]);
      } else if (step.execution.event === 'return') {
        expect(step.execution.frameId).toBe(current(before).id);
        expect(frames).toEqual(before.callStack!.slice(0, -1));
        expect(frames.some(({ id }) => id === step.execution!.frameId)).toBe(false);
      } else {
        expect(step.execution.frameId).toBe(active!.id);
      }
      if (active && active.functionName !== 'sort') {
        const { low, high } = variables(active.parameters);
        expect(step.markers.range).toMatchObject({ start: low, end: high });
      }
    }
    expect(Math.max(...trace.steps.map((step) => step.callStack!.length))).toBeGreaterThan(3);
  });

  it('assigns the returned partition index only after the partition frame has exited', () => {
    const trace = quickSort.execute({ values: [3, 2, 1] });
    for (const [index, step] of trace.steps.entries()) {
      if (step.statementId !== 'partition.return') continue;
      expect(step.execution?.event).toBe('return');
      expect(step.execution?.returnedValue).toBe(variables(current(trace.steps[index - 1]).locals).i);
      expect(current(step).functionName).toBe('quickSort');
      expect(current(step).locals).toEqual([]);
      expect(variables(step.variables)).not.toHaveProperty('pivot');
      const assigned = trace.steps[index + 1];
      expect(assigned.statementId).toBe('quickSort.partition');
      expect(assigned.kind).toBe('assign');
      expect(assigned.execution?.frameId).toBe(step.execution?.activeFrameId);
      expect(variables(current(assigned).locals)).toEqual({ p: step.execution?.returnedValue });
    }
  });

  it('recurses left before right with isolated parameters, and explicitly returns empty and singleton intervals', () => {
    const trace = quickSort.execute({ values: [1, 2, 3, 4] });
    const calls = new Map<string, string[]>();
    let emptyReturns = 0;
    let singleReturns = 0;
    for (const [index, step] of trace.steps.entries()) {
      if (step.kind === 'call' && ['quickSort.callLeft', 'quickSort.callRight'].includes(step.statementId!)) {
        const caller = step.callStack!.at(-2)!;
        const { low, high } = variables(caller.parameters);
        const { p } = variables(caller.locals);
        const left = step.statementId === 'quickSort.callLeft';
        expect(variables(current(step).parameters)).toEqual(left ? { low, high: Number(p) - 1 } : { low: Number(p) + 1, high });
        calls.set(caller.id, [...(calls.get(caller.id) ?? []), step.statementId!]);
      }
      if (step.statementId === 'quickSort.baseReturn') {
        const { low, high } = variables(current(trace.steps[index - 1]).parameters);
        expect(Number(low)).toBeGreaterThanOrEqual(Number(high));
        if (low === high) {
          singleReturns += 1;
          expect(step.markers.sorted).toContain(low);
        } else {
          emptyReturns += 1;
          expect(step.explanation).toContain('为空');
        }
      }
    }
    expect(calls.size).toBeGreaterThan(1);
    for (const order of calls.values()) expect(order).toEqual(['quickSort.callLeft', 'quickSort.callRight']);
    expect(emptyReturns).toBeGreaterThan(0);
    expect(singleReturns).toBeGreaterThan(0);
  });
});

describe('quick sort trace guarantees', () => {
  it('preserves unfrozen caller input and freezes independent complete snapshots', () => {
    const input = { values: [3, -1, 2, 3] };
    const original = structuredClone(input);
    const trace = quickSort.execute(input);
    expect(input).toEqual(original);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.values)).toBe(false);
    expectFrozen(trace);
    for (let index = 1; index < trace.steps.length; index += 1) {
      const step = trace.steps[index];
      const previous = trace.steps[index - 1];
      expect(step.items).not.toBe(previous.items);
      expect(step.items[0]).not.toBe(previous.items[0]);
      expect(step.callStack).not.toBe(previous.callStack);
      if (step.callStack!.length) {
        expect(step.callStack![0]).not.toBe(previous.callStack![0]);
        expect(step.callStack![0].locals).not.toBe(previous.callStack![0].locals);
      }
    }
    input.values[0] = 999;
    expect(trace.input).toEqual(original);
    expect(trace.steps[0].items.map(({ value }) => value)).toEqual(original.values);
  });

  it('replays every call and return identically through sequential, reverse and direct navigation', () => {
    const trace = quickSort.execute({ values: [5, 1, 4, 2, 3] });
    const before = JSON.stringify(trace);
    let sequential = createPlayerState(trace);
    for (let index = 1; index < trace.steps.length; index += 1) {
      sequential = playerReducer(sequential, { type: 'next' });
      if (!['call', 'return', 'complete'].includes(trace.steps[index].kind)) continue;
      const reverse = playerReducer(playerReducer(sequential, { type: 'previous' }), { type: 'next' });
      const direct = playerReducer(createPlayerState(trace), { type: 'seek', index });
      for (const state of [sequential, reverse, direct]) expect(state.trace.steps[state.index]).toBe(trace.steps[index]);
    }
    expect(JSON.stringify(trace)).toBe(before);
    expect(quickSort.execute({ values: [5, 1, 4, 2, 3] })).toEqual(trace);
  });

  it('maps every executed statement and rejects duplicated or absent function-specific IDs', () => {
    const trace = quickSort.execute({ values: [3, 1, 2, 4] });
    expect(() => validateStatementMapping(quickSort.code, trace.steps)).not.toThrow();
    const mapped = createStatementMap(quickSort.code);
    expect([...mapped.keys()].every((id) => id.includes('.'))).toBe(true);
    expect(() => createStatementMap([...quickSort.code, { id: 'partition.return', text: 'return i;' }])).toThrow(/重复/);
    expect(() => validateStatementMapping(quickSort.code.filter(({ id }) => id !== 'partition.return'), trace.steps)).toThrow(/partition.return/);
    for (const statementId of mapped.keys()) expect(trace.steps.some((step) => step.statementId === statementId)).toBe(true);
  });

  it('enforces the step limit during recording, including initial and final snapshots', () => {
    const input = { values: [3, 1, 2] };
    const trace = quickSort.execute(input);
    for (const maxSteps of [1, 5, trace.steps.length - 1]) {
      expect(() => quickSort.execute(input, { maxSteps })).toThrow(/步上限/);
    }
    expect(quickSort.execute(input, { maxSteps: trace.steps.length })).toEqual(trace);
    for (const maxSteps of [0, -1, NaN, Infinity, 1.5]) {
      expect(() => quickSort.execute(input, { maxSteps })).toThrow(/正整数/);
    }
  });

  it('validates its examples and rejects invalid or incompatible inputs at both boundaries', () => {
    for (const { draft } of quickSort.examples!) expect(quickSort.validate(draft).ok).toBe(true);
    expect(quickSort.validate({ values: '', target: '' })).toEqual({ ok: true, input: { values: [] } });
    for (const values of [[NaN], [Infinity], [1.1], [-1000], [1000], Array<number>(25).fill(1), Array(2)]) {
      expect(() => quickSort.execute({ values })).toThrow();
    }
    for (const values of ['1,,2', '1.5', '1000', Array(25).fill('1').join(',')]) {
      expect(quickSort.validate({ values, target: '' }).ok).toBe(false);
    }
    expect(quickSort.validate({ kind: 'union-find', nodeCount: '0', operations: '', pathCompression: false }).ok).toBe(false);
    expect(() => quickSort.execute({ kind: 'union-find', nodeCount: 0, operations: [], pathCompression: false })).toThrow();
  });
});
