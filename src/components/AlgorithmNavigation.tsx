import { useId, useState } from 'react';
import type { AlgorithmDefinition } from '../engine/types';
import { Icon } from './Icon';
import styles from './AlgorithmNavigation.module.css';

export function AlgorithmNavigation({ algorithms, selectedId, onSelect }: {
  algorithms: readonly AlgorithmDefinition[];
  selectedId: string;
  onSelect: (algorithm: AlgorithmDefinition) => void;
}) {
  const id = useId();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const categories = new Map<string, AlgorithmDefinition[]>();
  for (const algorithm of algorithms) {
    const group = categories.get(algorithm.category);
    if (group) group.push(algorithm);
    else categories.set(algorithm.category, [algorithm]);
  }

  function toggle(category: string) {
    setCollapsed(previous => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return <nav aria-label="选择算法" className={styles.navigation}>
    <ul className={styles.categories}>
      {[...categories].map(([category, items], index) => {
        const expanded = !collapsed.has(category);
        const containsSelection = items.some(item => item.id === selectedId);
        const groupId = `${id}-category-${index}`;
        return <li key={category}>
          <button type="button" className={styles.categoryButton} aria-expanded={expanded} aria-controls={groupId}
            data-active={containsSelection} onClick={() => toggle(category)}>
            <Icon name="chevron" size={13} />
            <span>{category}</span>
            {!expanded && containsSelection && <small className={styles.currentLabel}>当前</small>}
            <span className={styles.count} aria-label={`${items.length} 个算法`}>{items.length}</span>
          </button>
          <ul id={groupId} className={styles.algorithms} hidden={!expanded} aria-label={`${category}分类`}>
            {items.map(item => <li key={item.id}>
              <button type="button" className={styles.algorithmButton} aria-pressed={item.id === selectedId}
                aria-current={item.id === selectedId ? 'page' : undefined} onClick={() => onSelect(item)}>
                <span><strong>{item.name}</strong><small>{item.englishName}</small></span>
                <Icon name="chevron" size={13} />
              </button>
            </li>)}
          </ul>
        </li>;
      })}
    </ul>
  </nav>;
}
