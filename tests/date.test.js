import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, buildMonthGrid, daysInMonth, diffDays, isValidTime, msUntilNextMidnight,
  parseKey, toLocalDateTime, todayKey, weekdayOf,
} from '../src/utils/date.js';

describe('parseKey', () => {
  it('parses valid keys', () => expect(parseKey('2027-06-12')).toEqual({ y: 2027, m: 6, d: 12 }));
  it.each(['2027-02-30', '2027-13-01', '2027-6-12', '2027-06-12T00:00', '', null, 20270612, '2026-02-29'])(
    'rejects %s',
    (bad) => expect(parseKey(bad)).toBeNull(),
  );
  it('accepts 29 Feb only in leap years', () => expect(parseKey('2028-02-29')).not.toBeNull());
});

describe('month lengths and weekdays', () => {
  it('knows month lengths including leap Februaries', () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
  it.each([
    [2026, 10, 11, 0], // Sunday
    [2027, 1, 1, 5], // Friday
    [2028, 2, 29, 2], // Tuesday
    [1970, 1, 1, 4], // Thursday
  ])('%i-%i-%i is weekday %i', (y, m, d, w) => expect(weekdayOf(y, m, d)).toBe(w));
});

describe('date arithmetic never crosses UTC boundaries', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });
  it('counts days between keys', () => {
    expect(diffDays('2026-10-11', '2027-10-11')).toBe(365);
    expect(diffDays('2027-10-11', '2028-10-11')).toBe(366);
  });
  it('moves months backwards and forwards across years', () => {
    expect(addMonths({ y: 2027, m: 1 }, -1)).toEqual({ y: 2026, m: 12 });
    expect(addMonths({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 });
    expect(addMonths({ y: 2026, m: 10 }, 15)).toEqual({ y: 2028, m: 1 });
  });
});

describe('today and midnight', () => {
  it('uses local getters, so 23:59 local stays on the same day', () => {
    expect(todayKey(new Date(2026, 9, 11, 23, 59, 59))).toBe('2026-10-11');
    expect(todayKey(new Date(2026, 9, 12, 0, 0, 0))).toBe('2026-10-12');
  });
  it('computes time until the next local midnight', () => {
    expect(msUntilNextMidnight(new Date(2026, 9, 11, 23, 59, 0))).toBe(60_000);
  });
  it('builds a local Date for a reminder without UTC shift', () => {
    const at = toLocalDateTime('2027-06-12', '07:00');
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2027, 5, 12, 7, 0]);
  });
  it('validates HH:MM times', () => {
    expect(isValidTime('07:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('7:00')).toBe(false);
  });
});

describe('buildMonthGrid', () => {
  it('pads October 2026 (starts Thursday) into Sunday-first weeks', () => {
    const weeks = buildMonthGrid(2026, 10);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    weeks.forEach((w) => expect(w).toHaveLength(7));
  });
  it('handles a 6-week month and a 4-week February', () => {
    expect(buildMonthGrid(2027, 5)).toHaveLength(6); // May 2027 starts on Saturday
    expect(buildMonthGrid(2026, 2)).toHaveLength(4); // Feb 2026 starts on Sunday, 28 days
  });
});
