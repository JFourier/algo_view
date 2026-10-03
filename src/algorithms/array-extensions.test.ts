import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_STEPS } from '../engine/trace';
import type { Snapshot } from '../engine/types';
import { createPlayerState, playerReducer } from '../player/reducer';
import { insertionSort } from './insertion-sort';
import { linearSearch } from './linear-search';

const variables = (step: Snapshot) => Object.fromEntries(step.variables.map(variable => [variable.name, variable.value]));

describe('insertion sort', () => {
  it.each([[], [7], [1, 2, 3], [3, 2, 1], [2, 1, 2, 1], [-999, 999, 0, -3]].map(values => ({ values })))('sorts $values stably on a copy', ({ values }) => {
    const trace = insertionSort.execute({ values });
    const original = trace.steps[0].items;
    const expected = [...original].sort((a, b) => a.value - b.value);
    expect(trace.steps.at(-1)?.items).toEqual(expected);
    expect(trace.result).toMatchObject({ kind: 'sorted', values: expected.map(item => item.value) });
    expect(values).toEqual(original.map(item => item.value));
  });

  it('records actual slot copies, preserves the held item and writes it back at the insertion point', () => {
    const trace = insertionSort.execute({ values: [5, 4, 3, 2, 1] });
    for (let index = 1; index < trace.steps.length; index++) {
      const step = trace.steps[index];
      const previous = trace.steps[index - 1];
      if (step.statementId === 'shift') {
        const { index: destination, sourceIndex } = step.insertion!.write!;
        expect(destination).toBe(sourceIndex! + 1);
        expect(step.items[destination]).toEqual(previous.items[sourceIndex!]);
        expect(step.items[sourceIndex!]).toEqual(previous.items[sourceIndex!]);
        expect(step.insertion!.held).toEqual(previous.insertion!.held);
        expect(step.items.filter((_, slot) => slot !== destination)).toEqual(previous.items.filter((_, slot) => slot !== destination));
        expect(step.markers.range).toBeUndefined();
      } else if (step.statementId === 'insert') {
        expect(step.items[step.insertion!.write!.index]).toEqual(previous.insertion!.held);
        expect(new Set(step.items.map(item => item.id)).size).toBe(step.items.length);
      } else {
        expect(step.items).toEqual(previous.items);
      }
      if (step.markers.range) {
        const { start, end } = step.markers.range;
        const prefix = step.items.slice(start, end + 1).map(item => item.value);
        expect(prefix).toEqual([...prefix].sort((a, b) => a - b));
      }
      if (step.kind !== 'complete') expect(step.markers.sorted).toBeUndefined();
      if (step.statementId === 'outer') {
        expect(variables(step)).not.toHaveProperty('key');
        expect(variables(step)).not.toHaveProperty('j');
        expect(step.insertion?.held).toBeNull();
      }
    }
  });

  it('does not shift equal values and fits a maximum reverse input within the snapshot limit', () => {
    expect(insertionSort.execute({ values: [2, 2, 2] }).steps.some(step => step.statementId === 'shift')).toBe(false);
    const trace = insertionSort.execute({ values: Array.from({ length: 24 }, (_, i) => 24 - i) });
    expect(trace.steps.length).toBeLessThan(DEFAULT_MAX_STEPS);
    expect(trace.steps.at(-1)?.items.map(item => item.value)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });
});

describe('linear search', () => {
  it.each([
    { values: [], target: 1 }, { values: [1], target: 1 }, { values: [1], target: -1 },
    { values: [9, 2, 7, 2], target: 2 }, { values: [9, 2, 7], target: 7 },
    { values: [-999, 0, 999], target: -999 }, { values: [3, 2, 1], target: 0 },
  ])('returns the first match for $values / $target without requiring sorting', input => {
    const trace = linearSearch.execute(input);
    const expected = input.values.indexOf(input.target);
    expect(trace.result).toMatchObject({ kind: expected < 0 ? 'not-found' : 'found', index: expected });
    expect(trace.steps.every(step => JSON.stringify(step.items) === JSON.stringify(trace.steps[0].items))).toBe(true);
    const comparisons = trace.steps.filter(step => step.kind === 'compare');
    expect(comparisons.map(step => variables(step).i)).toEqual(Array.from({ length: expected < 0 ? input.values.length : expected + 1 }, (_, i) => i));
    for (const step of comparisons) {
      const i = variables(step).i as number;
      expect(step.condition?.result).toBe(input.values[i] === input.target);
      expect(step.markers.range).toEqual({ start: i, end: input.values.length - 1 });
    }
  });

  it('accepts unsorted input and rejects malformed values and targets', () => {
    expect(linearSearch.validate({ values: '3, 1, 3', target: '3' }).ok).toBe(true);
    expect(linearSearch.validate({ values: '3,,1', target: '3' }).ok).toBe(false);
    expect(linearSearch.validate({ values: '3,1', target: '' }).ok).toBe(false);
    expect(() => linearSearch.execute({ values: [1], target: 1.2 })).toThrow(/目标值/);
  });
});

describe('array extension replay contracts', () => {
  for (const algorithm of [insertionSort, linearSearch]) {
    it(`${algorithm.id} is deterministic and restores every snapshot through seek and backtracking`, () => {
      const input = { values: [3, 1, 2, 1], target: 1 };
      const before = structuredClone(input);
      const trace = algorithm.execute(input);
      expect(trace).toEqual(algorithm.execute(input));
      expect(input).toEqual(before);
      for (let index = 0; index < trace.steps.length; index++) {
        const sought = playerReducer(createPlayerState(trace), { type: 'seek', index });
        const restored = playerReducer(playerReducer(sought, { type: 'next' }), { type: 'previous' });
        expect(sought.trace.steps[sought.index]).toEqual(trace.steps[index]);
        if (index < trace.steps.length - 1) expect(restored.trace.steps[restored.index]).toEqual(trace.steps[index]);
      }
      expect(() => algorithm.execute(input, { maxSteps: trace.steps.length - 1 })).toThrow(/步上限/);
      expect(() => algorithm.execute({ values: Array(25).fill(1), target: 1 })).toThrow(/24/);
      expect(() => algorithm.execute({ kind: 'integer', n: 3 })).toThrow(/数组/);
      expect(algorithm.validate({ kind: 'integer', n: '3' }).ok).toBe(false);
    });
  }
});
