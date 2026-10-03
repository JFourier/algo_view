import { useId } from 'react';
import type { LinkedListState } from '../engine/types';
import styles from './LinkedListView.module.css';

export function LinkedListView({ state }: { state: LinkedListState }) {
  const markerId = `${useId()}-next-arrow`;
  const width = Math.max(480, state.nodes.length * 150 + 32);
  const position = new Map(state.nodes.map((node, index) => [node.id, 91 + index * 150]));
  const nullPointers = state.pointers.filter(pointer => pointer.nodeId === null);
  const description = state.nodes.map(node => `${node.id}，值 ${node.value}，next 指向 ${node.next ?? 'null'}`).join('；');
  return <div className={styles.view}>
    <div className={styles.summary}>
      <span>节点 <strong>{state.nodes.length}</strong></span>
      <span>链表头 <strong data-testid="list-head">{state.head ?? 'null'}</strong></span>
    </div>
    <div className={styles.pointers} aria-label="链表指针">
      {state.pointers.map(pointer => <span key={pointer.label} data-pointer={pointer.label} data-node={pointer.nodeId ?? 'null'}><code>{pointer.label}</code><b>→</b><code>{pointer.nodeId ?? 'null'}</code></span>)}
    </div>
    {state.nodes.length ? <div className={styles.scroller} tabIndex={0} role="region" aria-label="链表连接，可横向滚动">
      <svg className={styles.list} viewBox={`0 0 ${width} 240`} style={{ minWidth: width }} role="img" aria-label={`当前链表。箭头从节点指向其 next。${description}`}>
        <title>链表：节点位置固定，箭头从节点指向 next</title>
        <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L8 4L0 8z" fill="context-stroke" /></marker></defs>
        {state.nodes.map(node => {
          const x = position.get(node.id)!;
          const target = node.next === null ? null : position.get(node.next)!;
          const direction = target !== null && target < x ? -1 : 1;
          return <g key={node.id}>
            {target !== null
              ? <path className={styles.edge} data-node={node.id} data-next={node.next} data-changed={state.change?.nodeId === node.id} d={`M${x + direction * 43} 117H${target - direction * 47}`} markerEnd={`url(#${markerId})`} />
              : <><path className={styles.edge} data-node={node.id} data-next="null" data-changed={state.change?.nodeId === node.id} d={`M${x} 149V177`} markerEnd={`url(#${markerId})`} /><text className={styles.nullLabel} x={x} y="195" textAnchor="middle">null</text></>}
          </g>;
        })}
        {state.nodes.map(node => {
          const x = position.get(node.id)!;
          const pointers = state.pointers.filter(pointer => pointer.nodeId === node.id);
          return <g key={node.id} className={styles.node} data-node={node.id} data-next={node.next ?? 'null'} data-current={pointers.some(pointer => pointer.label === 'current')} data-changed={state.change?.nodeId === node.id} transform={`translate(${x}, 117)`}>
            <title>{node.id}，值 {node.value}，next = {node.next ?? 'null'}</title>
            {pointers.map((pointer, index) => <text key={pointer.label} className={styles.pointerLabel} y={-60 - (pointers.length - index - 1) * 15} textAnchor="middle">{pointer.label} ↓</text>)}
            <text className={styles.identity} y="-40" textAnchor="middle">{node.id}</text>
            <rect x="-42" y="-31" width="84" height="62" rx="9" />
            <text className={styles.value} y="-2" textAnchor="middle">{node.value}</text>
            <text className={styles.nextLabel} y="19" textAnchor="middle">next</text>
          </g>;
        })}
      </svg>
    </div> : <div className={styles.empty}><span>∅</span><strong>当前为空链表</strong><p>head = null，没有节点需要反转。</p></div>}
    <div className={styles.details}>
      <p><span>空指针</span><code>{nullPointers.length ? nullPointers.map(pointer => pointer.label).join(' / ') + ' → null' : '无'}</code></p>
      {state.change && <p className={styles.change} data-testid="link-change"><span>本步连接赋值</span><code>{state.change.nodeId}.next：{state.change.before ?? 'null'} → {state.change.after ?? 'null'}</code>{state.change.before === state.change.after && <small>连接未改变</small>}</p>}
      <p className={styles.hint}>箭头：节点 → next。节点位置按输入顺序固定；反转时仅改变连接方向。</p>
    </div>
  </div>;
}
