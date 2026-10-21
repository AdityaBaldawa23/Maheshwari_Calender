/**
 * Member account provisioning — core logic of scripts/provision-members.mjs.
 *
 * Runs ONLY on the IT Head's computer with the Firebase Admin SDK (never in the
 * app or the browser portal). It reconciles Firebase Authentication with the
 * decisions the IT Head made in the portal (memberAccess/{uid}):
 *
 *   approved, no account        → create account (uid "p<phone>", synthetic email, pattern password)
 *   approved, account disabled  → enable it
 *   revoked, account enabled    → disable it + revoke refresh tokens (signs the phone out)
 *   member account (p<phone>) without any memberAccess record → disable it (orphan)
 *
 * Safety properties
 *   - Only memberAccess records count as approval; access requests and imported
 *     members never create accounts.
 *   - Deterministic UID per phone number: retrying never creates a duplicate.
 *     An existing account with the same email but another UID is a conflict and is
 *     reported, never "fixed" automatically.
 *   - Dry run unless `apply` is true.
 *   - Passwords come from the organisation's existing pattern (a local, git-ignored
 *     hook). They are never logged, stored in Firestore or returned.
 */
import { maskPhone, syntheticEmail, uidForPhone } from '../../src/shared/phoneIdentity.js';

const MEMBER_UID = /^p[6-9]\d{9}$/;

async function getUserOrNull(auth, uid) {
  try {
    return await auth.getUser(uid);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

async function getUserByEmailOrNull(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

/** Calls the local pattern hook and checks the result without ever exposing it. */
async function patternPassword(passwordFor, context) {
  const password = await passwordFor(context);
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('password pattern hook returned no usable password (Firebase needs at least 6 characters)');
  }
  return password;
}

/** Decides (and, with apply, performs) the action for one memberAccess record. */
async function reconcileOne({ auth, access, passwordFor, apply, loadMember }) {
  const { uid, phone, status } = access;
  const masked = maskPhone(phone);
  if (uid !== uidForPhone(phone ?? '')) return { uid, phone: masked, action: 'error', note: 'record id does not match its phone number' };
  const email = syntheticEmail(phone);
  const user = await getUserOrNull(auth, uid);

  if (!user) {
    if (status !== 'approved') return { uid, phone: masked, action: 'none', accountStatus: 'none' };
    const other = await getUserByEmailOrNull(auth, email);
    if (other) return { uid, phone: masked, action: 'conflict', accountStatus: 'error', note: 'another account already uses this sign-in id' };
    if (apply) {
      const member = access.memberId ? await loadMember(access.memberId) : null;
      const password = await patternPassword(passwordFor, { phone, name: access.name, memberId: access.memberId ?? null, district: access.district, member });
      try {
        await auth.createUser({ uid, email, password, emailVerified: false, disabled: false });
      } catch (err) {
        // A parallel/previous run created it meanwhile: report, next run reconciles.
        if (err?.code === 'auth/uid-already-exists' || err?.code === 'auth/email-already-exists') {
          return { uid, phone: masked, action: 'retry', accountStatus: 'error', note: 'account appeared during this run; run again' };
        }
        throw err;
      }
    }
    return { uid, phone: masked, action: 'create', accountStatus: 'active' };
  }

  if (user.email !== email) return { uid, phone: masked, action: 'conflict', accountStatus: 'error', note: 'existing account has a different sign-in id' };
  if (status === 'approved') {
    if (!user.disabled) return { uid, phone: masked, action: 'none', accountStatus: 'active' };
    if (apply) await auth.updateUser(uid, { disabled: false });
    return { uid, phone: masked, action: 'enable', accountStatus: 'active' };
  }
  // revoked
  if (user.disabled) return { uid, phone: masked, action: 'none', accountStatus: 'disabled' };
  if (apply) {
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);
  }
  return { uid, phone: masked, action: 'disable', accountStatus: 'disabled' };
}

/** Every member-style account (uid "p<phone>") in Firebase Auth. */
async function listMemberUsers(auth) {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users.filter((u) => MEMBER_UID.test(u.uid)));
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

/**
 * @param {object} deps
 * @param {import('firebase-admin/auth').Auth} deps.auth
 * @param {import('firebase-admin/firestore').Firestore} deps.db
 * @param {(ctx: {phone:string, name:string, memberId:string|null, district:string, member:object|null}) => string|Promise<string>} deps.passwordFor
 * @param {boolean} [deps.apply]   false = dry run (default)
 * @returns {Promise<{results: object[], summary: Record<string, number>}>}
 */
export async function provisionMembers({ auth, db, passwordFor, apply = false, now = () => new Date() }) {
  const snap = await db.collection('memberAccess').get();
  const loadMember = async (id) => {
    const doc = await db.collection('members').doc(String(id)).get();
    return doc.exists ? doc.data() : null;
  };
  const results = [];
  const known = new Set();
  for (const doc of snap.docs) {
    const access = { uid: doc.id, ...doc.data() };
    known.add(doc.id);
    let result;
    try {
      result = await reconcileOne({ auth, access, passwordFor, apply, loadMember });
    } catch (err) {
      result = { uid: doc.id, phone: maskPhone(access.phone), action: 'error', accountStatus: 'error', note: String(err?.code ?? err?.message ?? err).slice(0, 120) };
    }
    results.push(result);
    // Report the account state back to the portal (Admin SDK: not subject to Security Rules).
    if (apply && result.accountStatus && (result.accountStatus !== access.accountStatus || (result.note ?? '') !== (access.accountNote ?? ''))) {
      await doc.ref.set({ accountStatus: result.accountStatus, accountNote: result.note ?? '', accountCheckedAt: now() }, { merge: true });
    }
  }

  for (const user of await listMemberUsers(auth)) {
    if (known.has(user.uid) || user.disabled) continue;
    if (apply) {
      await auth.updateUser(user.uid, { disabled: true });
      await auth.revokeRefreshTokens(user.uid);
    }
    results.push({ uid: user.uid, phone: maskPhone(user.uid.slice(1)), action: 'disable-orphan', note: 'account without an access record' });
  }

  const summary = {};
  for (const r of results) summary[r.action] = (summary[r.action] ?? 0) + 1;
  return { results, summary };
}

/**
 * Resets ONE approved member's password back to the organisation's pattern value,
 * after the IT Head has verified the person (see docs/MEMBER_ACCESS.md). Signs out
 * the member's other devices.
 */
export async function resetMemberPassword({ auth, db, passwordFor, phone, apply = false }) {
  const uid = uidForPhone(phone);
  const doc = await db.collection('memberAccess').doc(uid).get();
  if (!doc.exists || doc.data().status !== 'approved') return { uid, phone: maskPhone(phone), action: 'error', note: 'member is not approved' };
  const user = await getUserOrNull(auth, uid);
  if (!user) return { uid, phone: maskPhone(phone), action: 'error', note: 'no account yet — run provisioning first' };
  if (user.email !== syntheticEmail(phone)) return { uid, phone: maskPhone(phone), action: 'conflict', note: 'existing account has a different sign-in id' };
  if (apply) {
    const access = doc.data();
    const member = access.memberId ? (await db.collection('members').doc(String(access.memberId)).get()).data() ?? null : null;
    const password = await patternPassword(passwordFor, { phone, name: access.name, memberId: access.memberId ?? null, district: access.district, member });
    await auth.updateUser(uid, { password, disabled: false });
    await auth.revokeRefreshTokens(uid);
  }
  return { uid, phone: maskPhone(phone), action: 'reset' };
}
