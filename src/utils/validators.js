/**
 * Field-level validators shared by:
 *  - the app at runtime (malformed optional records are skipped, never crash), and
 *  - `npm run validate-data` at build time (malformed data fails the build).
 *
 * Each validator returns a list of problem strings ([] = valid).
 */
import { isValidKey, isValidTime, parseKey } from './date.js';
import { MAAS_KEYS, PAKSHA_KEYS } from '../constants/terms.js';
import { CATEGORY_KEYS, IMPORTANCE_LEVELS } from '../constants/categories.js';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEVANAGARI = /[ऀ-ॿ]/;
const DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/** "YYYY-MM-DDTHH:MM" (IST wall-clock time, as written by the generator). */
export function isValidDateTime(value) {
  const m = DATETIME_PATTERN.exec(typeof value === 'string' ? value : '');
  return Boolean(m && isValidKey(m[1]) && isValidTime(m[2]));
}

/** {hi, en} text. Hindi is required (and must be Devanagari); English is optional. */
export function checkLocalizedText(value, field, { required = true } = {}) {
  if (value === undefined && !required) return [];
  if (!isObject(value)) return [`${field} must be an object like {"hi": "…"}`];
  const problems = [];
  if (!isNonEmptyString(value.hi)) problems.push(`${field}.hi is missing`);
  else if (!DEVANAGARI.test(value.hi)) problems.push(`${field}.hi should be written in Devanagari`);
  if (value.en !== undefined && !isNonEmptyString(value.en)) problems.push(`${field}.en must be non-empty text`);
  return problems;
}

/** Problems that are not errors: e.g. missing English translation. */
export function translationWarnings(value, field) {
  return isObject(value) && !isNonEmptyString(value.en) ? [`${field}.en (English translation) is missing`] : [];
}

export function checkDayRecord(day) {
  if (!isObject(day)) return ['day record must be an object'];
  const problems = [];
  if (!Number.isInteger(day.tithi) || day.tithi < 1 || day.tithi > 15) problems.push(`tithi must be 1–15 (got ${day.tithi})`);
  if (!PAKSHA_KEYS.includes(day.paksha)) problems.push(`paksha must be one of ${PAKSHA_KEYS.join(', ')} (got ${day.paksha})`);
  if (!MAAS_KEYS.includes(day.maas)) problems.push(`maas must be one of ${MAAS_KEYS.join(', ')} (got ${day.maas})`);
  if (day.adhik !== undefined && typeof day.adhik !== 'boolean') problems.push('adhik must be true/false');
  if (day.sunrise !== undefined && !isValidTime(day.sunrise)) problems.push(`sunrise must be HH:MM (got ${day.sunrise})`);
  if (day.sunset !== undefined && !isValidTime(day.sunset)) problems.push(`sunset must be HH:MM (got ${day.sunset})`);
  for (const field of ['tithiStart', 'tithiEnd']) {
    if (day[field] !== undefined && !isValidDateTime(day[field])) {
      problems.push(`${field} must be YYYY-MM-DDTHH:MM (got ${day[field]})`);
    }
  }
  if (isValidDateTime(day.tithiStart) && isValidDateTime(day.tithiEnd) && day.tithiStart >= day.tithiEnd) {
    problems.push('tithiStart must be before tithiEnd');
  }
  if (day.kshaya !== undefined) {
    const k = day.kshaya;
    if (!isObject(k) || !Number.isInteger(k.tithi) || k.tithi < 1 || k.tithi > 15 || !PAKSHA_KEYS.includes(k.paksha)) {
      problems.push('kshaya must be {"tithi": 1–15, "paksha": "shukla"|"krishna", "start"?, "end"?}');
    } else if ((k.start !== undefined && !isValidDateTime(k.start)) || (k.end !== undefined && !isValidDateTime(k.end))) {
      problems.push('kshaya.start / kshaya.end must be YYYY-MM-DDTHH:MM');
    }
  }
  return problems;
}

function checkReminder(reminder) {
  if (reminder === undefined) return [];
  if (!isObject(reminder)) return ['reminder must be an object'];
  const problems = [];
  if (typeof reminder.enabled !== 'boolean') problems.push('reminder.enabled must be true/false');
  if (reminder.defaultTime !== undefined && !isValidTime(reminder.defaultTime)) {
    problems.push(`reminder.defaultTime must be HH:MM, 24-hour (got ${reminder.defaultTime})`);
  }
  return problems;
}

function checkOccasionCommon(o) {
  const problems = [];
  if (o.holiday !== undefined && typeof o.holiday !== 'boolean') problems.push('holiday must be true/false');
  if (!isNonEmptyString(o.id) || !ID_PATTERN.test(o.id)) problems.push(`id must be lowercase-with-hyphens (got ${o.id})`);
  problems.push(...checkLocalizedText(o.title, 'title'));
  problems.push(...checkLocalizedText(o.description, 'description', { required: false }));
  if (!CATEGORY_KEYS.includes(o.category)) problems.push(`category must be one of ${CATEGORY_KEYS.join(', ')} (got ${o.category})`);
  if (!IMPORTANCE_LEVELS.includes(o.importance)) problems.push(`importance must be one of ${IMPORTANCE_LEVELS.join(', ')} (got ${o.importance})`);
  problems.push(...checkReminder(o.reminder));
  return problems;
}

/** Occasion in <year>.json — has a full `date`. */
export function checkOccasion(o, year) {
  if (!isObject(o)) return ['occasion must be an object'];
  const problems = checkOccasionCommon(o);
  const date = parseKey(o.date);
  if (!date) problems.push(`date must be a real date YYYY-MM-DD (got ${o.date})`);
  else if (year !== undefined && date.y !== year) problems.push(`date ${o.date} is not in ${year}`);
  return problems;
}

/** Occasion in recurring.json — has `monthDay` "MM-DD". */
export function checkRecurringOccasion(o) {
  if (!isObject(o)) return ['occasion must be an object'];
  const problems = checkOccasionCommon(o);
  // 2024 is a leap year, so 02-29 is accepted here (it simply won't appear in other years).
  if (typeof o.monthDay !== 'string' || !isValidKey(`2024-${o.monthDay}`)) {
    problems.push(`monthDay must be MM-DD (got ${o.monthDay})`);
  }
  return problems;
}

const SAFE_LINK_TYPES = ['tel', 'https', 'mailto', 'whatsapp'];

/** Bundled image path ("ads/x.webp") or an https URL (admin-published ads). */
export function isSafeImageRef(value) {
  if (typeof value !== 'string') return false;
  if (/^ads\/[\w.-]+\.(webp|png|jpe?g|svg)$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && value.length <= 1000;
  } catch {
    return false;
  }
}

function checkDateRange(item) {
  const problems = [];
  if (item.startDate !== undefined && !isValidKey(item.startDate)) problems.push(`startDate must be YYYY-MM-DD (got ${item.startDate})`);
  if (item.endDate !== undefined && !isValidKey(item.endDate)) problems.push(`endDate must be YYYY-MM-DD (got ${item.endDate})`);
  if (isValidKey(item.startDate) && isValidKey(item.endDate) && item.startDate > item.endDate) {
    problems.push('startDate is after endDate');
  }
  return problems;
}

export function checkAdvertisement(ad) {
  if (!isObject(ad)) return ['advertisement must be an object'];
  const problems = [];
  if (!isNonEmptyString(ad.id) || !ID_PATTERN.test(ad.id)) problems.push(`id must be lowercase-with-hyphens (got ${ad.id})`);
  problems.push(...checkLocalizedText(ad.title, 'title'));
  problems.push(...checkLocalizedText(ad.description, 'description', { required: false }));
  problems.push(...checkLocalizedText(ad.sponsor, 'sponsor', { required: false }));
  if (typeof ad.active !== 'boolean') problems.push('active must be true/false');
  if (!Number.isFinite(ad.priority)) problems.push('priority must be a number');
  if (ad.image !== undefined && ad.image !== '' && !isSafeImageRef(ad.image)) {
    problems.push(`image must be "ads/<file>.webp|png|jpg|svg" or an https:// URL (got ${String(ad.image).slice(0, 60)})`);
  }
  if (ad.link !== undefined) {
    if (!isObject(ad.link) || !SAFE_LINK_TYPES.includes(ad.link.type) || !isNonEmptyString(ad.link.value)) {
      problems.push(`link must be {"type": ${SAFE_LINK_TYPES.join('|')}, "value": "…"}`);
    }
  }
  problems.push(...checkDateRange(ad));
  return problems;
}

export function checkNotice(notice) {
  if (!isObject(notice)) return ['notice must be an object'];
  const problems = [];
  if (!isNonEmptyString(notice.id) || !ID_PATTERN.test(notice.id)) problems.push(`id must be lowercase-with-hyphens (got ${notice.id})`);
  problems.push(...checkLocalizedText(notice.title, 'title'));
  problems.push(...checkLocalizedText(notice.body, 'body'));
  if (typeof notice.active !== 'boolean') problems.push('active must be true/false');
  if (!Number.isFinite(notice.priority)) problems.push('priority must be a number');
  if (notice.popup !== undefined && typeof notice.popup !== 'boolean') problems.push('popup must be true/false');
  problems.push(...checkDateRange(notice));
  return problems;
}
