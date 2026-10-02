import type { AlgorithmDefinition } from '../engine/types';
import { binarySearch } from './binary-search';
import { bubbleSort } from './bubble-sort';
import { quickSort } from './quick-sort';
import { unionFind } from './union-find';

export const algorithms: readonly AlgorithmDefinition[] = [bubbleSort, binarySearch, quickSort, unionFind];
export { binarySearch, bubbleSort, quickSort, unionFind };
