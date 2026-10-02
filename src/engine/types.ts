export interface ArrayItem {
  readonly id: string;
  readonly value: number;
}

export interface CodeLine {
  readonly id?: string;
  readonly text: string;
}

export interface AlgorithmInput {
  readonly values: readonly number[];
  readonly target?: number;
}

export interface InputDraft {
  readonly values: string;
  readonly target: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly input: AlgorithmInput }
  | { readonly ok: false; readonly error: string };

export interface Snapshot {
  readonly statementId: string | null;
  readonly kind: 'initial' | 'assign' | 'condition' | 'compare' | 'swap' | 'range' | 'complete';
  readonly explanation: string;
  readonly condition?: { readonly expression: string; readonly result: boolean };
  readonly variables: readonly { readonly name: string; readonly value: number | boolean | string | null }[];
  readonly items: readonly ArrayItem[];
  readonly markers: {
    readonly active?: readonly number[];
    readonly sorted?: readonly number[];
    readonly range?: { readonly start: number; readonly end: number };
    readonly pointers?: readonly { readonly label: string; readonly index: number }[];
    readonly found?: number;
  };
}

export interface Trace {
  readonly algorithmId: string;
  readonly input: AlgorithmInput;
  /** Index zero is the state before any statement has executed. */
  readonly steps: readonly Snapshot[];
  readonly result: { readonly kind: 'sorted' | 'found' | 'not-found'; readonly message: string; readonly index?: number };
}

export interface AlgorithmDefinition {
  readonly id: string;
  readonly name: string;
  readonly englishName: string;
  readonly category: string;
  readonly summary: string;
  readonly complexity: { readonly time: string; readonly space: string };
  readonly inputHint: string;
  readonly requiresTarget: boolean;
  readonly example: InputDraft;
  readonly code: readonly CodeLine[];
  validate(draft: InputDraft): ValidationResult;
  execute(input: AlgorithmInput, options?: { readonly maxSteps?: number }): Trace;
}
