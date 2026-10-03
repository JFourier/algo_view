import { assertValidInput, validateDraft } from '../engine/input';
import { createTraceRecorder } from '../engine/trace';
import type { AlgorithmDefinition, ArrayItem, CodeLine, Snapshot } from '../engine/types';

const code: readonly CodeLine[] = [
  { text: 'function insertionSort(values) {' },
  { id: 'copy', text: '  const a = [...values];' },
  { id: 'index', text: '  let i = 1;' },
  { id: 'outer', text: '  while (i < a.length) {' },
  { id: 'hold', text: '    const key = a[i];' },
  { id: 'scan', text: '    let j = i - 1;' },
  { id: 'inner', text: '    while (j >= 0) {' },
  { id: 'compare', text: '      if (a[j] <= key) {' },
  { id: 'stop', text: '        break;' },
  { text: '      }' },
  { id: 'shift', text: '      a[j + 1] = a[j];' },
  { id: 'retreat', text: '      j -= 1;' },
  { text: '    }' },
  { id: 'insert', text: '    a[j + 1] = key;' },
  { id: 'advance', text: '    i += 1;' },
  { text: '  }' },
  { id: 'return', text: '  return a;' },
  { text: '}' },
];
const rules = { requiresTarget: false };

export const insertionSort: AlgorithmDefinition = {
  id: 'insertion-sort', inputKind: 'array', name: '插入排序', englishName: 'Insertion Sort', category: '排序',
  summary: '把当前元素暂存为 key，将左侧较大元素逐项右移，再把 key 写入空出的位置。相等元素保持原来的先后顺序。',
  complexity: { time: '最好 O(n)，最坏 O(n²)', space: 'O(n)，含数组副本' },
  inputHint: '最多 24 个 −999 到 999 的整数，允许重复值和空数组。蓝色区间表示已有序的前缀，后续仍可能移位；暂存区保留待插入元素。',
  requiresTarget: false,
  example: { values: '8, 3, 6, 2, 5, 1', target: '' },
  examples: [
    { name: '逐项移位', draft: { values: '8, 3, 6, 2, 5, 1', target: '' } },
    { name: '稳定排序', draft: { values: '4, 2, 4, 1, 2', target: '' } },
    { name: '已经有序', draft: { values: '1, 2, 3, 4, 5', target: '' } },
  ],
  code,
  validate: draft => validateDraft(draft, rules),
  execute(input, options) {
    assertValidInput(input, rules);
    const recorder = createTraceRecorder('insertion-sort', input, code, options);
    const items: ArrayItem[] = input.values.map((value, index) => ({ id: `item-${index}`, value }));
    let i: number | undefined;
    let j: number | undefined;
    let held: ArrayItem | null = null;
    // A prefix is sorted only between insertions; it is never a finalized suffix.
    let prefix = 0;
    function record(statementId: string | null, kind: Snapshot['kind'], explanation: string,
      extra: { condition?: Snapshot['condition']; active?: readonly number[]; write?: NonNullable<Snapshot['insertion']>['write']; complete?: boolean } = {}) {
      recorder.record({
        statementId, kind, explanation, items,
        variables: [
          ...(i === undefined ? [] : [{ name: 'i', value: i }]),
          ...(held ? [{ name: 'key', value: held.value }] : []),
          ...(j === undefined ? [] : [{ name: 'j', value: j }]),
        ],
        markers: {
          pointers: [...(i === undefined ? [] : [{ label: 'i', index: i }]), ...(j === undefined ? [] : [{ label: 'j', index: j }])],
          ...(prefix > 0 && !extra.complete ? { range: { start: 0, end: prefix - 1, label: '已排序前缀' } } : {}),
          ...(extra.active ? { active: extra.active } : {}),
          ...(extra.complete ? { sorted: items.map((_, index) => index) } : {}),
        },
        insertion: { held, ...(extra.write ? { write: extra.write } : {}) },
        ...(extra.condition ? { condition: extra.condition } : {}),
      });
    }
    record(null, 'initial', '准备开始：数组保持输入顺序，暂存区为空，还没有执行语句。');
    record('copy', 'assign', '复制输入数组，所有移位和写入只修改副本。');
    i = 1;
    prefix = Math.min(1, items.length);
    record('index', 'assign', '设置 i = 1；首个元素自身有序，但未必在最终位置。');
    while (true) {
      const scanning = i < items.length;
      record('outer', 'condition', scanning ? `准备将下标 ${i} 的元素插入左侧已排序前缀。` : '所有元素均已插入，整个数组有序。', { condition: { expression: 'i < a.length', result: scanning } });
      if (!scanning) break;
      held = items[i];
      record('hold', 'assign', `暂存 key = ${held.value}（${held.id}）；即使数组中的原位置被覆盖，也能写回同一元素。`, { active: [i] });
      j = i - 1;
      record('scan', 'assign', `设置 j = ${j}，从有序前缀的右端向左检查。`);
      while (true) {
        const within = j >= 0;
        record('inner', 'condition', within ? `j = ${j}，继续检查左侧元素。` : 'j = -1，已到数组左边界，应将 key 插入下标 0。', { condition: { expression: 'j >= 0', result: within } });
        if (!within) break;
        const stop = items[j].value <= held.value;
        record('compare', 'compare', `${items[j].value} <= key (${held.value}) 为${stop ? '真，在该元素右侧插入；相等值保持顺序' : '假，需要将较大元素右移'}。`, { active: [j], condition: { expression: 'a[j] <= key', result: stop } });
        if (stop) {
          record('stop', 'condition', `停止向左扫描，key 将写入下标 ${j + 1}。`);
          break;
        }
        items[j + 1] = items[j];
        // During an unfinished insertion do not claim that its changing prefix is sorted.
        prefix = 0;
        record('shift', 'assign', `把下标 ${j} 的 ${items[j].value} 复制到下标 ${j + 1}；源位置尚未改写，因此暂时出现重复副本。key 仍在暂存区。`, { active: [j, j + 1], write: { index: j + 1, sourceIndex: j } });
        j -= 1;
        record('retreat', 'assign', `j 减少到 ${j}，继续寻找 key 的插入位置。`);
      }
      items[j + 1] = held;
      prefix = i + 1;
      record('insert', 'assign', `把暂存的 ${held.value} 写入下标 ${j + 1}；前 ${prefix} 个元素已经有序，后续仍可能移位。`, { active: [j + 1], write: { index: j + 1 } });
      i += 1;
      record('advance', 'assign', `i 增加到 ${i}，本轮插入结束。`);
      // key and j belong to the loop body and go out of scope at its closing brace.
      held = null;
      j = undefined;
    }
    const values = items.map(item => item.value);
    const message = values.length ? `排序完成，结果为 [${values.join(', ')}]。` : '空数组已经有序，排序完成。';
    record('return', 'complete', message, { complete: true });
    return recorder.finish({ kind: 'sorted', message, values });
  },
};
