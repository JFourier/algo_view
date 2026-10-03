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

export interface LinkedListInput {
  readonly kind: 'linked-list';
  readonly values: readonly number[];
}
export interface IntegerInput {
  readonly kind: 'integer';
  readonly n: number;
}
export type AlgorithmInput = ArrayInput | UnionFindInput | LinkedListInput | IntegerInput;
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
export interface LinkedListDraft {
  readonly kind: 'linked-list';
  readonly values: string;
}
export interface IntegerDraft {
  readonly kind: 'integer';
  readonly n: string;
}
export type InputDraft = ArrayDraft | UnionFindDraft | LinkedListDraft | IntegerDraft;
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
export interface LinkedListState {
  readonly nodes: readonly { readonly id: string; readonly value: number; readonly next: string | null }[];
  readonly head: string | null;
  readonly pointers: readonly { readonly label: string; readonly nodeId: string | null }[];
  readonly change?: { readonly nodeId: string; readonly before: string | null; readonly after: string | null };
}
export interface FibonacciState {
  readonly n: number;
  readonly calls: readonly { readonly n: number; readonly count: number }[];
  readonly result?: number;
}
export interface DpState {
  readonly cells: readonly (number | null)[];
  readonly dependencies: readonly number[];
  readonly activeIndex?: number;
  readonly writtenIndex?: number;
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
  readonly linkedList?: LinkedListState;
  readonly fibonacci?: FibonacciState;
  readonly dp?: DpState;
  /** Array slots retain their actual values, including temporary copies during shifts. */
  readonly insertion?: {
    readonly held: ArrayItem | null;
    readonly write?: { readonly index: number; readonly sourceIndex?: number };
  };
}

export type TraceResult =
  | { readonly kind: 'sorted'; readonly message: string; readonly values?: readonly number[] }
  | { readonly kind: 'found' | 'not-found'; readonly message: string; readonly index: number }
  | { readonly kind: 'linked-list'; readonly message: string; readonly head: string | null; readonly values: readonly number[] }
  | { readonly kind: 'number'; readonly message: string; readonly value: number }
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
  readonly inputKind: 'array' | 'union-find' | 'linked-list' | 'integer';
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
