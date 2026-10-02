import { useEffect, useState, type CSSProperties } from 'react';
import { algorithms } from './algorithms';
import type { AlgorithmDefinition, InputDraft } from './engine/types';
import { usePlayer, type PlaybackSpeed } from './player';
import { ArrayView } from './components/ArrayView';
import { CodePanel } from './components/CodePanel';
import { Icon } from './components/Icon';
import styles from './App.module.css';
import workspace from './components/Workspace.module.css';

function exampleTrace(algorithm: AlgorithmDefinition) {
  const validation = algorithm.validate(algorithm.example);
  if (!validation.ok) throw new Error(validation.error);
  return algorithm.execute(validation.input);
}

const initialTrace = exampleTrace(algorithms[0]);
const kindNames = { initial: '准备开始', assign: '更新变量', condition: '条件判断', compare: '比较元素', swap: '交换元素', range: '更新范围', complete: '执行完成' };

export default function App() {
  const [algorithm, setAlgorithm] = useState(algorithms[0]);
  const [draft, setDraft] = useState<InputDraft>(algorithm.example);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const { state, snapshot, dispatch } = usePlayer(initialTrace);
  const end = state.trace.steps.length - 1;
  const complete = !dirty && state.index === end;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || dirty) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest('input, textarea, select, button') || target.isContentEditable)) return;
      if (event.code === 'Space') { event.preventDefault(); dispatch({ type: state.playing ? 'pause' : 'play' }); }
      if (event.code === 'ArrowRight') { event.preventDefault(); dispatch({ type: 'next' }); }
      if (event.code === 'ArrowLeft') { event.preventDefault(); dispatch({ type: 'previous' }); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirty, dispatch, state.playing]);

  function generate(nextDraft = draft) {
    const validation = algorithm.validate(nextDraft);
    if (!validation.ok) { setError(validation.error); dispatch({ type: 'pause' }); return; }
    try {
      dispatch({ type: 'load', trace: algorithm.execute(validation.input) });
      setDraft(nextDraft); setDirty(false); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法生成演示，请检查输入后重试。');
    }
  }

  function edit(nextDraft: InputDraft) {
    setDraft(nextDraft); setDirty(true); setError(''); dispatch({ type: 'reset' });
  }

  function selectAlgorithm(next: AlgorithmDefinition) {
    setAlgorithm(next); setDraft(next.example); setDirty(false); setError('');
    dispatch({ type: 'load', trace: exampleTrace(next) });
  }

  return <div className={styles.app}>
    <a className={styles.skipLink} href="#main">跳到演示区</a>
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="./" aria-label="Algo View 首页"><span className={styles.brandMark}><i /><i /><i /></span><span>algo<span className={styles.brandLight}>view</span></span></a>
      <div className={styles.libraryHeading}><Icon name="book" size={17} />算法实验室</div>
      <nav aria-label="选择算法" className={styles.algorithmNav}>
        {algorithms.map(item => <button key={item.id} className={styles.algorithmButton} aria-pressed={item.id === algorithm.id} onClick={() => selectAlgorithm(item)}>
          <span className={styles.algorithmGlyph}>{item.requiresTarget ? '⌕' : '↕'}</span>
          <span><strong>{item.name}</strong><small>{item.englishName}</small></span><Icon name="chevron" size={14} />
        </button>)}
      </nav>
      <div className={styles.sidebarNote}><span className={styles.noteGraphic} aria-hidden="true">[ <b>i</b> ]</span><strong>慢一点，看清每一步。</strong><p>从一行代码，到一次变化。<br />按自己的节奏理解算法。</p></div>
      <div className={styles.sidebarFooter}><span />本地运行 · 自由探索</div>
    </aside>

    <main className={styles.main} id="main">
      <div className={styles.breadcrumb}>算法实验室 <span>/</span> {algorithm.category}<span className={styles.sessionTag}>交互式学习</span></div>
      <header className={styles.pageHeader}>
        <div><div className={styles.titleRow}><h1>{algorithm.name}</h1><span>{algorithm.englishName}</span></div><p>{algorithm.summary}</p></div>
        <dl className={styles.complexity}><div><dt>时间复杂度</dt><dd>{algorithm.complexity.time}</dd></div><div><dt>额外空间</dt><dd>{algorithm.complexity.space}</dd></div></dl>
      </header>

      <form className={styles.inputPanel} onSubmit={event => { event.preventDefault(); generate(); }}>
        <div className={styles.inputHeading}><strong>输入数据</strong><button type="button" className={styles.exampleButton} onClick={() => generate(algorithm.example)}><Icon name="reset" size={14} />使用示例</button></div>
        <div className={styles.inputFields}>
          <div className={styles.arrayField}><label className={styles.srOnly} htmlFor="array-input">数组元素</label><span aria-hidden="true">[</span><input id="array-input" value={draft.values} onChange={event => edit({ ...draft, values: event.target.value })} aria-describedby="input-hint input-status" aria-invalid={Boolean(error)} placeholder="留空可演示空数组" autoComplete="off" spellCheck={false} /><span aria-hidden="true">]</span></div>
          {algorithm.requiresTarget && <label className={styles.targetField} htmlFor="target-input">目标值<input id="target-input" value={draft.target} onChange={event => edit({ ...draft, target: event.target.value })} inputMode="numeric" aria-invalid={Boolean(error)} aria-describedby="input-status" /></label>}
          <button type="submit" className={styles.generateButton}>生成演示<Icon name="chevron" size={15} /></button>
        </div>
        <p id="input-hint" className={styles.inputHint}>{algorithm.inputHint}</p>
        <div id="input-status">{error ? <p className={styles.error} role="alert">{error}</p> : dirty ? <p className={styles.draftHint} role="status">输入已修改，点击「生成演示」开始新一轮。</p> : null}</div>
      </form>

      <div className={styles.workbench}>
        <section className={workspace.visualPanel} aria-labelledby="array-title">
          <header className={workspace.panelHeader}><h2 id="array-title"><Icon name="chart" />数据演示</h2><span className={workspace.status} data-complete={complete}>{dirty ? '等待新输入' : complete ? '已完成' : state.playing ? '播放中' : state.index === 0 ? '初始状态' : '已暂停'}</span></header>
          {dirty ? <div className={workspace.emptyArray}><span>[ … ]</span><strong>准备一组新的数据</strong><p>生成演示后，这里会显示新的执行过程。</p></div> : <ArrayView snapshot={snapshot} animate={state.playing} />}
          <div className={workspace.legend} aria-label="图例"><span><i data-color="default" />待处理</span><span><i data-color="active" />比较 / 交换</span><span><i data-color="sorted" />{algorithm.requiresTarget ? '找到目标' : '已就位'}</span>{algorithm.requiresTarget && <span><i data-color="range" />候选范围</span>}<span className={workspace.indexHint}>下方数字为索引</span></div>
          <div className={workspace.explanation} aria-live={state.playing ? 'off' : 'polite'}>
            <div className={workspace.stepHeading}><span className={workspace.stepKind} data-kind={snapshot.kind}>{dirty ? '等待生成' : kindNames[snapshot.kind]}</span><span>{dirty || state.index === 0 ? '从初始状态出发' : `第 ${state.index} 步`}</span></div>
            <p data-testid="step-explanation">{dirty ? '输入就绪后，点击「生成演示」；再用「下一步」逐条查看。' : snapshot.explanation}</p>
            {!dirty && snapshot.condition && <div className={workspace.condition}><code>{snapshot.condition.expression}</code><span data-result={snapshot.condition.result}>{String(snapshot.condition.result)}</span></div>}
            {complete && <div className={workspace.result} role="status">{state.trace.result.message}</div>}
          </div>
          <div className={workspace.variables}><h3>当前变量</h3><dl>{!dirty && snapshot.variables.length ? snapshot.variables.map(variable => <div key={variable.name}><dt>{variable.name}</dt><dd>{variable.value === null ? '—' : String(variable.value)}</dd></div>) : <p>变量将在执行时出现</p>}</dl></div>
        </section>
        <CodePanel key={algorithm.id} algorithm={algorithm} statementId={dirty ? null : snapshot.statementId} />
      </div>

      <section className={styles.controls} aria-label="播放控制">
        <div className={styles.timeline}><label htmlFor="progress">执行进度</label><input id="progress" type="range" min="0" max={end} value={state.index} disabled={dirty} onChange={event => dispatch({ type: 'seek', index: Number(event.target.value) })} style={{ '--progress': `${state.index / Math.max(1, end) * 100}%` } as CSSProperties} aria-valuetext={`第 ${state.index} 步，共 ${end} 步`} /><output data-testid="progress">{state.index}<span> / {end}</span></output></div>
        <div className={styles.transport}>
          <button className={styles.resetButton} onClick={() => dispatch({ type: 'reset' })} disabled={dirty || state.index === 0 && !state.playing}><Icon name="reset" size={16} /><span>重置</span></button>
          <div className={styles.stepControls}>
            <button onClick={() => dispatch({ type: 'previous' })} disabled={dirty || state.index === 0} aria-label="上一步" title="上一步（←）"><Icon name="previous" size={17} /><span>上一步</span></button>
            <button className={styles.playButton} onClick={() => dispatch({ type: state.playing ? 'pause' : 'play' })} disabled={dirty || complete} aria-label={state.playing ? '暂停' : '播放'} title="播放 / 暂停（空格）"><Icon name={state.playing ? 'pause' : 'play'} size={18} />{state.playing ? '暂停' : '播放'}</button>
            <button onClick={() => dispatch({ type: 'next' })} disabled={dirty || complete} aria-label="下一步" title="下一步（→）"><span>下一步</span><Icon name="next" size={17} /></button>
          </div>
          <label className={styles.speed}>速度<select value={state.speed} onChange={event => dispatch({ type: 'speed', speed: Number(event.target.value) as PlaybackSpeed })} aria-label="播放速度"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
        </div>
      </section>
      <footer className={styles.pageFooter}><span>观察变化，也理解变化的原因。</span><span><kbd>←</kbd><kbd>→</kbd> 单步执行 <kbd>space</kbd> 播放 / 暂停</span></footer>
    </main>
  </div>;
}
