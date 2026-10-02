import { assertValidInput, validateDraft } from '../engine/input';
import { createTraceRecorder } from '../engine/trace';
import type { AlgorithmDefinition, ArrayItem, CodeLine, Snapshot } from '../engine/types';

const code: readonly CodeLine[] = [
  { text: 'function bubbleSort(values) {' },
  { id: 'copy', text: '  const a = [...values];' },
  { id: 'length', text: '  const n = a.length;' },
  { id: 'end-init', text: '  let end = n - 1;' },
  { id: 'outer-condition', text: '  while (end > 0) {' },
  { id: 'j-init', text: '    let j = 0;' },
  { id: 'inner-condition', text: '    while (j < end) {' },
  { id: 'compare', text: '      if (a[j] > a[j + 1]) {' },
  { id: 'swap', text: '        [a[j], a[j + 1]] = [a[j + 1], a[j]];' },
  { text: '      }' },
  { id: 'j-advance', text: '      j += 1;' },
  { text: '    }' },
  { id: 'end-advance', text: '    end -= 1;' },
  { text: '  }' },
  { id: 'return', text: '  return a;' },
  { text: '}' },
];

const rules = { requiresTarget: false };

export const bubbleSort: AlgorithmDefinition = {
  id: 'bubble-sort',
  inputKind: 'array',
  name: '冒泡排序',
  englishName: 'Bubble Sort',
  category: '排序',
  summary: '从左到右比较相邻元素，将较大的值逐步移到右侧。每轮确定一个位置，直到整个数组有序。',
  complexity: { time: 'O(n²)', space: 'O(n)' },
  inputHint: '最多 24 个 −999 到 999 的整数，用逗号或空格分隔；留空可演示空数组。此版本不使用提前终止优化。',
  requiresTarget: false,
  example: { values: '8, 3, 6, 2, 5, 1', target: '' },
  code,
  validate: (draft) => validateDraft(draft, rules),
  execute(input, options) {
    assertValidInput(input, rules);
    const recorder = createTraceRecorder('bubble-sort', input, code, options);
    const items: ArrayItem[] = input.values.map((value, index) => ({ id: `item-${index}`, value }));
    const variables: Record<string, number> = {};
    let sorted: number[] = [];

    function record(
      statementId: string | null,
      kind: Snapshot['kind'],
      explanation: string,
      markers: Snapshot['markers'] = {},
      condition?: Snapshot['condition'],
    ) {
      recorder.record({
        statementId, kind, explanation, items,
        variables: Object.entries(variables).map(([name, value]) => ({ name, value })),
        markers: { sorted, ...markers },
        ...(condition ? { condition } : {}),
      });
    }

    record(null, 'initial', '准备开始：数组保持输入时的顺序，还没有执行任何语句。');
    record('copy', 'assign', '复制输入数组到 a；排序在副本上进行。');
    const n = items.length;
    variables.n = n;
    record('length', 'assign', `数组共有 ${n} 个元素，n = ${n}。`);
    let end = n - 1;
    variables.end = end;
    record('end-init', 'assign', `设置未完成区域的右边界 end = ${end}。`, { pointers: [{ label: 'end', index: end }] });

    while (true) {
      const continueOuter = end > 0;
      record('outer-condition', 'condition', continueOuter ? `end = ${end} > 0，开始新一轮。` : `end = ${end}，无需再进行比较。`,
        { pointers: [{ label: 'end', index: end }] }, { expression: 'end > 0', result: continueOuter });
      if (!continueOuter) break;
      let j = 0;
      variables.j = j;
      record('j-init', 'assign', '设置 j = 0，从本轮最左侧开始比较。', { pointers: [{ label: 'j', index: j }, { label: 'end', index: end }] });

      while (true) {
        const continueInner = j < end;
        const pointers = [{ label: 'j', index: j }, { label: 'end', index: end }];
        record('inner-condition', 'condition', continueInner ? `j = ${j} < end = ${end}，还有一对相邻元素待比较。` : `j = end = ${end}，本轮比较结束。`,
          { pointers }, { expression: 'j < end', result: continueInner });
        if (!continueInner) break;
        const shouldSwap = items[j].value > items[j + 1].value;
        const leftValue = items[j].value;
        const rightValue = items[j + 1].value;
        record('compare', 'compare', `${leftValue} > ${rightValue} 为${shouldSwap ? '真，需要交换' : '假，保持顺序'}。`,
          { active: [j, j + 1], pointers }, { expression: 'a[j] > a[j + 1]', result: shouldSwap });
        if (shouldSwap) {
          [items[j], items[j + 1]] = [items[j + 1], items[j]];
          record('swap', 'swap', `交换下标 ${j} 与 ${j + 1} 的元素，${leftValue} 向右移动。`, { active: [j, j + 1], pointers });
        }
        j += 1;
        variables.j = j;
        record('j-advance', 'assign', `j 增加到 ${j}，准备检查下一对元素。`, { pointers: [{ label: 'j', index: j }, { label: 'end', index: end }] });
      }
      const completedIndex = end;
      end -= 1;
      variables.end = end;
      sorted = Array.from({ length: n - end - 1 }, (_, index) => end + 1 + index);
      record('end-advance', 'range', `本轮结束：下标 ${completedIndex} 的 ${items[completedIndex].value} 已就位；end 缩小到 ${end}。`,
        { pointers: [{ label: 'end', index: end }] });
      delete variables.j;
    }
    sorted = items.map((_, index) => index);
    const message = n === 0 ? '空数组已经有序，排序完成。' : `排序完成，结果为 [${items.map((item) => item.value).join(', ')}]。`;
    record('return', 'complete', message);
    return recorder.finish({ kind: 'sorted', message });
  },
};
