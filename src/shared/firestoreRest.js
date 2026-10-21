/**
 * Converts between Firestore REST API documents and plain JavaScript values.
 * The mobile app talks to Firestore through the REST endpoint (no SDK, no
 * real-time listeners), keeping the APK small.
 * https://firebase.google.com/docs/firestore/reference/rest/v1/Value
 */

export function decodeValue(v) {
  if (!v || typeof v !== 'object') return undefined;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return String(v.stringValue);
  if ('timestampValue' in v) return String(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields ?? {});
  return undefined; // bytes, references, geo points are not used by this app
}

export function decodeFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields ?? {})) out[key] = decodeValue(value);
  return out;
}

/** REST document → plain object (fields only). */
export function decodeDocument(doc) {
  return doc?.fields ? decodeFields(doc.fields) : {};
}

/** Plain value → Firestore REST value (strings, numbers, booleans, null, arrays, maps). */
export function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { mapValue: { fields: encodeFields(v) } };
}

export function encodeFields(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj ?? {})) if (value !== undefined) out[key] = encodeValue(value);
  return out;
}
