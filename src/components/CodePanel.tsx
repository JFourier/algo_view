import { useEffect, useRef, useState } from 'react';
import type { AlgorithmDefinition, ExecutionContext } from '../engine/types';
import { Icon } from './Icon';
import styles from './Workspace.module.css';

type Token = { content: string; color?: string; fontStyle?: number };
const tokenCache = new Map<string, Token[][]>();
let highlighterPromise: ReturnType<typeof loadHighlighter> | undefined;

async function loadHighlighter() {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, language, theme] = await Promise.all([
    import('shiki/core'), import('shiki/engine/javascript'),
    import('shiki/langs/javascript.mjs'), import('shiki/themes/github-light.mjs'),
  ]);
  return createHighlighterCore({ langs: [language.default], themes: [theme.default], engine: createJavaScriptRegexEngine() });
}

export function CodePanel({ algorithm, statementId, execution }: { algorithm: AlgorithmDefinition; statementId: string | null; execution?: ExecutionContext }) {
  const source = algorithm.code.map(line => line.text).join('\n');
  const [tokens, setTokens] = useState<Token[][] | undefined>(() => tokenCache.get(source));
  const scroller = useRef<HTMLDivElement>(null);
  const activeLine = useRef<HTMLSpanElement>(null);
  const lineNumber = algorithm.code.findIndex(line => line.id === statementId) + 1;

  useEffect(() => {
    let cancelled = false;
    const cached = tokenCache.get(source);
    if (cached) { setTokens(cached); return; }
    highlighterPromise ??= loadHighlighter();
    highlighterPromise.then(highlighter => {
      const highlighted = highlighter.codeToTokens(source, { lang: 'javascript', theme: 'github-light' }).tokens;
      tokenCache.set(source, highlighted);
      if (!cancelled) setTokens(highlighted);
    }).catch(() => { /* Readable source remains available if highlighting cannot load. */ });
    return () => { cancelled = true; };
  }, [source]);

  useEffect(() => {
    const container = scroller.current;
    const line = activeLine.current;
    if (!container) return;
    if (!line) { container.scrollTop = 0; return; }
    const top = line.offsetTop;
    if (top < container.scrollTop || top + line.clientHeight > container.scrollTop + container.clientHeight) {
      container.scrollTop = Math.max(0, top - container.clientHeight / 2);
    }
  }, [statementId]);

  return <section className={styles.codePanel} aria-labelledby="code-title">
    <header className={styles.panelHeader}>
      <h2 id="code-title"><Icon name="code" />算法代码</h2>
      <span className={styles.language}>JavaScript <span>只读</span></span>
    </header>
    <div className={styles.codeScroller} ref={scroller} tabIndex={0} aria-label="完整算法代码">
      <pre className={styles.code}><code>{algorithm.code.map((line, index) => {
        const active = Boolean(line.id && line.id === statementId);
        return <span className={styles.codeLine} key={index} data-active={active} data-statement={line.id}
          aria-current={active ? 'step' : undefined} ref={active ? activeLine : undefined}>
          <span className={styles.lineNumber} aria-hidden="true">{active ? '›' : ''}<span>{index + 1}</span></span>
          <span>{tokens?.[index]?.map((token, part) => <span key={part} style={{ color: token.color, fontStyle: token.fontStyle && token.fontStyle & 1 ? 'italic' : undefined }}>{token.content}</span>) ?? line.text}{!line.text && '\u00a0'}</span>
        </span>;
      })}</code></pre>
    </div>
    <footer className={styles.codeFooter}><span className={styles.executionDot} />{lineNumber ? `${execution?.event === 'call' ? '进入函数，调用位于' : execution?.event === 'return' ? '函数返回，刚执行' : '刚执行完成'}第 ${lineNumber} 行${execution ? ` · ${execution.functionName}（${execution.frameId}）` : ''}` : '执行后，这里会标记刚完成的语句'}</footer>
  </section>;
}
