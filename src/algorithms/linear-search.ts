import { assertValidInput, validateDraft } from '../engine/input';
import { createTraceRecorder } from '../engine/trace';
import type { AlgorithmDefinition, CodeLine, Snapshot } from '../engine/types';

const code: readonly CodeLine[] = [
  { text: 'function linearSearch(a, target) {' },
  { id: 'index', text: '  let i = 0;' },
  { id: 'condition', text: '  while (i < a.length) {' },
  { id: 'compare', text: '    if (a[i] === target) {' },
  { id: 'found', text: '      return i;' },
  { text: '    }' },
  { id: 'advance', text: '    i += 1;' },
  { text: '  }' },
  { id: 'not-found', text: '  return -1;' },
  { text: '}' },
];
const rules = { requiresTarget: true };

export const linearSearch: AlgorithmDefinition = {
  id: 'linear-search', inputKind: 'array', name: '线性查找', englishName: 'Linear Search', category: '查找',
  summary: '从左到右逐项检查，无需预先排序。找到目标后立即返回第一个匹配下标，未找到返回 −1。',
  complexity: { time: 'O(n)', space: 'O(1)' },
  inputHint: '无需有序；最多 24 项，元素与目标值均为 −999 到 999 的整数。重复目标返回第一个位置，空数组可直接留空。',
  requiresTarget: true,
  example: { values: '8, 3, 6, 3, 5, 1', target: '3' },
  examples: [
    { name: '重复目标', draft: { values: '8, 3, 6, 3, 5, 1', target: '3' } },
    { name: '目标不存在', draft: { values: '4, 1, 9, 2', target: '7' } },
  ],
  code,
  validate: draft => validateDraft(draft, rules),
  execute(input, options) {
    assertValidInput(input, rules);
    const recorder = createTraceRecorder('linear-search', input, code, options);
    const items = input.values.map((value, index) => ({ id: `item-${index}`, value }));
    const target = input.target!;
    let i: number | undefined;
    function record(statementId: string | null, kind: Snapshot['kind'], explanation: string,
      markers: Snapshot['markers'] = {}, condition?: Snapshot['condition']) {
      recorder.record({
        statementId, kind, explanation, items,
        variables: [{ name: 'target', value: target }, ...(i === undefined ? [] : [{ name: 'i', value: i }])],
        markers: { ...(i === undefined ? {} : { pointers: [{ label: 'i', index: i }], range: { start: i, end: items.length - 1 } }), ...markers },
        ...(condition ? { condition } : {}),
      });
    }
    record(null, 'initial', `准备在原始数组中查找 ${target}，还没有执行任何语句。`);
    i = 0;
    record('index', 'assign', '设置 i = 0，从第一个元素开始检查。');
    while (true) {
      const scanning = i < items.length;
      record('condition', 'condition', scanning ? `i = ${i}，仍有元素待检查。` : '所有元素都已检查，候选范围为空。', {}, { expression: 'i < a.length', result: scanning });
      if (!scanning) break;
      const equal = items[i].value === target;
      record('compare', 'compare', `${items[i].value} === ${target} 为${equal ? '真，找到第一个匹配位置' : '假，继续向右查找'}。`, { active: [i] }, { expression: 'a[i] === target', result: equal });
      if (equal) {
        const message = `找到目标 ${target}，返回第一个匹配下标 ${i}（从 0 开始）。`;
        record('found', 'complete', message, { found: i });
        return recorder.finish({ kind: 'found', index: i, message });
      }
      i += 1;
      record('advance', 'assign', `i 增加到 ${i}，左侧已经检查的元素均不等于目标。`);
    }
    const message = `未找到目标 ${target}，返回 -1。`;
    record('not-found', 'complete', message);
    return recorder.finish({ kind: 'not-found', index: -1, message });
  },
};
