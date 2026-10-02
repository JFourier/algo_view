import { describe, expect, it } from 'vitest';
import { validateStatementMapping } from '../engine/code';
import { DEFAULT_MAX_STEPS } from '../engine/trace';
import type { AlgorithmInput, Snapshot, UnionFindDraft, UnionFindInput, UnionFindOperation, UnionFindState } from '../engine/types';
import { unionFind } from './union-find';

function input(operations: readonly UnionFindOperation[] = [], nodeCount = 8, pathCompression = false): UnionFindInput {
  return { kind: 'union-find', nodeCount, operations, pathCompression };
}

const chain: UnionFindOperation[] = [
  { kind: 'union', a: 0, b: 1 }, { kind: 'union', a: 2, b: 3 }, { kind: 'union', a: 0, b: 2 },
  { kind: 'union', a: 4, b: 5 }, { kind: 'union', a: 6, b: 7 }, { kind: 'union', a: 4, b: 6 },
  { kind: 'union', a: 0, b: 4 }, { kind: 'find', x: 7 }, { kind: 'find', x: 7 },
];

function stateAt(step: Snapshot): UnionFindState {
  expect(step.unionFind).toBeDefined();
  return step.unionFind!;
}

function rootOf(parent: readonly number[], node: number): number {
  const seen = new Set<number>();
  while (parent[node] !== node) {
    expect(seen.has(node)).toBe(false);
    seen.add(node);
    node = parent[node];
  }
  return node;
}

function checkStructure(state: UnionFindState, nodeCount: number, atBoundary: boolean) {
  expect(state.parent).toHaveLength(nodeCount);
  expect(state.size).toHaveLength(nodeCount);
  for (const parent of state.parent) {
    expect(Number.isInteger(parent)).toBe(true);
    expect(parent).toBeGreaterThanOrEqual(0);
    expect(parent).toBeLessThan(nodeCount);
  }
  const memberCounts = new Map<number, number>();
  for (let node = 0; node < nodeCount; node += 1) {
    const root = rootOf(state.parent, node);
    memberCounts.set(root, (memberCounts.get(root) ?? 0) + 1);
  }
  if (atBoundary) {
    expect(state.count).toBe(memberCounts.size);
    for (const [root, members] of memberCounts) expect(state.size[root]).toBe(members);
  }
}

function expectFrozen(value: unknown): void {
  if (value && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(expectFrozen);
  }
}

describe('union-find input', () => {
  const draft: UnionFindDraft = { kind: 'union-find', nodeCount: '8', operations: '', pathCompression: false };

  it('accepts empty structures, blank lines, signed integers and the permitted maximums', () => {
    expect(unionFind.validate({ ...draft, nodeCount: '0' })).toEqual({ ok: true, input: input([], 0) });
    expect(unionFind.validate({ ...draft, operations: '\n union  +1 2 \n\nfind 2\r\n' })).toEqual({
      ok: true, input: input([{ kind: 'union', a: 1, b: 2 }, { kind: 'find', x: 2 }]),
    });
    expect(unionFind.validate({ ...draft, nodeCount: '16', operations: Array(32).fill('find 15').join('\n') }).ok).toBe(true);
    expect(unionFind.example).toMatchObject({ kind: 'union-find', pathCompression: false });
  });

  it.each(['', ' ', '-1', '17', '1.5', '2e1', 'Infinity', 'NaN', 'hello'])('rejects node count %s', (nodeCount) => {
    expect(unionFind.validate({ ...draft, nodeCount }).ok).toBe(false);
  });

  it.each([
    ['\nconnect 1 2', '第 2 行'], ['find 1 2', '第 1 行'], ['union 1', '第 1 行'],
    ['\n\nunion 0 8', '第 3 行'], ['find -1', '第 1 行'], ['union 0 1.5', '第 1 行'],
    ['find 1e0', '第 1 行'], ['find NaN', '第 1 行'], ['union 0 x', '第 1 行'],
  ])('reports the source line for invalid operation %s', (operations, line) => {
    expect(unionFind.validate({ ...draft, operations })).toEqual({ ok: false, error: expect.stringContaining(line) });
  });

  it('rejects operations on zero nodes and more than 32 nonempty operations', () => {
    expect(unionFind.validate({ ...draft, nodeCount: '0', operations: '\nfind 0' })).toEqual({ ok: false, error: expect.stringContaining('第 2 行') });
    expect(unionFind.validate({ ...draft, operations: Array(33).fill('find 0').join('\n\n') })).toEqual({ ok: false, error: expect.stringContaining('第 65 行') });
  });

  it('guards execution independently of draft validation', () => {
    const malformed: unknown[] = [
      { values: [1, 2] }, { ...input(), nodeCount: -1 }, { ...input(), nodeCount: 17 },
      { ...input(), nodeCount: 1.5 }, { ...input(), nodeCount: NaN }, { ...input(), pathCompression: undefined },
      { ...input(), operations: null }, { ...input(), operations: Array(2) },
      input([{ kind: 'find', x: 8 }]), input([{ kind: 'find', x: 0 }], 0),
      input([{ kind: 'union', a: 1.5, b: 0 }]), input([{ kind: 'find', x: NaN }]),
      { ...input(), operations: [{ kind: 'unknown', x: 0 }] },
      input(Array.from({ length: 33 }, () => ({ kind: 'find', x: 0 }))),
    ];
    for (const value of malformed) expect(() => unionFind.execute(value as AlgorithmInput)).toThrow();
  });
});

describe('union-find execution', () => {
  it.each([0, 1, 16])('finishes an empty operation sequence on %i nodes', (nodeCount) => {
    const trace = unionFind.execute(input([], nodeCount));
    expect(trace.result).toMatchObject({ kind: 'union-find', count: nodeCount, operations: [] });
    expect(stateAt(trace.steps.at(-1)!).parent).toEqual(Array.from({ length: nodeCount }, (_, node) => node));
    expect(trace.steps.filter(({ kind }) => kind === 'complete')).toHaveLength(1);
    expect(trace.steps[0].kind).toBe('initial');
    expect(trace.steps.at(-1)?.kind).toBe('complete');
  });

  it('uses size before root number, chooses the lower root on ties, and handles repeated/self unions', () => {
    const operations: UnionFindOperation[] = [
      { kind: 'union', a: 5, b: 4 }, { kind: 'union', a: 4, b: 6 }, { kind: 'union', a: 0, b: 4 },
      { kind: 'union', a: 5, b: 0 }, { kind: 'union', a: 4, b: 4 }, { kind: 'find', x: 0 },
    ];
    const trace = unionFind.execute(input(operations));
    expect(trace.result.kind).toBe('union-find');
    if (trace.result.kind !== 'union-find') throw new Error('Unexpected result');
    expect(trace.result.operations.map(({ root }) => root)).toEqual([4, 4, 4, 4, 4, 4]);
    expect(trace.result.operations.map(({ merged }) => merged)).toEqual([true, true, true, false, false, undefined]);
    expect(trace.result.count).toBe(5);
    expect(trace.result.size[4]).toBe(4);
    expect(trace.steps.filter(({ statementId }) => statementId === 'union.link')).toHaveLength(3);
  });

  it.each([false, true])('agrees with an independent connectivity model, compression = %s', (pathCompression) => {
    // This oracle tracks component labels, never parent pointers or union-by-size.
    for (const nodeCount of [1, 4, 8, 16]) {
      let random = 113 + nodeCount;
      const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random; };
      const operations = Array.from({ length: 32 }, (_, index): UnionFindOperation => index % 4 === 3
        ? { kind: 'find', x: (next() >>> 8) % nodeCount }
        : { kind: 'union', a: (next() >>> 8) % nodeCount, b: (next() >>> 8) % nodeCount });
      const trace = unionFind.execute(input(operations, nodeCount, pathCompression));
      const labels = Array.from({ length: nodeCount }, (_, node) => node);
      let completed = 0;
      for (const step of trace.steps) {
        const state = stateAt(step);
        const atBoundary = state.results.length > completed;
        checkStructure(state, nodeCount, atBoundary || step.kind === 'complete');
        if (atBoundary) {
          const result = state.results.at(-1)!;
          const operation = operations[completed];
          expect(result.operation).toEqual(operation);
          expect(result.operationIndex).toBe(completed);
          expect(state.operationIndex).toBe(completed);
          if (operation.kind === 'union') {
            const oldA = labels[operation.a];
            const oldB = labels[operation.b];
            expect(result.merged).toBe(oldA !== oldB);
            for (let node = 0; node < nodeCount; node += 1) if (labels[node] === oldB) labels[node] = oldA;
            expect(rootOf(state.parent, operation.a)).toBe(result.root);
            expect(rootOf(state.parent, operation.b)).toBe(result.root);
          } else expect(rootOf(state.parent, operation.x)).toBe(result.root);
          for (let a = 0; a < nodeCount; a += 1) {
            for (let b = 0; b < nodeCount; b += 1) {
              expect(rootOf(state.parent, a) === rootOf(state.parent, b)).toBe(labels[a] === labels[b]);
            }
          }
          completed += 1;
        }
        expect(state.results).toHaveLength(completed);
        if (step.kind !== 'complete') expect(state.results.length).toBeLessThanOrEqual((state.operationIndex ?? -1) + 1);
      }
      expect(completed).toBe(operations.length);
      expect(trace.steps.filter(({ kind }) => kind === 'complete')).toHaveLength(1);
      expect(trace.steps.at(-1)?.unionFind?.operationIndex).toBeNull();
    }
  });

  it('records parent, root size, and count updates as separate post-statement states', () => {
    const trace = unionFind.execute(input(chain));
    for (const [index, step] of trace.steps.entries()) {
      if (step.statementId !== 'union.link') continue;
      const previous = stateAt(trace.steps[index - 1]);
      const linked = stateAt(step);
      const resized = stateAt(trace.steps[index + 1]);
      const counted = stateAt(trace.steps[index + 2]);
      const change = linked.parentChange!;
      const expectedParent = [...previous.parent];
      expectedParent[change.node] = change.after;
      expect(linked.parent).toEqual(expectedParent);
      expect(linked.size).toEqual(previous.size);
      expect(linked.count).toBe(previous.count);
      expect(trace.steps[index + 1].statementId).toBe('union.size');
      expect(resized.size[change.after]).toBe(previous.size[change.after] + previous.size[change.node]);
      expect(resized.count).toBe(previous.count);
      expect(trace.steps[index + 2].statementId).toBe('union.count');
      expect(counted.count).toBe(previous.count - 1);
      expect(counted.parent).toEqual(linked.parent);
      checkStructure(counted, 8, true);
    }
  });

  it('keeps all queries read-only with compression off', () => {
    const trace = unionFind.execute(input(chain));
    const firstQuery = trace.steps.filter((step) => step.unionFind?.operationIndex === 7);
    expect(firstQuery.some((step) => step.unionFind?.path.join(',') === '7,6,4,0')).toBe(true);
    for (const query of [7, 8]) {
      const steps = trace.steps.filter((step) => step.unionFind?.operationIndex === query);
      const before = stateAt(steps[0]).parent;
      expect(steps.every((step) => JSON.stringify(stateAt(step).parent) === JSON.stringify(before))).toBe(true);
    }
    expect(trace.steps.filter(({ kind }) => kind === 'compress')).toHaveLength(0);
  });

  it('compresses the original path one assignment at a time, including unchanged assignments', () => {
    const trace = unionFind.execute(input(chain, 8, true));
    const query = trace.steps.filter((step) => step.unionFind?.operationIndex === 7);
    const compressed = query.filter(({ kind }) => kind === 'compress');
    expect(compressed.map((step) => stateAt(step).parentChange)).toEqual([
      { node: 7, before: 6, after: 0 }, { node: 6, before: 4, after: 0 }, { node: 4, before: 0, after: 0 },
    ]);
    expect(compressed.at(-1)?.explanation).toContain('已直接连接根节点');
    expect(compressed.every((step) => stateAt(step).path.join(',') === '7,6,4,0')).toBe(true);
    for (const [index, step] of trace.steps.entries()) {
      if (step.kind !== 'compress') continue;
      expect(step.statementId).toBe('find.compress');
      const before = stateAt(trace.steps[index - 1]);
      const after = stateAt(step);
      const expected = [...before.parent];
      expected[after.parentChange!.node] = after.parentChange!.after;
      expect(after.parent).toEqual(expected);
      expect(after.size).toEqual(before.size);
      expect(after.count).toBe(before.count);
    }
    const secondQuery = trace.steps.filter((step) => step.unionFind?.operationIndex === 8);
    expect(secondQuery.some((step) => stateAt(step).path.join(',') === '7,0')).toBe(true);
    expect(secondQuery.filter(({ kind }) => kind === 'compress')).toHaveLength(1);
    const uncompressed = unionFind.execute(input(chain));
    expect(stateAt(trace.steps.at(-1)!).count).toBe(stateAt(uncompressed.steps.at(-1)!).count);
    for (let node = 0; node < 8; node += 1) {
      expect(rootOf(stateAt(trace.steps.at(-1)!).parent, node)).toBe(rootOf(stateAt(uncompressed.steps.at(-1)!).parent, node));
    }
  });

  it('compresses internal find calls even when a union joins nodes already in the same component', () => {
    const trace = unionFind.execute(input([...chain.slice(0, 7), { kind: 'union', a: 7, b: 0 }], 8, true));
    const last = trace.steps.filter((step) => step.unionFind?.operationIndex === 7);
    expect(last.some(({ kind }) => kind === 'compress')).toBe(true);
    expect(last.some(({ kind }) => kind === 'link')).toBe(false);
    expect(last.at(-1)?.unionFind?.results.at(-1)).toMatchObject({ merged: false, root: 0 });
    expect(last.at(-1)?.unionFind?.count).toBe(1);
    expect(last.at(-1)?.unionFind?.size[0]).toBe(8);
  });

  it('retains immutable independent snapshots for backward playback and direct jumps', () => {
    const source = input(structuredClone(chain), 8, true);
    const before = structuredClone(source);
    const trace = unionFind.execute(source);
    const saved = structuredClone(trace.steps);
    expect(source).toEqual(before);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(source.operations)).toBe(false);
    expectFrozen(trace);
    const firstCompression = trace.steps.findIndex((step) => step.kind === 'compress' && step.unionFind?.operationIndex === 7);
    expect(stateAt(trace.steps[firstCompression - 1]).parent[7]).toBe(6);
    expect(stateAt(trace.steps[firstCompression]).parent[7]).toBe(0);
    expect(stateAt(trace.steps[firstCompression + 1]).parent[6]).toBe(4);
    for (const index of [trace.steps.length - 1, firstCompression + 1, firstCompression - 1, 0, firstCompression]) {
      expect(trace.steps[index]).toEqual(saved[index]);
    }
    for (let index = 1; index < trace.steps.length; index += 1) {
      expect(trace.steps[index].unionFind?.parent).not.toBe(trace.steps[index - 1].unionFind?.parent);
      expect(trace.steps[index].unionFind?.results).not.toBe(trace.steps[index - 1].unionFind?.results);
    }
    (source.operations as UnionFindOperation[])[0] = { kind: 'find', x: 7 };
    expect(trace.input).toEqual(before);
  });

  it('maps all statements and restores callers without retaining departed local variables', () => {
    const trace = unionFind.execute(input(chain, 8, true));
    expect(() => validateStatementMapping(unionFind.code, trace.steps)).not.toThrow();
    const knownFrames = new Map<string, string>();
    for (const step of trace.steps) {
      expect(step.items).toEqual([]);
      expect(step.markers).toEqual({});
      for (const [depth, frame] of (step.callStack ?? []).entries()) {
        knownFrames.set(frame.id, frame.functionName);
        expect(frame.depth).toBe(depth);
        expect(frame.parentId).toBe(depth ? step.callStack![depth - 1].id : null);
      }
      if (!step.execution) continue;
      expect(step.execution.activeFrameId).toBe(step.callStack?.at(-1)?.id ?? null);
      expect(knownFrames.get(step.execution.frameId)).toBe(step.execution.functionName);
      if (step.execution.event === 'return') {
        expect(step.callStack?.some(({ id }) => id === step.execution?.frameId)).toBe(false);
      }
      if (step.execution.event === 'call') {
        const caller = step.callStack?.at(-2);
        expect(caller?.id).toBe(step.execution.frameId);
        const target = step.statementId === 'union.findA' ? 'rootA' : step.statementId === 'union.findB' ? 'rootB' : step.statementId === 'run.find' ? 'root' : 'result';
        expect(caller?.locals.some(({ name }) => name === target)).toBe(false);
      }
    }
    expect(trace.steps.at(-1)?.callStack).toEqual([]);
  });

  it('is deterministic, enforces the exact step limit, and fits the default budget at maximum input', () => {
    const source = input(chain, 8, true);
    const trace = unionFind.execute(source);
    expect(unionFind.execute(source)).toEqual(trace);
    expect(unionFind.execute(source, { maxSteps: trace.steps.length })).toEqual(trace);
    expect(() => unionFind.execute(source, { maxSteps: trace.steps.length - 1 })).toThrow(/步上限/);
    for (const maxSteps of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => unionFind.execute(source, { maxSteps })).toThrow(/正整数/);
    }
    const operations: UnionFindOperation[] = [];
    for (let width = 1; width < 16; width *= 2) {
      for (let node = 0; node < 16; node += width * 2) operations.push({ kind: 'union', a: node, b: node + width });
    }
    while (operations.length < 32) operations.push({ kind: 'union', a: 15, b: 7 });
    for (const compress of [false, true]) {
      const trace = unionFind.execute(input(operations, 16, compress));
      expect(trace.steps.length).toBeLessThan(DEFAULT_MAX_STEPS);
      checkStructure(stateAt(trace.steps.at(-1)!), 16, true);
    }
  });
});
