/**
 * Small, dependency-free hashing helpers shared by the app, the admin portal
 * and tests. Used for integrity checks of published snapshots and for stable,
 * deterministic IDs — NOT for security.
 */

/** JSON with object keys sorted recursively, so equal data always serialises identically. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a 32-bit hash of a string, as 8 hex characters. */
export function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Checksum of a list of records (order-sensitive), used to verify downloaded snapshots. */
export function checksumOf(records) {
  return fnv1a(canonicalJson(records));
}
