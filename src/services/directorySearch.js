/**
 * Offline directory search. An index is built once per snapshot (normalised
 * haystack per member); every keystroke then filters in memory — no network.
 * 10,000 members search in a few milliseconds on a mid-range phone.
 */
import { compareMembers, memberName } from '../shared/directorySchema.js';
import { PROFESSIONS, professionLabel } from '../shared/professions.js';
import { orgOf } from '../shared/organizations.js';

const DEVANAGARI_DIGIT = /[०-९]/g;

/** Case-, width- and whitespace-insensitive normal form for Hindi + English text. */
export function normalizeForSearch(s) {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(DEVANAGARI_DIGIT, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/\u200b|\u200c|\u200d/g, '') // zero-width characters
    .replace(/\u093c/g, '') // nukta: fa ~ pha
    .replace(/[.,'’"()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Display form of a locality for the filter list (first-letter-cased, trimmed). */
const cityLabel = (s) => s.trim().replace(/\s+/g, ' ');

export function buildDirectoryIndex(members) {
  const sorted = [...members].sort(compareMembers);
  const entries = sorted.map((m) => {
    const phoneDigits = (m.phone ?? '').replace(/\D/g, '');
    return {
      member: m,
      haystack: normalizeForSearch(
        [
          m.nameHi, m.nameEn, m.fatherName, m.motherName, m.city, m.id, m.bloodGroup, phoneDigits, phoneDigits.slice(-10),
          m.designation, m.professionDetail, professionLabel(m.profession, 'hi'), professionLabel(m.profession, 'en'),
        ].join(' '),
      ),
      city: normalizeForSearch(m.city),
      org: orgOf(m),
    };
  });

  const cities = new Map(); // normalised → label
  for (const e of entries) if (e.city && !cities.has(e.city)) cities.set(e.city, cityLabel(e.member.city));
  const bloodGroups = [...new Set(sorted.map((m) => m.bloodGroup).filter(Boolean))].sort();
  const usedProfessions = new Set(sorted.map((m) => m.profession).filter(Boolean));
  const orgCounts = {};
  for (const e of entries) orgCounts[e.org] = (orgCounts[e.org] ?? 0) + 1;

  return {
    size: entries.length,
    entries,
    cities: [...cities.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'hi')),
    bloodGroups,
    /** Profession categories that occur in the data, in the standard list order. */
    professions: PROFESSIONS.filter((p) => usedProfessions.has(p.id)).map((p) => p.id),
    orgCounts,
  };
}

/**
 * @param {ReturnType<typeof buildDirectoryIndex>} index
 * @param {{query?: string, bloodGroup?: string, city?: string, profession?: string, org?: string}} criteria
 *   city is the normalised value; org limits results to one organisation
 * @returns {object[]} matching members, in name order
 */
export function searchDirectory(index, { query = '', bloodGroup = '', city = '', profession = '', org = '' } = {}) {
  const tokens = normalizeForSearch(query).split(' ').filter(Boolean);
  const out = [];
  for (const e of index.entries) {
    if (org && e.org !== org) continue;
    if (bloodGroup && e.member.bloodGroup !== bloodGroup) continue;
    if (profession && e.member.profession !== profession) continue;
    if (city && e.city !== city) continue;
    if (tokens.length && !tokens.every((t) => e.haystack.includes(t))) continue;
    out.push(e.member);
  }
  return out;
}

export { memberName };
