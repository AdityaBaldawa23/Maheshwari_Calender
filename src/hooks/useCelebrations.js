import { useMemo } from 'react';
import { useDataset } from './useSync.js';
import { buildCelebrationIndex } from '../services/celebrations.js';

/** Birthday/anniversary index from the cached directory (empty until it has been downloaded). */
export function useCelebrationIndex() {
  const members = useDataset('directory').snapshot?.data;
  return useMemo(() => buildCelebrationIndex(members), [members]);
}
