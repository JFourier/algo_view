import type { AlgorithmDefinition } from '../engine/types';
import { binarySearch } from './binary-search';
import { bubbleSort } from './bubble-sort';

export const algorithms: readonly AlgorithmDefinition[] = [bubbleSort, binarySearch];
export { binarySearch, bubbleSort };
