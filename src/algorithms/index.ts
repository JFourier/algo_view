import type { AlgorithmDefinition } from '../engine/types';
import { binarySearch } from './binary-search';
import { bubbleSort } from './bubble-sort';
import { quickSort } from './quick-sort';
import { unionFind } from './union-find';
import { insertionSort } from './insertion-sort';
import { linearSearch } from './linear-search';
import { reverseLinkedList } from './reverse-linked-list';
import { recursiveFibonacci } from './recursive-fibonacci';
import { dpFibonacci } from './dp-fibonacci';

export const algorithms: readonly AlgorithmDefinition[] = [bubbleSort, binarySearch, quickSort, unionFind, insertionSort, linearSearch, reverseLinkedList, recursiveFibonacci, dpFibonacci];
export { binarySearch, bubbleSort, quickSort, unionFind, insertionSort, linearSearch, reverseLinkedList, recursiveFibonacci, dpFibonacci };
