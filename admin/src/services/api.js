/**
 * Admin portal ↔ Firestore. Every write here is ALSO checked by firestore.rules;
 * this module only organises the work (batches, validation, history).
 */
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { DIRECTORY_SCHEMA_VERSION, checkPublishedMember, toPublicMember } from '../../../src/shared/directorySchema.js';
import { isDistrictId } from '../../../src/shared/districts.js';
import { uidForPhone } from '../../../src/shared/phoneIdentity.js';
import { buildDirectorySnapshot, chunkId } from '../../../src/shared/snapshot.js';
import { checkEmergencyDoc, EMERGENCY_SCHEMA_VERSION } from '../../../src/shared/emergencySchema.js';
import { checkAdvertisement, checkNotice, checkOccasion } from '../../../src/utils/validators.js';

const BATCH_LIMIT = 400; // Firestore allows 500 writes per batch; keep headroom
const KEEP_DIRECTORY_VERSIONS = 3; // older chunk sets per district are deleted (rollback window)

// ------------------------------------------------------------------ members

export async function loadMembers() {
  const snap = await getDocs(collection(db, 'members'));
  return snap.docs.map((d) => d.data());
}

export async function saveMember(record, uid) {
  await setDoc(doc(db, 'members', record.id), { ...record, updatedAt: serverTimestamp(), updatedBy: uid }, { merge: true });
}

export async function deleteMember(id) {
  await deleteDoc(doc(db, 'members', id));
}

// ------------------------------------------------------------------ imports

/** SHA-256 of the file bytes → deterministic import id (retrying the same file is idempotent). */
export async function fileFingerprint(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

export async function getImport(importId) {
  const snap = await getDoc(doc(db, 'imports', importId));
  return snap.exists() ? snap.data() : null;
}

/**
 * Commits planned writes in batches. Safe to retry after a network failure:
 * member document IDs are deterministic and writes are merges of absolute
 * values, so repeating a batch produces the same result.
 */
export async function commitImport({ importId, fileName, fileSize, mode, options, summary, writes, uid, onProgress }) {
  const importRef = doc(db, 'imports', importId);
  await setDoc(
    importRef,
    { importId, adminUid: uid, fileName, fileSize, mode, options, summary, status: 'pending', startedAt: serverTimestamp() },
    { merge: true },
  );
  let done = 0;
  try {
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const w of writes.slice(i, i + BATCH_LIMIT)) {
        const base = { ...w.data, id: w.id, updatedAt: serverTimestamp(), updatedBy: uid, importId };
        if (w.kind === 'create') base.createdAt = serverTimestamp();
        if (w.kind === 'update' && base.status === undefined) delete base.status;
        batch.set(doc(db, 'members', w.id), w.kind === 'update' ? base : { status: 'active', ...base }, { merge: true });
      }
      await batch.commit();
      done = Math.min(writes.length, i + BATCH_LIMIT);
      onProgress?.(done, writes.length);
    }
    await setDoc(importRef, { status: 'committed', written: done, committedAt: serverTimestamp() }, { merge: true });
    return { ok: true, written: done };
  } catch (err) {
    await setDoc(importRef, { status: 'failed', written: done, error: String(err?.message ?? err) }, { merge: true }).catch(() => {});
    return { ok: false, written: done, error: String(err?.message ?? err) };
  }
}

/** Separately confirmed reconciliation: deactivate (never delete) the listed members. */
export async function deactivateMembers(ids, uid) {
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(db, 'members', id), { id, status: 'inactive', updatedAt: serverTimestamp(), updatedBy: uid }, { merge: true });
    }
    await batch.commit();
  }
}

export async function listImports(max = 50) {
  const snap = await getDocs(query(collection(db, 'imports'), orderBy('startedAt', 'desc'), limit(max)));
  return snap.docs.map((d) => d.data());
}

// ------------------------------------------------------------------ directory publishing (per district)

/**
 * Builds one public snapshot per district from active members; returns problems
 * instead of publishing bad data. Members without a district are NOT published
 * (no approved member could be authorised to see them) and are listed separately.
 */
export function prepareDirectory(members) {
  const active = members.filter((m) => m.status === 'active');
  const byDistrict = new Map();
  const noDistrict = [];
  for (const m of active) {
    if (!isDistrictId(m.district)) {
      noDistrict.push(m.id);
      continue;
    }
    if (!byDistrict.has(m.district)) byDistrict.set(m.district, []);
    byDistrict.get(m.district).push(toPublicMember(m));
  }
  const districts = [...byDistrict].map(([district, publicMembers]) => ({ district, publicMembers }));
  const problems = districts
    .flatMap((d) => d.publicMembers)
    .map((m) => ({ id: m.id, problems: checkPublishedMember(m) }))
    .filter((p) => p.problems.length);
  const publicCount = districts.reduce((n, d) => n + d.publicMembers.length, 0);
  return { districts, problems, publicCount, noDistrict, activeCount: active.length, inactiveCount: members.length - active.length };
}

/** Current published meta document of every district: { districtId: meta }. */
export async function loadDistrictMetas() {
  const snap = await getDocs(collection(db, 'districts'));
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
}

const summaryOf = (meta) => ({
  version: meta.version, recordCount: meta.recordCount, chunkCount: meta.chunkCount, checksum: meta.checksum,
});

/**
 * Publishes the prepared district snapshots. Per district: all chunks are
 * uploaded first (invisible until the meta document points at them), then the
 * meta document is switched in one write — each district changes atomically.
 * Districts whose content is unchanged are skipped (no writes; phones download
 * nothing). A district that no longer has any active members gets an empty
 * snapshot, so phones of that district drop the old list.
 */
export async function publishDirectory(prepared, uid, { note } = {}) {
  const version = Date.now();
  const publishedAt = new Date(version).toISOString();
  const current = await loadDistrictMetas();
  const targets = new Map(prepared.districts.map((d) => [d.district, d.publicMembers]));
  for (const [district, meta] of Object.entries(current)) {
    if (!targets.has(district) && meta.recordCount > 0) targets.set(district, []);
  }

  const published = {};
  const unchanged = [];
  for (const [district, members] of targets) {
    const { meta, chunks } = buildDirectorySnapshot(members, { version, publishedAt, district });
    const live = current[district];
    if (live && live.checksum === meta.checksum && live.recordCount === meta.recordCount && live.schemaVersion === meta.schemaVersion) {
      unchanged.push(district);
      continue;
    }
    for (let i = 0; i < chunks.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const c of chunks.slice(i, i + BATCH_LIMIT)) batch.set(doc(db, 'districts', district, 'chunks', chunkId(version, c.index)), c);
      await batch.commit();
    }
    await setDoc(doc(db, 'districts', district), { ...meta, publishedBy: uid });
    published[district] = summaryOf(meta);
  }

  const recordCount = prepared.publicCount;
  await setDoc(doc(collection(db, 'publications')), {
    dataset: 'directory', action: 'publish', version, districts: published, unchanged, recordCount,
    publishedBy: uid, publishedAt: serverTimestamp(), note: note ?? '',
  });
  for (const district of Object.keys(published)) {
    await pruneDistrictVersions(district, version).catch((err) => console.warn('prune failed', district, err));
  }
  return { version, recordCount, published, unchanged };
}

/** Keeps the newest KEEP_DIRECTORY_VERSIONS chunk sets of a district (plus `keep`) for rollback; deletes the rest. */
async function pruneDistrictVersions(district, keep) {
  const snap = await getDocs(collection(db, 'districts', district, 'chunks'));
  const versions = [...new Set(snap.docs.map((d) => d.data().version))].sort((a, b) => b - a);
  const retained = new Set([keep, ...versions.slice(0, KEEP_DIRECTORY_VERSIONS)]);
  const stale = snap.docs.filter((d) => !retained.has(d.data().version));
  for (let i = 0; i < stale.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    stale.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export async function getPublished(docId) {
  const snap = await getDoc(doc(db, 'published', docId));
  return snap.exists() ? snap.data() : null;
}

/** Re-activates the district snapshots of an earlier publication whose chunks are still retained. */
export async function rollbackDirectory(publication, uid) {
  const districts = publication.districts;
  if (!districts || !Object.keys(districts).length) {
    throw new Error('Only district publications can be restored (the retired public directory cannot be re-published).');
  }
  for (const [district, meta] of Object.entries(districts)) {
    for (let i = 0; i < meta.chunkCount; i++) {
      const chunk = await getDoc(doc(db, 'districts', district, 'chunks', chunkId(meta.version, i)));
      if (!chunk.exists()) throw new Error(`${district}: the data of this version is no longer available (older versions are pruned)`);
    }
  }
  const batch = writeBatch(db);
  for (const [district, meta] of Object.entries(districts)) {
    batch.set(doc(db, 'districts', district), {
      ...meta, district, schemaVersion: DIRECTORY_SCHEMA_VERSION, publishedAt: new Date(meta.version).toISOString(), publishedBy: uid,
    });
  }
  batch.set(doc(collection(db, 'publications')), {
    dataset: 'directory', action: 'rollback', version: publication.version, districts, publishedBy: uid, publishedAt: serverTimestamp(),
  });
  await batch.commit();
}

/**
 * The V2.0 public directory (published/directory + chunks) was readable by
 * anyone. Security Rules no longer allow public reads of it; these helpers find
 * and remove the stored copy itself (separately confirmed by the admin).
 */
export async function getLegacyPublicDirectory() {
  const meta = await getPublished('directory');
  const chunks = await getDocs(collection(db, 'published', 'directory', 'chunks'));
  return meta || chunks.size ? { meta, chunkDocs: chunks.size } : null;
}

export async function deleteLegacyPublicDirectory(uid) {
  const chunks = await getDocs(collection(db, 'published', 'directory', 'chunks'));
  for (let i = 0; i < chunks.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    chunks.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, 'published', 'directory'));
  batch.set(doc(collection(db, 'publications')), {
    dataset: 'directory-legacy', action: 'delete', version: Date.now(), deletedChunks: chunks.size, publishedBy: uid, publishedAt: serverTimestamp(),
  });
  await batch.commit();
  return chunks.size + 1;
}

// ------------------------------------------------------------------ member access (IT Head only)
// Every write is also enforced by firestore.rules (memberAccess / accessRequests /
// accessAudit are administrator-only). Accounts themselves are created by the
// local provisioning script (scripts/provision-members.mjs), never from the browser.

export async function listAccessRequests() {
  const snap = await getDocs(collection(db, 'accessRequests'));
  return snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
}

export async function listMemberAccess() {
  const snap = await getDocs(collection(db, 'memberAccess'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function listAccessAudit(max = 200) {
  const snap = await getDocs(query(collection(db, 'accessAudit'), orderBy('at', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
}

const audit = (batch, uid, action, target, details = {}) =>
  batch.set(doc(collection(db, 'accessAudit')), { action, target, ...details, by: uid, at: serverTimestamp() });

/**
 * Approves (or manually grants) access for a phone number with one district.
 * Writes memberAccess/{p<phone>} — the record Security Rules check on every
 * directory read — plus the request status and an audit entry, atomically.
 */
export async function approveAccess({ phone, name, district, memberId, org, requestId }, uid) {
  if (!isDistrictId(district)) throw new Error('Choose a district');
  const target = uidForPhone(phone);
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'memberAccess', target),
    {
      phone, name, district, status: 'approved', ...(memberId ? { memberId } : {}), ...(org ? { org } : {}),
      reason: '', approvedAt: serverTimestamp(), approvedBy: uid, updatedAt: serverTimestamp(), updatedBy: uid,
    },
    { merge: true },
  );
  if (requestId) {
    batch.update(doc(db, 'accessRequests', requestId), { status: 'approved', reviewedBy: uid, reviewedAt: serverTimestamp(), approvedDistrict: district });
  }
  audit(batch, uid, requestId ? 'approve' : 'grant', target, { district, ...(memberId ? { memberId } : {}) });
  await batch.commit();
}

export async function rejectRequest(request, reason, uid) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'accessRequests', request.docId), { status: 'rejected', reason: reason ?? '', reviewedBy: uid, reviewedAt: serverTimestamp() });
  audit(batch, uid, 'reject', uidForPhone(request.phone), { reason: reason ?? '' });
  await batch.commit();
}

/** Marks a request as needing more information; the requester may then re-submit it from the app. */
export async function requestMoreInfo(request, message, uid) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'accessRequests', request.docId), { status: 'info_requested', infoMessage: message ?? '', reviewedBy: uid, reviewedAt: serverTimestamp() });
  audit(batch, uid, 'request_info', uidForPhone(request.phone), { reason: message ?? '' });
  await batch.commit();
}

export async function deleteAccessRequest(request, uid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'accessRequests', request.docId));
  audit(batch, uid, 'delete_request', uidForPhone(request.phone));
  await batch.commit();
}

async function updateAccess(access, patch, action, details, uid) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'memberAccess', access.uid), { ...patch, updatedAt: serverTimestamp(), updatedBy: uid });
  audit(batch, uid, action, access.uid, details);
  await batch.commit();
}

/** Takes effect on the member's next online request (Security Rules re-check memberAccess every time). */
export const revokeAccess = (access, reason, uid) => updateAccess(access, { status: 'revoked', reason: reason ?? '' }, 'revoke', { reason: reason ?? '' }, uid);
export const restoreAccess = (access, uid) => updateAccess(access, { status: 'approved', reason: '' }, 'restore', {}, uid);
export function changeDistrict(access, district, uid) {
  if (!isDistrictId(district)) throw new Error('Choose a district');
  return updateAccess(access, { district }, 'change_district', { from: access.district, district }, uid);
}

// ------------------------------------------------------------------ drafts → publish (small datasets)

export async function loadDraft(name) {
  const snap = await getDoc(doc(db, 'drafts', name));
  return snap.exists() ? snap.data() : null;
}

export async function saveDraft(name, data, uid) {
  await setDoc(doc(db, 'drafts', name), { ...data, updatedAt: serverTimestamp(), updatedBy: uid });
}

/** Validation per publishable dataset. Returns a list of problems ([] = OK). */
export function validateDataset(name, payload) {
  if (name === 'emergency') return checkEmergencyDoc({ ...payload, schemaVersion: EMERGENCY_SCHEMA_VERSION });
  if (name === 'content') {
    return [
      ...(payload.ads ?? []).flatMap((a, i) => checkAdvertisement(a).map((p) => `Ad ${i + 1}: ${p}`)),
      ...(payload.notices ?? []).flatMap((n, i) => checkNotice(n).map((p) => `Notice ${i + 1}: ${p}`)),
    ];
  }
  const year = Number(name.replace('occasions_', ''));
  const seen = new Set();
  const problems = [];
  (payload.occasions ?? []).forEach((o, i) => {
    problems.push(...checkOccasion(o, year).map((p) => `${o?.id ?? i}: ${p}`));
    const key = `${o?.id}|${o?.date}`;
    if (seen.has(key)) problems.push(`duplicate ${key}`);
    seen.add(key);
  });
  return problems;
}

/**
 * Publishes a validated draft payload as published/{name} with a new version,
 * and logs the full payload so it can be restored (rollback) later.
 */
export async function publishDataset(name, payload, uid) {
  const problems = validateDataset(name, payload);
  if (problems.length) throw new Error(problems.slice(0, 5).join('\n'));
  const version = Date.now();
  const published = { ...payload, version, schemaVersion: 1, updatedAt: new Date(version).toISOString() };
  const batch = writeBatch(db);
  batch.set(doc(db, 'published', name), published);
  if (name.startsWith('occasions_')) {
    const index = (await getPublished('calendar')) ?? { years: {} };
    batch.set(doc(db, 'published', 'calendar'), {
      version, schemaVersion: 1, years: { ...(index.years ?? {}), [String(payload.year)]: version },
    });
  }
  batch.set(doc(collection(db, 'publications')), {
    dataset: name, action: 'publish', version, payload: published, publishedBy: uid, publishedAt: serverTimestamp(),
  });
  await batch.commit();
  return published;
}

export async function listPublications(max = 50) {
  const snap = await getDocs(query(collection(db, 'publications'), orderBy('publishedAt', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
}

export async function listAdmins() {
  const snap = await getDocs(query(collection(db, 'admins'), where('active', '==', true)));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}
