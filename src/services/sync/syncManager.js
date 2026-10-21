/**
 * App-wide sync coordinator.
 *
 * - Cached snapshots are loaded from device storage first (instant, offline).
 * - syncAll() runs on launch, on resume (throttled) and on manual refresh.
 *   No background polling and no real-time listeners.
 * - Subscribers (React hooks) are notified when any dataset state changes.
 * - Calendar startup never waits for this: bundled calendar data renders first.
 *
 * Member directory (protected) — on every sync, for a signed-in member:
 *   1. refresh the ID token (fails → session ended → cached directory deleted)
 *   2. read memberAccess/{uid}: not approved / revoked → cached directory deleted
 *   3. district changed → old district's cache deleted
 *   4. read districts/{district} version; download chunks only if it changed,
 *      verify (counts, checksum, schema) and swap atomically (two-slot store)
 *   A device that is completely OFFLINE cannot learn about a revocation: it keeps
 *   showing its last downloaded district copy until it reconnects (step 2), and at
 *   most ACCESS_MAX_OFFLINE_MS after the last successful access check — after that
 *   the directory stays hidden until access is verified online again.
 */
import { firebaseConfig, remoteEnabled } from '../../config.js';
import { createRemoteSource } from './remoteSource.js';
import { createSnapshotStore } from './snapshotStore.js';
import { syncDataset } from './syncEngine.js';
import {
  calendarIndexDataset, contentDataset, districtDirectoryDataset, emergencyDataset, occasionsDataset,
} from './datasets.js';
import { createMemberAuth, createPreferencesStorage } from '../auth/memberAuth.js';
import { isDistrictId } from '../../shared/districts.js';

/** Automatic syncs (launch/resume) at most this often; manual refresh ignores it. */
export const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;
/** The cached directory is hidden if access could not be re-verified online for this long. */
export const ACCESS_MAX_OFFLINE_MS = 30 * 24 * 60 * 60 * 1000;
/** One access request per device per minute (the server allows one per phone number anyway). */
const REQUEST_INTERVAL_MS = 60 * 1000;

const LAST_SYNC_KEY = 'lastAutoSync';
const ACCESS_KEY = 'mdc.access.state';
const REQUEST_KEY = 'mdc.access.request';
/** Stable empty state (React's useSyncExternalStore needs referentially stable snapshots). */
const EMPTY_STATE = Object.freeze({ snapshot: null, status: 'idle', loaded: false });

export function createSyncManager({
  enabled = remoteEnabled,
  remote = enabled ? createRemoteSource(firebaseConfig) : null,
  auth = enabled ? createMemberAuth({ apiKey: firebaseConfig.apiKey, authEmulatorHost: firebaseConfig.authEmulatorHost }) : null,
  storeFactory = createSnapshotStore,
  kv = createPreferencesStorage(),
  now = () => Date.now(),
  pointerStore = null,
  appVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
} = {}) {
  const stores = new Map();
  const storeFor = (name) => {
    if (!stores.has(name)) stores.set(name, storeFactory(name));
    return stores.get(name);
  };

  /** name → { snapshot, status, error, checkedAt } ; plus 'access' and 'request' */
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

  // ------------------------------------------------------------ member access + directory

  /** Deletes the protected directory from the device (memory + both file slots). */
  async function clearDirectory(status = 'idle') {
    try {
      await storeFor('directory').clear();
    } catch (err) {
      console.warn('[sync] could not clear directory cache', err);
    }
    setState('directory', { snapshot: null, status, loaded: true, error: undefined });
  }

  async function setAccess(access) {
    setState('access', { ...access, loaded: true });
    await (access.status === 'signedOut' ? kv.remove(ACCESS_KEY) : kv.set(ACCESS_KEY, access)).catch(() => {});
  }

  const accessFresh = (access) => access?.status === 'approved' && now() - (access.verifiedAt ?? 0) < ACCESS_MAX_OFFLINE_MS;

  async function syncDirectory() {
    const session = auth?.getSession();
    if (!session) {
      if (state.get('directory')?.snapshot) await clearDirectory();
      return;
    }
    let token;
    try {
      token = await auth.getIdToken();
    } catch (err) {
      if (err?.code === 'session-ended') {
        await clearDirectory();
        await setAccess({ status: 'signedOut', reason: 'ended' });
      } else {
        setState('directory', { status: 'offline' });
      }
      return;
    }

    let record;
    try {
      record = await remote.getDoc(`memberAccess/${session.uid}`, { token });
    } catch (err) {
      setState('directory', { status: err?.offline ? 'offline' : 'error', error: String(err?.message ?? err) });
      return;
    }
    if (!record || record.status !== 'approved' || !isDistrictId(record.district)) {
      await clearDirectory();
      await setAccess({ status: record?.status === 'revoked' ? 'revoked' : 'notApproved', uid: session.uid, phone: session.phone, verifiedAt: now() });
      return;
    }
    const cached = await loadCached('directory');
    if (cached && cached.meta?.district !== record.district) await clearDirectory();
    await setAccess({ status: 'approved', uid: session.uid, phone: session.phone, district: record.district, verifiedAt: now() });

    const result = await runOne(districtDirectoryDataset(record.district, token));
    if (result.status === 'denied') {
      // Access changed between the two reads: never keep data the server refused.
      await clearDirectory('denied');
    }
  }

  async function syncAllNow() {
    if (!enabled) return;
    await Promise.all([runOne(emergencyDataset), runOne(contentDataset), syncDirectory(), syncCalendar()]);
  }

  return {
    enabled,

    /** Loads every cached snapshot (call once at startup; fast, offline). */
    async init() {
      await Promise.all(['emergency', 'content', 'calendar-index'].map(loadCached));
      const years = state.get('calendar-index')?.snapshot?.data ?? {};
      await Promise.all(Object.keys(years).map((y) => loadCached(`occasions-${y}`)));
      if (pointerStore) lastAutoSync = (await pointerStore.get(LAST_SYNC_KEY)) ?? 0;

      // Protected directory: only for the signed-in member's approved district.
      await auth?.load();
      const session = auth?.getSession();
      const saved = session ? await kv.get(ACCESS_KEY) : null;
      const access = saved?.uid === session?.uid ? saved : null;
      setState('request', { ...((await kv.get(REQUEST_KEY)) ?? {}), loaded: true });
      if (!session) {
        // Signed out — also removes a public directory cached by older app versions.
        await setAccess({ status: 'signedOut' });
        await clearDirectory();
        return;
      }
      if (!access || access.status !== 'approved') {
        await setAccess(access ?? { status: 'unverified', uid: session.uid, phone: session.phone });
        await clearDirectory();
        return;
      }
      setState('access', { ...access, loaded: true });
      if (!accessFresh(access)) {
        // Too long without an online check: keep the file, but do not show it until re-verified.
        setState('directory', { snapshot: null, status: 'stale', loaded: true });
        return;
      }
      const cached = await loadCached('directory');
      if (cached && cached.meta?.district !== access.district) await clearDirectory();
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

    /** Signs a member in with mobile number + password, then verifies access and downloads their district. */
    async signIn(phone, password) {
      if (!auth) throw new Error('sign-in is not configured');
      const session = await auth.signIn(phone, password);
      await setAccess({ status: 'unverified', uid: session.uid, phone: session.phone });
      setState('directory', { snapshot: null, status: 'syncing', loaded: true });
      await (running ?? Promise.resolve());
      await syncDirectory();
      return session;
    },

    /** Signs out and deletes the district directory from this device. */
    async signOut() {
      await auth?.signOut();
      await clearDirectory();
      await setAccess({ status: 'signedOut' });
    },

    /**
     * Sends an access request (no account needed). Throws RemoteError: `denied`
     * when the server refused it (e.g. a request for this number already exists).
     */
    async submitAccessRequest({ phone, name, fatherName, district, city, org, note }) {
      if (!enabled) throw new Error('not configured');
      const last = state.get('request');
      if (last?.submittedAt && now() - last.submittedAt < REQUEST_INTERVAL_MS) {
        const err = new Error('please wait');
        err.code = 'too-soon';
        throw err;
      }
      const fields = { name, district };
      for (const [k, v] of Object.entries({ fatherName, city, org, note })) if (v) fields[k] = v;
      if (appVersion) fields.appVersion = appVersion.slice(0, 20);
      await remote.submitAccessRequest(phone, fields);
      const record = { phone, name, district, submittedAt: now() };
      await kv.set(REQUEST_KEY, record).catch(() => {});
      setState('request', { ...record, loaded: true });
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
