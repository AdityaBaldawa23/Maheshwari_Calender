/**
 * Directory snapshot publishing format (shared by admin publisher, app sync and tests).
 *
 * Firestore layout — ONE snapshot per district, readable only by administrators
 * and by members approved for that district (see firestore.rules):
 *   districts/{district}                         meta  { district, version, schemaVersion, recordCount, chunkCount, checksum, publishedAt }
 *   districts/{district}/chunks/{version}_{n}    { version, index, members: [...] }
 *
 * The app reads its district's meta document (1 read). Only when `version`
 * changed does it read `chunkCount` chunk documents (≈1 read per 400 members) —
 * never one read per member, never a real-time listener, never another district.
 */
import { checksumOf } from './hash.js';
import { DIRECTORY_SCHEMA_VERSION, checkPublishedMember, compareMembers } from './directorySchema.js';

export const CHUNK_SIZE = 400; // ~120 KB per chunk, far below Firestore's 1 MiB document limit

export const chunkId = (version, index) => `${version}_${index}`;

/** Splits sorted public members into chunks and computes the meta document. */
export function buildDirectorySnapshot(publicMembers, { version, publishedAt, district }) {
  const members = [...publicMembers].sort(compareMembers);
  const chunks = [];
  for (let i = 0; i < members.length; i += CHUNK_SIZE) {
    chunks.push({ version, index: chunks.length, members: members.slice(i, i + CHUNK_SIZE) });
  }
  const meta = {
    ...(district ? { district } : {}),
    version,
    schemaVersion: DIRECTORY_SCHEMA_VERSION,
    recordCount: members.length,
    chunkCount: chunks.length,
    checksum: checksumOf(members),
    publishedAt,
  };
  return { meta, chunks };
}

/**
 * Validates a downloaded snapshot before it may replace the cached one.
 * Returns { ok: true, members } or { ok: false, error }.
 */
export function verifyDirectorySnapshot(meta, chunks) {
  if (!meta || typeof meta !== 'object') return { ok: false, error: 'meta missing' };
  if (meta.schemaVersion !== DIRECTORY_SCHEMA_VERSION) return { ok: false, error: `unsupported schemaVersion ${meta.schemaVersion}` };
  if (!Number.isInteger(meta.version) || !Number.isInteger(meta.chunkCount) || !Number.isInteger(meta.recordCount)) {
    return { ok: false, error: 'meta fields malformed' };
  }
  if (!Array.isArray(chunks) || chunks.length !== meta.chunkCount) return { ok: false, error: 'chunk count mismatch' };
  const ordered = [...chunks].sort((a, b) => a.index - b.index);
  if (ordered.some((c, i) => c?.index !== i || c.version !== meta.version || !Array.isArray(c.members))) {
    return { ok: false, error: 'chunks incomplete or from another version' };
  }
  const members = ordered.flatMap((c) => c.members);
  if (members.length !== meta.recordCount) return { ok: false, error: 'record count mismatch' };
  if (checksumOf(members) !== meta.checksum) return { ok: false, error: 'checksum mismatch' };
  const ids = new Set();
  for (const m of members) {
    const problems = checkPublishedMember(m);
    if (problems.length) return { ok: false, error: `invalid record ${m?.id}: ${problems[0]}` };
    if (ids.has(m.id)) return { ok: false, error: `duplicate id ${m.id}` };
    ids.add(m.id);
  }
  return { ok: true, members };
}
