import { useEffect, useId, useRef } from 'react';
import type { UnionFindInput, UnionFindOperation, UnionFindState } from '../engine/types';
import styles from './Structures.module.css';

function command(operation: UnionFindOperation) {
  return operation.kind === 'union' ? `union ${operation.a} ${operation.b}` : `find ${operation.x}`;
}

export function OperationList({ input, state }: { input: UnionFindInput; state: UnionFindState }) {
  const titleId = useId();
  const scroller = useRef<HTMLOListElement>(null);
  const currentOperation = useRef<HTMLLIElement>(null);
  const results = new Map(state.results.map(result => [result.operationIndex, result]));

  useEffect(() => {
    const container = scroller.current;
    const current = currentOperation.current;
    if (!container) return;
    if (!current) { container.scrollTop = 0; return; }
    const top = current.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    if (top < container.scrollTop || top + current.clientHeight > container.scrollTop + container.clientHeight) {
      container.scrollTop = Math.max(0, top - container.clientHeight / 2);
    }
  }, [state.operationIndex, state.results.length]);

  return <section className={styles.panel} aria-labelledby={titleId}>
    <header className={styles.panelHeader}>
      <h2 id={titleId}>操作序列</h2>
      <span>已完成 {results.size} / {input.operations.length}</span>
    </header>
    {input.operations.length ? <ol className={styles.operationList} ref={scroller} tabIndex={0} aria-label="并查集操作进度">{input.operations.map((operation, index) => {
      const result = results.get(index);
      const current = state.operationIndex === index && !result;
      const status = result ? 'completed' : current ? 'current' : 'pending';
      return <li key={index} className={styles.operation} ref={state.operationIndex === index ? currentOperation : undefined} data-operation-index={index} data-state={result ? 'complete' : status} data-status={status} aria-current={current ? 'step' : undefined}>
        <span className={styles.operationNumber}>{index + 1}</span>
        <div className={styles.operationContent}>
          <div className={styles.operationHeading}><code>{command(operation)}</code><span>{result ? '已完成' : current ? '执行中' : '待执行'}</span></div>
          {result && <p className={styles.operationResult} data-result={index}>{result.message}</p>}
        </div>
      </li>;
    })}</ol> : <p className={styles.emptyOperations}>没有待执行的操作，保留各节点的初始集合。</p>}
    <p className={styles.panelNote}>操作结果随当前步骤展示，回退时同步恢复。</p>
  </section>;
}
