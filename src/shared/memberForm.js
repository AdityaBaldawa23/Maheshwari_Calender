/**
 * Validation for the admin portal's manual add/edit member form. Uses the same
 * normalisers as spreadsheet import, so both paths store identical data.
 */
import { MEMBER_ID_PATTERN } from './directorySchema.js';
import { PROFESSION_IDS } from './professions.js';
import { DEFAULT_ORG, ORG_IDS } from './organizations.js';
import { isDistrictId } from './districts.js';
import {
  cleanText, normalizeAge, normalizeBloodGroup, normalizeDate, normalizeMemberId, normalizePhone, normalizePhotoUrl,
  normalizeText,
} from './import/normalize.js';

const TEXT = { nameHi: 100, nameEn: 100, fatherName: 100, motherName: 100, city: 100, publicNote: 300, adminNote: 500, professionDetail: 120, designation: 80 };

export const EMPTY_MEMBER_FORM = {
  id: '', nameHi: '', nameEn: '', dob: '', age: '', anniversary: '', bloodGroup: '', fatherName: '', motherName: '',
  phone: '', city: '', district: '', publicNote: '', adminNote: '', status: 'active',
  photo: '', profession: '', professionDetail: '', designation: '', org: DEFAULT_ORG,
};

/** Master record → form strings. */
export function toForm(member) {
  const f = { ...EMPTY_MEMBER_FORM };
  for (const k of Object.keys(f)) if (member?.[k] !== undefined && member[k] !== null) f[k] = String(member[k]);
  return f;
}

/**
 * @returns {{ record: object, errors: Record<string,string> }}
 *   record contains every field (blank → '') so saving can also clear values.
 */
export function validateMemberForm(form, { today, isNew }) {
  const errors = {};
  const record = { status: form.status === 'inactive' ? 'inactive' : 'active' };
  const take = (field, result) => {
    if (result.error) errors[field] = result.error;
    else record[field] = result.value ?? '';
  };

  const id = normalizeMemberId(form.id);
  if (id.error) errors.id = id.error;
  else if (!id.value && !isNew) errors.id = 'सदस्य क्रमांक आवश्यक — member ID required';
  else record.id = id.value;

  for (const [field, max] of Object.entries(TEXT)) take(field, normalizeText(form[field], max));
  take('dob', normalizeDate(form.dob, { notAfter: today }));
  take('anniversary', normalizeDate(form.anniversary, { notAfter: today }));
  take('bloodGroup', normalizeBloodGroup(form.bloodGroup));
  take('phone', normalizePhone(form.phone));
  take('photo', normalizePhotoUrl(form.photo));
  if (form.profession && !PROFESSION_IDS.includes(form.profession)) errors.profession = 'Unknown profession category';
  else record.profession = form.profession || '';
  record.org = ORG_IDS.includes(form.org) ? form.org : DEFAULT_ORG;
  if (form.district && !isDistrictId(form.district)) errors.district = 'Unknown district';
  else record.district = form.district || '';
  const age = normalizeAge(form.age);
  if (age.error) errors.age = age.error;
  else record.age = record.dob ? '' : age.value; // never store an age when a DOB exists

  if (!record.nameHi && !record.nameEn && !errors.nameHi && !errors.nameEn) {
    errors.nameHi = 'हिंदी या अंग्रेज़ी नाम आवश्यक — a name is required';
  }
  if (record.id && !MEMBER_ID_PATTERN.test(record.id)) errors.id = 'अमान्य सदस्य क्रमांक — invalid member ID';
  return { record, errors };
}

/** New member IDs for manual creation: readable, collision-checked by the caller. */
export function newMemberId(nameHint = '') {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const initials = cleanText(nameHint).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  return `M${initials}${rand}`;
}
