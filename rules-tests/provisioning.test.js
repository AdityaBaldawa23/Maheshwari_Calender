/**
 * End-to-end tests on the local emulators (Auth + Firestore), no cloud access:
 *   npm run test:rules
 *
 * Covers the provisioning script logic (Admin SDK), real phone + password sign-in
 * through the app's REST auth client, and the app's protected reads with the
 * resulting ID token against the real Security Rules.
 *
 * The organisation's password pattern is NOT in the repository; these tests use a
 * stand-in pattern (`test-<phone>`) through the same hook interface.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { provisionMembers, resetMemberPassword } from '../scripts/lib/provision.mjs';
import { createMemberAuth } from '../src/services/auth/memberAuth.js';
import { createRemoteSource } from '../src/services/sync/remoteSource.js';
import { createSyncManager } from '../src/services/sync/syncManager.js';
import { createSnapshotStore } from '../src/services/sync/snapshotStore.js';
import { buildDirectorySnapshot, chunkId } from '../src/shared/snapshot.js';
import { syntheticEmail } from '../src/shared/phoneIdentity.js';

const PROJECT = 'demo-mdc';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIRESTORE_EMULATOR_HOST = FS_HOST;

let env;
let app;
let auth;
let db;
const passwordFor = ({ phone }) => `test-${phone}`; // stand-in for the real (local, git-ignored) pattern hook

const memoryStorage = () => {
  const map = new Map();
  return { map, get: async (k) => structuredClone(map.get(k) ?? null), set: async (k, v) => void map.set(k, structuredClone(v)), remove: async (k) => void map.delete(k) };
};
const fakeDevice = () => {
  const files = new Map();
  const prefs = new Map();
  return {
    files,
    deps: {
      files: { read: async (n) => files.get(n) ?? null, write: async (n, t) => void files.set(n, t), remove: async (n) => void files.delete(n) },
      pointer: { get: async (k) => prefs.get(k) ?? null, set: async (k, v) => void prefs.set(k, v), remove: async (k) => void prefs.delete(k) },
    },
  };
};
const appAuth = (storage = memoryStorage()) => createMemberAuth({ apiKey: 'fake-api-key', authEmulatorHost: AUTH_HOST, storage });
const appRemote = () => createRemoteSource({ projectId: PROJECT, apiKey: '', emulatorHost: FS_HOST });

async function publishDistrict(district, members, version) {
  const { meta, chunks } = buildDirectorySnapshot(members, { version, publishedAt: 'now', district });
  for (const c of chunks) await db.doc(`districts/${district}/chunks/${chunkId(version, c.index)}`).set(c);
  await db.doc(`districts/${district}`).set(meta);
}

const access = (phone, status, district) => ({ phone, name: `Member ${phone.slice(-3)}`, district, status, updatedAt: new Date(), updatedBy: 'admin1' });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: FS_HOST.split(':')[0], port: Number(FS_HOST.split(':')[1]), rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  app = initializeApp({ projectId: PROJECT }, 'provision-tests');
  auth = getAuth(app);
  db = getFirestore(app);
});

afterAll(async () => {
  await env?.cleanup();
  if (app) await deleteApp(app);
});

beforeEach(async () => {
  await env.clearFirestore();
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await db.doc('memberAccess/p9000000001').set(access('9000000001', 'approved', 'sangli'));
  await db.doc('memberAccess/p9000000003').set(access('9000000003', 'revoked', 'sangli'));
  await db.doc('accessRequests/9000000002').set({ phone: '9000000002', name: 'Pending', district: 'sangli', status: 'pending', submittedAt: new Date() });
  await db.doc('members/M1').set({ id: 'M1', nameEn: 'Ram', status: 'active', district: 'sangli', adminNote: 'private' });
  await publishDistrict('sangli', [{ id: 'S1', nameHi: 'राम', dob: '1990-05-01' }, { id: 'S2', nameHi: 'सीता' }], 100);
  await publishDistrict('pune', [{ id: 'P1', nameHi: 'पुणे' }], 100);
});

const memberUsers = async () => (await auth.listUsers(1000)).users.filter((u) => /^p\d{10}$/.test(u.uid));

describe('provisioning script (Admin SDK, local)', () => {
  it('dry run changes nothing', async () => {
    const { summary } = await provisionMembers({ auth, db, passwordFor });
    expect(summary).toMatchObject({ create: 1 });
    expect(await memberUsers()).toHaveLength(0);
  });

  it('creates accounts ONLY for approved access records (not for pending requests), with the synthetic id', async () => {
    const { summary } = await provisionMembers({ auth, db, passwordFor, apply: true });
    expect(summary).toMatchObject({ create: 1 });
    const users = await memberUsers();
    expect(users.map((u) => [u.uid, u.email, u.disabled])).toEqual([['p9000000001', syntheticEmail('9000000001'), false]]);
    expect((await db.doc('memberAccess/p9000000001').get()).data().accountStatus).toBe('active');
    expect(JSON.stringify((await db.doc('memberAccess/p9000000001').get()).data())).not.toContain('test-9000000001');
  });

  it('[12] retries are safe: running again creates no duplicates', async () => {
    await provisionMembers({ auth, db, passwordFor, apply: true });
    const again = await provisionMembers({ auth, db, passwordFor, apply: true });
    expect(again.summary.create).toBeUndefined();
    expect(await memberUsers()).toHaveLength(1);
  });

  it('[12] a failed provisioning is reported, the others continue, and a later run completes it', async () => {
    await db.doc('memberAccess/p9000000004').set(access('9000000004', 'approved', 'pune'));
    const flaky = (m) => {
      if (m.phone === '9000000004') throw new Error('hook failed');
      return passwordFor(m);
    };
    const first = await provisionMembers({ auth, db, passwordFor: flaky, apply: true });
    expect(first.results.find((r) => r.uid === 'p9000000004')).toMatchObject({ action: 'error' });
    expect((await db.doc('memberAccess/p9000000004').get()).data().accountStatus).toBe('error');
    expect((await memberUsers()).map((u) => u.uid)).toEqual(['p9000000001']);

    await provisionMembers({ auth, db, passwordFor, apply: true });
    expect((await memberUsers()).map((u) => u.uid).sort()).toEqual(['p9000000001', 'p9000000004']);
    expect((await db.doc('memberAccess/p9000000004').get()).data().accountStatus).toBe('active');
  });

  it('[11] never creates a second account for the same number: an existing account with another UID is a conflict', async () => {
    await auth.createUser({ uid: 'someOtherUid', email: syntheticEmail('9000000001'), password: 'whatever1' });
    const { results } = await provisionMembers({ auth, db, passwordFor, apply: true });
    expect(results.find((r) => r.uid === 'p9000000001')).toMatchObject({ action: 'conflict' });
    expect((await auth.listUsers()).users.filter((u) => u.email === syntheticEmail('9000000001'))).toHaveLength(1);
  });

  it('disables revoked members and orphan member accounts; re-enables on restore', async () => {
    await provisionMembers({ auth, db, passwordFor, apply: true });
    await auth.createUser({ uid: 'p9111111111', email: syntheticEmail('9111111111'), password: 'whatever1' });
    await db.doc('memberAccess/p9000000001').update({ status: 'revoked' });
    const { summary } = await provisionMembers({ auth, db, passwordFor, apply: true });
    expect(summary).toMatchObject({ disable: 1, 'disable-orphan': 1 });
    expect((await auth.getUser('p9000000001')).disabled).toBe(true);
    expect((await auth.getUser('p9111111111')).disabled).toBe(true);

    await db.doc('memberAccess/p9000000001').update({ status: 'approved' });
    expect((await provisionMembers({ auth, db, passwordFor, apply: true })).summary).toMatchObject({ enable: 1 });
    expect((await auth.getUser('p9000000001')).disabled).toBe(false);
  });

  it('resets an approved member\'s password back to the pattern value (and only for approved members)', async () => {
    await provisionMembers({ auth, db, passwordFor, apply: true });
    await auth.updateUser('p9000000001', { password: 'changed-elsewhere' });
    expect(await resetMemberPassword({ auth, db, passwordFor, phone: '9000000001', apply: true })).toMatchObject({ action: 'reset' });
    await expect(appAuth().signIn('9000000001', 'test-9000000001')).resolves.toMatchObject({ uid: 'p9000000001' });
    expect(await resetMemberPassword({ auth, db, passwordFor, phone: '9000000003', apply: true })).toMatchObject({ action: 'error' });
  });
});

describe('member sign-in and protected reads (app REST clients → emulators)', () => {
  it('[5][6][7] phone + pattern password signs in; the token reads the own district only', async () => {
    await provisionMembers({ auth, db, passwordFor, apply: true });
    const memberAuth = appAuth();
    const session = await memberAuth.signIn('+91 90000 00001', 'test-9000000001');
    expect(session).toEqual({ uid: 'p9000000001', phone: '9000000001' });
    const token = await memberAuth.getIdToken();
    const remote = appRemote();
    expect(await remote.getDoc('memberAccess/p9000000001', { token })).toMatchObject({ status: 'approved', district: 'sangli' });
    expect(await remote.getDoc('districts/sangli', { token })).toMatchObject({ district: 'sangli', recordCount: 2 });
    await expect(remote.getDoc('districts/pune', { token })).rejects.toMatchObject({ denied: true });
    await expect(remote.getDocs([`districts/pune/chunks/${chunkId(100, 0)}`], { token })).rejects.toMatchObject({ denied: true });
    await expect(remote.getDoc('members/M1', { token })).rejects.toMatchObject({ denied: true });
    await expect(remote.getDoc('districts/sangli')).rejects.toMatchObject({ denied: true }); // without a token
  });

  it('wrong password / unknown number / revoked (disabled) account all give the same generic error', async () => {
    await provisionMembers({ auth, db, passwordFor, apply: true });
    await auth.createUser({ uid: 'p9000000003', email: syntheticEmail('9000000003'), password: 'test-9000000003' });
    await provisionMembers({ auth, db, passwordFor, apply: true }); // disables the revoked member's account
    for (const [phone, pw] of [['9000000001', 'wrong-password'], ['9555555555', 'test-9555555555'], ['9000000003', 'test-9000000003']]) {
      await expect(appAuth().signIn(phone, pw)).rejects.toMatchObject({ code: 'invalid' });
    }
  });

  it('[3] a pending applicant has no account, so cannot sign in at all', async () => {
    await provisionMembers({ auth, db, passwordFor, apply: true });
    await expect(appAuth().signIn('9000000002', 'test-9000000002')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('[8] after revocation a fresh online request is denied even with a still-valid token, and the app deletes its copy', async () => {
    await provisionMembers({ auth, db, passwordFor, apply: true });
    const device = fakeDevice();
    const memberAuth = appAuth();
    const mgr = createSyncManager({
      enabled: true, remote: appRemote(), auth: memberAuth, kv: memoryStorage(), storeFactory: (n) => createSnapshotStore(n, device.deps),
    });
    await mgr.init();
    await mgr.signIn('9000000001', 'test-9000000001');
    expect(mgr.get('directory').snapshot.data.map((m) => m.id).sort()).toEqual(['S1', 'S2']);
    const token = await memberAuth.getIdToken();

    await db.doc('memberAccess/p9000000001').update({ status: 'revoked' }); // IT Head revokes in the portal
    await expect(appRemote().getDoc('districts/sangli', { token })).rejects.toMatchObject({ denied: true });
    await mgr.syncAll({ force: true });
    expect(mgr.get('access').status).toBe('revoked');
    expect(mgr.get('directory').snapshot).toBeNull();
    expect(device.files.size).toBe(0);
  });

  it('[2] the app can submit an access request without an account', async () => {
    const remote = appRemote();
    await remote.submitAccessRequest('9876543210', { name: 'Ramesh Maheshwari', district: 'sangli', city: 'Miraj' });
    const saved = (await db.doc('accessRequests/9876543210').get()).data();
    expect(saved).toMatchObject({ phone: '9876543210', name: 'Ramesh Maheshwari', status: 'pending', district: 'sangli' });
    expect(saved.submittedAt.toDate()).toBeInstanceOf(Date);
    await expect(remote.submitAccessRequest('9876543210', { name: 'Someone Else', district: 'pune' })).rejects.toMatchObject({ denied: true });
  });
});
