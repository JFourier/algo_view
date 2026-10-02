import type { InputDraft } from '../engine/types';
import styles from '../App.module.css';

export function InputEditor({ draft, requiresTarget, error, onChange }: {
  draft: InputDraft;
  requiresTarget: boolean;
  error: boolean;
  onChange: (draft: InputDraft) => void;
}) {
  if (draft.kind === 'union-find') return <div className={styles.unionInputs}>
    <div className={styles.unionOptions}>
      <label className={styles.targetField} htmlFor="node-count">节点数<input id="node-count" value={draft.nodeCount} inputMode="numeric" onChange={event => onChange({ ...draft, nodeCount: event.target.value })} aria-invalid={error} aria-describedby="input-hint input-status" /></label>
      <label className={styles.compressionToggle}><input type="checkbox" checked={draft.pathCompression} onChange={event => onChange({ ...draft, pathCompression: event.target.checked })} />启用路径压缩</label>
      <span>节点编号从 0 开始</span>
    </div>
    <label className={styles.operationsField} htmlFor="operations-input">操作序列<textarea id="operations-input" value={draft.operations} onChange={event => onChange({ ...draft, operations: event.target.value })} rows={5} spellCheck={false} autoComplete="off" aria-invalid={error} aria-describedby="input-hint input-status" placeholder={'union 0 1\nfind 1'} /></label>
  </div>;
  return <>
    <div className={styles.arrayField}><label className={styles.srOnly} htmlFor="array-input">数组元素</label><span aria-hidden="true">[</span><input id="array-input" value={draft.values} onChange={event => onChange({ ...draft, values: event.target.value })} aria-describedby="input-hint input-status" aria-invalid={error} placeholder="留空可演示空数组" autoComplete="off" spellCheck={false} /><span aria-hidden="true">]</span></div>
    {requiresTarget && <label className={styles.targetField} htmlFor="target-input">目标值<input id="target-input" value={draft.target} onChange={event => onChange({ ...draft, target: event.target.value })} inputMode="numeric" aria-invalid={error} aria-describedby="input-status" /></label>}
  </>;
}
