/**
 * Whole-file validation used by `npm run validate-data` (and its tests).
 * Each function returns { errors: string[], warnings: string[] }.
 * Errors fail the build; warnings are printed for the content editor.
 */
import { addDays, daysInMonth, isLeapYear, parseKey, toKey } from '../../src/utils/date.js';
import {
  checkAdvertisement,
  checkDayRecord,
  checkNotice,
  checkOccasion,
  checkRecurringOccasion,
  translationWarnings,
} from '../../src/utils/validators.js';

const report = () => ({ errors: [], warnings: [] });
const prefix = (where, list) => list.map((p) => `${where}: ${p}`);

/** Absolute tithi index 1–30 (Shukla 1 … Purnima 15, Krishna 1 … Amavasya 30). */
const absoluteTithi = (day) => (day.paksha === 'shukla' ? day.tithi : day.tithi + 15);

export function validateCalendarFile(data, fileYear) {
  const r = report();
  if (!data || typeof data !== 'object') {
    r.errors.push('file is not a JSON object');
    return r;
  }
  if (data.year !== fileYear) r.errors.push(`"year" is ${data.year} but the file is named ${fileYear}.json`);
  if (!data.days || typeof data.days !== 'object') {
    r.errors.push('"days" object is missing');
    return r;
  }
  if (data.meta?.verified !== true) {
    r.warnings.push('meta.verified is not true — verify against a trusted panchang before release');
  }

  for (const [key, day] of Object.entries(data.days)) {
    const parsed = parseKey(key);
    if (!parsed) r.errors.push(`${key}: not a real date (YYYY-MM-DD)`);
    else if (parsed.y !== fileYear) r.errors.push(`${key}: belongs to ${parsed.y}, not ${fileYear}`);
    r.errors.push(...prefix(key, checkDayRecord(day)));
  }

  // Every civil day must be present.
  const expected = isLeapYear(fileYear) ? 366 : 365;
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysInMonth(fileYear, m); d++) {
      const key = toKey(fileYear, m, d);
      if (!(key in data.days)) r.errors.push(`${key}: missing day`);
    }
  }
  const count = Object.keys(data.days).length;
  if (count !== expected) r.errors.push(`expected ${expected} days, found ${count}`);

  // Tithi continuity: from one sunrise to the next the tithi advances by 0 (vriddhi), 1, or 2 (kshaya).
  for (const key of Object.keys(data.days).sort()) {
    const next = data.days[addDaysSafe(key)];
    const day = data.days[key];
    if (!next || checkDayRecord(day).length || checkDayRecord(next).length) continue;
    const step = (absoluteTithi(next) - absoluteTithi(day) + 30) % 30;
    if (step > 2) r.errors.push(`${key} → next day: tithi jumps by ${step} (expected 0, 1 or 2) — check for a typo`);
    if (step === 2 && !day.kshaya) r.warnings.push(`${key}: a tithi is skipped but no "kshaya" is recorded`);
  }
  return r;
}

function addDaysSafe(key) {
  try {
    return addDays(key, 1);
  } catch {
    return null;
  }
}

export function validateOccasionsFile(data, fileYear) {
  const r = report();
  if (data?.year !== fileYear) r.errors.push(`"year" is ${data?.year} but the file is named ${fileYear}.json`);
  if (!Array.isArray(data?.occasions)) {
    r.errors.push('"occasions" array is missing');
    return r;
  }
  if (data.meta?.verified !== true) {
    r.warnings.push('meta.verified is not true — verify festival dates against a trusted panchang before release');
  }
  const seen = new Map();
  data.occasions.forEach((o, i) => {
    const where = `occasions[${i}] (${o?.id ?? '?'})`;
    r.errors.push(...prefix(where, checkOccasion(o, fileYear)));
    r.warnings.push(...prefix(where, translationWarnings(o?.title, 'title')));
    const dupKey = `${o?.id}|${o?.date}`;
    if (seen.has(dupKey)) r.errors.push(`${where}: duplicate of occasions[${seen.get(dupKey)}] (same id and date)`);
    else seen.set(dupKey, i);
  });

  // Same title on the same date under different ids is almost certainly an accidental duplicate.
  const titles = new Map();
  for (const o of data.occasions) {
    const k = `${o?.date}|${o?.title?.hi}`;
    if (titles.has(k) && titles.get(k) !== o.id) r.warnings.push(`${o.date}: "${o.title.hi}" appears twice (ids ${titles.get(k)}, ${o.id})`);
    titles.set(k, o?.id);
  }
  return r;
}

export function validateRecurringFile(data) {
  const r = report();
  if (!Array.isArray(data?.occasions)) {
    r.errors.push('"occasions" array is missing');
    return r;
  }
  const ids = new Set();
  data.occasions.forEach((o, i) => {
    const where = `occasions[${i}] (${o?.id ?? '?'})`;
    r.errors.push(...prefix(where, checkRecurringOccasion(o)));
    r.warnings.push(...prefix(where, translationWarnings(o?.title, 'title')));
    if (ids.has(o?.id)) r.errors.push(`${where}: duplicate id`);
    ids.add(o?.id);
  });
  return r;
}

export function validateAdsFile(data, imageExists) {
  const r = report();
  if (!Array.isArray(data?.ads)) {
    r.errors.push('"ads" array is missing');
    return r;
  }
  const ids = new Set();
  data.ads.forEach((ad, i) => {
    const where = `ads[${i}] (${ad?.id ?? '?'})`;
    r.errors.push(...prefix(where, checkAdvertisement(ad)));
    if (ids.has(ad?.id)) r.errors.push(`${where}: duplicate id`);
    ids.add(ad?.id);
    if (typeof ad?.image === 'string' && !imageExists(ad.image)) r.errors.push(`${where}: image public/${ad.image} not found`);
  });
  return r;
}

export function validateNoticesFile(data) {
  const r = report();
  if (!Array.isArray(data?.notices)) {
    r.errors.push('"notices" array is missing');
    return r;
  }
  const ids = new Set();
  data.notices.forEach((n, i) => {
    const where = `notices[${i}] (${n?.id ?? '?'})`;
    r.errors.push(...prefix(where, checkNotice(n)));
    if (ids.has(n?.id)) r.errors.push(`${where}: duplicate id`);
    ids.add(n?.id);
  });
  return r;
}
