import type { Snapshot } from '../engine/types';
import styles from './Workspace.module.css';

export function ArrayView({ snapshot, animate }: { snapshot: Snapshot; animate: boolean }) {
  const { items, markers, insertion } = snapshot;
  if (!items.length) return <div className={styles.emptyArray}><span>[ ]</span><strong>这是一个空数组</strong><p>继续执行，观察算法如何处理没有元素的情况。</p></div>;
  const width = Math.max(540, items.length * 62 + 60);
  const cell = Math.min(70, (width - 64) / items.length);
  const start = (width - cell * items.length) / 2;
  const max = Math.max(0, ...items.map(item => item.value));
  const min = Math.min(0, ...items.map(item => item.value));
  const scale = 150 / Math.max(1, max - min);
  const baseline = 62 + max * scale;
  const description = items.map((item, index) => {
    const action = markers.found === index ? '，找到目标' : markers.active?.includes(index)
      ? snapshot.kind === 'swap' ? '，刚完成交换' : snapshot.kind === 'compare' ? '，正在比较' : markers.pointers?.some(pointer => pointer.label === 'mid' && pointer.index === index) ? '，当前中点' : '，当前元素'
      : markers.sorted?.includes(index) ? '，已就位' : '';
    return `索引 ${index}：${item.value}${action}${markers.pivot?.id === item.id ? '，基准元素' : ''}${insertion?.write?.index === index ? '，刚写入' : ''}`;
  }).join('；');

  return <div className={styles.arrayScroll}>
    {insertion && <div className={styles.heldItem} aria-label="待插入元素暂存区" data-testid="insertion-held">
      <span>暂存 key</span><strong>{insertion.held ? insertion.held.value : '—'}</strong>
      <code>{insertion.held?.id ?? '尚未暂存'}</code>
      <span>{insertion.write ? `刚写入 a[${insertion.write.index}]${insertion.write.sourceIndex === undefined ? ' ← key' : ` ← a[${insertion.write.sourceIndex}]`}` : '右移时保留 key，找到位置后写回'}</span>
    </div>}
    <svg className={styles.arraySvg} viewBox={`0 0 ${width} 340`} style={{ minWidth: items.length > 9 ? width : undefined }} role="img" aria-label={description}>
      <title>当前数组与索引</title>
      {markers.range && markers.range.start <= markers.range.end && <g>
        <rect x={start + markers.range.start * cell - 4} y="34" width={(markers.range.end - markers.range.start + 1) * cell + 8} height="265" rx="12" className={styles.rangeFill} />
        <text x={start + markers.range.start * cell + 5} y="23" className={styles.rangeLabel}>{markers.range.label ?? '候选范围'} [{markers.range.start}, {markers.range.end}]</text>
      </g>}
      <line x1="24" x2={width - 24} y1={baseline} y2={baseline} className={styles.baseline} />
      <text x="12" y={baseline + 4} className={styles.axisLabel}>0</text>
      {items.map((item, index) => {
        const active = markers.active?.includes(index);
        const sorted = markers.sorted?.includes(index);
        const found = markers.found === index;
        const outside = !insertion && markers.range && (index < markers.range.start || index > markers.range.end);
        const height = Math.max(4, Math.abs(item.value) * scale);
        const y = item.value >= 0 ? baseline - height : baseline;
        const state = found ? 'found' : active ? 'active' : sorted ? 'sorted' : outside ? 'outside' : 'default';
        return <g key={insertion ? index : item.id} className={styles.element} data-state={state} data-item={item.id} data-index={index} data-write={insertion?.write?.index === index} data-pivot={markers.pivot?.id === item.id} style={{ transform: `translateX(${start + index * cell}px)`, transition: animate && !insertion ? undefined : 'none' }}>
          <rect x="7" y={y} width={cell - 14} height={height} rx="5" className={styles.bar} />
          <text x={cell / 2} y={item.value < 0 ? y + height + 19 : y - 12} textAnchor="middle" className={styles.value}>{item.value}</text>
          {markers.pivot?.id === item.id && <text x={cell / 2} y="244" textAnchor="middle" className={styles.pivotLabel}>基准</text>}
          {(active || sorted || found) && <text x={cell / 2} y="260" textAnchor="middle" className={styles.markLabel}>{insertion?.write?.index === index ? '写入' : found ? '找到' : active ? (snapshot.kind === 'swap' ? '交换' : snapshot.kind === 'compare' ? '比较' : markers.pointers?.some(pointer => pointer.label === 'mid' && pointer.index === index) ? '中点' : '当前') : '✓'}</text>}
        </g>;
      })}
      {items.map((_, index) => <g key={index}>
        <text x={start + (index + 0.5) * cell} y="282" textAnchor="middle" className={styles.indexLabel}>{index}</text>
        {markers.pointers?.some(pointer => pointer.index === index) && <g>
          <path d={`M${start + (index + 0.5) * cell} 291v8m-3-5 3-3 3 3`} className={styles.pointer} />
          <text x={start + (index + 0.5) * cell} y="317" textAnchor="middle" className={styles.pointerLabel}>{markers.pointers.filter(pointer => pointer.index === index).map(pointer => pointer.label).join(' / ')}</text>
        </g>}
      </g>)}
    </svg>
    {markers.pointers?.some(pointer => pointer.index < 0 || pointer.index >= items.length) && <p className={styles.outsidePointer}>{markers.pointers.filter(pointer => pointer.index < 0 || pointer.index >= items.length).map(pointer => `${pointer.label} = ${pointer.index}（数组边界外）`).join('；')}</p>}
  </div>;
}
