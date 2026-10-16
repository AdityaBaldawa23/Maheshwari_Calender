/**
 * Golden tests for the dev-only panchang generator. Expected dates are the
 * dates actually observed in India (as published in standard panchangs), so a
 * regression in the astronomy or the observance rules is caught immediately.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildYearContext, generateCalendarYear, generateOccasionsYear } from '../scripts/lib/generate.mjs';

const rules = JSON.parse(readFileSync(new URL('../scripts/festival-rules.json', import.meta.url), 'utf8'));

function datesFor(year) {
  const ctx = buildYearContext(year);
  const occasions = generateOccasionsYear(ctx, rules).occasions;
  const byId = (id) => occasions.filter((o) => o.id === id).map((o) => o.date);
  return { ctx, calendar: generateCalendarYear(ctx), byId };
}

describe('panchang generator — 2025 observed dates', () => {
  const { byId } = datesFor(2025);
  it.each([
    ['maha-shivratri', '2025-02-26'],
    ['holika-dahan', '2025-03-13'], // Bhadra ends late at night; Purnima too short next day
    ['holi', '2025-03-14'],
    ['mahesh-navami', '2025-06-04'],
    ['raksha-bandhan', '2025-08-09'],
    ['kajari-teej', '2025-08-12'],
    ['janmashtami', '2025-08-15'],
    ['ganesh-chaturthi', '2025-08-27'],
    ['dussehra', '2025-10-02'],
    ['karwa-chauth', '2025-10-10'],
    ['dhanteras', '2025-10-18'],
    ['diwali', '2025-10-20'],
    ['bhai-dooj', '2025-10-23'],
    ['ekadashi-nirjala', '2025-06-06'],
  ])('%s → %s', (id, date) => {
    expect(byId(id)).toContain(date);
  });
});

describe('panchang generator — 2026', () => {
  const { calendar, byId } = datesFor(2026);

  it.each([
    ['til-chauth', '2026-01-06'],
    ['makar-sankranti', '2026-01-14'],
    ['vasant-panchami', '2026-01-23'],
    ['maha-shivratri', '2026-02-15'],
    ['holika-dahan', '2026-03-03'], // Bhadra covers pradosh on 2 Mar; Purnima lasts >3 prahar on 3 Mar
    ['holi', '2026-03-04'],
    ['hindu-nav-varsh', '2026-03-19'],
    ['raksha-bandhan', '2026-08-28'], // Bhadra on 27 Aug
    ['janmashtami', '2026-09-04'],
    ['ganesh-chaturthi', '2026-09-14'],
    ['dussehra', '2026-10-20'],
    ['karwa-chauth', '2026-10-29'],
    ['diwali', '2026-11-08'],
  ])('%s → %s', (id, date) => {
    expect(byId(id)).toContain(date);
  });

  it('marks the 2026 Adhik Jyeshtha month (17 May – 15 Jun)', () => {
    expect(calendar.days['2026-05-16'].adhik).toBeUndefined();
    expect(calendar.days['2026-05-17']).toMatchObject({ maas: 'jyeshtha', adhik: true, paksha: 'shukla', tithi: 1 });
    expect(calendar.days['2026-06-15'].adhik).toBe(true);
    expect(calendar.days['2026-06-16'].adhik).toBeUndefined();
  });

  it('places festivals only in nija (non-adhik) months', () => {
    expect(byId('mahesh-navami')).toEqual(['2026-06-23']);
  });

  it('switches Vikram Samvat on Chaitra Shukla Pratipada', () => {
    expect(calendar.meta.vikramSamvat).toEqual({ newYearDate: '2026-03-19', before: 2082, from: 2083 });
  });

  it('records tithi start and end times around each sunrise', () => {
    // Amavasya before Sharad Navratri 2026.
    expect(calendar.days['2026-10-10']).toMatchObject({
      tithi: 15, paksha: 'krishna', tithiStart: '2026-10-09T21:37', tithiEnd: '2026-10-10T21:21',
    });
    for (const [key, d] of Object.entries(calendar.days)) {
      expect(d.tithiStart < `${key}T${d.sunrise}`).toBe(true);
      expect(d.tithiEnd > `${key}T${d.sunrise}`).toBe(true);
    }
  });

  it('produces one record per civil day', () => {
    expect(Object.keys(calendar.days)).toHaveLength(365);
  });
});

describe('panchang generator — later years', () => {
  it.each([
    [2027, 'diwali', '2027-10-29'],
    [2028, 'diwali', '2028-10-17'],
  ])('%i %s → %s', (year, id, date) => {
    expect(datesFor(year).byId(id)).toContain(date);
  });
});
