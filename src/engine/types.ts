export interface ArrayItem {
  readonly id: string;
  readonly value: number;
}

export interface CodeLine {
  readonly id?: string;
  readonly text: string;
}

export interface ArrayInput {
  readonly kind?: 'array';
  readonly values: readonly number[];
  readonly target?: number;
}

export type UnionFindOperation =
  | { readonly kind: 'union'; readonly a: number; readonly b: number }
  | { readonly kind: 'find'; readonly x: number };

export interface UnionFindInput {
  readonly kind: 'union-find';
  readonly nodeCount: number;
  readonly operations: readonly UnionFindOperation[];
  readonly pathCompression: boolean;
}

export type AlgorithmInput = ArrayInput | UnionFindInput;
export interface ArrayDraft {
  readonly kind?: 'array';
  readonly values: string;
  readonly target: string;
}
export interface UnionFindDraft {
  readonly kind: 'union-find';
  readonly nodeCount: string;
  readonly operations: string;
  readonly pathCompression: boolean;
}
export type InputDraft = ArrayDraft | UnionFindDraft;
export type ValidationResult =
  | { readonly ok: true; readonly input: AlgorithmInput }
  | { readonly ok: false; readonly error: string };

export interface Variable {
  readonly name: string;
  readonly value: number | boolean | string | null;
}
export interface CallFrame {
  readonly id: string;
  readonly functionName: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly parameters: readonly Variable[];
  readonly locals: readonly Variable[];
}
export interface ExecutionContext {
  readonly event: 'statement' | 'call' | 'return';
  /** Owner of the executed statement; a returned frame may already be popped. */
  readonly frameId: string;
  readonly functionName: string;
  readonly activeFrameId: string | null;
  readonly returnedValue?: number | string;
}
export interface UnionFindOperationResult {
  readonly operationIndex: number;
  readonly operation: UnionFindOperation;
  readonly root: number;
  readonly merged?: boolean;
  readonly message: string;
}
export interface UnionFindState {
  readonly parent: readonly number[];
  readonly size: readonly number[];
  readonly count: number;
  readonly path: readonly number[];
  readonly roots: readonly number[];
  readonly parentChange?: { readonly node: number; readonly before: number; readonly after: number };
  readonly operationIndex: number | null;
  readonly results: readonly UnionFindOperationResult[];
}
export interface Snapshot {
  readonly statementId: string | null;
  readonly kind: 'initial' | 'assign' | 'condition' | 'compare' | 'swap' | 'range' | 'call' | 'return' | 'visit' | 'link' | 'compress' | 'operation' | 'complete';
  readonly explanation: string;
  readonly condition?: { readonly expression: string; readonly result: boolean };
  readonly variables: readonly Variable[];
  readonly items: readonly ArrayItem[];
  readonly markers: {
    readonly active?: readonly number[];
    readonly sorted?: readonly number[];
    readonly range?: { readonly start: number; readonly end: number; readonly label?: string };
    readonly pointers?: readonly { readonly label: string; readonly index: number }[];
    readonly found?: number;
    readonly pivot?: { readonly id: string; readonly value: number; readonly index: number };
  };
  readonly callStack?: readonly CallFrame[];
  readonly execution?: ExecutionContext;
  readonly unionFind?: UnionFindState;
}

export type TraceResult =
  | { readonly kind: 'sorted'; readonly message: string; readonly values?: readonly number[] }
  | { readonly kind: 'found' | 'not-found'; readonly message: string; readonly index: number }
  | { readonly kind: 'union-find'; readonly message: string; readonly parent: readonly number[]; readonly size: readonly number[]; readonly count: number; readonly operations: readonly UnionFindOperationResult[] };
export interface Trace {
  readonly algorithmId: string;
  readonly input: AlgorithmInput;
  /** Index zero is the state before any statement has executed. */
  readonly steps: readonly Snapshot[];
  readonly result: TraceResult;
}

export interface AlgorithmDefinition {
  readonly id: string;
  readonly inputKind: 'array' | 'union-find';
  readonly name: string;
  readonly englishName: string;
  readonly category: string;
  readonly summary: string;
  readonly complexity: { readonly time: string; readonly space: string };
  readonly inputHint: string;
  readonly requiresTarget: boolean;
  readonly example: InputDraft;
  readonly examples?: readonly { readonly name: string; readonly draft: InputDraft }[];
  readonly code: readonly CodeLine[];
  validate(draft: InputDraft): ValidationResult;
  execute(input: AlgorithmInput, options?: { readonly maxSteps?: number }): Trace;
}
