import { assertValidInput, validateDraft } from '../engine/input';
import { createTraceRecorder } from '../engine/trace';
import type { AlgorithmDefinition, CodeLine, Snapshot } from '../engine/types';

const code: readonly CodeLine[] = [
  { text: 'function binarySearch(a, target) {' },
  { id: 'left-init', text: '  let left = 0;' },
  { id: 'right-init', text: '  let right = a.length - 1;' },
  { id: 'loop-condition', text: '  while (left <= right) {' },
  { id: 'mid', text: '    const mid = Math.floor((left + right) / 2);' },
  { id: 'equal', text: '    if (a[mid] === target) {' },
  { id: 'found', text: '      return mid;' },
  { text: '    }' },
  { id: 'less', text: '    if (a[mid] < target) {' },
  { id: 'left-advance', text: '      left = mid + 1;' },
  { text: '    } else {' },
  { id: 'right-advance', text: '      right = mid - 1;' },
  { text: '    }' },
  { text: '  }' },
  { id: 'not-found', text: '  return -1;' },
  { text: '}' },
];

const rules = { requiresTarget: true, sorted: true };

export const binarySearch: AlgorithmDefinition = {
  id: 'binary-search',
  name: '二分查找',
  englishName: 'Binary Search',
  category: '查找',
  summary: '在升序数组的闭区间 [left, right] 内检查中点，每次排除一半候选元素。重复目标值返回执行时遇到的匹配位置。',
  complexity: { time: 'O(log n)', space: 'O(1)' },
  inputHint: '数组须升序排列，允许重复值；最多 24 项，元素与目标值均为 −999 到 999 的整数。无序输入会提示修正。',
  requiresTarget: true,
  example: { values: '2, 5, 8, 12, 16, 23, 38', target: '16' },
  code,
  validate: (draft) => validateDraft(draft, rules),
  execute(input, options) {
    assertValidInput(input, rules);
    const recorder = createTraceRecorder('binary-search', input, code, options);
    const target = input.target!;
    const items = input.values.map((value, index) => ({ id: `item-${index}`, value }));
    const variables: Record<string, number> = { target };
    let left = 0;
    let right = items.length - 1;
    let mid: number | undefined;
    let hasLeft = false;
    let hasRight = false;

    function record(
      statementId: string | null,
      kind: Snapshot['kind'],
      explanation: string,
      markers: Snapshot['markers'] = {},
      condition?: Snapshot['condition'],
    ) {
      const pointers = [
        ...(hasLeft ? [{ label: 'left', index: left }] : []),
        ...(hasRight ? [{ label: 'right', index: right }] : []),
        ...(mid !== undefined ? [{ label: 'mid', index: mid }] : []),
      ];
      recorder.record({
        statementId, kind, explanation, items,
        variables: Object.entries(variables).map(([name, value]) => ({ name, value })),
        markers: { ...(hasRight ? { range: { start: left, end: right } } : {}), pointers, ...markers },
        ...(condition ? { condition } : {}),
      });
    }

    record(null, 'initial', `准备在升序数组中查找 ${target}，还没有执行任何语句。`);
    variables.left = left;
    hasLeft = true;
    record('left-init', 'assign', '左边界 left = 0。');
    variables.right = right;
    hasRight = true;
    record('right-init', 'assign', `右边界 right = ${right}，候选区间包含左右端点。`);

    while (true) {
      const hasCandidates = left <= right;
      record('loop-condition', 'condition', hasCandidates ? `[${left}, ${right}] 仍有候选元素，继续查找。` : `left = ${left} > right = ${right}，候选区间为空。`,
        {}, { expression: 'left <= right', result: hasCandidates });
      if (!hasCandidates) break;
      mid = Math.floor((left + right) / 2);
      variables.mid = mid;
      record('mid', 'assign', `mid = ⌊(${left} + ${right}) / 2⌋ = ${mid}，中点的值为 ${items[mid].value}。`, { active: [mid] });
      const equal = items[mid].value === target;
      record('equal', 'compare', `${items[mid].value} === ${target} 为${equal ? '真，找到目标' : '假，继续判断搜索方向'}。`,
        { active: [mid] }, { expression: 'a[mid] === target', result: equal });
      if (equal) {
        const message = `找到目标 ${target}，返回下标 ${mid}（从 0 开始）。`;
        record('found', 'complete', message, { active: [mid], found: mid });
        return recorder.finish({ kind: 'found', index: mid, message });
      }
      const goRight = items[mid].value < target;
      record('less', 'compare', `${items[mid].value} < ${target} 为${goRight ? '真，目标只可能在中点右侧' : '假，目标只可能在中点左侧'}。`,
        { active: [mid] }, { expression: 'a[mid] < target', result: goRight });
      if (goRight) {
        left = mid + 1;
        variables.left = left;
        record('left-advance', 'range', `排除中点及左侧元素，left 更新为 ${left}。`);
      } else {
        right = mid - 1;
        variables.right = right;
        record('right-advance', 'range', `排除中点及右侧元素，right 更新为 ${right}。`);
      }
      delete variables.mid;
      mid = undefined;
    }
    const message = `未找到目标 ${target}，返回 -1。`;
    record('not-found', 'complete', message);
    return recorder.finish({ kind: 'not-found', index: -1, message });
  },
};
