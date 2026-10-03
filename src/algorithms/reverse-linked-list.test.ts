import { describe, expect, it } from 'vitest';
import { validateStatementMapping } from '../engine/code';
import { DEFAULT_MAX_STEPS } from '../engine/trace';
import type { AlgorithmInput, LinkedListInput, LinkedListState, Snapshot } from '../engine/types';
import { createPlayerState, playerReducer } from '../player/reducer';
import { reverseLinkedList } from './reverse-linked-list';

const input = (values: readonly number[]): LinkedListInput => ({ kind: 'linked-list', values });
const stateAt = (step: Snapshot): LinkedListState => {
  expect(step.linkedList).toBeDefined();
  return step.linkedList!;
};
const pointersAt = (step: Snapshot) => Object.fromEntries(stateAt(step).pointers.map(pointer => [pointer.label, pointer.nodeId]));

function walk(state: LinkedListState, head: string | null): string[] {
  const byId = new Map(state.nodes.map(node => [node.id, node]));
  const ids: string[] = [];
  for (let nodeId = head; nodeId !== null;) {
    expect(ids).not.toContain(nodeId);
    expect(byId.has(nodeId)).toBe(true);
    ids.push(nodeId);
    nodeId = byId.get(nodeId)!.next;
  }
  return ids;
}

function expectFrozen(value: unknown): void {
  if (value && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(expectFrozen);
  }
}

describe('linked list input', () => {
  it('accepts empty lists, repeated values, signed bounds and all supported separators', () => {
    expect(reverseLinkedList.validate({ kind: 'linked-list', values: '' })).toEqual({ ok: true, input: input([]) });
    expect(reverseLinkedList.validate({ kind: 'linked-list', values: ' -999， +999\n0, 4 4 ' })).toEqual({ ok: true, input: input([-999, 999, 0, 4, 4]) });
    expect(reverseLinkedList.validate({ kind: 'linked-list', values: Array(24).fill(7).join(',') }).ok).toBe(true);
  });

  it.each(['1.5', 'NaN', 'Infinity', '2e2', '1000', '-1000', '1,,2', '1,', ',1', 'hello', Array(25).fill(1).join(',')])('rejects invalid node values %s', values => {
    expect(reverseLinkedList.validate({ kind: 'linked-list', values }).ok).toBe(false);
  });

  it('rejects other input kinds and independently validates direct execution', () => {
    expect(reverseLinkedList.validate({ values: '1, 2', target: '' })).toEqual({ ok: false, error: expect.stringContaining('链表') });
    const malformed: unknown[] = [
      { values: [1, 2] }, { kind: 'array', values: [1, 2] },
      { kind: 'union-find', nodeCount: 0, operations: [], pathCompression: false },
      input([1.5]), input([NaN]), input([Infinity]), input([-1000]), input([1000]),
      input(Array(25).fill(1)), input(Array(2)), { kind: 'linked-list', values: null },
    ];
    for (const value of malformed) expect(() => reverseLinkedList.execute(value as AlgorithmInput)).toThrow();
  });
});

describe('linked list reversal', () => {
  it('executes the displayed JavaScript with the same result and original node objects', () => {
    interface DisplayNode { id: string; value: number; next: DisplayNode | null }
    const executeCode = new Function(`${reverseLinkedList.code.map(line => line.text).join('\n')}\nreturn reverseList;`)() as (head: DisplayNode | null) => DisplayNode | null;
    for (const values of [[], [8], [3, 1, 3, -999, 999], Array.from({ length: 24 }, (_, index) => index)]) {
      const nodes: DisplayNode[] = values.map((value, index) => ({ id: `node-${index}`, value, next: null }));
      nodes.forEach((node, index) => { node.next = nodes[index + 1] ?? null; });
      const result = executeCode(nodes[0] ?? null);
      const trace = reverseLinkedList.execute(input(values));
      expect(result).toBe(nodes.at(-1) ?? null);
      expect(stateAt(trace.steps.at(-1)!).nodes).toEqual(nodes.map(node => ({ id: node.id, value: node.value, next: node.next?.id ?? null })));
      const reversedValues: number[] = [];
      for (let node = result; node !== null; node = node.next) reversedValues.push(node.value);
      expect(trace.result).toMatchObject({ head: result?.id ?? null, values: reversedValues });
    }
  });

  it.each([[], [7], [1, 2, 3, 4], [4, 4, 2, 4], [-999, 999, 0]].map(values => ({ values })))('reverses $values while preserving node identity and values', ({ values }) => {
    const trace = reverseLinkedList.execute(input(values));
    const initial = stateAt(trace.steps[0]);
    const final = stateAt(trace.steps.at(-1)!);
    const expectedIds = values.map((_, index) => `node-${index}`).reverse();
    expect(trace.result).toMatchObject({ kind: 'linked-list', values: [...values].reverse(), head: expectedIds[0] ?? null });
    expect(walk(final, final.head)).toEqual(expectedIds);
    expect(initial.head).toBe(values.length ? 'node-0' : null);
    expect(initial.pointers).toEqual([{ label: 'head', nodeId: initial.head }]);
    expect(trace.steps[0]).toMatchObject({ kind: 'initial', statementId: null });
    expect(trace.steps.at(-1)).toMatchObject({ kind: 'complete', statementId: 'return' });
    expect(trace.steps.filter(step => step.kind === 'complete')).toHaveLength(1);
    expect(() => validateStatementMapping(reverseLinkedList.code, trace.steps)).not.toThrow();
    for (const step of trace.steps) {
      const state = stateAt(step);
      expect(state.nodes.map(({ id, value }) => ({ id, value }))).toEqual(initial.nodes.map(({ id, value }) => ({ id, value })));
      expect(step.items).toEqual([]);
      expect(step.markers).toEqual({});
      // Every node must remain reachable from a live reference, including during edge reversal.
      const reachable = new Set(state.pointers.flatMap(pointer => walk(state, pointer.nodeId)));
      expect([...reachable].sort()).toEqual(state.nodes.map(node => node.id).sort());
    }
  });

  it('saves next before each edge assignment and advances pointers in separate post-statement snapshots', () => {
    const trace = reverseLinkedList.execute(input([2, 2, 7, 4]));
    let reversed = 0;
    for (const [index, step] of trace.steps.entries()) {
      const state = stateAt(step);
      const pointers = pointersAt(step);
      if (step.statementId === 'loop-condition') {
        expect(step.condition).toEqual({ expression: 'current !== null', result: pointers.current !== null });
        expect(pointers).not.toHaveProperty('next');
      }
      if (step.statementId !== 'reverse-link') {
        expect(state.change).toBeUndefined();
        if (index > 0) expect(state.nodes).toEqual(stateAt(trace.steps[index - 1]).nodes);
        continue;
      }
      const saved = trace.steps[index - 1];
      const before = stateAt(saved);
      expect(saved.statementId).toBe('save-next');
      expect(pointers).toEqual(pointersAt(saved));
      expect(pointers.current).toBe(`node-${reversed}`);
      const originalNext = before.nodes.find(node => node.id === pointers.current)!.next;
      expect(pointers.next).toBe(originalNext);
      expect(state.change).toEqual({ nodeId: pointers.current, before: originalNext, after: pointers.prev });
      expect(state.nodes).toEqual(before.nodes.map(node => node.id === pointers.current ? { ...node, next: pointers.prev } : node));
      expect(trace.steps[index + 1].statementId).toBe('prev-advance');
      expect(pointersAt(trace.steps[index + 1])).toEqual({ ...pointers, prev: pointers.current });
      expect(trace.steps[index + 2].statementId).toBe('current-advance');
      expect(pointersAt(trace.steps[index + 2])).toEqual({ ...pointers, prev: pointers.current, current: pointers.next });
      expect(trace.steps[index + 3].statementId).toBe('loop-condition');
      expect(pointersAt(trace.steps[index + 3])).not.toHaveProperty('next');
      reversed += 1;
    }
    expect(reversed).toBe(4);
    const headIndex = trace.steps.findIndex(step => step.statementId === 'head-update');
    expect(stateAt(trace.steps[headIndex - 1]).head).toBe('node-0');
    expect(stateAt(trace.steps[headIndex]).head).toBe('node-3');
  });

  it('records the assignment even when a singleton next remains null', () => {
    const trace = reverseLinkedList.execute(input([5]));
    const links = trace.steps.filter(step => step.kind === 'link');
    expect(links).toHaveLength(1);
    expect(stateAt(links[0]).change).toEqual({ nodeId: 'node-0', before: null, after: null });
    expect(links[0].explanation).toContain('保持为空');
    expect(reverseLinkedList.execute(input([])).steps.some(step => step.kind === 'link')).toBe(false);
  });

  it('retains independent immutable snapshots and restores connections across playback paths', () => {
    const values = [1, 2, 3];
    const source = input(values);
    const trace = reverseLinkedList.execute(source);
    const saved = structuredClone(trace);
    expect(source).toEqual(input([1, 2, 3]));
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(values)).toBe(false);
    expectFrozen(trace);
    for (let index = 1; index < trace.steps.length; index += 1) {
      const before = stateAt(trace.steps[index - 1]);
      const after = stateAt(trace.steps[index]);
      expect(before.nodes).not.toBe(after.nodes);
      expect(before.nodes[0]).not.toBe(after.nodes[0]);
      expect(before.pointers).not.toBe(after.pointers);
    }
    const linkIndex = trace.steps.findIndex(step => step.linkedList?.change?.after === 'node-0');
    let player = createPlayerState(trace);
    player = playerReducer(player, { type: 'seek', index: linkIndex });
    expect(stateAt(player.trace.steps[player.index]).nodes[1].next).toBe('node-0');
    player = playerReducer(player, { type: 'previous' });
    expect(stateAt(player.trace.steps[player.index]).nodes[1].next).toBe('node-2');
    player = playerReducer(player, { type: 'next' });
    expect(player.trace.steps[player.index]).toEqual(saved.steps[linkIndex]);
    for (const index of [trace.steps.length - 1, 0, linkIndex - 1, linkIndex, 2]) {
      player = playerReducer(player, { type: 'seek', index });
      expect(player.trace.steps[player.index]).toEqual(saved.steps[index]);
    }
    player = playerReducer(player, { type: 'reset' });
    expect(player.trace.steps[player.index]).toEqual(saved.steps[0]);
    values[0] = 99;
    expect(trace).toEqual(saved);
  });

  it('is deterministic, honors exact step limits and accepts the maximum list length', () => {
    const source = input(Array.from({ length: 24 }, (_, index) => index - 12));
    const trace = reverseLinkedList.execute(source);
    expect(trace.steps.length).toBeLessThan(DEFAULT_MAX_STEPS);
    expect(reverseLinkedList.execute(source)).toEqual(trace);
    expect(reverseLinkedList.execute(source, { maxSteps: trace.steps.length })).toEqual(trace);
    expect(() => reverseLinkedList.execute(source, { maxSteps: trace.steps.length - 1 })).toThrow(/步上限/);
    for (const maxSteps of [0, -1, 1.5, NaN, Infinity]) expect(() => reverseLinkedList.execute(source, { maxSteps })).toThrow(/正整数/);
  });
});
