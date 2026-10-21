import { describe, expect, it, vi } from 'vitest';
import { createSnapshotStore } from '../src/services/sync/snapshotStore.js';
import { syncDataset } from '../src/services/sync/syncEngine.js';
import { ACCESS_MAX_OFFLINE_MS, createSyncManager } from '../src/services/sync/syncManager.js';
import { districtDirectoryDataset, emergencyDataset, occasionsDataset } from '../src/services/sync/datasets.js';
import { buildDirectorySnapshot, chunkId } from '../src/shared/snapshot.js';
import { createRemoteSource } from '../src/services/sync/remoteSource.js';
import { decodeDocument } from '../src/shared/firestoreRest.js';
import { buildCelebrationIndex, celebrationsOn } from '../src/services/celebrations.js';
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
  const kv = new Map();
  return {
    files,
    prefs,
    kv: {
      get: async (k) => structuredClone(kv.get(k) ?? null),
      set: async (k, v) => void kv.set(k, structuredClone(v)),
      remove: async (k) => void kv.delete(k),
    },
    deps: {
      files: { read: async (n) => files.get(n) ?? null, write: async (n, t) => void files.set(n, t), remove: async (n) => void files.delete(n) },
      pointer: { get: async (k) => prefs.get(k) ?? null, set: async (k, v) => void prefs.set(k, v), remove: async (k) => void prefs.delete(k) },
    },
  };
}

const denied = () => Object.assign(new Error('HTTP 403'), { status: 403, denied: true });

/**
 * Firestore stand-in that enforces the same access rule as firestore.rules for
 * districts/**: the token (= uid here) must have memberAccess approved for that district.
 */
function fakeRemote(docs) {
  const allowed = (path, token) => {
    const m = /^districts\/([^/]+)/.exec(path);
    if (m) {
      const access = docs[`memberAccess/${token}`];
      return Boolean(token && access?.status === 'approved' && access.district === m[1]);
    }
    if (path.startsWith('memberAccess/')) return Boolean(token) && path === `memberAccess/${token}`;
    return path.startsWith('published/');
  };
  return {
    calls: 0,
    paths: [],
    async getDoc(path, { token } = {}) {
      this.calls++;
      this.paths.push(path);
      if (docs.offline) throw Object.assign(new Error('offline'), { offline: true });
      if (!allowed(path, token)) throw denied();
      return structuredClone(docs[path] ?? null);
    },
    async getDocs(paths, { token } = {}) {
      this.calls++;
      this.paths.push(...paths);
      if (docs.offline) throw Object.assign(new Error('offline'), { offline: true });
      if (!paths.every((p) => allowed(p, token))) throw denied();
      return paths.map((p) => structuredClone(docs[p] ?? null));
    },
    async submitAccessRequest(phone, fields) {
      if (docs.offline) throw Object.assign(new Error('offline'), { offline: true });
      if (docs[`accessRequests/${phone}`]) throw denied();
      docs[`accessRequests/${phone}`] = { ...fields, phone, status: 'pending' };
    },
  };
}

/** Member sign-in stand-in: the ID token is simply the uid. */
function fakeAuth({ uid = 'p9000000001', phone = '9000000001', signedIn = true } = {}) {
  let session = signedIn ? { uid, phone } : null;
  const control = { ended: false, offline: false };
  return {
    control,
    load: async () => {},
    getSession: () => session,
    async getIdToken() {
      if (!session) return null;
      if (control.ended) {
        session = null;
        throw Object.assign(new Error('ended'), { code: 'session-ended' });
      }
      if (control.offline) throw Object.assign(new Error('offline'), { code: 'offline' });
      return session.uid;
    },
    async signIn(p) {
      session = { uid: `p${p}`, phone: p };
      return session;
    },
    async signOut() {
      session = null;
    },
  };
}

function publishDistrict(docs, district, members, version) {
  const { meta, chunks } = buildDirectorySnapshot(members, { version, publishedAt: 'now', district });
  docs[`districts/${district}`] = meta;
  chunks.forEach((c) => (docs[`districts/${district}/chunks/${chunkId(version, c.index)}`] = c));
}

const approve = (docs, uid, district, status = 'approved') => {
  docs[`memberAccess/${uid}`] = { phone: uid.slice(1), name: 'Test', district, status };
};

const M = (id, nameHi, extra = {}) => ({ id, nameHi, ...extra });
const sangli = (token = 'p9000000001') => districtDirectoryDataset('sangli', token);

/** Docs with an approved Sangli member (p9000000001) and published Sangli + Pune directories. */
function world() {
  const docs = {};
  approve(docs, 'p9000000001', 'sangli');
  publishDistrict(docs, 'sangli', [M('S1', 'राम', { dob: '1990-05-01' }), M('S2', 'सीता', { anniversary: '2015-05-01' })], 100);
  publishDistrict(docs, 'pune', [M('P1', 'पुणे सदस्य', { dob: '1985-05-01' })], 100);
  return docs;
}

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

  it('clear() removes both slots and the pointer', async () => {
    const device = fakeDevice();
    const store = createSnapshotStore('directory', device.deps);
    await store.save({ version: 1 }, ['a']);
    await store.save({ version: 2 }, ['b']);
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(device.files.size).toBe(0);
    expect(device.prefs.has('directory')).toBe(false);
  });
});

describe('dataset sync (district directory)', () => {
  it('[13] downloads once, then only checks the version (no re-download)', async () => {
    const remote = fakeRemote(world());
    const store = createSnapshotStore('directory', fakeDevice().deps);

    const first = await syncDataset({ dataset: sangli(), store, remote });
    expect(first.status).toBe('updated');
    expect(first.snapshot.data.map((m) => m.id).sort()).toEqual(['S1', 'S2']);
    expect(first.snapshot.meta.district).toBe('sangli');
    const callsAfterFirst = remote.calls;

    const second = await syncDataset({ dataset: sangli(), store, remote });
    expect(second.status).toBe('current');
    expect(remote.calls - callsAfterFirst).toBe(1); // just the meta document
  });

  it('[14] downloads again after the district was updated', async () => {
    const docs = world();
    const remote = fakeRemote(docs);
    const store = createSnapshotStore('directory', fakeDevice().deps);
    await syncDataset({ dataset: sangli(), store, remote });
    publishDistrict(docs, 'sangli', [M('S1', 'राम'), M('S3', 'नया सदस्य')], 200);
    const r = await syncDataset({ dataset: sangli(), store, remote });
    expect(r.status).toBe('updated');
    expect(r.snapshot.data.map((m) => m.id).sort()).toEqual(['S1', 'S3']);
    expect((await store.load()).meta.version).toBe(200);
  });

  it('[15] a failed or invalid update preserves the previous valid snapshot', async () => {
    const docs = world();
    const remote = fakeRemote(docs);
    const store = createSnapshotStore('directory', fakeDevice().deps);
    await syncDataset({ dataset: sangli(), store, remote });

    // New version published, but one chunk is corrupted (checksum mismatch).
    publishDistrict(docs, 'sangli', [M('S1', 'राम'), M('S2', 'सीता'), M('S3', 'नया')], 200);
    docs[`districts/sangli/chunks/${chunkId(200, 0)}`].members[0].nameHi = 'छेड़छाड़';
    const bad = await syncDataset({ dataset: sangli(), store, remote });
    expect(bad.status).toBe('error');
    expect(bad.snapshot.data.map((m) => m.id).sort()).toEqual(['S1', 'S2']);
    expect((await store.load()).meta.version).toBe(100);

    // A chunk missing (publication in progress): still the old snapshot.
    delete docs[`districts/sangli/chunks/${chunkId(200, 0)}`];
    expect((await syncDataset({ dataset: sangli(), store, remote })).snapshot.meta.version).toBe(100);

    // Network failure: still the old snapshot.
    docs.offline = true;
    const offline = await syncDataset({ dataset: sangli(), store, remote });
    expect(offline.status).toBe('offline');
    expect(offline.snapshot.meta.version).toBe(100);
  });

  it('reports "denied" when the server refuses the district', async () => {
    const docs = world();
    const r = await syncDataset({ dataset: districtDirectoryDataset('pune', 'p9000000001'), store: createSnapshotStore('d', fakeDevice().deps), remote: fakeRemote(docs) });
    expect(r).toMatchObject({ status: 'denied', snapshot: null });
  });

  it('rejects an unsupported schema version and a meta document of another district', async () => {
    const docs = world();
    docs['districts/sangli'].schemaVersion = 99;
    expect(await syncDataset({ dataset: sangli(), store: createSnapshotStore('d', fakeDevice().deps), remote: fakeRemote(docs) })).toMatchObject({ status: 'error', snapshot: null });
    docs['districts/sangli'] = { ...docs['districts/pune'] };
    expect((await syncDataset({ dataset: sangli(), store: createSnapshotStore('d', fakeDevice().deps), remote: fakeRemote(docs) })).status).toBe('unpublished');
  });

  it('serialises concurrent syncs of the same dataset (single download, consistent state)', async () => {
    const remote = fakeRemote(world());
    const store = createSnapshotStore('directory', fakeDevice().deps);
    const results = await Promise.all([1, 2, 3].map(() => syncDataset({ dataset: sangli(), store, remote })));
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

describe('sync manager — member access and district directory', () => {
  const managerFor = (docs, device = fakeDevice(), { auth = fakeAuth(), now } = {}) => {
    const remote = fakeRemote(docs);
    const mgr = createSyncManager({
      enabled: true, remote, auth, kv: device.kv, storeFactory: (name) => createSnapshotStore(name, device.deps), ...(now ? { now } : {}),
    });
    return Object.assign(mgr, { remote, auth, device });
  };

  it('[1] the public calendar data syncs without any sign-in', async () => {
    const docs = { 'published/calendar': { version: 9, years: {} } };
    const mgr = managerFor(docs, fakeDevice(), { auth: fakeAuth({ signedIn: false }) });
    await mgr.init();
    await mgr.syncAll({ force: true });
    expect(mgr.get('calendar-index').status).toBe('updated');
    expect(mgr.get('access').status).toBe('signedOut');
    expect(mgr.remote.paths.some((p) => p.startsWith('districts/') || p.startsWith('memberAccess/'))).toBe(false);
  });

  it('new device without connection: no cached directory, honest offline state', async () => {
    const mgr = managerFor({ offline: true });
    await mgr.init();
    await mgr.syncAll({ force: true });
    expect(mgr.get('directory')).toMatchObject({ snapshot: null, status: 'offline' });
  });

  it('[6][7] an approved member downloads ONLY their own district', async () => {
    const mgr = managerFor(world());
    await mgr.init();
    await mgr.syncAll({ force: true });
    expect(mgr.get('access')).toMatchObject({ status: 'approved', district: 'sangli' });
    expect(mgr.get('directory').snapshot.data.map((m) => m.id).sort()).toEqual(['S1', 'S2']);
    expect(mgr.remote.paths.filter((p) => p.startsWith('districts/')).every((p) => p.startsWith('districts/sangli'))).toBe(true);
  });

  it('after one successful sync the district directory is available offline after restart', async () => {
    const device = fakeDevice();
    const online = managerFor(world(), device);
    await online.init();
    await online.syncAll({ force: true });

    const restartedOffline = managerFor({ offline: true }, device);
    await restartedOffline.init();
    await restartedOffline.syncAll({ force: true });
    expect(restartedOffline.get('directory').snapshot.data.map((m) => m.id).sort()).toEqual(['S1', 'S2']);
    expect(restartedOffline.get('access').status).toBe('approved');
  });

  it('[3][4] a signed-in but not approved (pending/rejected) member gets nothing and nothing is cached', async () => {
    const docs = world();
    const mgr = managerFor(docs, fakeDevice(), { auth: fakeAuth({ uid: 'p9000000002', phone: '9000000002' }) });
    await mgr.init();
    await mgr.syncAll({ force: true });
    expect(mgr.get('access').status).toBe('notApproved');
    expect(mgr.get('directory').snapshot).toBeNull();
    expect(mgr.remote.paths.some((p) => p.startsWith('districts/'))).toBe(false);
  });

  it('[8] revocation is enforced on reconnect: the cached district copy is deleted', async () => {
    const docs = world();
    const device = fakeDevice();
    const mgr = managerFor(docs, device);
    await mgr.init();
    await mgr.syncAll({ force: true });
    expect(mgr.get('directory').snapshot).not.toBeNull();

    // While offline nothing can be learnt: the copy stays (documented limitation).
    docs.offline = true;
    await mgr.syncAll({ force: true });
    expect(mgr.get('directory').snapshot).not.toBeNull();

    // Back online after the IT Head revoked access.
    docs.offline = false;
    approve(docs, 'p9000000001', 'sangli', 'revoked');
    await mgr.syncAll({ force: true });
    expect(mgr.get('access').status).toBe('revoked');
    expect(mgr.get('directory').snapshot).toBeNull();
    expect(device.files.size).toBe(0); // gone from storage, not only hidden

    const restarted = managerFor({ offline: true }, device);
    await restarted.init();
    expect(restarted.get('directory').snapshot).toBeNull();
  });

  it('district change: the old district is deleted and the new one downloaded', async () => {
    const docs = world();
    const mgr = managerFor(docs);
    await mgr.init();
    await mgr.syncAll({ force: true });
    approve(docs, 'p9000000001', 'pune');
    await mgr.syncAll({ force: true });
    expect(mgr.get('directory').snapshot.meta.district).toBe('pune');
    expect(mgr.get('directory').snapshot.data.map((m) => m.id)).toEqual(['P1']);
  });

  it('a disabled account (session ended) signs the device out and deletes the copy', async () => {
    const device = fakeDevice();
    const mgr = managerFor(world(), device);
    await mgr.init();
    await mgr.syncAll({ force: true });
    mgr.auth.control.ended = true;
    await mgr.syncAll({ force: true });
    expect(mgr.get('access').status).toBe('signedOut');
    expect(mgr.get('directory').snapshot).toBeNull();
    expect(device.files.size).toBe(0);
  });

  it(`hides the cached copy after ${ACCESS_MAX_OFFLINE_MS / 86400000} days without an online access check`, async () => {
    const device = fakeDevice();
    let clock = Date.UTC(2027, 0, 1);
    const now = () => clock;
    const mgr = managerFor(world(), device, { now });
    await mgr.init();
    await mgr.syncAll({ force: true });

    clock += ACCESS_MAX_OFFLINE_MS + 1;
    const late = managerFor({ offline: true }, device, { now });
    await late.init();
    expect(late.get('directory')).toMatchObject({ snapshot: null, status: 'stale' });

    const back = managerFor(world(), device, { now });
    await back.init();
    await back.syncAll({ force: true });
    expect(back.get('directory').snapshot.data).toHaveLength(2);
  });

  it('sign-out deletes the directory from the device', async () => {
    const device = fakeDevice();
    const mgr = managerFor(world(), device);
    await mgr.init();
    await mgr.syncAll({ force: true });
    await mgr.signOut();
    expect(mgr.get('directory').snapshot).toBeNull();
    expect(mgr.get('access').status).toBe('signedOut');
    expect(device.files.size).toBe(0);
  });

  it('removes a public directory cached by an older app version when signed out', async () => {
    const device = fakeDevice();
    await createSnapshotStore('directory', device.deps).save({ version: 1, schemaVersion: 1 }, [M('OLD', 'पुराना')]);
    const mgr = managerFor({}, device, { auth: fakeAuth({ signedIn: false }) });
    await mgr.init();
    expect(mgr.get('directory').snapshot).toBeNull();
    expect(await createSnapshotStore('directory', device.deps).load()).toBeNull();
  });

  it('signIn() verifies access and downloads the district immediately', async () => {
    const mgr = managerFor(world(), fakeDevice(), { auth: fakeAuth({ signedIn: false }) });
    await mgr.init();
    await mgr.signIn('9000000001', 'pattern-password');
    expect(mgr.get('access')).toMatchObject({ status: 'approved', district: 'sangli' });
    expect(mgr.get('directory').snapshot.data).toHaveLength(2);
  });

  it('[2] access request without an account; a second request for the same number is refused', async () => {
    const docs = {};
    const mgr = managerFor(docs, fakeDevice(), { auth: fakeAuth({ signedIn: false }) });
    await mgr.init();
    await mgr.submitAccessRequest({ phone: '9876543210', name: 'Ramesh', district: 'sangli', city: 'Miraj' });
    expect(docs['accessRequests/9876543210']).toMatchObject({ name: 'Ramesh', district: 'sangli', status: 'pending', city: 'Miraj' });
    expect(mgr.get('request')).toMatchObject({ phone: '9876543210', district: 'sangli' });
    await expect(mgr.submitAccessRequest({ phone: '9876543210', name: 'X', district: 'pune' })).rejects.toMatchObject({ code: 'too-soon' });
  });

  it('[16] birthdays/anniversaries exist only for authorised members of that district', async () => {
    const authorised = managerFor(world());
    await authorised.init();
    await authorised.syncAll({ force: true });
    const index = buildCelebrationIndex(authorised.get('directory').snapshot?.data);
    expect(celebrationsOn(index, '2027-05-01').map((e) => e.member.id).sort()).toEqual(['S1', 'S2']); // never Pune's P1

    for (const auth of [fakeAuth({ signedIn: false }), fakeAuth({ uid: 'p9000000002', phone: '9000000002' })]) {
      const other = managerFor(world(), fakeDevice(), { auth });
      await other.init();
      await other.syncAll({ force: true });
      expect(celebrationsOn(buildCelebrationIndex(other.get('directory').snapshot?.data), '2027-05-01')).toEqual([]);
    }
  });

  it('throttles automatic syncs but honours manual refresh', async () => {
    let clock = 1_000_000;
    const mgr = managerFor(world(), fakeDevice(), { now: () => clock });
    await mgr.syncAll();
    const calls = mgr.remote.calls;
    clock += 60_000;
    await mgr.syncAll(); // within 30 min → skipped
    expect(mgr.remote.calls).toBe(calls);
    await mgr.syncAll({ force: true });
    expect(mgr.remote.calls).toBeGreaterThan(calls);
  });

  it('does nothing when Firebase is not configured', async () => {
    const mgr = createSyncManager({ enabled: false, kv: fakeDevice().kv, storeFactory: (n) => createSnapshotStore(n, fakeDevice().deps) });
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
    const mgr = createSyncManager({ enabled: true, remote: fakeRemote(docs), auth: fakeAuth({ signedIn: false }), kv: device.kv, storeFactory: (n) => createSnapshotStore(n, device.deps) });
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

  it('sends the member ID token only for protected reads, and access requests with server time', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => (url.includes(':batchGet') ? [] : { fields: { district: { stringValue: 'sangli' } } }) };
    };
    const remote = createRemoteSource({ projectId: 'demo-mdc', apiKey: 'k', fetchImpl });
    expect(await remote.getDoc('districts/sangli', { token: 'ID' })).toEqual({ district: 'sangli' });
    expect(calls[0].init.headers.Authorization).toBe('Bearer ID');
    await remote.submitAccessRequest('9876543210', { name: 'Ram', district: 'sangli' });
    const body = JSON.parse(calls[1].init.body);
    expect(calls[1].url).toContain('/documents:commit?key=k');
    expect(calls[1].init.headers.Authorization).toBeUndefined();
    expect(body.writes[0].update.name).toBe('projects/demo-mdc/databases/(default)/documents/accessRequests/9876543210');
    expect(decodeDocument(body.writes[0].update)).toEqual({ name: 'Ram', district: 'sangli', phone: '9876543210', status: 'pending' });
    expect(body.writes[0].updateTransforms).toEqual([{ fieldPath: 'submittedAt', setToServerValue: 'REQUEST_TIME' }]);
  });
});
