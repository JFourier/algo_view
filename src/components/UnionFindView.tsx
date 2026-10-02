import { useId } from 'react';
import type { UnionFindState } from '../engine/types';
import styles from './Structures.module.css';

interface ForestNode {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

function layoutForest(parent: readonly number[]) {
  const children = parent.map(() => [] as number[]);
  const roots: number[] = [];
  parent.forEach((ancestor, node) => {
    if (ancestor === node) roots.push(node);
    else children[ancestor].push(node);
  });
  const widths = parent.map(() => 0);
  function measure(node: number): number {
    widths[node] = Math.max(1, children[node].reduce((sum, child) => sum + measure(child), 0));
    return widths[node];
  }
  roots.forEach(measure);
  const slots = roots.reduce((sum, root) => sum + widths[root], 0);
  const width = Math.max(480, slots * 76 + 48);
  const nodes: ForestNode[] = [];
  let maxDepth = 0;
  function place(node: number, left: number, depth: number) {
    nodes.push({ id: node, x: left + widths[node] * 38, y: 58 + depth * 88 });
    maxDepth = Math.max(maxDepth, depth);
    let childLeft = left;
    children[node].forEach(child => {
      place(child, childLeft, depth + 1);
      childLeft += widths[child] * 76;
    });
  }
  let left = (width - slots * 76) / 2;
  roots.forEach(root => {
    place(root, left, 0);
    left += widths[root] * 76;
  });
  nodes.sort((a, b) => a.id - b.id);
  return { nodes, width, height: Math.max(200, maxDepth * 88 + 104) };
}

export function UnionFindView({ state }: { state: UnionFindState }) {
  const viewId = useId();
  const markerId = `${viewId}-parent-arrow`;
  const { nodes, width, height } = layoutForest(state.parent);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const path = new Set(state.path);
  const roots = state.parent.flatMap((parent, node) => parent === node ? [node] : []);
  const parentChange = state.parentChange;
  const stateOf = (node: number) => parentChange?.node === node ? 'changed' : path.has(node) ? 'path' : state.parent[node] === node ? 'root' : 'default';
  const description = state.parent.map((parent, node) => parent === node
    ? `节点 ${node} 是根，集合大小 ${state.size[node]}`
    : `节点 ${node} 指向父节点 ${parent}`).join('；');

  return <div className={styles.unionView}>
    <div className={styles.structureSummary}>
      <span>节点 <strong>{state.parent.length}</strong></span>
      <span>集合计数 <strong data-testid="set-count">{state.count}</strong></span>
      <span>根节点 <strong>{roots.length ? roots.join('、') : '无'}</strong></span>
    </div>
    {state.parent.length ? <>
      <div className={styles.tableScroller} tabIndex={0} role="region" aria-label="父节点数组，可横向滚动">
        <table className={styles.parentTable} aria-label="父节点数组">
          <caption>父节点数组与根节点的集合大小</caption>
          <thead><tr><th scope="col">节点 x</th>{state.parent.map((_, node) => <th scope="col" key={node}>{node}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">parent[x]</th>{state.parent.map((parent, node) => <td key={node} data-node={node} data-parent={parent} data-state={stateOf(node)} aria-label={`parent[${node}] = ${parent}`}>{parent}</td>)}</tr>
            <tr><th scope="row">根的 size</th>{state.parent.map((parent, node) => <td key={node} data-root={parent === node} aria-label={parent === node ? `根 ${node} 的集合大小 ${state.size[node]}` : `节点 ${node} 不是根，size 不适用`}>{parent === node ? state.size[node] : '—'}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <div className={styles.forestScroller} tabIndex={0} role="region" aria-label="并查集森林，可横向滚动">
        <svg className={styles.forest} viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width, height }} role="img" aria-label={`当前并查集森林。${description}`}>
          <title>并查集森林：箭头从节点指向父节点</title>
          <defs><marker id={markerId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L7 3.5L0 7z" fill="context-stroke" /></marker></defs>
          {nodes.filter(node => state.parent[node.id] !== node.id).map(node => {
            const parent = byId.get(state.parent[node.id])!;
            const dx = parent.x - node.x;
            const dy = parent.y - node.y;
            const distance = Math.hypot(dx, dy);
            return <line key={node.id} className={styles.forestEdge} data-node={node.id} data-parent={parent.id} data-state={stateOf(node.id)}
              x1={node.x + dx / distance * 21} y1={node.y + dy / distance * 21}
              x2={parent.x - dx / distance * 24} y2={parent.y - dy / distance * 24}
              markerEnd={`url(#${markerId})`} />;
          })}
          {nodes.map(node => {
            const isRoot = state.parent[node.id] === node.id;
            return <g key={node.id} className={styles.forestNode} data-node={node.id} data-parent={state.parent[node.id]} data-root={isRoot} data-state={stateOf(node.id)} data-highlight-root={state.roots.includes(node.id)} transform={`translate(${node.x}, ${node.y})`}>
              <title>{isRoot ? `根节点 ${node.id}，集合大小 ${state.size[node.id]}` : `节点 ${node.id}，父节点 ${state.parent[node.id]}`}{path.has(node.id) ? '，已访问' : ''}{parentChange?.node === node.id ? '，刚执行父节点赋值' : ''}</title>
              {isRoot && <text className={styles.rootLabel} textAnchor="middle" y="-31">根 · size {state.size[node.id]}</text>}
              <circle r="20" />
              <text className={styles.nodeLabel} textAnchor="middle" dominantBaseline="central">{node.id}</text>
            </g>;
          })}
        </svg>
      </div>
    </> : <div className={styles.emptyForest}><span>∅</span><strong>当前没有节点</strong><p>空并查集包含 0 个集合。</p></div>}
    <div className={styles.forestLegend} aria-label="森林图例">
      <span><i data-color="root" />根节点</span><span><i data-color="path" />访问路径</span><span><i data-color="changed" />父节点赋值</span><span className={styles.arrowHint}>箭头：节点 → 父节点</span>
    </div>
    <div className={styles.structureDetails}>
      <p><span>本次访问路径</span><code>{state.path.length ? state.path.join(' → ') : '尚未开始查找'}</code></p>
      {parentChange && <p className={styles.parentChange} data-testid="parent-change"><span>父节点赋值</span><code>parent[{parentChange.node}]：{parentChange.before} → {parentChange.after}</code>{parentChange.before === parentChange.after && <small>已直接连接根节点，结构未变化</small>}</p>}
      <p className={styles.sizeNote}>size 仅在根节点处有效；连接后的大小与集合计数会随对应语句更新。</p>
    </div>
  </div>;
}
