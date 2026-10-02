import { useId } from 'react';
import type { Snapshot, Variable } from '../engine/types';
import styles from './Structures.module.css';

function FrameVariables({ values, empty }: { values: readonly Variable[]; empty: string }) {
  if (!values.length) return <p className={styles.emptyVariables}>{empty}</p>;
  return <dl className={styles.frameVariables}>{values.map(variable => <div key={variable.name}>
    <dt>{variable.name}</dt><dd>{variable.value === null ? 'null' : String(variable.value)}</dd>
  </div>)}</dl>;
}

export function CallStackPanel({ snapshot }: { snapshot: Snapshot }) {
  const titleId = useId();
  const frames = snapshot.callStack ?? [];
  const execution = snapshot.execution;
  const activeFrameId = execution ? execution.activeFrameId : frames.at(-1)?.id;
  const ownerHasReturned = execution?.event === 'return' && !frames.some(frame => frame.id === execution.frameId);
  const activeFrame = frames.find(frame => frame.id === activeFrameId);

  return <section className={styles.panel} aria-labelledby={titleId}>
    <header className={styles.panelHeader}>
      <h2 id={titleId}>调用栈</h2>
      <span>{frames.length} 个调用</span>
    </header>
    {execution && <div className={styles.executionContext} data-event={execution.event} data-owner={execution.frameId}>
      <p><span>{execution.event === 'return' ? '刚返回的调用' : execution.event === 'call' ? '调用语句所属' : '刚执行的调用'}</span>
        <code>{execution.functionName}</code><small>{execution.frameId}</small>
        {ownerHasReturned && <span className={styles.returnBadge}>已退出栈</span>}
      </p>
      {execution.event === 'return' && <p className={styles.returnDetail}>
        {execution.returnedValue !== undefined ? <>返回值 <code>{execution.returnedValue}</code>；</> : '本次调用结束；'}
        {activeFrame ? <>恢复 <code>{activeFrame.functionName}</code>（{activeFrame.id}）</> : '当前没有活动调用'}
      </p>}
    </div>}
    {frames.length ? <ol className={styles.frameList} tabIndex={0} aria-label="当前调用栈，从内层到外层">{[...frames].reverse().map(frame => {
      const active = frame.id === activeFrameId;
      return <li className={styles.frame} key={frame.id} data-frame={frame.id} data-active={active} aria-current={active ? 'step' : undefined}>
        <div className={styles.frameHeading}>
          <code>{frame.functionName}</code>
          <span className={styles.frameState}>{active ? '当前调用' : '等待子调用'}</span>
        </div>
        <div className={styles.frameMeta}><span>深度 {frame.depth}</span><code>{frame.id}</code></div>
        <div className={styles.frameGroup}><h3>参数</h3><FrameVariables values={frame.parameters} empty="无参数" /></div>
        <div className={styles.frameGroup}><h3>局部变量</h3><FrameVariables values={frame.locals} empty="尚未定义局部变量" /></div>
      </li>;
    })}</ol> : <div className={styles.emptyStack}>{snapshot.kind === 'complete' ? '所有调用均已返回。' : execution?.event === 'return' ? '本次调用已返回，调用栈为空。' : '执行函数调用后，这里会展示各层参数与局部变量。'}</div>}
    <p className={styles.panelNote}>每次调用保留独立变量；栈顶在上，等待返回的外层调用在下。</p>
  </section>;
}
