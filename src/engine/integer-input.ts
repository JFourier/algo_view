import type { AlgorithmInput, InputDraft, IntegerInput, ValidationResult } from './types';

/** Shared small range so both Fibonacci implementations can replay the same input. */
export const MAX_FIBONACCI_N = 10;

function integerError(n: unknown): string | null {
  return typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_FIBONACCI_N
    ? `n 必须是 0 到 ${MAX_FIBONACCI_N} 之间的整数。`
    : null;
}

export function assertValidIntegerInput(input: AlgorithmInput): asserts input is IntegerInput {
  if (input.kind !== 'integer') throw new Error('此算法需要整数 n 作为输入。');
  const error = integerError(input.n);
  if (error) throw new Error(error);
}

export function validateIntegerDraft(draft: InputDraft): ValidationResult {
  if (draft.kind !== 'integer') return { ok: false, error: '此算法需要整数 n 作为输入。' };
  const text = draft.n.trim();
  if (!/^[+-]?\d+$/.test(text)) return { ok: false, error: '请输入一个整数 n，例如：5。' };
  const n = Number(text);
  const error = integerError(n);
  return error ? { ok: false, error } : { ok: true, input: { kind: 'integer', n } };
}
