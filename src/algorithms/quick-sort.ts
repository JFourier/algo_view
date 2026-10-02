import { assertValidInput, validateDraft } from '../engine/input';
import { createTraceRecorder } from '../engine/trace';
import type { AlgorithmDefinition, ArrayItem, CallFrame, CodeLine, ExecutionContext, Snapshot } from '../engine/types';

const code: readonly CodeLine[] = [
  { text: 'function sort(values) {' },
  { id: 'sort.copy', text: '  const a = [...values];' },
  { id: 'sort.call', text: '  quickSort(a, 0, a.length - 1);' },
  { id: 'sort.return', text: '  return a;' },
  { text: '}' },
  { text: '' },
  { text: 'function quickSort(a, low, high) {' },
  { id: 'quickSort.base', text: '  if (low >= high) {' },
  { id: 'quickSort.baseReturn', text: '    return;' },
  { text: '  }' },
  { id: 'quickSort.partition', text: '  const p = partition(a, low, high);' },
  { id: 'quickSort.callLeft', text: '  quickSort(a, low, p - 1);' },
  { id: 'quickSort.callRight', text: '  quickSort(a, p + 1, high);' },
  { id: 'quickSort.return', text: '  return;' },
  { text: '}' },
  { text: '' },
  { text: 'function partition(a, low, high) {' },
  { id: 'partition.pivot', text: '  const pivot = a[high];' },
  { id: 'partition.i', text: '  let i = low;' },
  { id: 'partition.j', text: '  let j = low;' },
  { id: 'partition.condition', text: '  while (j < high) {' },
  { id: 'partition.compare', text: '    if (a[j] < pivot) {' },
  { id: 'partition.swap', text: '      [a[i], a[j]] = [a[j], a[i]];' },
  { id: 'partition.advanceI', text: '      i += 1;' },
  { text: '    }' },
  { id: 'partition.advanceJ', text: '    j += 1;' },
  { text: '  }' },
  { id: 'partition.placePivot', text: '  [a[i], a[high]] = [a[high], a[i]];' },
  { id: 'partition.return', text: '  return i;' },
  { text: '}' },
];

interface Frame {
  readonly id: string;
  readonly functionName: 'sort' | 'quickSort' | 'partition';
  readonly parentId: string | null;
  readonly depth: number;
  readonly parameters: Record<string, number>;
  readonly locals: Record<string, number>;
  pivot?: ArrayItem;
}

const rules = { requiresTarget: false };
const entries = (values: Readonly<Record<string, number>>) => Object.entries(values).map(([name, value]) => ({ name, value }));

export const quickSort: AlgorithmDefinition = {
  id: 'quick-sort',
  inputKind: 'array',
  name: '快速排序',
  englishName: 'Quick Sort',
  category: '排序',
  summary: '固定选择右端元素作为基准，用 Lomuto 分区把较小值移到左侧，再依次递归左右区间。相等元素不保证稳定顺序。',
  complexity: { time: '平均 O(n log n)，最坏 O(n²)', space: 'O(n)，含数组副本与最坏递归栈' },
  inputHint: '最多 24 个 −999 到 999 的整数，允许重复值和空数组。固定右端基准；有序或全相等输入会形成较深的递归。',
  requiresTarget: false,
  example: { values: '8, 3, 6, 2, 5, 1', target: '' },
  examples: [
    { name: '普通数组', draft: { values: '8, 3, 6, 2, 5, 1', target: '' } },
    { name: '重复值', draft: { values: '4, 2, 4, 1, 2, 4', target: '' } },
    { name: '已经有序', draft: { values: '1, 2, 3, 4, 5, 6', target: '' } },
  ],
  code,
  validate: (draft) => validateDraft(draft, rules),
  execute(input, options) {
    assertValidInput(input, rules);
    const recorder = createTraceRecorder('quick-sort', input, code, options);
    const items: ArrayItem[] = input.values.map((value, index) => ({ id: `item-${index}`, value }));
    const stack: Frame[] = [];
    const sorted = new Set<number>();
    let nextFrame = 0;

    function push(functionName: Frame['functionName'], parameters: Frame['parameters']): Frame {
      const frame: Frame = {
        id: `frame-${nextFrame++}`, functionName, parameters, locals: {},
        parentId: stack.at(-1)?.id ?? null, depth: stack.length,
      };
      stack.push(frame);
      return frame;
    }

    function record(
      statementId: string | null,
      kind: Snapshot['kind'],
      explanation: string,
      owner?: Frame,
      event: ExecutionContext['event'] = 'statement',
      extra: { readonly active?: readonly number[]; readonly condition?: Snapshot['condition']; readonly returnedValue?: number | string } = {},
    ) {
      const active = stack.at(-1);
      const markers: Snapshot['markers'] = {
        sorted: [...sorted].sort((a, b) => a - b),
        ...(active && active.functionName !== 'sort' ? {
          range: { start: active.parameters.low, end: active.parameters.high, label: '当前区间' },
          pointers: ['i', 'j', 'p'].filter((name) => name in active.locals).map((label) => ({ label, index: active.locals[label] })),
        } : {}),
        ...(active?.pivot ? { pivot: { ...active.pivot, index: items.findIndex(({ id }) => id === active.pivot!.id) } } : {}),
        ...(extra.active ? { active: extra.active } : {}),
      };
      const callStack: CallFrame[] = stack.map((frame) => ({
        id: frame.id, functionName: frame.functionName, parentId: frame.parentId, depth: frame.depth,
        parameters: entries(frame.parameters), locals: entries(frame.locals),
      }));
      recorder.record({
        statementId, kind, explanation, items, markers, callStack,
        variables: active ? [...entries(active.parameters), ...entries(active.locals)] : [],
        ...(extra.condition ? { condition: extra.condition } : {}),
        ...(owner ? { execution: {
          event, frameId: owner.id, functionName: owner.functionName, activeFrameId: active?.id ?? null,
          ...(extra.returnedValue !== undefined ? { returnedValue: extra.returnedValue } : {}),
        } } : {}),
      });
    }

    function enter(owner: Frame, statementId: string, functionName: Frame['functionName'], low: number, high: number): Frame {
      const frame = push(functionName, { low, high });
      record(statementId, 'call', `进入 ${functionName}(${low}, ${high})，调用深度 ${frame.depth}；${owner.functionName} 等待子调用返回。`, owner, 'call');
      return frame;
    }

    function leave(frame: Frame, statementId: string, explanation: string, returnedValue?: number) {
      stack.pop();
      const caller = stack.at(-1);
      record(statementId, 'return', `${explanation}返回 ${caller?.functionName ?? '调用方'}${caller ? `（${caller.id}）` : ''}。`, frame, 'return', { returnedValue });
    }

    function partition(frame: Frame): number {
      const { low, high } = frame.parameters;
      const pivot = items[high];
      frame.pivot = pivot;
      frame.locals.pivot = pivot.value;
      record('partition.pivot', 'assign', `选择右端下标 ${high} 的 ${pivot.value} 作为基准，保留其元素身份。`, frame);
      let i = low;
      frame.locals.i = i;
      record('partition.i', 'assign', `设置 i = ${i}，指向下一个小于基准的元素应放入的位置。`, frame);
      let j = low;
      frame.locals.j = j;
      record('partition.j', 'assign', `设置 j = ${j}，从区间左端开始扫描。`, frame);
      while (true) {
        const scanning = j < high;
        record('partition.condition', 'condition', `j = ${j} < high = ${high} 为${scanning ? '真，继续扫描' : '假，扫描结束'}。`, frame, 'statement', {
          condition: { expression: 'j < high', result: scanning },
        });
        if (!scanning) break;
        const smaller = items[j].value < pivot.value;
        record('partition.compare', 'compare', `${items[j].value} < 基准 ${pivot.value} 为${smaller ? '真，放入左侧' : '假，留在右侧区域'}。`, frame, 'statement', {
          active: [j, high], condition: { expression: 'a[j] < pivot', result: smaller },
        });
        if (smaller) {
          [items[i], items[j]] = [items[j], items[i]];
          record('partition.swap', 'swap', i === j ? `执行下标 ${i} 与自身的交换，位置未变化。` : `交换下标 ${i} 与 ${j}，将小于基准的元素移入左侧。`, frame, 'statement', { active: [i, j] });
          i += 1;
          frame.locals.i = i;
          record('partition.advanceI', 'assign', `i 增加到 ${i}；[${low}, ${i - 1}] 内的值均小于基准。`, frame);
        }
        j += 1;
        frame.locals.j = j;
        record('partition.advanceJ', 'assign', `j 增加到 ${j}，准备检查下一项。`, frame);
      }
      [items[i], items[high]] = [items[high], items[i]];
      sorted.add(i);
      record('partition.placePivot', 'swap', `将基准 ${pivot.value} 放到最终位置 ${i}${i === high ? '，执行自身交换，位置未变化' : ''}；左侧值更小，右侧值大于或等于基准。`, frame, 'statement', { active: [i, high] });
      leave(frame, 'partition.return', `分区返回下标 ${i}，调用方尚未完成 p 的赋值。`, i);
      return i;
    }

    function recurse(frame: Frame) {
      const { low, high } = frame.parameters;
      const baseCase = low >= high;
      record('quickSort.base', 'condition', `low = ${low} >= high = ${high} 为${baseCase ? '真，无需分区' : '假，需要分区'}。`, frame, 'statement', {
        condition: { expression: 'low >= high', result: baseCase },
      });
      if (baseCase) {
        if (low === high) sorted.add(low);
        leave(frame, 'quickSort.baseReturn', low > high ? `区间 [${low}, ${high}] 为空，直接返回。` : `区间只有下标 ${low} 的一个元素，位置已确定。`);
        return;
      }
      const partitionFrame = enter(frame, 'quickSort.partition', 'partition', low, high);
      const p = partition(partitionFrame);
      frame.locals.p = p;
      frame.pivot = items[p];
      record('quickSort.partition', 'assign', `接收 partition 的返回值，完成 p = ${p} 的赋值；基准已经就位。`, frame);
      recurse(enter(frame, 'quickSort.callLeft', 'quickSort', low, p - 1));
      recurse(enter(frame, 'quickSort.callRight', 'quickSort', p + 1, high));
      leave(frame, 'quickSort.return', `区间 [${low}, ${high}] 的左右递归均已结束。`);
    }

    const root = push('sort', {});
    record(null, 'initial', '准备开始：数组保持输入顺序，还没有执行任何语句。');
    record('sort.copy', 'assign', '复制输入数组到 a；所有交换都只修改副本。', root);
    recurse(enter(root, 'sort.call', 'quickSort', 0, items.length - 1));
    const values = items.map(({ value }) => value);
    const message = values.length ? `排序完成，结果为 [${values.join(', ')}]。` : '空数组已经有序，排序完成。';
    stack.pop();
    record('sort.return', 'complete', message, root, 'return', { returnedValue: `[${values.join(', ')}]` });
    return recorder.finish({ kind: 'sorted', message, values });
  },
};
