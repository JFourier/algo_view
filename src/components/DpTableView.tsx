import type { DpState } from '../engine/types';
import styles from './Fibonacci.module.css';

export function DpTableView({ state }: { state: DpState }) {
  const calculated = state.cells.filter(value => value !== null).length;
  return <div className={styles.view}>
    <div className={styles.summary}>
      <span>已计算 <strong>{calculated} / {state.cells.length}</strong></span>
      {state.activeIndex !== undefined && <span>当前状态 <strong>dp[{state.activeIndex}]</strong></span>}
      {state.writtenIndex !== undefined && <span>刚写入 <strong>dp[{state.writtenIndex}] = {state.cells[state.writtenIndex]}</strong></span>}
    </div>
    {state.cells.length ? <div className={styles.tableScroller} tabIndex={0} role="region" aria-label="DP 状态表，可横向滚动">
      <table className={styles.table} aria-label="斐波那契 DP 状态表">
        <caption>按下标从左到右保存结果；— 表示尚未计算</caption>
        <thead><tr><th scope="col">下标 i</th>{state.cells.map((_, index) => <th key={index} scope="col">{index}</th>)}</tr></thead>
        <tbody><tr><th scope="row">dp[i]</th>{state.cells.map((value, index) => <td key={index}
          data-index={index} data-value={value === null ? 'null' : value}
          data-written={index === state.writtenIndex} data-dependency={state.dependencies.includes(index)} data-active={index === state.activeIndex}
          aria-label={`dp[${index}]${value === null ? ' 尚未计算' : ` = ${value}`}${index === state.writtenIndex ? '，刚写入' : state.dependencies.includes(index) ? '，已读取' : ''}`}>{value === null ? '—' : value}</td>)}</tr></tbody>
      </table>
    </div> : <div className={styles.empty}><code>dp</code><strong>等待分配状态表</strong><p>执行数组分配语句后，未计算的单元格才会出现。</p></div>}
    <div className={styles.legend} aria-label="DP 表图例">
      <span><i data-color="empty" />尚未计算</span>
      <span><i data-color="active" />当前状态</span>
      <span><i data-color="dependency" />已读取</span>
      <span><i data-color="written" />刚写入</span>
    </div>
    <p className={styles.note}>{state.dependencies.length
      ? `已读取：${state.dependencies.map(index => `dp[${index}] = ${state.cells[index]}`).join('，')}。`
      : '先初始化 F(0) = 0 和存在的 F(1) = 1，再逐项读取前两项并写入当前状态。'}</p>
  </div>;
}
