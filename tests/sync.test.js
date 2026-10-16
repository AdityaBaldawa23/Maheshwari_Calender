import { describe, expect, it, vi } from 'vitest';
import { createSnapshotStore } from '../src/services/sync/snapshotStore.js';
import { syncDataset } from '../src/services/sync/syncEngine.js';
import { createSyncManager } from '../src/services/sync/syncManager.js';
import { directoryDataset, emergencyDataset, occasionsDataset } from '../src/services/sync/datasets.js';
import { buildDirectorySnapshot, chunkId } from '../src/shared/snapshot.js';
import { createRemoteSource } from '../src/services/sync/remoteSource.js';
import { decodeDocument } from '../src/shared/firestoreRest.js';
import { createLocalCalendarRepository } from '../src/repositories/LocalCalendarRepository.js';
import { createCalendarService } from '../src/services/calendarService.js';
import { createReminderService } from '../src/services/reminderService.js';
import { createNotificationService } from '../src/services/notificationService.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/services/settings.js';
import { EMERGENCY_SCHEMA_VERSION, emptyContact, emptyHospital } from '../src/shared/emergencySchema.js';

/** "Device storage" that survives store re-creation (= app restart). */
function fakeDevice() {
  const files = new Map();
  const prefs = new Map();
  return {
    files,
    prefs,
    deps: {
      files: { read: async (n) => files.get(n) ?? null, write: async (n, t) => void files.set(n, t) },
      pointer: { get: async (k) => prefs.get(k) ?? null, set: async (k, v) => void prefs.set(k, v) },
    },
  };
}

function fakeRemote(docs) {
  return {
    calls: 0,
    async getDoc(path) {
      this.calls++;
      if (docs.offline) throw Object.assign(new Error('offline'), { offline: true });
      return structuredClone(docs[path] ?? null);
    },
    async getDocs(paths) {
      this.calls++;
      if (docs.offline) throw Object.assign(new Error('offline'), { offline: true });
      return paths.map((p) => structuredClone(docs[p] ?? null));
    },
  };
}

function publishDirectory(docs, members, version) {
  const { meta, chunks } = buildDirectorySnapshot(members, { version, publishedAt: 'now' });
  docs['published/directory'] = meta;
  chunks.forEach((c) => (docs[`published/directory/chunks/${chunkId(version, c.index)}`] = c));
}

const M = (id, nameHi) => ({ id, nameHi });

describe('snapshot store', () => {
  it('persists across restarts and survives a corrupted active file', async () => {
    const device = fakeDevice();
    await createSnapshotStore('directory', device.deps).save({ version: 1 }, ['a']);
    await createSnapshotStore('directory', device.deps).save({ version: 2 }, ['b']);
    const restarted = createSnapshotStore('directory', device.deps);
    expect((await restarted.load()).data).toEqual(['b']);

    // Corrupt the active slot: the previous valid snapshot is used instead.
    const active = device.prefs.get('directory').slot;
    device.files.set(`directory-${active}.json`, '{"meta":{"version":2},"data":[tru');
    expect((await restarted.load()).data).toEqual(['a']);
  });

  it('keeps the previous snapshot if the app dies mid-write (pointer never flipped)', async () => {
    const device = fakeDevice();
    const store = createSnapshotStore('directory', device.deps);
    await store.save({ version: 1 }, ['old']);
    const failing = { ...device.deps, files: { ...device.deps.files, write: async (n) => void device.files.set(n, '{"meta":{"ver') } };
    await expect(createSnapshotStore('directory', failing).save({ version: 2 }, ['new'])).rejects.toThrow();
    expect((await createSnapshotStore('directory', device.deps).load()).data).toEqual(['old']);
  });

  it('returns null on a new device (never downloaded)', async () => {
    expect(await createSnapshotStore('directory', fakeDevice().deps).load()).toBeNull();
  });
});

describe('dataset sync', () => {
  it('downloads once, then only checks the version (no re-download)', async () => {
    const docs = {};
    publishDirectory(docs, [M('M1', 'राम'), M('M2', 'सीता')], 100);
    const remote = fakeRemote(docs);
    const store = createSnapshotStore('directory', fakeDevice().deps);

    const first = await syncDataset({ dataset: directoryDataset, store, remote });
    expect(first.status).toBe('updated');
    expect(first.snapshot.data.map((m) => m.id).sort()).toEqual(['M1', 'M2']);
    const callsAfterFirst = remote.calls;

    const second = await syncDataset({ dataset: directoryDataset, store, remote });
    expect(second.status).toBe('current');
    expect(remote.calls - callsAfterFirst).toBe(1); // just the meta document
  });

  it('a failed or invalid update preserves the previous valid snapshot', async () => {
    const docs = {};
    publishDirectory(docs, [M('M1', 'राम')], 100);
    const remote = fakeRemote(docs);
    const store = createSnapshotStore('directory', fakeDevice().deps);
    await syncDataset({ dataset: directoryDataset, store, remote });

    // New version published, but one chunk is corrupted (checksum mismatch).
    publishDirectory(docs, [M('M1', 'राम'), M('M2', 'सीता')], 200);
    docs[`published/directory/chunks/${chunkId(200, 0)}`].members[0].nameHi = 'छेड़छाड़';
    const bad = await syncDataset({ dataset: directoryDataset, store, remote });
    expect(bad.status).toBe('error');
    expect(bad.snapshot.data.map((m) => m.id)).toEqual(['M1']);
    expect((await store.load()).meta.version).toBe(100);

    // Network failure: still the old snapshot.
    docs.offline = true;
    const offline = await syncDataset({ dataset: directoryDataset, store, remote });
    expect(offline.status).toBe('offline');
    expect(offline.snapshot.meta.version).toBe(100);
  });

  it('rejects an unsupported schema version', async () => {
    const docs = {};
    publishDirectory(docs, [M('M1', 'राम')], 100);
    docs['published/directory'].schemaVersion = 99;
    const result = await syncDataset({ dataset: directoryDataset, store: createSnapshotStore('d', fakeDevice().deps), remote: fakeRemote(docs) });
    expect(result).toMatchObject({ status: 'error', snapshot: null });
  });

  it('serialises concurrent syncs of the same dataset (single download, consistent state)', async () => {
    const docs = {};
    publishDirectory(docs, [M('M1', 'राम')], 100);
    const remote = fakeRemote(docs);
    const device = fakeDevice();
    const store = createSnapshotStore('directory', device.deps);
    const results = await Promise.all([1, 2, 3].map(() => syncDataset({ dataset: directoryDataset, store, remote })));
    expect(results.map((r) => r.status).sort()).toEqual(['current', 'current', 'updated']);
    expect((await store.load()).meta.version).toBe(100);
  });

  it('validates emergency documents before accepting them', async () => {
    const good = {
      version: 5,
      schemaVersion: EMERGENCY_SCHEMA_VERSION,
      contacts: [1, 2, 3, 4].map(emptyContact),
      hospitals: [1, 2, 3, 4].map(emptyHospital),
      services: [{ id: 'police', name: 'पुलिस', phone: '112', active: true }],
    };
    const store = createSnapshotStore('emergency', fakeDevice().deps);
    expect((await syncDataset({ dataset: emergencyDataset, store, remote: fakeRemote({ 'published/emergency': good }) })).status).toBe('updated');
    const bad = { ...good, version: 6, contacts: [{ ...emptyContact(1), active: true, name: 'X', phone: 'abc' }, ...good.contacts.slice(1)] };
    const r = await syncDataset({ dataset: emergencyDataset, store, remote: fakeRemote({ 'published/emergency': bad }) });
    expect(r.status).toBe('error');
    expect(r.snapshot.meta.version).toBe(5);
  });

  it('rejects published occasions with duplicates or invalid entries', async () => {
    const occ = { id: 'x', date: '2027-01-01', title: { hi: 'पर्व' }, category: 'festival', importance: 'low' };
    const store = createSnapshotStore('o', fakeDevice().deps);
    const dup = { 'published/occasions_2027': { version: 1, year: 2027, occasions: [occ, occ] } };
    expect((await syncDataset({ dataset: occasionsDataset(2027), store, remote: fakeRemote(dup) })).status).toBe('error');
  });
});

describe('sync manager', () => {
  const managerFor = (docs, device = fakeDevice()) =>
    createSyncManager({ enabled: true, remote: fakeRemote(docs), storeFactory: (name) => createSnapshotStore(name, device.deps) });

  it('new device without connection: no cached directory, honest offline state', async () => {
    const mgr = managerFor({ offline: true });
    await mgr.init();
    await mgr.syncAll({ force: true });
    expect(mgr.get('directory')).toMatchObject({ snapshot: null, status: 'offline' });
  });

  it('after one successful sync the directory is available offline after restart', async () => {
    const docs = {};
    publishDirectory(docs, [M('M1', 'राम')], 100);
    const device = fakeDevice();
    const online = managerFor(docs, device);
    await online.init();
    await online.syncAll({ force: true });

    const restartedOffline = managerFor({ offline: true }, device);
    await restartedOffline.init();
    expect(restartedOffline.get('directory').snapshot.data).toEqual([M('M1', 'राम')]);
  });

  it('throttles automatic syncs but honours manual refresh', async () => {
    const docs = {};
    publishDirectory(docs, [M('M1', 'राम')], 100);
    const remote = fakeRemote(docs);
    const device = fakeDevice();
    let clock = 1_000_000;
    const mgr = createSyncManager({ enabled: true, remote, now: () => clock, storeFactory: (n) => createSnapshotStore(n, device.deps) });
    await mgr.syncAll();
    const calls = remote.calls;
    clock += 60_000;
    await mgr.syncAll(); // within 30 min → skipped
    expect(remote.calls).toBe(calls);
    await mgr.syncAll({ force: true });
    expect(remote.calls).toBeGreaterThan(calls);
  });

  it('does nothing when Firebase is not configured', async () => {
    const mgr = createSyncManager({ enabled: false });
    await mgr.syncAll({ force: true });
    expect(mgr.get('directory').snapshot).toBeNull();
  });
});

describe('published occasions → calendar → reminders', () => {
  it('replaces bundled occasions, and re-syncing reminders does not duplicate notifications', async () => {
    const occasion = {
      id: 'samaj-sammelan', date: '2027-06-20', title: { hi: 'समाज सम्मेलन' }, category: 'event', importance: 'high',
      reminder: { enabled: true, defaultTime: '08:00' },
    };
    const docs = {
      'published/calendar': { version: 9, years: { 2027: 3 } },
      'published/occasions_2027': { version: 3, year: 2027, verified: true, occasions: [occasion] },
    };
    const device = fakeDevice();
    const mgr = createSyncManager({ enabled: true, remote: fakeRemote(docs), storeFactory: (n) => createSnapshotStore(n, device.deps) });
    const changed = vi.fn();
    mgr.onOccasionsChanged(changed);
    await mgr.init();
    await mgr.syncAll({ force: true });
    expect(changed).toHaveBeenCalledWith([2027]);

    const repo = createLocalCalendarRepository({
      calendarModules: { '../data/calendar/2027.json': async () => ({ year: 2027, meta: {}, days: {} }) },
      occasionModules: { '../data/occasions/2027.json': async () => ({ year: 2027, occasions: [{ ...occasion, id: 'bundled-only', date: '2027-06-21' }] }) },
      recurring: [],
      loadAds: async () => ({ ads: [] }),
      loadNotices: async () => ({ notices: [] }),
      getOccasionOverride: (y) => mgr.getOccasionOverride(y),
    });
    const calendar = createCalendarService(repo);
    expect((await calendar.getOccasionsForDate('2027-06-20')).map((o) => o.id)).toEqual(['samaj-sammelan']);
    expect(await calendar.getOccasionsForDate('2027-06-21')).toEqual([]);
    expect((await calendar.getDateInfo('2027-06-20')).verified.occasions).toBe(true);

    // Reminders: two syncs (e.g. data update + app restart) keep exactly one notification.
    const pending = new Map();
    const plugin = {
      checkPermissions: async () => ({ display: 'granted' }),
      createChannel: async () => {},
      getPending: async () => ({ notifications: [...pending.values()] }),
      schedule: async ({ notifications }) => notifications.forEach((n) => pending.set(n.id, { ...n, schedule: { at: n.schedule.at } })),
      cancel: async ({ notifications }) => notifications.forEach((n) => pending.delete(n.id)),
      addListener: () => ({ remove() {} }),
    };
    const reminders = createReminderService({ calendar, notifications: createNotificationService({ plugin, isNative: true }) });
    const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, remindersEnabled: true, groups: { festival: true, community: true, vrat: false } });
    const now = new Date(2027, 5, 1, 9, 0);
    await reminders.sync(settings, now);
    await reminders.sync(settings, now);
    expect([...pending.values()].map((n) => n.extra.occasionId)).toEqual(['samaj-sammelan']);
  });
});

describe('Firestore REST decoding', () => {
  it('decodes nested maps, arrays and number types', () => {
    const doc = {
      fields: {
        version: { integerValue: '1712345678901' },
        verified: { booleanValue: true },
        members: { arrayValue: { values: [{ mapValue: { fields: { id: { stringValue: 'M1' }, age: { integerValue: '45' } } } }] } },
        empty: { arrayValue: {} },
        ratio: { doubleValue: 0.5 },
        nothing: { nullValue: null },
      },
    };
    expect(decodeDocument(doc)).toEqual({ version: 1712345678901, verified: true, members: [{ id: 'M1', age: 45 }], empty: [], ratio: 0.5, nothing: null });
  });

  it('uses unauthenticated GET/batchGet against published paths only', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (url.includes(':batchGet')) return { ok: true, status: 200, json: async () => [{ missing: 'x' }] };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const remote = createRemoteSource({ projectId: 'demo-mdc', apiKey: 'k', fetchImpl });
    expect(await remote.getDoc('published/directory')).toBeNull();
    expect(await remote.getDocs(['published/directory/chunks/1_0'])).toEqual([null]);
    expect(calls[0].url).toBe('https://firestore.googleapis.com/v1/projects/demo-mdc/databases/(default)/documents/published/directory?key=k');
    expect(calls.every((c) => !c.init?.headers?.Authorization)).toBe(true);
  });
});
