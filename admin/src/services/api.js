/**
 * Admin portal ↔ Firestore. Every write here is ALSO checked by firestore.rules;
 * this module only organises the work (batches, validation, history).
 */
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { checkPublishedMember, toPublicMember } from '../../../src/shared/directorySchema.js';
import { buildDirectorySnapshot, chunkId } from '../../../src/shared/snapshot.js';
import { checkEmergencyDoc, EMERGENCY_SCHEMA_VERSION } from '../../../src/shared/emergencySchema.js';
import { checkAdvertisement, checkNotice, checkOccasion } from '../../../src/utils/validators.js';

const BATCH_LIMIT = 400; // Firestore allows 500 writes per batch; keep headroom
const KEEP_DIRECTORY_VERSIONS = 3; // older chunk sets are deleted (rollback window)

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

// ------------------------------------------------------------------ directory publishing

/** Builds the public snapshot from active members; returns problems instead of publishing bad data. */
export function prepareDirectory(members) {
  const active = members.filter((m) => m.status === 'active');
  const publicMembers = active.map(toPublicMember);
  const problems = publicMembers
    .map((m) => ({ id: m.id, problems: checkPublishedMember(m) }))
    .filter((p) => p.problems.length);
  return { publicMembers, problems, activeCount: active.length, inactiveCount: members.length - active.length };
}

export async function publishDirectory(publicMembers, uid, { note } = {}) {
  const version = Date.now();
  const { meta, chunks } = buildDirectorySnapshot(publicMembers, { version, publishedAt: new Date(version).toISOString() });
  // 1. Upload all chunks first (invisible to the app until the meta document points at them).
  for (let i = 0; i < chunks.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const c of chunks.slice(i, i + BATCH_LIMIT)) batch.set(doc(db, 'published', 'directory', 'chunks', chunkId(version, c.index)), c);
    await batch.commit();
  }
  // 2. Activate: meta + audit log in one atomic batch.
  const batch = writeBatch(db);
  batch.set(doc(db, 'published', 'directory'), { ...meta, publishedBy: uid });
  batch.set(doc(collection(db, 'publications')), {
    dataset: 'directory', action: 'publish', version, meta, publishedBy: uid, publishedAt: serverTimestamp(), note: note ?? '',
  });
  await batch.commit();
  await pruneDirectoryVersions(version).catch((err) => console.warn('prune failed', err));
  return meta;
}

/** Keeps the newest KEEP_DIRECTORY_VERSIONS chunk sets (plus `keep`) for rollback; deletes the rest. */
async function pruneDirectoryVersions(keep) {
  const snap = await getDocs(collection(db, 'published', 'directory', 'chunks'));
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

/** Re-activates an earlier directory version whose chunks are still retained. */
export async function rollbackDirectory(publication, uid) {
  const { meta } = publication;
  for (let i = 0; i < meta.chunkCount; i++) {
    const chunk = await getDoc(doc(db, 'published', 'directory', 'chunks', chunkId(meta.version, i)));
    if (!chunk.exists()) throw new Error('इस संस्करण के डेटा अब उपलब्ध नहीं — chunks of this version were pruned');
  }
  const batch = writeBatch(db);
  batch.set(doc(db, 'published', 'directory'), { ...meta, publishedBy: uid });
  batch.set(doc(collection(db, 'publications')), {
    dataset: 'directory', action: 'rollback', version: meta.version, meta, publishedBy: uid, publishedAt: serverTimestamp(),
  });
  await batch.commit();
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
      ...(payload.ads ?? []).flatMap((a, i) => checkAdvertisement(a).map((p) => `विज्ञापन ${i + 1}: ${p}`)),
      ...(payload.notices ?? []).flatMap((n, i) => checkNotice(n).map((p) => `सूचना ${i + 1}: ${p}`)),
    ];
  }
  const year = Number(name.replace('occasions_', ''));
  const seen = new Set();
  const problems = [];
  (payload.occasions ?? []).forEach((o, i) => {
    problems.push(...checkOccasion(o, year).map((p) => `${o?.id ?? i}: ${p}`));
    const key = `${o?.id}|${o?.date}`;
    if (seen.has(key)) problems.push(`दोहराया गया — duplicate ${key}`);
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
