import { createTraceRecorder } from '../engine/trace';
import type {
  AlgorithmDefinition, AlgorithmInput, CallFrame, CodeLine, ExecutionContext, InputDraft,
  Snapshot, UnionFindInput, UnionFindOperation, UnionFindOperationResult, Variable,
} from '../engine/types';

export const MAX_UNION_FIND_NODES = 16;
export const MAX_UNION_FIND_OPERATIONS = 32;

const code: readonly CodeLine[] = [
  { text: 'function unionFind(n, operations, compress = false) {' },
  { id: 'run.parent', text: '  const parent = Array.from({ length: n }, (_, x) => x);' },
  { id: 'run.size', text: '  const size = Array(n).fill(1);' },
  { id: 'run.count', text: '  let count = n;' },
  { text: '' },
  { text: '  function find(x) {' },
  { id: 'find.root', text: '    let root = x;' },
  { id: 'find.walkCondition', text: '    while (parent[root] !== root) {' },
  { id: 'find.walk', text: '      root = parent[root];' },
  { text: '    }' },
  { id: 'find.compressCondition', text: '    if (compress) {' },
  { id: 'find.pathCondition', text: '      while (parent[x] !== x) {' },
  { id: 'find.next', text: '        const next = parent[x];' },
  { id: 'find.compress', text: '        parent[x] = root;' },
  { id: 'find.advance', text: '        x = next;' },
  { text: '      }' },
  { text: '    }' },
  { id: 'find.return', text: '    return root;' },
  { text: '  }' },
  { text: '' },
  { text: '  function union(a, b) {' },
  { id: 'union.findA', text: '    let rootA = find(a);' },
  { id: 'union.findB', text: '    let rootB = find(b);' },
  { id: 'union.same', text: '    if (rootA === rootB) {' },
  { id: 'union.sameReturn', text: '      return { root: rootA, merged: false };' },
  { text: '    }' },
  { id: 'union.sizeCompare', text: '    if (size[rootA] < size[rootB] ||' },
  { text: '        (size[rootA] === size[rootB] && rootA > rootB)) {' },
  { id: 'union.swapRoots', text: '      [rootA, rootB] = [rootB, rootA];' },
  { text: '    }' },
  { id: 'union.link', text: '    parent[rootB] = rootA;' },
  { id: 'union.size', text: '    size[rootA] += size[rootB];' },
  { id: 'union.count', text: '    count -= 1;' },
  { id: 'union.return', text: '    return { root: rootA, merged: true };' },
  { text: '  }' },
  { text: '' },
  { id: 'run.results', text: '  const results = [];' },
  { id: 'run.index', text: '  let k = 0;' },
  { id: 'run.condition', text: '  while (k < operations.length) {' },
  { id: 'run.operation', text: '    const op = operations[k];' },
  { id: 'run.operationKind', text: '    if (op.kind === "union") {' },
  { id: 'run.union', text: '      const result = union(op.a, op.b);' },
  { id: 'run.unionResult', text: '      results.push({ operationIndex: k, operation: op, ...result });' },
  { text: '    } else {' },
  { id: 'run.find', text: '      const root = find(op.x);' },
  { id: 'run.findResult', text: '      results.push({ operationIndex: k, operation: op, root });' },
  { text: '    }' },
  { id: 'run.advance', text: '    k += 1;' },
  { text: '  }' },
  { id: 'run.return', text: '  return { parent, size, count, operations: results };' },
  { text: '}' },
];

const compressionOperations = [
  'union 0 1', 'union 2 3', 'union 0 2', 'union 4 5', 'union 6 7',
  'union 4 6', 'union 0 4', 'find 7', 'find 7',
].join('\n');

function nodeCountError(nodeCount: unknown): string | null {
  return typeof nodeCount !== 'number' || !Number.isInteger(nodeCount) || nodeCount < 0 || nodeCount > MAX_UNION_FIND_NODES
    ? `节点数必须是 0 到 ${MAX_UNION_FIND_NODES} 之间的整数。` : null;
}

function operationError(operation: UnionFindOperation, nodeCount: number): string | null {
  if (!operation || typeof operation !== 'object' || !['union', 'find'].includes(operation.kind)) {
    return '只支持 union a b 或 find x。';
  }
  const nodes = operation.kind === 'union' ? [operation.a, operation.b] : [operation.x];
  if (nodes.some((node) => !Number.isInteger(node))) return '节点编号必须是整数。';
  if (nodeCount === 0) return '节点数为 0 时不能执行操作。';
  if (nodes.some((node) => node < 0 || node >= nodeCount)) return `节点编号必须在 0 到 ${nodeCount - 1} 之间。`;
  return null;
}

function assertValidUnionFindInput(input: AlgorithmInput): asserts input is UnionFindInput {
  if (!input || input.kind !== 'union-find') throw new Error('并查集需要节点数、操作序列和路径压缩配置。');
  const error = nodeCountError(input.nodeCount);
  if (error) throw new Error(error);
  if (typeof input.pathCompression !== 'boolean') throw new Error('路径压缩配置必须为开或关。');
  if (!Array.isArray(input.operations)) throw new Error('操作序列必须是数组。');
  if (input.operations.length > MAX_UNION_FIND_OPERATIONS) throw new Error(`最多输入 ${MAX_UNION_FIND_OPERATIONS} 条操作。`);
  for (const [index, operation] of input.operations.entries()) {
    const error = operationError(operation, input.nodeCount);
    if (error) throw new Error(`第 ${index + 1} 条操作：${error}`);
  }
}

function validate(draft: InputDraft) {
  if (draft.kind !== 'union-find') return { ok: false as const, error: '请输入并查集的节点数与操作序列。' };
  const nodeCount = Number(draft.nodeCount.trim());
  const error = nodeCountError(nodeCount);
  if (!/^[+\-]?\d+$/.test(draft.nodeCount.trim()) || error) {
    return { ok: false as const, error: error ?? '节点数必须是整数。' };
  }
  if (typeof draft.pathCompression !== 'boolean') return { ok: false as const, error: '路径压缩配置必须为开或关。' };
  const operations: UnionFindOperation[] = [];
  for (const [index, line] of draft.operations.split(/\r?\n/).entries()) {
    const text = line.trim();
    if (!text) continue;
    const [command, ...arguments_] = text.split(/\s+/);
    const prefix = `第 ${index + 1} 行：`;
    if (command !== 'union' && command !== 'find') return { ok: false as const, error: `${prefix}未知命令 ${command}，请使用 union 或 find。` };
    if (arguments_.length !== (command === 'union' ? 2 : 1)) return { ok: false as const, error: `${prefix}格式应为 ${command === 'union' ? 'union a b' : 'find x'}。` };
    if (arguments_.some((argument) => !/^[+\-]?\d+$/.test(argument))) return { ok: false as const, error: `${prefix}节点编号必须是整数。` };
    const nodes = arguments_.map(Number);
    const operation: UnionFindOperation = command === 'union' ? { kind: 'union', a: nodes[0], b: nodes[1] } : { kind: 'find', x: nodes[0] };
    const error = operationError(operation, nodeCount);
    if (error) return { ok: false as const, error: prefix + error };
    operations.push(operation);
    if (operations.length > MAX_UNION_FIND_OPERATIONS) return { ok: false as const, error: `${prefix}最多输入 ${MAX_UNION_FIND_OPERATIONS} 条操作。` };
  }
  return { ok: true as const, input: { kind: 'union-find' as const, nodeCount, operations, pathCompression: draft.pathCompression } };
}

type MutableFrame = {
  id: string;
  functionName: string;
  parentId: string | null;
  depth: number;
  parameters: Record<string, Variable['value']>;
  locals: Record<string, Variable['value']>;
};

function variables(values: Record<string, Variable['value']>): Variable[] {
  return Object.entries(values).map(([name, value]) => ({ name, value }));
}

function operationText(operation: UnionFindOperation) {
  return operation.kind === 'union' ? `union ${operation.a} ${operation.b}` : `find ${operation.x}`;
}

export const unionFind: AlgorithmDefinition = {
  id: 'union-find',
  inputKind: 'union-find',
  name: '并查集',
  englishName: 'Union Find',
  category: '数据结构',
  summary: '按集合大小合并；大小相同时选择编号较小的根。逐个执行合并与查询，可选路径压缩，观察每次父节点变化。',
  complexity: { time: '未压缩 O(log n) / 次；压缩后均摊 O(α(n)) / 次', space: 'O(n)' },
  inputHint: '0—16 个节点，编号从 0 开始；每行 union a b 或 find x，最多 32 条操作，空行会忽略。size 只在根节点有效。',
  requiresTarget: false,
  example: { kind: 'union-find', nodeCount: '8', operations: compressionOperations, pathCompression: false },
  examples: [
    { name: '多集合合并', draft: { kind: 'union-find', nodeCount: '6', operations: 'union 0 1\nunion 2 3\nfind 1\nunion 1 3\nfind 3\nunion 0 3', pathCompression: false } },
    { name: '观察路径', draft: { kind: 'union-find', nodeCount: '8', operations: compressionOperations, pathCompression: false } },
    { name: '路径压缩', draft: { kind: 'union-find', nodeCount: '8', operations: compressionOperations, pathCompression: true } },
  ],
  code,
  validate,
  execute(input, options) {
    assertValidUnionFindInput(input);
    const { pathCompression } = input;
    const recorder = createTraceRecorder('union-find', input, code, options);
    const parent = Array.from({ length: input.nodeCount }, (_, node) => node);
    const size = Array<number>(input.nodeCount).fill(1);
    let count = input.nodeCount;
    let path: number[] = [];
    let roots: number[] = [];
    let operationIndex: number | null = null;
    const results: UnionFindOperationResult[] = [];
    const stack: MutableFrame[] = [];
    let nextFrameId = 0;

    function pushFrame(functionName: string, parameters: MutableFrame['parameters']): MutableFrame {
      const frame: MutableFrame = {
        id: `call-${nextFrameId++}`, functionName, parentId: stack.at(-1)?.id ?? null,
        depth: stack.length, parameters, locals: {},
      };
      stack.push(frame);
      return frame;
    }

    function record(
      statementId: string | null, kind: Snapshot['kind'], explanation: string,
      details: { condition?: Snapshot['condition']; execution?: ExecutionContext; parentChange?: NonNullable<Snapshot['unionFind']>['parentChange'] } = {},
    ) {
      const current = stack.at(-1);
      const callStack: CallFrame[] = stack.map((frame) => ({
        ...frame, parameters: variables(frame.parameters), locals: variables(frame.locals),
      }));
      recorder.record({
        statementId, kind, explanation, items: [], markers: {}, callStack,
        variables: current ? [...variables(current.parameters), ...variables(current.locals)] : [],
        unionFind: { parent, size, count, path, roots, operationIndex, results, ...(details.parentChange ? { parentChange: details.parentChange } : {}) },
        ...(details.condition ? { condition: details.condition } : {}),
        ...(details.execution ? { execution: details.execution } : current ? {
          execution: { event: 'statement', frameId: current.id, functionName: current.functionName, activeFrameId: current.id },
        } : {}),
      });
    }

    function enter(statementId: string, functionName: string, parameters: MutableFrame['parameters']) {
      const caller = stack.at(-1)!;
      const frame = pushFrame(functionName, parameters);
      record(statementId, 'call', `进入 ${functionName}(${Object.values(parameters).join(', ')})，调用方等待返回值。`, {
        execution: { event: 'call', frameId: caller.id, functionName: caller.functionName, activeFrameId: frame.id },
      });
      return frame;
    }

    function leave(statementId: string, explanation: string, returnedValue: number | string) {
      const frame = stack.pop()!;
      record(statementId, 'return', explanation, {
        execution: { event: 'return', frameId: frame.id, functionName: frame.functionName, activeFrameId: stack.at(-1)?.id ?? null, returnedValue },
      });
    }

    function find(x: number, callStatement: string): number {
      path = [];
      const frame = enter(callStatement, 'find', { x });
      let root = x;
      frame.locals.root = root;
      path.push(root);
      record('find.root', 'visit', `从节点 ${x} 开始，root = ${root}。`);
      while (true) {
        const keepWalking = parent[root] !== root;
        if (!keepWalking) roots = [root];
        record('find.walkCondition', 'condition', keepWalking
          ? `${root} 的父节点是 ${parent[root]}，继续沿父节点查找。` : `parent[${root}] = ${root}，找到根节点 ${root}。`,
        { condition: { expression: 'parent[root] !== root', result: keepWalking } });
        if (!keepWalking) break;
        root = parent[root];
        frame.locals.root = root;
        path.push(root);
        record('find.walk', 'visit', `沿父节点到达 ${root}，访问路径：${path.join(' → ')}。`);
      }
      record('find.compressCondition', 'condition', pathCompression ? '路径压缩已开启，逐个把原路径上的非根节点连接到根。' : '路径压缩已关闭，保留父节点关系。',
        { condition: { expression: 'compress', result: pathCompression } });
      if (pathCompression) {
        while (true) {
          delete frame.locals.next;
          const hasParent = parent[x] !== x;
          record('find.pathCondition', 'condition', hasParent ? `节点 ${x} 不是根，准备将它直接连接到 ${root}。` : `已经到达根 ${x}，压缩结束。`,
            { condition: { expression: 'parent[x] !== x', result: hasParent } });
          if (!hasParent) break;
          const next = parent[x];
          frame.locals.next = next;
          record('find.next', 'assign', `保存原父节点 next = ${next}，更新后仍能沿原路径继续。`);
          parent[x] = root;
          record('find.compress', 'compress', next === root
            ? `parent[${x}] = ${root}；节点 ${x} 已直接连接根节点，结构没有变化。`
            : `parent[${x}] 从 ${next} 更新为 ${root}，集合成员、大小与数量不变。`,
          { parentChange: { node: x, before: next, after: root } });
          x = next;
          frame.parameters.x = x;
          record('find.advance', 'assign', `x = next = ${x}，继续处理原路径。`);
        }
      }
      leave('find.return', `find 返回根节点 ${root}，恢复调用方。`, root);
      return root;
    }

    function union(a: number, b: number): { root: number; merged: boolean } {
      const frame = enter('run.union', 'union', { a, b });
      let rootA = find(a, 'union.findA');
      frame.locals.rootA = rootA;
      record('union.findA', 'assign', `接收 find(${a}) 的返回值，rootA = ${rootA}。`);
      let rootB = find(b, 'union.findB');
      frame.locals.rootB = rootB;
      roots = [...new Set([rootA, rootB])];
      record('union.findB', 'assign', `接收 find(${b}) 的返回值，rootB = ${rootB}。`);
      const same = rootA === rootB;
      record('union.same', 'compare', same ? `两个根都是 ${rootA}，节点已在同一集合。` : `根 ${rootA} 与 ${rootB} 不同，需要合并。`,
        { condition: { expression: 'rootA === rootB', result: same } });
      if (same) {
        leave('union.sameReturn', '返回“已在同一集合”，不重复更新大小或集合数量。', `root=${rootA}, merged=false`);
        return { root: rootA, merged: false };
      }
      const shouldSwap = size[rootA] < size[rootB] || (size[rootA] === size[rootB] && rootA > rootB);
      record('union.sizeCompare', 'compare', `根 ${rootA} 的大小为 ${size[rootA]}，根 ${rootB} 的大小为 ${size[rootB]}；${shouldSwap ? '交换两个根，让大集合（同大小时编号较小者）成为 rootA' : '保留 rootA 作为新根'}。`,
        { condition: { expression: 'size[rootA] < size[rootB] || (size[rootA] === size[rootB] && rootA > rootB)', result: shouldSwap } });
      if (shouldSwap) {
        [rootA, rootB] = [rootB, rootA];
        frame.locals.rootA = rootA;
        frame.locals.rootB = rootB;
        roots = [rootA, rootB];
        record('union.swapRoots', 'assign', `交换根变量：rootA = ${rootA}，rootB = ${rootB}。`);
      }
      const before = parent[rootB];
      parent[rootB] = rootA;
      roots = [rootA];
      record('union.link', 'link', `将根 ${rootB} 连接到根 ${rootA}；父节点已更新，接下来更新根大小和集合数量。`,
        { parentChange: { node: rootB, before, after: rootA } });
      size[rootA] += size[rootB];
      record('union.size', 'assign', `根 ${rootA} 的大小更新为 ${size[rootA]}；非根 ${rootB} 的 size 不再有效，集合数量尚待更新。`);
      count -= 1;
      record('union.count', 'assign', `两个集合合为一个，集合数量减少为 ${count}。`);
      leave('union.return', `合并完成，返回根 ${rootA} 和 merged = true。`, `root=${rootA}, merged=true`);
      return { root: rootA, merged: true };
    }

    record(null, 'initial', `准备 ${input.nodeCount} 个独立节点和 ${input.operations.length} 条操作，尚未执行任何语句。`);
    const main = pushFrame('unionFind', { n: input.nodeCount, compress: input.pathCompression });
    record('run.parent', 'assign', '初始化 parent[x] = x，每个节点都是自己的根。');
    record('run.size', 'assign', '初始化每个独立集合的 size 为 1。');
    record('run.count', 'assign', `初始化集合数量 count = ${count}。`);
    record('run.results', 'assign', '初始化空结果列表。');
    main.locals.k = 0;
    record('run.index', 'assign', '从第 1 条操作开始，k = 0。');
    for (let k = 0; ; k += 1) {
      const hasOperation = k < input.operations.length;
      record('run.condition', 'condition', hasOperation ? `还有操作，准备执行第 ${k + 1} 条。` : '所有操作均已完成，准备返回最终结构。',
        { condition: { expression: 'k < operations.length', result: hasOperation } });
      if (!hasOperation) break;
      const operation = input.operations[k];
      operationIndex = k;
      path = [];
      roots = [];
      main.locals.op = operationText(operation);
      record('run.operation', 'operation', `第 ${k + 1} / ${input.operations.length} 条操作：${operationText(operation)}。`);
      const isUnion = operation.kind === 'union';
      record('run.operationKind', 'condition', isUnion ? '本次执行合并，需要分别查找两个节点的根。' : '本次执行查询，返回该节点所在集合的根。',
        { condition: { expression: 'op.kind === "union"', result: isUnion } });
      if (operation.kind === 'union') {
        const result = union(operation.a, operation.b);
        main.locals.result = `root=${result.root}, merged=${result.merged}`;
        record('run.union', 'assign', `接收合并结果：根为 ${result.root}，${result.merged ? '成功合并' : '已在同一集合'}。`);
        const message = `${operationText(operation)}：${result.merged ? `合并完成，根为 ${result.root}` : `已在同一集合，根为 ${result.root}`}。`;
        results.push({ operationIndex: k, operation, ...result, message });
        record('run.unionResult', 'operation', `第 ${k + 1} 条操作完成。${message}`);
        delete main.locals.result;
      } else {
        const root = find(operation.x, 'run.find');
        main.locals.root = root;
        record('run.find', 'assign', `接收查询结果：节点 ${operation.x} 的根为 ${root}。`);
        const message = `${operationText(operation)}：根为 ${root}。`;
        results.push({ operationIndex: k, operation, root, message });
        record('run.findResult', 'operation', `第 ${k + 1} 条操作完成。${message}`);
        delete main.locals.root;
      }
      main.locals.k = k + 1;
      record('run.advance', 'assign', `k 更新为 ${k + 1}，已完成 ${results.length} 条操作。`);
      delete main.locals.op;
    }
    operationIndex = null;
    const message = `${input.operations.length} 条操作全部完成，当前共有 ${count} 个集合。`;
    stack.pop();
    record('run.return', 'complete', message, {
      execution: { event: 'return', frameId: main.id, functionName: main.functionName, activeFrameId: null, returnedValue: `${count} 个集合` },
    });
    return recorder.finish({ kind: 'union-find', message, parent, size, count, operations: results });
  },
};
