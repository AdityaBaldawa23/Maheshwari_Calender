/**
 * Hindi display formatting. All user-visible numbers (dates, years, times,
 * samvat) are written in Devanagari digits (०–९). Functions take a `lang`
 * argument (default "hi") so an English UI can be added later without touching
 * the data.
 */
import { ADHIK, AMAVASYA, GREGORIAN_MONTHS, MAAS, PAKSHAS, PURNIMA, TITHIS, WEEKDAYS } from '../constants/terms.js';
import { parseKey, parseTime } from './date.js';

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** Converts ASCII digits to Devanagari digits: 2026 → २०२६. Other characters are kept. */
export function toHindiDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => DEVANAGARI_DIGITS[d]);
}

/** Number in the UI's numeral system. */
export function num(value, lang = 'hi') {
  return lang === 'hi' ? toHindiDigits(value) : String(value);
}

/** Picks the language from a {hi, en} object, falling back to Hindi. */
export function txt(value, lang = 'hi') {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value.hi || '';
}

export function tithiName(tithi, paksha, lang = 'hi') {
  if (tithi === 15) return txt(paksha === 'krishna' ? AMAVASYA : PURNIMA, lang);
  return txt(TITHIS[tithi], lang);
}

export function maasName(maas, adhik = false, lang = 'hi') {
  const name = txt(MAAS[maas], lang);
  return adhik ? `${txt(ADHIK, lang)} ${name}` : name;
}

/** "ज्येष्ठ शुक्ल नवमी", "अधिक ज्येष्ठ कृष्ण अमावस्या". */
export function fullTithiLabel(panchang, lang = 'hi') {
  if (!panchang) return '';
  const { maas, adhik, paksha, tithi } = panchang;
  return `${maasName(maas, adhik, lang)} ${txt(PAKSHAS[paksha], lang)} ${tithiName(tithi, paksha, lang)}`;
}

/** Paksha initial for tight spaces: "शु." / "कृ.". */
export function pakshaShort(paksha, lang = 'hi') {
  if (lang !== 'hi') return paksha === 'shukla' ? 'S' : 'K';
  return paksha === 'shukla' ? 'शु.' : 'कृ.';
}

/** Tithi label for calendar cells: "शु. नवमी", "पूर्णिमा", "अमावस्या". */
export function cellTithiLabel(panchang, lang = 'hi') {
  if (!panchang) return '';
  if (panchang.tithi === 15) return tithiName(15, panchang.paksha, lang);
  return `${pakshaShort(panchang.paksha, lang)} ${tithiName(panchang.tithi, panchang.paksha, lang)}`;
}

export function monthName(m, lang = 'hi') {
  return txt(GREGORIAN_MONTHS[m - 1], lang);
}

/** "अक्टूबर २०२६". */
export function monthYearLabel(y, m, lang = 'hi') {
  return `${monthName(m, lang)} ${num(y, lang)}`;
}

export function weekdayName(weekday, lang = 'hi') {
  return txt(WEEKDAYS[weekday], lang);
}

export function weekdayShort(weekday, lang = 'hi') {
  return txt(WEEKDAYS[weekday].short, lang);
}

/** "११ अक्टूबर २०२७". */
export function formatDate(key, lang = 'hi') {
  const p = parseKey(key);
  return p ? `${num(p.d, lang)} ${monthName(p.m, lang)} ${num(p.y, lang)}` : '';
}

/** "११ अक्टूबर" (no year). */
export function formatDayMonth(key, lang = 'hi') {
  const p = parseKey(key);
  return p ? `${num(p.d, lang)} ${monthName(p.m, lang)}` : '';
}

function dayPeriod(h) {
  if (h >= 4 && h < 12) return 'सुबह';
  if (h >= 12 && h < 16) return 'दोपहर';
  if (h >= 16 && h < 20) return 'शाम';
  return 'रात';
}

/** "सुबह ६:३६", "शाम ७:१२"; English: "6:36 AM". */
export function formatTime(hhmm, lang = 'hi') {
  const t = parseTime(hhmm);
  if (!t) return '';
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  const mm = String(t.min).padStart(2, '0');
  if (lang !== 'hi') return `${h12}:${mm} ${t.h < 12 ? 'AM' : 'PM'}`;
  return `${dayPeriod(t.h)} ${num(`${h12}:${mm}`)}`;
}

/** "YYYY-MM-DDTHH:MM" → "१२ अक्टूबर, रात ८:१०" (always with the date, so it is unambiguous). */
export function formatDateTime(isoLocal, lang = 'hi') {
  if (typeof isoLocal !== 'string') return '';
  const [date, time] = isoLocal.split('T');
  const day = formatDayMonth(date, lang);
  const clock = formatTime(time, lang);
  return day && clock ? `${day}, ${clock}` : '';
}

/** "आश्विन – कार्तिक" for the lunar months spanning a Gregorian month. */
export function lunarMonthsLabel(lunarMonths, lang = 'hi') {
  return lunarMonths.map((lm) => maasName(lm.maas, lm.adhik, lang)).join(' – ');
}

export function samvatLabel(samvats, lang = 'hi') {
  if (!samvats?.length) return '';
  return `वि.सं. ${samvats.map((s) => num(s, lang)).join('–')}`;
}

/** "+919876543210" → "+९१ ९८७६५ ४३२१०"; other numbers just get Devanagari digits. */
export function formatPhone(phone, lang = 'hi') {
  const m = /^\+91([6-9]\d{4})(\d{5})$/.exec(phone ?? '');
  return num(m ? `+91 ${m[1]} ${m[2]}` : (phone ?? ''), lang);
}
