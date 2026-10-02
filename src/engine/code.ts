import type { CodeLine, Snapshot } from './types';

/** Resolve stable statement identifiers to one-based displayed line numbers. */
export function createStatementMap(code: readonly CodeLine[]): ReadonlyMap<string, number> {
  const statements = new Map<string, number>();
  code.forEach((line, index) => {
    if (line.id === undefined) return;
    if (!line.id.trim()) throw new Error(`第 ${index + 1} 行的语句标识不能为空。`);
    if (statements.has(line.id)) throw new Error(`展示代码包含重复语句标识：${line.id}`);
    statements.set(line.id, index + 1);
  });
  return statements;
}

export function validateStatementMapping(code: readonly CodeLine[], steps: readonly Snapshot[]): void {
  const statements = createStatementMap(code);
  steps.forEach((step, index) => {
    if (index === 0 && step.kind === 'initial' && step.statementId === null) return;
    if (step.kind === 'initial' || step.statementId === null || !statements.has(step.statementId)) {
      throw new Error(`第 ${index} 步无法关联到展示语句：${step.statementId ?? '无标识'}`);
    }
  });
}
