import { describe, expect, it, vi } from 'vitest';
import { createLocalCalendarRepository } from '../src/repositories/LocalCalendarRepository.js';
import { calendarService, createCalendarService } from '../src/services/calendarService.js';

const day = (tithi, paksha = 'shukla', maas = 'jyeshtha') => ({ tithi, paksha, maas, sunrise: '05:45', sunset: '19:10' });
const occasion = (id, date, extra = {}) => ({
  id,
  date,
  title: { hi: 'परीक्षण', en: 'Test' },
  category: 'festival',
  importance: 'medium',
  reminder: { enabled: true, defaultTime: '07:00' },
  ...extra,
});

function makeRepo({ occasions = [], days } = {}) {
  return createLocalCalendarRepository({
    calendarModules: {
      '../data/calendar/2027.json': async () => ({
        year: 2027,
        meta: { vikramSamvat: { newYearDate: '2027-04-07', before: 2083, from: 2084 } },
        days: days ?? { '2027-06-12': day(9), '2027-06-13': day(10) },
      }),
    },
    occasionModules: { '../data/occasions/2027.json': async () => ({ year: 2027, occasions }) },
    recurring: [{ ...occasion('independence-day'), monthDay: '08-15', category: 'national' }],
    loadAds: async () => ({ ads: [] }),
    loadNotices: async () => ({ notices: [] }),
  });
}

describe('calendarService with an injected repository', () => {
  it('returns date info with panchang, weekday and samvat', async () => {
    const svc = createCalendarService(makeRepo());
    const info = await svc.getDateInfo('2027-06-12');
    expect(info).toMatchObject({ key: '2027-06-12', weekday: 6, hasData: true, samvat: 2084 });
    expect(info.panchang.tithi).toBe(9);
    expect((await svc.getDateInfo('2027-01-10')).samvat).toBe(2083);
  });

  it('looks up occasions, sorted by importance', async () => {
    const svc = createCalendarService(
      makeRepo({
        occasions: [
          occasion('low-one', '2027-06-12', { importance: 'low' }),
          occasion('mahesh-navami', '2027-06-12', { importance: 'high', category: 'maheshwari' }),
        ],
      }),
    );
    const list = await svc.getOccasionsForDate('2027-06-12');
    expect(list.map((o) => o.id)).toEqual(['mahesh-navami', 'low-one']);
    expect(await svc.getOccasionsForDate('2027-06-13')).toEqual([]);
  });

  it('expands recurring fixed-date occasions into the year', async () => {
    const svc = createCalendarService(makeRepo());
    expect((await svc.getOccasionsForDate('2027-08-15')).map((o) => o.id)).toEqual(['independence-day']);
  });

  it('skips malformed occasions instead of crashing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const svc = createCalendarService(
      makeRepo({ occasions: [occasion('good', '2027-06-12'), { id: 'Bad ID', date: '2027-02-30' }, null] }),
    );
    expect((await svc.getOccasionsForDate('2027-06-12')).map((o) => o.id)).toEqual(['good']);
    warn.mockRestore();
  });

  it('removes duplicate occasions (same id and date)', async () => {
    const svc = createCalendarService(
      makeRepo({ occasions: [occasion('dup', '2027-06-12'), occasion('dup', '2027-06-12')] }),
    );
    expect(await svc.getOccasionsForDate('2027-06-12')).toHaveLength(1);
  });

  it('still renders a month for a year with no data (no crash, no panchang)', async () => {
    const svc = createCalendarService(makeRepo());
    const month = await svc.getCalendarForMonth(2031, 2);
    expect(month.hasData).toBe(false);
    expect(Object.keys(month.days)).toHaveLength(28);
    expect(month.days['2031-02-01'].panchang).toBeNull();
  });

  it('builds month data with lunar months and samvat', async () => {
    const svc = createCalendarService(makeRepo());
    const month = await svc.getCalendarForMonth(2027, 6);
    expect(month.lunarMonths).toEqual([{ maas: 'jyeshtha', adhik: false }]);
    expect(month.samvats).toEqual([2084]);
    expect(month.weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it('collects occasions across a range spanning a missing year', async () => {
    const svc = createCalendarService(makeRepo({ occasions: [occasion('a', '2027-12-30')] }));
    const list = await svc.getOccasionsInRange('2027-12-01', '2028-01-31');
    expect(list.map((o) => o.id)).toEqual(['a']);
  });

  it('getTodayInfo uses the local date', async () => {
    const svc = createCalendarService(makeRepo());
    expect((await svc.getTodayInfo(new Date(2027, 5, 12, 23, 30))).key).toBe('2027-06-12');
  });
});

describe('calendarService with the bundled data', () => {
  it('loads every bundled year completely', async () => {
    const years = calendarService.getAvailableYears();
    expect(years.length).toBeGreaterThan(0);
    for (const year of years) {
      const month = await calendarService.getCalendarForMonth(year, 1);
      expect(month.hasData).toBe(true);
      expect(Object.values(month.days).every((d) => d.panchang)).toBe(true);
    }
  });

  it('finds Mahesh Navami 2027 and Diwali 2026', async () => {
    expect((await calendarService.getOccasionsForDate('2027-06-12')).map((o) => o.id)).toContain('mahesh-navami');
    expect((await calendarService.getOccasionsForDate('2026-11-08')).map((o) => o.id)).toContain('diwali');
  });
});
