/**
 * Normalisation of untrusted spreadsheet cell values. Each function returns
 * { value } on success (value may be '' for blank) or { error } with a Hindi +
 * English explanation. Values from .xlsx may be strings, numbers, booleans or
 * Date objects; from .csv they are always strings.
 */
import { isValidKey, toKey } from '../../utils/date.js';
import { BLOOD_GROUPS, MEMBER_ID_PATTERN } from '../directorySchema.js';

const DEVANAGARI_DIGITS = /[०-९]/g;
const toAsciiDigits = (s) => s.replace(DEVANAGARI_DIGITS, (d) => String(d.charCodeAt(0) - 0x0966));

export const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Collapses whitespace, removes zero-width/control characters, NFC-normalises. */
export function cleanText(v) {
  if (isBlank(v)) return '';
  return String(v)
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Text that a spreadsheet program would treat as a formula (we never evaluate it). */
export function looksLikeFormula(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v.trim()) && !/^\+?\d[\d\s-]*$/.test(v.trim());
}

export function normalizeText(v, max) {
  const value = cleanText(v);
  if (value.length > max) return { error: `बहुत लंबा (${value.length}/${max} अक्षर) — too long` };
  return { value };
}

/** Excel serial date (1900 system) → "YYYY-MM-DD". */
function fromExcelSerial(n) {
  if (!Number.isFinite(n) || n < 1 || n > 80000) return null;
  const ms = Math.round((n - 25569) * 86400000); // 25569 = days from 1899-12-30 to 1970-01-01
  const d = new Date(ms);
  return toKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Accepts: Date cells, Excel serial numbers, "YYYY-MM-DD", "DD/MM/YYYY",
 * "DD-MM-YYYY", "DD.MM.YYYY" (Indian day-first order), Devanagari digits.
 * Two-digit years are rejected as ambiguous.
 */
export function normalizeDate(v, { notAfter } = {}) {
  if (isBlank(v)) return { value: '' };
  let key = null;
  if (v instanceof Date) {
    key = Number.isNaN(v.getTime()) ? null : toKey(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  } else if (typeof v === 'number') {
    key = fromExcelSerial(v);
  } else {
    const s = toAsciiDigits(cleanText(v));
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) key = toKey(+m[1], +m[2], +m[3]);
    else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) key = toKey(+m[3], +m[2], +m[1]);
    else if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2}$/.test(s)) return { error: 'दो अंकों का वर्ष अस्पष्ट है — use a 4-digit year' };
    else if (/^\d+(\.\d+)?$/.test(s)) key = fromExcelSerial(Number(s));
  }
  if (!key || !isValidKey(key)) return { error: `अमान्य तिथि "${String(v).slice(0, 30)}" — invalid date (use DD/MM/YYYY)` };
  if (key < '1900-01-01') return { error: 'तिथि 1900 से पहले की है — date before 1900' };
  if (notAfter && key > notAfter) return { error: 'तिथि भविष्य की है — date is in the future' };
  return { value: key };
}

const BLOOD_ALIASES = { POSITIVE: '+', POS: '+', VE: '', NEGATIVE: '-', NEG: '-' };

/** "a +ve", "B Positive", "ab-", "O POS" → "A+", "B+", "AB-", "O+". */
export function normalizeBloodGroup(v) {
  if (isBlank(v)) return { value: '' };
  let s = cleanText(v).toUpperCase().replace(/[()]/g, ' ');
  s = s.replace(/\b(POSITIVE|POS|NEGATIVE|NEG)\b/g, (w) => BLOOD_ALIASES[w]);
  s = s.replace(/([+-])\s*VE\b/g, '$1').replace(/\s+/g, '').replace(/^0/, 'O');
  return BLOOD_GROUPS.includes(s) ? { value: s } : { error: `अमान्य रक्त समूह "${cleanText(v)}" — invalid blood group` };
}

/**
 * Indian phone numbers: 10-digit mobiles (with optional +91 / 91 / 0 prefix)
 * become "+91XXXXXXXXXX"; landlines with STD code (10–11 digits) are kept as
 * digits. If a cell holds several numbers, the first is kept with a warning.
 */
export function normalizePhone(v) {
  if (isBlank(v)) return { value: '' };
  const raw = toAsciiDigits(typeof v === 'number' ? String(Math.trunc(v)) : cleanText(v));
  const parts = raw.split(/[,/;|]| or /i).map((p) => p.trim()).filter(Boolean);
  const first = parts[0] ?? '';
  const digits = first.replace(/[\s().-]/g, '');
  const warning = parts.length > 1 ? 'एक से अधिक नंबर — only the first number was kept' : undefined;
  let m;
  if ((m = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(digits))) return { value: `+91${m[1]}`, warning };
  if (/^0\d{9,10}$/.test(digits)) return { value: digits, warning };
  if (/^\+\d{8,15}$/.test(digits)) return { value: digits, warning };
  return { error: `अमान्य फ़ोन नंबर "${first.slice(0, 20)}" — invalid phone number` };
}

export function normalizeAge(v) {
  if (isBlank(v)) return { value: '' };
  const s = toAsciiDigits(String(v).trim()).replace(/\s*(years?|yrs?|वर्ष|साल)$/i, '');
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > 125) return { error: `अमान्य आयु "${String(v).slice(0, 10)}" — invalid age` };
  return { value: n };
}

export function normalizeMemberId(v) {
  if (isBlank(v)) return { value: '' };
  const s = typeof v === 'number' ? String(Math.trunc(v)) : cleanText(v).replace(/\s+/g, '-');
  return MEMBER_ID_PATTERN.test(s) ? { value: s } : { error: `अमान्य सदस्य क्रमांक "${s.slice(0, 40)}" — use letters, digits, - or _` };
}

const DEVANAGARI = /[ऀ-ॿ]/;
export const isDevanagari = (s) => DEVANAGARI.test(s);
