import { describe, expect, it } from 'vitest';
import { createStatementMap, validateStatementMapping } from '../engine/code';
import { DEFAULT_MAX_STEPS, createTraceRecorder } from '../engine/trace';
import type { AlgorithmInput, Snapshot, Trace } from '../engine/types';
import { algorithms, binarySearch, bubbleSort } from './index';

function valuesAt(trace: Trace, index: number) {
  return trace.steps[index].items.map((item) => item.value);
}

function variablesAt(step: Snapshot) {
  return Object.fromEntries(step.variables.map(({ name, value }) => [name, value]));
}

function expectFrozen(value: unknown): void {
  if (value && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(expectFrozen);
  }
}

describe('registered algorithm execution', () => {
  it('exposes complete definitions and trace-to-code mappings through one interface', () => {
    expect(new Set(algorithms.map(({ id }) => id)).size).toBe(algorithms.length);
    for (const algorithm of algorithms) {
      const validation = algorithm.validate(algorithm.example);
      expect(validation.ok).toBe(true);
      if (!validation.ok) throw new Error(validation.error);
      const trace = algorithm.execute(validation.input);
      expect(trace.algorithmId).toBe(algorithm.id);
      expect(trace.input).toEqual(validation.input);
      expect(trace.steps[0].statementId).toBeNull();
      expect(trace.steps[0].kind).toBe('initial');
      expect(trace.steps.at(-1)?.kind).toBe('complete');
      expect(() => validateStatementMapping(algorithm.code, trace.steps)).not.toThrow();
      expect(trace.steps.every((step) => step.explanation.length > 0)).toBe(true);
    }
  });

  it('does not mutate or freeze caller input and produces independent frozen snapshots', () => {
    for (const algorithm of algorithms) {
      const validation = algorithm.validate(algorithm.example);
      if (!validation.ok) throw new Error(validation.error);
      const input: AlgorithmInput = structuredClone(validation.input);
      const before = structuredClone(input);
      const trace = algorithm.execute(input);
      expect(input).toEqual(before);
      expect(Object.isFrozen(input)).toBe(false);
      if ('values' in input) expect(Object.isFrozen(input.values)).toBe(false);
      expectFrozen(trace);
      for (let index = 1; index < trace.steps.length; index += 1) {
        expect(trace.steps[index].items).not.toBe(trace.steps[index - 1].items);
        if (trace.steps[index].items.length) expect(trace.steps[index].items[0]).not.toBe(trace.steps[index - 1].items[0]);
        expect(trace.steps[index].variables).not.toBe(trace.steps[index - 1].variables);
        expect(trace.steps[index].markers).not.toBe(trace.steps[index - 1].markers);
      }
      if ('values' in input && 'values' in before && 'values' in trace.input) {
        (input.values as number[])[0] = 999;
        expect(trace.input.values).toEqual(before.values);
        expect(trace.steps[0].linkedList?.nodes.map(node => node.value) ?? valuesAt(trace, 0)).toEqual(before.values);
      }
    }
  });

  it('is deterministic for the same input and options', () => {
    expect(bubbleSort.execute({ values: [4, -2, 4, 0] })).toEqual(bubbleSort.execute({ values: [4, -2, 4, 0] }));
    expect(binarySearch.execute({ values: [-2, 0, 4, 4], target: 4 })).toEqual(binarySearch.execute({ values: [-2, 0, 4, 4], target: 4 }));
  });

  it('reports an explicit step limit error without returning a partial trace', () => {
    for (const algorithm of algorithms) {
      const validation = algorithm.validate(algorithm.example);
      if (!validation.ok) throw new Error(validation.error);
      const input = validation.input;
      const trace = algorithm.execute(input);
      expect(() => algorithm.execute(input, { maxSteps: trace.steps.length - 1 })).toThrow(/步上限/);
      expect(algorithm.execute(input, { maxSteps: trace.steps.length })).toEqual(trace);
      for (const maxSteps of [0, -1, 1.5, NaN, Infinity]) {
        expect(() => algorithm.execute(input, { maxSteps })).toThrow(/正整数/);
      }
    }
    expect(bubbleSort.execute({ values: Array.from({ length: 24 }, (_, index) => 24 - index) }).steps.length).toBeLessThan(DEFAULT_MAX_STEPS);
  });
});

describe('bubble sort', () => {
  it.each([
    [], [7], [1, 2, 3, 4], [4, 3, 2, 1], [3, 1, 3, 2, 1], [-999, 0, 999, -1],
  ].map((values) => ({ values })))('sorts $values and preserves element identities and values', ({ values }) => {
    const trace = bubbleSort.execute({ values });
    expect(trace.result.kind).toBe('sorted');
    expect(valuesAt(trace, trace.steps.length - 1)).toEqual([...values].sort((a, b) => a - b));
    const original = new Map(trace.steps[0].items.map(({ id, value }) => [id, value]));
    for (const step of trace.steps) {
      expect(step.items).toHaveLength(values.length);
      expect(new Set(step.items.map(({ id }) => id)).size).toBe(values.length);
      expect(step.items.every(({ id, value }) => original.get(id) === value)).toBe(true);
    }
    expect(trace.steps.at(-1)?.markers.sorted).toEqual(values.map((_, index) => index));
  });

  it('keeps comparisons separate from swaps and reports true and false decisions', () => {
    const trace = bubbleSort.execute({ values: [2, 1, 3] });
    const comparisons = trace.steps.filter(({ kind }) => kind === 'compare');
    expect(comparisons.some((step) => step.condition?.result === true)).toBe(true);
    expect(comparisons.some((step) => step.condition?.result === false)).toBe(true);
    for (const [index, step] of trace.steps.entries()) {
      if (step.kind === 'compare') {
        expect(step.statementId).toBe('compare');
        const [left, right] = step.markers.active!;
        expect(right).toBe(left + 1);
        expect(step.condition?.result).toBe(step.items[left].value > step.items[right].value);
        expect(valuesAt(trace, index)).toEqual(valuesAt(trace, index - 1));
        expect(trace.steps[index + 1].kind === 'swap').toBe(step.condition?.result);
      }
      if (step.kind === 'swap') {
        expect(trace.steps[index - 1].kind).toBe('compare');
        const [left, right] = step.markers.active!;
        expect(step.items[left]).toEqual(trace.steps[index - 1].items[right]);
        expect(step.items[right]).toEqual(trace.steps[index - 1].items[left]);
      }
    }
  });

  it('marks each completed pass and does not terminate early for sorted input', () => {
    const trace = bubbleSort.execute({ values: [1, 2, 3, 4] });
    const completedPasses = trace.steps.filter(({ kind }) => kind === 'range');
    expect(completedPasses.map(({ markers }) => markers.sorted)).toEqual([[3], [2, 3], [1, 2, 3]]);
    expect(trace.steps.filter(({ kind }) => kind === 'swap')).toHaveLength(0);
    expect(trace.steps.filter(({ kind }) => kind === 'compare')).toHaveLength(6);
  });

  it('preserves relative identity order for equal values', () => {
    const trace = bubbleSort.execute({ values: [2, 1, 2, 1] });
    expect(trace.steps.at(-1)?.items.map(({ id }) => id)).toEqual(['item-1', 'item-3', 'item-0', 'item-2']);
  });

  it('keeps the inner index visible through the outer block and removes it when that block exits', () => {
    const trace = bubbleSort.execute({ values: [3, 2, 1] });
    for (const [index, step] of trace.steps.entries()) {
      if (step.statementId !== 'end-advance') continue;
      expect(variablesAt(step).j).toBe(variablesAt(trace.steps[index - 1]).j);
      expect(variablesAt(trace.steps[index + 1])).not.toHaveProperty('j');
    }
  });
});

describe('binary search', () => {
  it.each([
    { values: [], target: 4, index: -1 },
    { values: [4], target: 4, index: 0 },
    { values: [4], target: 2, index: -1 },
    { values: [4], target: 6, index: -1 },
    { values: [1, 3, 5, 7, 9], target: 1, index: 0 },
    { values: [1, 3, 5, 7, 9], target: 9, index: 4 },
    { values: [1, 3, 5, 7, 9], target: 5, index: 2 },
    { values: [1, 3, 5, 7, 9], target: 4, index: -1 },
    { values: [1, 2, 2, 2, 3], target: 2, index: 2 },
  ])('returns the encountered match or -1 for $values / $target', ({ values, target, index }) => {
    const trace = binarySearch.execute({ values, target });
    expect(trace.result).toMatchObject({ index });
    expect(trace.result.kind).toBe(index === -1 ? 'not-found' : 'found');
    expect(trace.steps.every((step) => step.items.map((item) => item.value).join(',') === values.join(','))).toBe(true);
    if (index >= 0) expect(trace.steps.at(-1)?.markers.found).toBe(index);
    else expect(trace.steps.at(-1)?.markers.found).toBeUndefined();
  });

  it('keeps midpoint calculations and comparisons inside inclusive shrinking ranges', () => {
    const trace = binarySearch.execute({ values: [-5, -1, 2, 4, 6, 9, 15, 21], target: 20 });
    let previousStart = 0;
    let previousEnd = 7;
    for (const step of trace.steps) {
      if (step.markers.range) {
        const { start, end } = step.markers.range;
        expect(start).toBeGreaterThanOrEqual(previousStart);
        expect(end).toBeLessThanOrEqual(previousEnd);
        previousStart = start;
        previousEnd = end;
      }
      const variables = variablesAt(step);
      if (step.statementId === 'mid') {
        expect(variables.mid).toBe(Math.floor((Number(variables.left) + Number(variables.right)) / 2));
        expect(Number(variables.mid)).toBeGreaterThanOrEqual(Number(variables.left));
        expect(Number(variables.mid)).toBeLessThanOrEqual(Number(variables.right));
      }
      if (step.statementId === 'equal') expect(step.condition?.result).toBe(step.items[Number(variables.mid)].value === 20);
      if (step.statementId === 'less') expect(step.condition?.result).toBe(step.items[Number(variables.mid)].value < 20);
      if (step.statementId === 'left-advance') expect(variables.left).toBe(Number(variables.mid) + 1);
      if (step.statementId === 'right-advance') expect(variables.right).toBe(Number(variables.mid) - 1);
    }
    const finalRange = trace.steps.at(-1)!.markers.range!;
    expect(finalRange.start).toBeGreaterThan(finalRange.end);
  });

  it('keeps mid visible for a boundary update, then removes it when the loop block exits', () => {
    const trace = binarySearch.execute({ values: [1, 3, 5, 7, 9], target: 4 });
    for (const [index, step] of trace.steps.entries()) {
      if (step.kind !== 'range') continue;
      expect(variablesAt(step)).toHaveProperty('mid');
      expect(variablesAt(trace.steps[index + 1])).not.toHaveProperty('mid');
      expect(trace.steps[index + 1].markers.pointers?.some(({ label }) => label === 'mid')).toBe(false);
    }
  });
});

describe('input validation', () => {
  it('accepts empty arrays, whitespace and comma separators, duplicates, and signed bounds', () => {
    expect(bubbleSort.validate({ values: '', target: '' })).toEqual({ ok: true, input: { values: [] } });
    expect(bubbleSort.validate({ values: ' -999, 0， +999\n 4  4 ', target: '' })).toEqual({ ok: true, input: { values: [-999, 0, 999, 4, 4] } });
    expect(binarySearch.validate({ values: '1, 1, 2', target: '1' })).toEqual({ ok: true, input: { values: [1, 1, 2], target: 1 } });
    expect(binarySearch.validate({ values: '', target: '0' }).ok).toBe(true);
    expect(bubbleSort.validate({ values: Array(24).fill(1).join(','), target: '' }).ok).toBe(true);
  });

  it.each(['1.5', 'NaN', 'Infinity', '2e2', '1000', '-1000', '1,,2', '1,', ',1', 'hello', Array(25).fill(1).join(',')])('rejects invalid array text %s', (values) => {
    const result = bubbleSort.validate({ values, target: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it('rejects unsorted binary search input and invalid targets without changing input', () => {
    const draft = { values: '3, 1, 2', target: '1' };
    expect(binarySearch.validate(draft)).toEqual({ ok: false, error: expect.stringContaining('升序') });
    expect(draft.values).toBe('3, 1, 2');
    for (const target of ['', '1.5', '1000', 'NaN']) {
      expect(binarySearch.validate({ values: '1, 2, 3', target }).ok).toBe(false);
    }
    expect(() => binarySearch.execute({ values: [3, 1, 2], target: 1 })).toThrow(/升序/);
    expect(() => binarySearch.execute({ values: [1, 2] })).toThrow(/目标值/);
  });

  it('guards the execution boundary even when callers skip draft validation', () => {
    for (const algorithm of algorithms) {
      for (const values of [[NaN], [1.5], [Infinity], [1000], [-1000], Array(25).fill(0), Array(2)]) {
        expect(() => algorithm.execute({ values, target: 0 })).toThrow();
      }
    }
  });
});

describe('statement mappings', () => {
  it('resolves by stable ID after code lines are reformatted or shifted', () => {
    const reformatted = [{ text: '// extra documentation' }, { text: '' }, ...bubbleSort.code.map((line) => ({ ...line, text: `  ${line.text}` }))];
    const before = createStatementMap(bubbleSort.code);
    const after = createStatementMap(reformatted);
    for (const [id, line] of before) expect(after.get(id)).toBe(line + 2);
    expect(() => validateStatementMapping(reformatted, bubbleSort.execute({ values: [2, 1] }).steps)).not.toThrow();
  });

  it('detects duplicate IDs and missing mappings', () => {
    expect(() => createStatementMap([{ id: 'same', text: 'a' }, { id: 'same', text: 'b' }])).toThrow(/重复/);
    expect(() => createStatementMap([{ id: '', text: 'a' }])).toThrow(/不能为空/);
    const trace = bubbleSort.execute({ values: [2, 1] });
    const missingSwap = bubbleSort.code.map((line) => line.id === 'swap' ? { text: line.text } : line);
    expect(() => validateStatementMapping(missingSwap, trace.steps)).toThrow(/swap/);
  });

  it('requires trace recorders to finish with an initial and a completion state', () => {
    const recorder = createTraceRecorder('test', { values: [] }, [{ id: 'return', text: 'return [];' }]);
    expect(() => recorder.finish({ kind: 'sorted', message: 'done' })).toThrow(/初始状态/);
    recorder.record({ statementId: null, kind: 'initial', explanation: 'ready', items: [], variables: [], markers: {} });
    expect(() => recorder.finish({ kind: 'sorted', message: 'done' })).toThrow(/结束状态/);
  });
});
