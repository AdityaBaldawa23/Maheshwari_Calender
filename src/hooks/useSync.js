import { useSyncExternalStore } from 'react';
import { syncManager } from '../services/sync/syncManager.js';

/** Live state of one synced dataset: { snapshot, status, error, checkedAt, loaded }. */
export function useDataset(name) {
  return useSyncExternalStore(
    (listener) => syncManager.subscribe(listener),
    () => syncManager.get(name),
  );
}
