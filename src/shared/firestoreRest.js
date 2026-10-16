/**
 * Decodes Firestore REST API documents into plain JavaScript values.
 * The mobile app reads *published* data through the REST endpoint (no SDK,
 * no authentication, no real-time listeners), keeping the APK small.
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
