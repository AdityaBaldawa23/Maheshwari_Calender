import { describe, expect, it } from 'vitest';
import { validateAdsFile, validateCalendarFile, validateOccasionsFile } from '../scripts/lib/validate.mjs';
import { checkAdvertisement } from '../src/utils/validators.js';
import { daysInMonth, toKey } from '../src/utils/date.js';

/** A complete year whose tithi advances by exactly one per day. */
function fullYear(year) {
  const days = {};
  let abs = 0;
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysInMonth(year, m); d++) {
      const n = (abs++ % 30) + 1;
      days[toKey(year, m, d)] = { tithi: n <= 15 ? n : n - 15, paksha: n <= 15 ? 'shukla' : 'krishna', maas: 'chaitra' };
    }
  }
  return { year, meta: { verified: true }, days };
}

describe('validateCalendarFile', () => {
  it('accepts a complete, consistent year', () => {
    expect(validateCalendarFile(fullYear(2027), 2027)).toEqual({ errors: [], warnings: [] });
  });

  it('detects a missing day, malformed fields and tithi jumps', () => {
    const data = fullYear(2027);
    delete data.days['2027-03-15'];
    data.days['2027-04-10'] = { tithi: 20, paksha: 'purnima', maas: 'chaitra', sunrise: '6:00' };
    const before = data.days['2027-06-30'];
    data.days['2027-07-01'] = { ...before, tithi: before.tithi <= 8 ? before.tithi + 7 : before.tithi - 7 };
    const all = validateCalendarFile(data, 2027).errors.join('\n');
    expect(all).toMatch(/2027-03-15: missing day/);
    expect(all).toMatch(/tithi must be 1–15/);
    expect(all).toMatch(/paksha must be/);
    expect(all).toMatch(/sunrise must be HH:MM/);
    expect(all).toMatch(/tithi jumps/);
  });

  it('detects a file whose year does not match its name', () => {
    expect(validateCalendarFile(fullYear(2027), 2028).errors.join('\n')).toMatch(/file is named 2028/);
  });

  it('warns when data is not yet verified', () => {
    const data = fullYear(2027);
    data.meta.verified = false;
    expect(validateCalendarFile(data, 2027).warnings[0]).toMatch(/verified/);
  });
});

describe('validateOccasionsFile', () => {
  const o = (extra) => ({
    id: 'mahesh-navami',
    date: '2027-06-12',
    title: { hi: 'महेश नवमी', en: 'Mahesh Navami' },
    category: 'maheshwari',
    importance: 'high',
    reminder: { enabled: true, defaultTime: '07:00' },
    ...extra,
  });
  const file = (occasions) => ({ year: 2027, meta: { verified: true }, occasions });

  it('detects duplicates, bad dates, invalid reminder times, wrong categories and non-Devanagari titles', () => {
    const { errors } = validateOccasionsFile(
      file([
        o(),
        o(),
        o({ id: 'x', date: '2027-02-30' }),
        o({ id: 'y', reminder: { enabled: true, defaultTime: '25:00' } }),
        o({ id: 'z', category: 'party' }),
        o({ id: 'w', title: { hi: 'Mahesh' } }),
        o({ id: 'v', date: '2028-01-01' }),
      ]),
      2027,
    );
    const all = errors.join('\n');
    expect(all).toMatch(/duplicate/);
    expect(all).toMatch(/real date/);
    expect(all).toMatch(/defaultTime/);
    expect(all).toMatch(/category/);
    expect(all).toMatch(/Devanagari/);
    expect(all).toMatch(/not in 2027/);
  });

  it('warns about missing English translations', () => {
    const { errors, warnings } = validateOccasionsFile(file([o({ title: { hi: 'महेश नवमी' } })]), 2027);
    expect(errors).toEqual([]);
    expect(warnings.join()).toMatch(/English translation/);
  });
});

describe('advertisements', () => {
  const ad = (extra) => ({ id: 'ad-1', title: { hi: 'विज्ञापन' }, active: true, priority: 1, ...extra });

  it('rejects unsafe links and odd image paths', () => {
    expect(checkAdvertisement(ad({ link: { type: 'javascript', value: 'alert(1)' } }))).not.toEqual([]);
    expect(checkAdvertisement(ad({ image: '../../secret.png' }))).not.toEqual([]);
    expect(checkAdvertisement(ad({ link: { type: 'tel', value: '+919999999999' } }))).toEqual([]);
  });

  it('reports missing image files', () => {
    expect(validateAdsFile({ ads: [ad({ image: 'ads/none.webp' })] }, () => false).errors.join()).toMatch(/not found/);
  });
});
