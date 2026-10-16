/**
 * Emergency contacts — schema shared by app, admin portal and tests.
 *
 * Published document `published/emergency`:
 *   { version, schemaVersion, updatedAt,
 *     contacts:  exactly 4 community contact slots,
 *     services:  police / ambulance / fire,
 *     hospitals: exactly 4 hospital slots }
 * Unfilled slots stay in the list (configured: false) so the app can show an
 * honest "not yet configured" state instead of inventing details.
 */
export const EMERGENCY_SCHEMA_VERSION = 1;
export const CONTACT_SLOTS = 4;
export const HOSPITAL_SLOTS = 4;
export const SERVICE_IDS = ['police', 'ambulance', 'fire'];

const PHONE = /^\+?[0-9]{3,15}$/;
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isOptionalText = (v, max) => v === undefined || v === '' || (typeof v === 'string' && v.length <= max);

/** Digits (and a leading +) only, for tel: links; null if not a dialable number. */
export function dialable(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\s()-]/g, '');
  return PHONE.test(cleaned) ? cleaned : null;
}

/** Only https Google/Apple/OSM-style map links are allowed for directions. */
export function safeMapUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function emptyContact(order) {
  return { slot: order, name: '', role: '', phone: '', altPhone: '', address: '', description: '', active: false };
}

export function emptyHospital(order) {
  return { slot: order, name: '', phone: '', emergencyPhone: '', altPhone: '', address: '', city: '', mapUrl: '', active: false };
}

/** A slot is shown with a Call button only if it is active and has a dialable number. */
export const isConfigured = (entry) => Boolean(entry?.active && isText(entry.name) && dialable(entry.phone));

function checkCommon(entry, label, fields) {
  const problems = [];
  if (!entry || typeof entry !== 'object') return [`${label}: must be an object`];
  if (typeof entry.active !== 'boolean') problems.push(`${label}: active must be true/false`);
  for (const [field, max] of Object.entries(fields)) {
    if (!isOptionalText(entry[field], max)) problems.push(`${label}: ${field} must be text up to ${max} characters`);
  }
  for (const field of ['phone', 'altPhone', 'emergencyPhone']) {
    if (isText(entry[field]) && !dialable(entry[field])) problems.push(`${label}: ${field} is not a valid phone number`);
  }
  if (entry.active && !isText(entry.name)) problems.push(`${label}: an active entry needs a name`);
  if (entry.active && !dialable(entry.phone)) problems.push(`${label}: an active entry needs a valid phone number`);
  return problems;
}

export function checkEmergencyDoc(doc) {
  if (!doc || typeof doc !== 'object') return ['document missing'];
  const problems = [];
  if (doc.schemaVersion !== EMERGENCY_SCHEMA_VERSION) problems.push(`unsupported schemaVersion ${doc.schemaVersion}`);
  if (!Array.isArray(doc.contacts) || doc.contacts.length !== CONTACT_SLOTS) problems.push(`exactly ${CONTACT_SLOTS} contact slots required`);
  if (!Array.isArray(doc.hospitals) || doc.hospitals.length !== HOSPITAL_SLOTS) problems.push(`exactly ${HOSPITAL_SLOTS} hospital slots required`);
  if (!Array.isArray(doc.services)) problems.push('services list required');
  (doc.contacts ?? []).forEach((c, i) =>
    problems.push(...checkCommon(c, `contact ${i + 1}`, { name: 80, role: 80, phone: 20, altPhone: 20, address: 200, description: 300 })),
  );
  (doc.hospitals ?? []).forEach((h, i) => {
    problems.push(...checkCommon(h, `hospital ${i + 1}`, { name: 120, phone: 20, emergencyPhone: 20, altPhone: 20, address: 200, city: 80, mapUrl: 500 }));
    if (isText(h?.mapUrl) && !safeMapUrl(h.mapUrl)) problems.push(`hospital ${i + 1}: mapUrl must be an https link`);
  });
  (doc.services ?? []).forEach((s, i) => {
    if (!SERVICE_IDS.includes(s?.id)) problems.push(`service ${i + 1}: unknown id ${s?.id}`);
    problems.push(...checkCommon(s, `service ${s?.id ?? i + 1}`, { name: 80, phone: 20, altPhone: 20, jurisdiction: 120 }));
    if (s?.verification !== undefined && typeof s.verification !== 'object') problems.push(`service ${s?.id}: verification must be an object`);
  });
  return problems;
}
