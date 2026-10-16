/**
 * Maheshwari Directory — record schema, shared by the app (validating
 * downloaded snapshots), the admin portal (editing, import, publishing) and tests.
 *
 * Published record shape (empty fields are omitted to keep snapshots small):
 *   { id, nameHi?, nameEn?, dob?, age?, anniversary?, bloodGroup?, fatherName?,
 *     motherName?, phone?, city?, note? }
 *   - dob / anniversary: ISO "YYYY-MM-DD".
 *   - age: ONLY when the source supplied an age without a DOB. When a DOB is
 *     present, age is always computed at display time (never stored).
 *   - note: a public note approved by an administrator (admin-only notes stay private).
 */
import { isValidKey, parseKey } from '../utils/date.js';

export const DIRECTORY_SCHEMA_VERSION = 1;

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/** Field definitions: label (Hindi/English), max length, and whether the field is published. */
export const MEMBER_FIELDS = {
  id: { label: { hi: 'सदस्य क्रमांक', en: 'Member ID' }, max: 40 },
  nameHi: { label: { hi: 'नाम (हिंदी)', en: 'Name (Hindi)' }, max: 100 },
  nameEn: { label: { hi: 'नाम (अंग्रेज़ी)', en: 'Name (English)' }, max: 100 },
  dob: { label: { hi: 'जन्म तिथि', en: 'Date of birth' } },
  age: { label: { hi: 'आयु', en: 'Age' } },
  anniversary: { label: { hi: 'विवाह वर्षगांठ', en: 'Anniversary' } },
  bloodGroup: { label: { hi: 'रक्त समूह', en: 'Blood group' } },
  fatherName: { label: { hi: 'पिता का नाम', en: "Father's name" }, max: 100 },
  motherName: { label: { hi: 'माता का नाम', en: "Mother's name" }, max: 100 },
  phone: { label: { hi: 'संपर्क नंबर', en: 'Contact number' }, max: 16 },
  city: { label: { hi: 'शहर / स्थान', en: 'City / locality' }, max: 100 },
  note: { label: { hi: 'टिप्पणी', en: 'Note' }, max: 300 },
};

export const PUBLIC_FIELDS = Object.keys(MEMBER_FIELDS);
export const MEMBER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

/** Whole years between a DOB and a date key (both "YYYY-MM-DD"); null if not computable. */
export function ageOn(dob, todayKeyValue) {
  const b = parseKey(dob);
  const t = parseKey(todayKeyValue);
  if (!b || !t) return null;
  let age = t.y - b.y;
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) age--;
  return age >= 0 ? age : null;
}

/** Age to display: computed from DOB when available, otherwise the supplied age. */
export function displayAge(member, todayKeyValue) {
  if (member.dob) return ageOn(member.dob, todayKeyValue);
  return Number.isInteger(member.age) ? member.age : null;
}

/** Problems with one published record ([] = valid). */
export function checkPublishedMember(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['record must be an object'];
  const problems = [];
  if (typeof m.id !== 'string' || !MEMBER_ID_PATTERN.test(m.id)) problems.push(`invalid id ${m.id}`);
  if (!isText(m.nameHi) && !isText(m.nameEn)) problems.push('a name (Hindi or English) is required');
  for (const [field, def] of Object.entries(MEMBER_FIELDS)) {
    const v = m[field];
    if (v === undefined || field === 'age') continue;
    if (typeof v !== 'string') problems.push(`${field} must be text`);
    else if (def.max && v.length > def.max) problems.push(`${field} is longer than ${def.max} characters`);
  }
  for (const field of ['dob', 'anniversary']) {
    if (m[field] !== undefined && !isValidKey(m[field])) problems.push(`${field} must be YYYY-MM-DD`);
  }
  if (m.age !== undefined && !(Number.isInteger(m.age) && m.age >= 0 && m.age <= 125)) problems.push('age must be 0–125');
  if (m.bloodGroup !== undefined && !BLOOD_GROUPS.includes(m.bloodGroup)) problems.push(`invalid blood group ${m.bloodGroup}`);
  if (m.phone !== undefined && !PHONE_PATTERN.test(m.phone)) problems.push('invalid phone');
  const unknown = Object.keys(m).filter((k) => !PUBLIC_FIELDS.includes(k));
  if (unknown.length) problems.push(`unknown fields: ${unknown.join(', ')}`);
  return problems;
}

/**
 * Converts an admin master record (Firestore `members/{id}`) to the public
 * shape: only published fields, trimmed, empty values omitted.
 */
export function toPublicMember(master) {
  const out = { id: master.id };
  for (const field of PUBLIC_FIELDS) {
    if (field === 'id') continue;
    const sourceField = field === 'note' ? 'publicNote' : field;
    const v = master[sourceField];
    if (field === 'age') {
      if (!master.dob && Number.isInteger(v)) out.age = v;
    } else if (typeof v === 'string' && v.trim()) {
      out[field] = v.trim();
    }
  }
  return out;
}

/** Display name: Hindi first, English as fallback. */
export function memberName(m) {
  return m.nameHi || m.nameEn || '';
}

/** Sort key used for publishing and display (Hindi collation where available). */
export function compareMembers(a, b) {
  return memberName(a).localeCompare(memberName(b), 'hi') || a.id.localeCompare(b.id);
}
