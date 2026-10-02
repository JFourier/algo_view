import { createStatementMap, validateStatementMapping } from './code';
import type { AlgorithmInput, CodeLine, Snapshot, Trace } from './types';

export const DEFAULT_MAX_STEPS = 5000;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function frozenCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

/** A bounded recorder; playback consumes only the immutable result of finish. */
export function createTraceRecorder(
  algorithmId: string,
  input: AlgorithmInput,
  code: readonly CodeLine[],
  options?: { readonly maxSteps?: number },
) {
  const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) {
    throw new Error('执行步数上限必须是正整数。');
  }
  createStatementMap(code);
  const steps: Snapshot[] = [];
  const inputCopy = frozenCopy(input);
  return {
    record(snapshot: Snapshot): void {
      if (steps.length >= maxSteps) throw new Error(`执行记录超过 ${maxSteps} 步上限，请减少输入规模。`);
      steps.push(frozenCopy(snapshot));
    },
    finish(result: Trace['result']): Trace {
      if (steps[0]?.kind !== 'initial' || steps[0].statementId !== null) {
        throw new Error('执行记录必须从尚未执行语句的初始状态开始。');
      }
      if (steps.at(-1)?.kind !== 'complete') throw new Error('执行记录缺少明确的结束状态。');
      validateStatementMapping(code, steps);
      return deepFreeze({ algorithmId, input: inputCopy, steps: [...steps], result: frozenCopy(result) });
    },
  };
}
