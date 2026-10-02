import type { AlgorithmInput, ArrayInput, InputDraft, ValidationResult } from './types';

export const MAX_INPUT_LENGTH = 24;
export const MIN_VALUE = -999;
export const MAX_VALUE = 999;

interface InputRules {
  readonly requiresTarget: boolean;
  readonly sorted?: boolean;
}

function valueError(value: unknown): boolean {
  return typeof value !== 'number' || !Number.isInteger(value) || value < MIN_VALUE || value > MAX_VALUE;
}

function inputError(input: AlgorithmInput, rules: InputRules): string | null {
  if (input.kind === 'union-find') return '此算法需要数组输入。';
  if (!Array.isArray(input.values)) return '请输入整数数组。';
  if (input.values.length > MAX_INPUT_LENGTH) return `最多输入 ${MAX_INPUT_LENGTH} 个整数。`;
  if (Array.from(input.values).some(valueError)) return `数组元素必须是 ${MIN_VALUE} 到 ${MAX_VALUE} 之间的整数。`;
  if (rules.requiresTarget && valueError(input.target)) return `目标值必须是 ${MIN_VALUE} 到 ${MAX_VALUE} 之间的整数。`;
  if (rules.sorted && input.values.some((value, index) => index > 0 && value < input.values[index - 1])) {
    return '二分查找要求数组按升序排列（允许重复值），请先调整输入。';
  }
  return null;
}

export function assertValidInput(input: AlgorithmInput, rules: InputRules): asserts input is ArrayInput {
  const error = inputError(input, rules);
  if (error) throw new Error(error);
}

export function validateDraft(draft: InputDraft, rules: InputRules): ValidationResult {
  if (draft.kind === 'union-find') return { ok: false, error: '此算法需要数组输入。' };
  const text = draft.values.trim().replaceAll('，', ',');
  const groups = text ? text.split(',') : [];
  if (groups.some((group) => !group.trim())) {
    return { ok: false, error: '逗号之间需要一个整数；空数组请直接留空。' };
  }
  const tokens = groups.flatMap((group) => group.trim().split(/\s+/));
  if (tokens.some((token) => !/^[+-]?\d+$/.test(token))) {
    return { ok: false, error: '请用逗号或空格分隔整数，例如：8, 3, 5, 1。' };
  }
  const targetText = draft.target.trim();
  if (rules.requiresTarget && !/^[+-]?\d+$/.test(targetText)) {
    return { ok: false, error: '请输入一个整数作为查找目标。' };
  }
  const input: AlgorithmInput = rules.requiresTarget
    ? { values: tokens.map(Number), target: Number(targetText) }
    : { values: tokens.map(Number) };
  const error = inputError(input, rules);
  return error ? { ok: false, error } : { ok: true, input };
}
