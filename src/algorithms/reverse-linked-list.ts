import { assertValidInput, validateDraft } from '../engine/input';
import { createTraceRecorder } from '../engine/trace';
import type { AlgorithmDefinition, CodeLine, LinkedListState, Snapshot } from '../engine/types';

const code: readonly CodeLine[] = [
  { text: 'function reverseList(head) {' },
  { id: 'prev-init', text: '  let prev = null;' },
  { id: 'current-init', text: '  let current = head;' },
  { id: 'loop-condition', text: '  while (current !== null) {' },
  { id: 'save-next', text: '    const next = current.next;' },
  { id: 'reverse-link', text: '    current.next = prev;' },
  { id: 'prev-advance', text: '    prev = current;' },
  { id: 'current-advance', text: '    current = next;' },
  { text: '  }' },
  { id: 'head-update', text: '  head = prev;' },
  { id: 'return', text: '  return head;' },
  { text: '}' },
];

interface Node {
  readonly id: string;
  readonly value: number;
  next: Node | null;
}

const rules = { requiresTarget: false };
const label = (node: Node | null) => node?.id ?? 'null';

export const reverseLinkedList: AlgorithmDefinition = {
  id: 'reverse-linked-list',
  inputKind: 'linked-list',
  name: '链表反转',
  englishName: 'Reverse Linked List',
  category: '链表',
  summary: '依次保存下一节点，将 current.next 改为 prev，再推进两个指针。节点身份和值保持不变，只有连接方向改变。',
  complexity: { time: 'O(n)', space: 'O(1)' },
  inputHint: '按输入顺序建立无环单向链表；最多 24 个节点，值为 −999 到 999 的整数。留空表示空链表。',
  requiresTarget: false,
  example: { kind: 'linked-list', values: '3, 7, 2, 9, 5' },
  examples: [
    { name: '普通链表', draft: { kind: 'linked-list', values: '3, 7, 2, 9, 5' } },
    { name: '重复值', draft: { kind: 'linked-list', values: '4, 2, 4, 2' } },
    { name: '空链表', draft: { kind: 'linked-list', values: '' } },
  ],
  code,
  validate(draft) {
    if (draft.kind !== 'linked-list') return { ok: false, error: '此算法需要链表输入。' };
    const validated = validateDraft({ values: draft.values, target: '' }, rules);
    if (!validated.ok) return validated;
    assertValidInput(validated.input, rules);
    return { ok: true, input: { kind: 'linked-list', values: validated.input.values } };
  },
  execute(input, options) {
    if (input.kind !== 'linked-list') throw new Error('此算法需要链表输入。');
    assertValidInput({ values: input.values }, rules);
    const recorder = createTraceRecorder('reverse-linked-list', input, code, options);
    const nodes: Node[] = input.values.map((value, index) => ({ id: `node-${index}`, value, next: null }));
    nodes.forEach((node, index) => { node.next = nodes[index + 1] ?? null; });
    let head: Node | null = nodes[0] ?? null;
    let prev: Node | null = null;
    let current: Node | null = null;
    let next: Node | null | undefined;
    let hasPrev = false;
    let hasCurrent = false;

    function record(
      statementId: string | null,
      kind: Snapshot['kind'],
      explanation: string,
      condition?: Snapshot['condition'],
      change?: LinkedListState['change'],
    ) {
      const pointers = [
        { label: 'head', nodeId: head?.id ?? null },
        ...(hasPrev ? [{ label: 'prev', nodeId: prev?.id ?? null }] : []),
        ...(hasCurrent ? [{ label: 'current', nodeId: current?.id ?? null }] : []),
        ...(next !== undefined ? [{ label: 'next', nodeId: next?.id ?? null }] : []),
      ];
      recorder.record({
        statementId, kind, explanation,
        items: [], markers: {},
        variables: pointers.map(({ label: name, nodeId: value }) => ({ name, value })),
        linkedList: {
          nodes: nodes.map(node => ({ id: node.id, value: node.value, next: node.next?.id ?? null })),
          head: head?.id ?? null,
          pointers,
          ...(change ? { change } : {}),
        },
        ...(condition ? { condition } : {}),
      });
    }

    record(null, 'initial', `按输入顺序建立 ${nodes.length} 个节点；head = ${label(head)}，还没有执行任何语句。`);
    prev = null;
    hasPrev = true;
    record('prev-init', 'assign', 'prev = null，已反转部分暂时为空。');
    current = head;
    hasCurrent = true;
    record('current-init', 'assign', `current = head，从 ${label(current)} 开始处理。`);
    while (true) {
      const hasNode = current !== null;
      record('loop-condition', 'condition', hasNode ? `current = ${label(current)}，还有节点需要反转。` : 'current = null，所有节点已处理。',
        { expression: 'current !== null', result: hasNode });
      if (current === null) break;
      next = current.next;
      record('save-next', 'assign', `将 ${current.id} 原本的下一节点 ${label(next)} 保存到 next，改边后仍可继续访问。`);
      const before = current.next?.id ?? null;
      current.next = prev;
      record('reverse-link', 'link', `将 ${current.id}.next 从 ${before ?? 'null'} 改为 ${label(prev)}${before === (prev?.id ?? null) ? '，该连接保持为空' : ''}。`,
        undefined, { nodeId: current.id, before, after: prev?.id ?? null });
      prev = current;
      record('prev-advance', 'assign', `prev 前进到 ${prev.id}，它现在是已反转部分的头节点。`);
      current = next;
      record('current-advance', 'assign', `current 前进到已保存的 ${label(current)}${current === null ? '，到达原链表末尾' : ''}。`);
      next = undefined;
    }
    head = prev;
    record('head-update', 'assign', `将 head 更新为 prev = ${label(head)}，指向反转后的链表头。`);
    const values: number[] = [];
    for (let node: Node | null = head; node !== null; node = node.next) values.push(node.value);
    const message = nodes.length ? `链表反转完成，返回新头 ${label(head)}：${values.join(' → ')} → null。` : '空链表反转完成，返回 null。';
    record('return', 'complete', message);
    return recorder.finish({ kind: 'linked-list', message, head: head?.id ?? null, values });
  },
};
