/**
 * Firestore Security Rules tests — run against the local emulator:
 *   npm run test:rules
 * (wraps `firebase emulators:exec --only firestore,auth`, project "demo-mdc", no cloud access).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';

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

const access = (phone, status, district) => ({
  phone, name: 'Test', district, status, updatedAt: new Date(), updatedBy: 'admin1',
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/admin1'), { active: true, email: 'admin@example.org' });
    await setDoc(doc(db, 'admins/former'), { active: false });
    // Retired public directory (V2.0) — must no longer be public.
    await setDoc(doc(db, 'published/directory'), { version: 1, schemaVersion: 1, recordCount: 1, chunkCount: 1, checksum: 'x' });
    await setDoc(doc(db, 'published/directory/chunks/1_0'), { version: 1, index: 0, members: [{ id: 'M1', nameHi: 'राम' }] });
    await setDoc(doc(db, 'published/emergency'), { version: 1, schemaVersion: 1, contacts: [], hospitals: [], services: [] });
    await setDoc(doc(db, 'published/content'), { version: 1, schemaVersion: 1, ads: [], notices: [] });
    await setDoc(doc(db, 'published/occasions_2027'), { version: 1, schemaVersion: 1, year: 2027, occasions: [] });
    // District directories.
    for (const d of ['sangli', 'pune']) {
      await setDoc(doc(db, `districts/${d}`), { district: d, version: 5, schemaVersion: 1, recordCount: 1, chunkCount: 1, checksum: 'c' });
      await setDoc(doc(db, `districts/${d}/chunks/5_0`), { version: 5, index: 0, members: [{ id: `M-${d}`, nameEn: d, dob: '1990-05-01' }] });
    }
    // Member access states (uid = "p" + phone).
    await setDoc(doc(db, 'memberAccess/p9000000001'), access('9000000001', 'approved', 'sangli'));
    await setDoc(doc(db, 'memberAccess/p9000000003'), access('9000000003', 'revoked', 'sangli'));
    await setDoc(doc(db, 'accessRequests/9000000002'), { phone: '9000000002', name: 'Pending', district: 'sangli', status: 'pending', submittedAt: new Date() });
    await setDoc(doc(db, 'accessRequests/9000000004'), { phone: '9000000004', name: 'Rejected', district: 'sangli', status: 'rejected', submittedAt: new Date() });
    await setDoc(doc(db, 'accessRequests/9000000005'), { phone: '9000000005', name: 'Info', district: 'sangli', status: 'info_requested', submittedAt: new Date() });
    await setDoc(doc(db, 'members/M1'), { id: 'M1', nameHi: 'राम', status: 'active', adminNote: 'private', district: 'sangli' });
    await setDoc(doc(db, 'drafts/emergency'), { contacts: [] });
    await setDoc(doc(db, 'imports/imp1'), { adminUid: 'admin1', status: 'committed' });
    await setDoc(doc(db, 'publications/p1'), { publishedBy: 'admin1', dataset: 'directory' });
    await setDoc(doc(db, 'accessAudit/a1'), { action: 'approve', by: 'admin1', at: new Date() });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const user = (uid) => env.authenticatedContext(uid).firestore();
const admin = () => user('admin1');
const approved = () => user('p9000000001'); // approved for Sangli
const pending = () => user('p9000000002'); // has an account but only a pending request
const revoked = () => user('p9000000003');
const rejected = () => user('p9000000004');

const request = (phone, extra = {}) => ({
  phone, name: 'Ramesh Maheshwari', district: 'sangli', status: 'pending', submittedAt: serverTimestamp(), ...extra,
});

describe('public (unauthenticated) app users', () => {
  it('[1] can read the public calendar data, emergency contacts and notices without signing in', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'published/emergency')));
    await assertSucceeds(getDoc(doc(anon(), 'published/content')));
    await assertSucceeds(getDoc(doc(anon(), 'published/occasions_2027')));
  });

  it('cannot read the retired public directory or any district directory', async () => {
    await assertFails(getDoc(doc(anon(), 'published/directory')));
    await assertFails(getDoc(doc(anon(), 'published/directory/chunks/1_0')));
    await assertFails(getDoc(doc(anon(), 'districts/sangli')));
    await assertFails(getDoc(doc(anon(), 'districts/sangli/chunks/5_0')));
    await assertFails(getDocs(collection(anon(), 'districts')));
  });

  it('cannot write published data', async () => {
    await assertFails(setDoc(doc(anon(), 'published/directory'), { version: 2, schemaVersion: 1 }));
    await assertFails(setDoc(doc(anon(), 'published/content'), { version: 2, schemaVersion: 1 }));
    await assertFails(deleteDoc(doc(anon(), 'published/emergency')));
    await assertFails(setDoc(doc(anon(), 'districts/sangli'), { district: 'sangli', version: 9, schemaVersion: 1, recordCount: 0, chunkCount: 0 }));
  });

  it('cannot read private master records, drafts, imports, publications, access data or the admin roster', async () => {
    await assertFails(getDoc(doc(anon(), 'members/M1')));
    await assertFails(getDocs(collection(anon(), 'members')));
    await assertFails(getDoc(doc(anon(), 'drafts/emergency')));
    await assertFails(getDoc(doc(anon(), 'imports/imp1')));
    await assertFails(getDoc(doc(anon(), 'publications/p1')));
    await assertFails(getDoc(doc(anon(), 'admins/admin1')));
    await assertFails(getDoc(doc(anon(), 'memberAccess/p9000000001')));
    await assertFails(getDoc(doc(anon(), 'accessAudit/a1')));
  });

  it('cannot read unknown collections', async () => {
    await assertFails(getDoc(doc(anon(), 'anything/else')));
  });
});

describe('access requests', () => {
  it('[2] can be submitted without an account, but never read back or listed', async () => {
    await assertSucceeds(setDoc(doc(anon(), 'accessRequests/9876543210'), request('9876543210', { city: 'Miraj', fatherName: 'Suresh', org: 'yuva' })));
    await assertFails(getDoc(doc(anon(), 'accessRequests/9876543210')));
    await assertFails(getDocs(collection(anon(), 'accessRequests')));
    await assertFails(getDocs(collection(approved(), 'accessRequests')));
  });

  it('must be pending — a requester cannot approve themselves or pick a role', async () => {
    await assertFails(setDoc(doc(anon(), 'accessRequests/9876543210'), request('9876543210', { status: 'approved' })));
    await assertFails(setDoc(doc(anon(), 'accessRequests/9876543210'), request('9876543210', { role: 'admin' })));
    await assertFails(setDoc(doc(anon(), 'memberAccess/p9876543210'), access('9876543210', 'approved', 'sangli')));
  });

  it('are validated: normalised 10-digit number as ID, matching phone field, sane sizes, server time', async () => {
    await assertFails(setDoc(doc(anon(), 'accessRequests/+919876543210'), request('+919876543210')));
    await assertFails(setDoc(doc(anon(), 'accessRequests/1234567890'), request('1234567890')));
    await assertFails(setDoc(doc(anon(), 'accessRequests/9876543210'), request('9876500000')));
    await assertFails(setDoc(doc(anon(), 'accessRequests/9876543210'), request('9876543210', { name: 'x'.repeat(101) })));
    await assertFails(setDoc(doc(anon(), 'accessRequests/9876543210'), request('9876543210', { district: 'Sangli District!' })));
    await assertFails(setDoc(doc(anon(), 'accessRequests/9876543210'), request('9876543210', { submittedAt: new Date(2020, 0, 1) })));
  });

  it('cannot be overwritten by the public (pending/rejected), only re-submitted after "info requested"', async () => {
    await assertFails(setDoc(doc(anon(), 'accessRequests/9000000002'), request('9000000002', { name: 'Someone Else' })));
    await assertFails(setDoc(doc(anon(), 'accessRequests/9000000004'), request('9000000004')));
    await assertSucceeds(setDoc(doc(anon(), 'accessRequests/9000000005'), request('9000000005', { note: 'Member no. 123' })));
  });
});

describe('member access by status', () => {
  it('[3] pending: an account without approval cannot read any district', async () => {
    await assertFails(getDoc(doc(pending(), 'districts/sangli')));
    await assertFails(getDoc(doc(pending(), 'districts/sangli/chunks/5_0')));
  });

  it('[4] rejected: cannot read any district', async () => {
    await assertFails(getDoc(doc(rejected(), 'districts/sangli')));
    await assertFails(getDoc(doc(rejected(), 'districts/sangli/chunks/5_0')));
  });

  it('[6] approved: can read their own access record and their assigned district (meta + chunks)', async () => {
    await assertSucceeds(getDoc(doc(approved(), 'memberAccess/p9000000001')));
    await assertSucceeds(getDoc(doc(approved(), 'districts/sangli')));
    await assertSucceeds(getDoc(doc(approved(), 'districts/sangli/chunks/5_0')));
    await assertSucceeds(getDocs(collection(approved(), 'districts/sangli/chunks')));
  });

  it('[7] approved: cannot read another district, list districts, the master records or others\' access', async () => {
    await assertFails(getDoc(doc(approved(), 'districts/pune')));
    await assertFails(getDoc(doc(approved(), 'districts/pune/chunks/5_0')));
    await assertFails(getDocs(collection(approved(), 'districts')));
    await assertFails(getDoc(doc(approved(), 'members/M1')));
    await assertFails(getDoc(doc(approved(), 'memberAccess/p9000000003')));
    await assertFails(getDoc(doc(approved(), 'published/directory')));
  });

  it('[8] revoked: a fresh online read is denied (even with a still-valid sign-in token)', async () => {
    await assertFails(getDoc(doc(revoked(), 'districts/sangli')));
    await assertFails(getDoc(doc(revoked(), 'districts/sangli/chunks/5_0')));
    // Revocation takes effect on the very next request after the admin writes it.
    await assertSucceeds(updateDoc(doc(admin(), 'memberAccess/p9000000001'), { status: 'revoked', updatedAt: serverTimestamp(), updatedBy: 'admin1' }));
    await assertFails(getDoc(doc(approved(), 'districts/sangli')));
  });

  it('district change takes effect immediately: old district denied, new district allowed', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'memberAccess/p9000000001'), { district: 'pune', updatedAt: serverTimestamp(), updatedBy: 'admin1' }));
    await assertFails(getDoc(doc(approved(), 'districts/sangli')));
    await assertSucceeds(getDoc(doc(approved(), 'districts/pune')));
  });
});

describe('members cannot change their own access', () => {
  it('[9] a non-admin cannot approve themselves or another member', async () => {
    await assertFails(setDoc(doc(pending(), 'memberAccess/p9000000002'), access('9000000002', 'approved', 'sangli')));
    await assertFails(setDoc(doc(approved(), 'memberAccess/p9876543210'), access('9876543210', 'approved', 'sangli')));
    await assertFails(updateDoc(doc(revoked(), 'memberAccess/p9000000003'), { status: 'approved' }));
    await assertFails(updateDoc(doc(approved(), 'accessRequests/9000000002'), { status: 'approved' }));
    await assertFails(setDoc(doc(approved(), 'accessAudit/x'), { action: 'approve', by: 'p9000000001', at: serverTimestamp() }));
  });

  it('[10] a non-admin cannot change a district assignment (own or anyone\'s)', async () => {
    await assertFails(updateDoc(doc(approved(), 'memberAccess/p9000000001'), { district: 'pune' }));
    await assertFails(setDoc(doc(approved(), 'memberAccess/p9000000001'), access('9000000001', 'approved', 'pune')));
    await assertFails(updateDoc(doc(user('stranger'), 'memberAccess/p9000000001'), { district: 'pune' }));
  });

  it('cannot remap their UID to another phone number, or delete their record', async () => {
    await assertFails(updateDoc(doc(approved(), 'memberAccess/p9000000001'), { phone: '9000000009' }));
    await assertFails(deleteDoc(doc(revoked(), 'memberAccess/p9000000003')));
  });

  it('cannot make themselves admin', async () => {
    await assertFails(setDoc(doc(user('stranger'), 'admins/stranger'), { active: true }));
    await assertFails(setDoc(doc(approved(), 'admins/p9000000001'), { active: true }));
  });

  it('deactivated admins lose access', async () => {
    await assertFails(getDoc(doc(user('former'), 'members/M1')));
    await assertFails(setDoc(doc(user('former'), 'published/content'), { version: 3, schemaVersion: 1 }));
    await assertFails(getDocs(collection(user('former'), 'accessRequests')));
    await assertFails(setDoc(doc(user('former'), 'memberAccess/p9000000002'), { ...access('9000000002', 'approved', 'sangli'), updatedBy: 'former', updatedAt: serverTimestamp() }));
  });
});

describe('administrators (IT Head)', () => {
  const grant = (phone, district, extra = {}) => ({
    phone, name: 'Test', district, status: 'approved', updatedAt: serverTimestamp(), updatedBy: 'admin1', ...extra,
  });

  it('can review requests and approve with a district (UID mapping enforced)', async () => {
    await assertSucceeds(getDocs(collection(admin(), 'accessRequests')));
    await assertSucceeds(setDoc(doc(admin(), 'memberAccess/p9000000002'), grant('9000000002', 'sangli', { memberId: 'M1', approvedBy: 'admin1' })));
    await assertSucceeds(updateDoc(doc(admin(), 'accessRequests/9000000002'), { status: 'approved' }));
    await assertFails(setDoc(doc(admin(), 'memberAccess/p9000000002'), grant('9000000099', 'sangli'))); // uid ≠ "p"+phone
    await assertFails(setDoc(doc(admin(), 'memberAccess/x9000000002'), grant('9000000002', 'sangli')));
    await assertFails(setDoc(doc(admin(), 'memberAccess/p9000000002'), grant('9000000002', 'sangli', { status: 'superuser' })));
    await assertFails(setDoc(doc(admin(), 'memberAccess/p9000000002'), grant('9000000002', 'sangli', { role: 'admin' })));
    await assertFails(setDoc(doc(admin(), 'memberAccess/p9000000002'), grant('9000000002', 'sangli', { updatedBy: 'someone' })));
  });

  it('audit entries are attributed, server-timed and append-only', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'accessAudit/a2'), { action: 'revoke', by: 'admin1', at: serverTimestamp(), phone: '90•••••001' }));
    await assertFails(setDoc(doc(admin(), 'accessAudit/a3'), { action: 'revoke', by: 'someone-else', at: serverTimestamp() }));
    await assertFails(setDoc(doc(admin(), 'accessAudit/a4'), { action: 'make_admin', by: 'admin1', at: serverTimestamp() }));
    await assertFails(updateDoc(doc(admin(), 'accessAudit/a1'), { action: 'reject' }));
    await assertFails(deleteDoc(doc(admin(), 'accessAudit/a1')));
  });

  it('can publish a district snapshot in one batch, with naming checks', async () => {
    const db = admin();
    const batch = writeBatch(db);
    batch.set(doc(db, 'districts/sangli/chunks/6_0'), { version: 6, index: 0, members: [{ id: 'M1', nameHi: 'राम' }] });
    batch.set(doc(db, 'districts/sangli'), { district: 'sangli', version: 6, schemaVersion: 1, recordCount: 1, chunkCount: 1, checksum: 'y' });
    await assertSucceeds(batch.commit());
    await assertFails(setDoc(doc(db, 'districts/sangli'), { district: 'pune', version: 7, schemaVersion: 1, recordCount: 0, chunkCount: 0 }));
    await assertFails(setDoc(doc(db, 'districts/sangli/chunks/8_0'), { version: 7, index: 0, members: [] }));
    await assertFails(setDoc(doc(db, 'districts/Bad_ID'), { district: 'Bad_ID', version: 7, schemaVersion: 1, recordCount: 0, chunkCount: 0 }));
  });

  it('can no longer publish the public directory, but can delete the legacy copy', async () => {
    await assertFails(setDoc(doc(admin(), 'published/directory'), { version: 2, schemaVersion: 1 }));
    await assertFails(setDoc(doc(admin(), 'published/directory/chunks/2_0'), { version: 2, index: 0, members: [] }));
    await assertSucceeds(getDoc(doc(admin(), 'published/directory')));
    await assertSucceeds(deleteDoc(doc(admin(), 'published/directory/chunks/1_0')));
    await assertSucceeds(deleteDoc(doc(admin(), 'published/directory')));
  });

  it('can manage members, with ID/status integrity enforced', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'members/M2'), { id: 'M2', nameHi: 'सीता', status: 'active', district: 'pune' }));
    await assertSucceeds(getDoc(doc(admin(), 'members/M1')));
    await assertFails(setDoc(doc(admin(), 'members/M3'), { id: 'OTHER', nameHi: 'x', status: 'active' }));
    await assertFails(setDoc(doc(admin(), 'members/M3'), { id: 'M3', nameHi: 'x', status: 'deleted' }));
    await assertSucceeds(deleteDoc(doc(admin(), 'members/M1')));
  });

  it('cannot publish malformed metadata to other published documents', async () => {
    await assertFails(setDoc(doc(admin(), 'published/content'), { version: 'two', schemaVersion: 1 }));
    await assertFails(setDoc(doc(admin(), 'published/secret'), { version: 2, schemaVersion: 1 }));
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
