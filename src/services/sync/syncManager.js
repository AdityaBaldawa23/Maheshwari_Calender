/**
 * App-wide sync coordinator.
 *
 * - Cached snapshots are loaded from device storage first (instant, offline).
 * - syncAll() runs on launch, on resume (throttled) and on manual refresh.
 *   No background polling and no real-time listeners.
 * - Subscribers (React hooks) are notified when any dataset state changes.
 * - Calendar startup never waits for this: bundled calendar data renders first.
 */
import { firebaseConfig, remoteEnabled } from '../../config.js';
import { createRemoteSource } from './remoteSource.js';
import { createSnapshotStore } from './snapshotStore.js';
import { syncDataset } from './syncEngine.js';
import {
  calendarIndexDataset, contentDataset, directoryDataset, emergencyDataset, occasionsDataset,
} from './datasets.js';

/** Automatic syncs (launch/resume) at most this often; manual refresh ignores it. */
export const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;

const LAST_SYNC_KEY = 'lastAutoSync';
/** Stable empty state (React's useSyncExternalStore needs referentially stable snapshots). */
const EMPTY_STATE = Object.freeze({ snapshot: null, status: 'idle', loaded: false });

export function createSyncManager({
  enabled = remoteEnabled,
  remote = enabled ? createRemoteSource(firebaseConfig) : null,
  storeFactory = createSnapshotStore,
  now = () => Date.now(),
  pointerStore = null,
} = {}) {
  const stores = new Map();
  const storeFor = (name) => {
    if (!stores.has(name)) stores.set(name, storeFactory(name));
    return stores.get(name);
  };

  /** name → { snapshot, status, error, checkedAt } */
  const state = new Map();
  const listeners = new Set();
  const occasionListeners = new Set();
  let lastAutoSync = 0;
  let running = null;

  const emit = () => listeners.forEach((l) => l());
  const setState = (name, patch) => {
    state.set(name, { ...(state.get(name) ?? { snapshot: null, status: 'idle' }), ...patch });
    emit();
  };

  async function loadCached(name) {
    if (state.get(name)?.loaded) return state.get(name).snapshot;
    let snapshot = null;
    try {
      snapshot = await storeFor(name).load();
    } catch (err) {
      console.warn(`[sync] could not read cached ${name}`, err);
    }
    setState(name, { snapshot, loaded: true, status: state.get(name)?.status ?? 'idle' });
    return snapshot;
  }

  async function runOne(dataset) {
    setState(dataset.name, { status: 'syncing' });
    const result = await syncDataset({ dataset, store: storeFor(dataset.name), remote });
    setState(dataset.name, {
      snapshot: result.snapshot,
      status: result.status,
      error: result.error,
      checkedAt: new Date(now()).toISOString(),
      loaded: true,
    });
    if (result.status === 'error') console.warn(`[sync] ${dataset.name}: ${result.error}`);
    return result;
  }

  async function syncCalendar() {
    const index = await runOne(calendarIndexDataset);
    const years = index.snapshot?.data ?? {};
    const changed = [];
    for (const [year, version] of Object.entries(years)) {
      const name = `occasions-${year}`;
      const cached = await loadCached(name);
      if (cached?.meta?.version === version) continue;
      const r = await runOne(occasionsDataset(Number(year)));
      if (r.status === 'updated') changed.push(Number(year));
    }
    if (changed.length) occasionListeners.forEach((l) => l(changed));
  }

  async function syncAllNow() {
    if (!enabled) return;
    await Promise.all([runOne(emergencyDataset), runOne(contentDataset), runOne(directoryDataset), syncCalendar()]);
  }

  return {
    enabled,

    /** Loads every cached snapshot (call once at startup; fast, offline). */
    async init() {
      await Promise.all(['directory', 'emergency', 'content', 'calendar-index'].map(loadCached));
      const years = state.get('calendar-index')?.snapshot?.data ?? {};
      await Promise.all(Object.keys(years).map((y) => loadCached(`occasions-${y}`)));
      if (pointerStore) lastAutoSync = (await pointerStore.get(LAST_SYNC_KEY)) ?? 0;
    },

    /** Runs a sync unless one ran recently (`force` for manual refresh). Never throws. */
    async syncAll({ force = false } = {}) {
      if (!enabled) return;
      if (running) return running;
      if (!force && now() - lastAutoSync < AUTO_SYNC_INTERVAL_MS) return;
      lastAutoSync = now();
      pointerStore?.set(LAST_SYNC_KEY, lastAutoSync);
      running = syncAllNow()
        .catch((err) => console.warn('[sync] failed', err))
        .finally(() => {
          running = null;
        });
      return running;
    },

    get(name) {
      return state.get(name) ?? EMPTY_STATE;
    },

    /** Cached occasions for a year (admin-published), or null to use bundled data. */
    async getOccasionOverride(year) {
      const snap = await loadCached(`occasions-${year}`);
      return snap?.data ?? null;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    onOccasionsChanged(listener) {
      occasionListeners.add(listener);
      return () => occasionListeners.delete(listener);
    },
  };
}

export const syncManager = createSyncManager();
