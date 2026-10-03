import type { FibonacciState } from '../engine/types';
import styles from './Fibonacci.module.css';

export function FibonacciView({ state }: { state: FibonacciState }) {
  const total = state.calls.reduce((sum, { count }) => sum + count, 0);
  const repeats = state.calls.reduce((sum, { count }) => sum + Math.max(0, count - 1), 0);
  const mostCalls = Math.max(1, ...state.calls.map(({ count }) => count));

  return <div className={styles.view}>
    <div className={styles.summary}>
      <span>目标 <strong>F({state.n})</strong></span>
      <span>累计调用 <strong data-testid="fibonacci-total-calls">{total}</strong></span>
      <span>重复调用 <strong data-testid="fibonacci-repeat-calls">{repeats}</strong></span>
      {state.result !== undefined && <span>结果 <strong>{state.result}</strong></span>}
    </div>
    <div className={styles.recurrence}><code>F(0) = 0 · F(1) = 1</code><code>F(n) = F(n − 1) + F(n − 2)</code></div>
    <ul className={styles.callCounts} aria-label="各子问题的累计调用次数">
      {state.calls.map(({ n, count }) => <li key={n} data-subproblem={n} data-call-count={count} data-repeated={count > 1}>
        <div><code>F({n})</code><span>{count} 次</span></div>
        <div className={styles.countTrack} aria-hidden="true"><i style={{ width: `${count / mostCalls * 100}%` }} /></div>
        <small>{count > 1 ? `重复求解 ${count - 1} 次` : count === 1 ? '已调用一次' : '尚未调用'}</small>
      </li>)}
    </ul>
    <p className={styles.note}>计数在进入 fibonacci 时增加，包含正在计算的调用。相同参数会再次展开；每次调用的参数、局部变量和返回值见调用栈。</p>
  </div>;
}
