/**
 * Birthdays & wedding anniversaries, computed on the phone from the already
 * downloaded directory snapshot — no extra data, no network calls.
 *
 * The index (month-day → members) is built once per snapshot; looking up a day
 * or a whole month is then a few map reads.
 */
import { isLeapYear, parseKey, toKey, daysInMonth } from '../utils/date.js';
import { memberName } from '../shared/directorySchema.js';

const indexCache = new WeakMap(); // members array → index

const monthDay = (key) => key.slice(5); // "YYYY-MM-DD" → "MM-DD"

/** "MM-DD" → [{ member, kind: 'birthday'|'anniversary', year }] */
export function buildCelebrationIndex(members) {
  if (!Array.isArray(members)) return new Map();
  if (indexCache.has(members)) return indexCache.get(members);
  const index = new Map();
  const add = (md, entry) => {
    if (!index.has(md)) index.set(md, []);
    index.get(md).push(entry);
  };
  for (const member of members) {
    for (const [kind, field] of [['birthday', 'dob'], ['anniversary', 'anniversary']]) {
      const p = parseKey(member[field]);
      if (p) add(monthDay(member[field]), { member, kind, year: p.y });
    }
  }
  for (const list of index.values()) {
    list.sort((a, b) => (a.kind === b.kind ? memberName(a.member).localeCompare(memberName(b.member), 'hi') : a.kind === 'birthday' ? -1 : 1));
  }
  indexCache.set(members, index);
  return index;
}

/**
 * Celebrations on a date, with the number of years being completed
 * (36th birthday, 14th anniversary). 29 February dates are celebrated on
 * 28 February in non-leap years. Future dates (not yet born / married) are skipped.
 */
export function celebrationsOn(index, dateKey) {
  const p = parseKey(dateKey);
  if (!p || !index?.size) return [];
  const entries = [...(index.get(monthDay(dateKey)) ?? [])];
  if (p.m === 2 && p.d === 28 && !isLeapYear(p.y)) entries.push(...(index.get('02-29') ?? []));
  return entries
    .map((e) => ({ ...e, years: p.y - e.year }))
    .filter((e) => (e.kind === 'birthday' ? e.years >= 0 : e.years >= 1));
}

/** dateKey → number of celebrations, for every day of a month (for calendar markers). */
export function celebrationCountsForMonth(index, y, m) {
  const counts = {};
  if (!index?.size) return counts;
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = toKey(y, m, d);
    const n = celebrationsOn(index, key).length;
    if (n) counts[key] = n;
  }
  return counts;
}

/** Hindi ordinal label: "३६वाँ जन्मदिन", "१४वीं वर्षगांठ" (digits converted by the caller's formatter). */
export function celebrationLabel(entry, num) {
  if (entry.kind === 'birthday') return entry.years === 0 ? 'जन्म दिवस' : `${num(entry.years)}वाँ जन्मदिन`;
  return `${num(entry.years)}वीं विवाह वर्षगांठ`;
}

export function greetingFor(entry) {
  return entry.kind === 'birthday'
    ? 'जन्मदिन की हार्दिक शुभकामनाएँ! 🎂🙏'
    : 'विवाह वर्षगांठ की हार्दिक शुभकामनाएँ! 💐🙏';
}
