/**
 * Firestore Security Rules tests — run against the local emulator:
 *   npm run test:rules
 * (wraps `firebase emulators:exec --only firestore`, project "demo-mdc", no cloud access).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, writeBatch } from 'firebase/firestore';

let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mdc',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/admin1'), { active: true, email: 'admin@example.org' });
    await setDoc(doc(db, 'admins/former'), { active: false });
    await setDoc(doc(db, 'published/directory'), { version: 1, schemaVersion: 1, recordCount: 1, chunkCount: 1, checksum: 'x' });
    await setDoc(doc(db, 'published/directory/chunks/1_0'), { version: 1, index: 0, members: [{ id: 'M1', nameHi: 'राम' }] });
    await setDoc(doc(db, 'published/emergency'), { version: 1, schemaVersion: 1, contacts: [], hospitals: [], services: [] });
    await setDoc(doc(db, 'members/M1'), { id: 'M1', nameHi: 'राम', status: 'active', adminNote: 'private' });
    await setDoc(doc(db, 'drafts/emergency'), { contacts: [] });
    await setDoc(doc(db, 'imports/imp1'), { adminUid: 'admin1', status: 'committed' });
    await setDoc(doc(db, 'publications/p1'), { publishedBy: 'admin1', dataset: 'directory' });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const user = (uid) => env.authenticatedContext(uid).firestore();
const admin = () => user('admin1');

describe('public (unauthenticated) app users', () => {
  it('can read published directory meta, chunks and emergency contacts', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'published/directory')));
    await assertSucceeds(getDoc(doc(anon(), 'published/directory/chunks/1_0')));
    await assertSucceeds(getDoc(doc(anon(), 'published/emergency')));
  });

  it('cannot write published data', async () => {
    await assertFails(setDoc(doc(anon(), 'published/directory'), { version: 2, schemaVersion: 1 }));
    await assertFails(setDoc(doc(anon(), 'published/directory/chunks/2_0'), { version: 2, index: 0, members: [] }));
    await assertFails(deleteDoc(doc(anon(), 'published/emergency')));
  });

  it('cannot read private master records, drafts, imports, publications or the admin roster', async () => {
    await assertFails(getDoc(doc(anon(), 'members/M1')));
    await assertFails(getDocs(collection(anon(), 'members')));
    await assertFails(getDoc(doc(anon(), 'drafts/emergency')));
    await assertFails(getDoc(doc(anon(), 'imports/imp1')));
    await assertFails(getDoc(doc(anon(), 'publications/p1')));
    await assertFails(getDoc(doc(anon(), 'admins/admin1')));
  });

  it('cannot read unknown collections', async () => {
    await assertFails(getDoc(doc(anon(), 'anything/else')));
  });
});

describe('signed-in non-admins (e.g. someone who created an account)', () => {
  it('get no write access and no private reads', async () => {
    const db = user('stranger');
    await assertFails(setDoc(doc(db, 'members/M2'), { id: 'M2', nameHi: 'x', status: 'active' }));
    await assertFails(setDoc(doc(db, 'published/directory'), { version: 9, schemaVersion: 1 }));
    await assertFails(getDoc(doc(db, 'members/M1')));
    await assertSucceeds(getDoc(doc(db, 'published/directory'))); // still public
  });

  it('cannot make themselves admin', async () => {
    await assertFails(setDoc(doc(user('stranger'), 'admins/stranger'), { active: true }));
  });

  it('deactivated admins lose access', async () => {
    await assertFails(getDoc(doc(user('former'), 'members/M1')));
    await assertFails(setDoc(doc(user('former'), 'published/content'), { version: 3, schemaVersion: 1 }));
  });
});

describe('administrators', () => {
  it('can manage members, with ID/status integrity enforced', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'members/M2'), { id: 'M2', nameHi: 'सीता', status: 'active' }));
    await assertSucceeds(getDoc(doc(admin(), 'members/M1')));
    await assertFails(setDoc(doc(admin(), 'members/M3'), { id: 'OTHER', nameHi: 'x', status: 'active' }));
    await assertFails(setDoc(doc(admin(), 'members/M3'), { id: 'M3', nameHi: 'x', status: 'deleted' }));
    await assertSucceeds(deleteDoc(doc(admin(), 'members/M1')));
  });

  it('can publish a versioned directory snapshot in one batch', async () => {
    const db = admin();
    const batch = writeBatch(db);
    batch.set(doc(db, 'published/directory/chunks/2_0'), { version: 2, index: 0, members: [{ id: 'M1', nameHi: 'राम' }] });
    batch.set(doc(db, 'published/directory'), { version: 2, schemaVersion: 1, recordCount: 1, chunkCount: 1, checksum: 'y' });
    await assertSucceeds(batch.commit());
  });

  it('cannot publish malformed metadata or mis-named chunks', async () => {
    await assertFails(setDoc(doc(admin(), 'published/directory'), { version: 'two', schemaVersion: 1 }));
    await assertFails(setDoc(doc(admin(), 'published/secret'), { version: 2, schemaVersion: 1 }));
    await assertFails(setDoc(doc(admin(), 'published/directory/chunks/3_0'), { version: 2, index: 0, members: [] }));
    await assertSucceeds(setDoc(doc(admin(), 'published/occasions_2027'), { version: 2, schemaVersion: 1, year: 2027, occasions: [] }));
  });

  it('import history is attributed and cannot be deleted; publication log is append-only', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'imports/imp2'), { adminUid: 'admin1', status: 'pending' }));
    await assertFails(setDoc(doc(admin(), 'imports/imp3'), { adminUid: 'someone-else', status: 'pending' }));
    await assertFails(deleteDoc(doc(admin(), 'imports/imp1')));
    await assertSucceeds(setDoc(doc(admin(), 'publications/p2'), { publishedBy: 'admin1', dataset: 'emergency' }));
    await assertFails(setDoc(doc(admin(), 'publications/p1'), { publishedBy: 'admin1', dataset: 'tampered' }));
  });

  it('cannot change the admin roster from the client either', async () => {
    await assertFails(setDoc(doc(admin(), 'admins/newbie'), { active: true }));
  });
});
