/**
 * Civil-date helpers.
 *
 * All calendar logic works on plain "YYYY-MM-DD" keys and integer {y, m, d}
 * triples (m is 1–12). We deliberately never parse date strings with
 * `new Date("2027-01-01")` — that is interpreted as UTC midnight and shifts the
 * day for any timezone west of UTC. Weekdays and day arithmetic use integer
 * algorithms, so results never depend on the device timezone.
 *
 * The only place a JS Date is read is `todayKey()`, which uses *local* getters
 * so "today" matches the date shown on the user's phone.
 */

const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(y, m) {
  if (m === 2 && isLeapYear(y)) return 29;
  return MONTH_LENGTHS[m - 1];
}

export function isValidYmd(y, m, d) {
  return (
    Number.isInteger(y) &&
    Number.isInteger(m) &&
    Number.isInteger(d) &&
    y >= 1 &&
    y <= 9999 &&
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= daysInMonth(y, m)
  );
}

const pad2 = (n) => String(n).padStart(2, '0');

export function toKey(y, m, d) {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

/** Strictly parses "YYYY-MM-DD". Returns null for anything malformed or impossible (e.g. 2027-02-30). */
export function parseKey(key) {
  if (typeof key !== 'string') return null;
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return isValidYmd(y, m, d) ? { y, m, d } : null;
}

export function isValidKey(key) {
  return parseKey(key) !== null;
}

// Howard Hinnant's days_from_civil / civil_from_days (proleptic Gregorian).
function daysFromCivil(y, m, d) {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z) {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(y, m, d) {
  const days = daysFromCivil(y, m, d);
  return ((days % 7) + 11) % 7; // 1970-01-01 (day 0) was a Thursday (4)
}

export function weekdayOfKey(key) {
  const p = parseKey(key);
  return p ? weekdayOf(p.y, p.m, p.d) : null;
}

export function addDays(key, n) {
  const p = parseKey(key);
  if (!p) throw new RangeError(`Invalid date key: ${key}`);
  const c = civilFromDays(daysFromCivil(p.y, p.m, p.d) + n);
  return toKey(c.y, c.m, c.d);
}

/** Whole days from keyA to keyB (positive when B is later). */
export function diffDays(keyA, keyB) {
  const a = parseKey(keyA);
  const b = parseKey(keyB);
  if (!a || !b) throw new RangeError(`Invalid date key: ${!a ? keyA : keyB}`);
  return daysFromCivil(b.y, b.m, b.d) - daysFromCivil(a.y, a.m, a.d);
}

/** Month arithmetic on {y, m}; returns a new {y, m}. */
export function addMonths({ y, m }, n) {
  const index = y * 12 + (m - 1) + n;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

/** The device-local calendar date (what the phone's own calendar shows). */
export function todayKey(now = new Date()) {
  return toKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Milliseconds until the next local midnight — used to roll "today" over. */
export function msUntilNextMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

/**
 * Month grid for rendering. Returns an array of weeks; each week is 7 cells,
 * each cell either a date key or null (padding before the 1st / after the last).
 * Weeks start on Sunday (रविवार), as on Indian printed calendars.
 */
export function buildMonthGrid(y, m) {
  const firstWeekday = weekdayOf(y, m, 1);
  const total = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(toKey(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** "HH:MM" 24-hour time validation. */
export function isValidTime(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

export function parseTime(value) {
  if (!isValidTime(value)) return null;
  const [h, min] = value.split(':').map(Number);
  return { h, min };
}

/** Builds a local Date for a date key + "HH:MM" without any UTC parsing. */
export function toLocalDateTime(key, time) {
  const p = parseKey(key);
  const t = parseTime(time);
  if (!p || !t) return null;
  return new Date(p.y, p.m - 1, p.d, t.h, t.min, 0, 0);
}
