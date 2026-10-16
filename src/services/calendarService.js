/**
 * Calendar business logic. The UI calls this service; the service talks to a
 * repository (local JSON in V1). Nothing here depends on React.
 */
import { buildMonthGrid, daysInMonth, diffDays, parseKey, todayKey, toKey, weekdayOf, addDays } from '../utils/date.js';
import { calendarRepository } from '../repositories/index.js';
import { CATEGORY_KEYS, IMPORTANCE_LEVELS } from '../constants/categories.js';

const byImportance = (a, b) =>
  IMPORTANCE_LEVELS.indexOf(a.importance) - IMPORTANCE_LEVELS.indexOf(b.importance) ||
  CATEGORY_KEYS.indexOf(a.category) - CATEGORY_KEYS.indexOf(b.category) ||
  a.id.localeCompare(b.id);

function samvatFor(meta, key) {
  const vs = meta?.vikramSamvat;
  if (!vs?.newYearDate) return null;
  return key >= vs.newYearDate ? vs.from : vs.before;
}

export function createCalendarService(repository) {
  const yearCache = new Map(); // year -> Promise<{ data, occasionsByDate }>

  function loadYear(year) {
    if (!yearCache.has(year)) {
      const promise = repository.loadYear(year).then((data) => {
        if (!data) return null;
        const occasionsByDate = new Map();
        for (const o of data.occasions) {
          if (!occasionsByDate.has(o.date)) occasionsByDate.set(o.date, []);
          occasionsByDate.get(o.date).push(o);
        }
        for (const list of occasionsByDate.values()) list.sort(byImportance);
        return { data, occasionsByDate };
      });
      // A failed load is not cached, so it can be retried later.
      promise.then((v) => v ?? yearCache.delete(year), () => yearCache.delete(year));
      yearCache.set(year, promise);
    }
    return yearCache.get(year);
  }

  function describe(key, loaded) {
    const { y, m, d } = parseKey(key);
    const day = loaded?.data.days[key] ?? null;
    return {
      key,
      y,
      m,
      d,
      weekday: weekdayOf(y, m, d),
      panchang: day,
      occasions: loaded?.occasionsByDate.get(key) ?? [],
      samvat: loaded ? samvatFor(loaded.data.meta, key) : null,
      /** Reference location for sunrise/sunset ({hi, en}), if the data provides one. */
      location: loaded?.data.meta?.location?.name ?? null,
      hasData: day !== null,
    };
  }

  async function getDateInfo(key) {
    const parsed = parseKey(key);
    if (!parsed) throw new RangeError(`Invalid date key: ${key}`);
    return describe(key, await loadYear(parsed.y));
  }

  return {
    getAvailableYears: () => repository.getAvailableYears(),

    /** Everything needed to render one month. Works (without panchang) even for years with no data. */
    async getCalendarForMonth(y, m) {
      const loaded = await loadYear(y);
      const days = {};
      const lunarMonths = [];
      const samvats = new Set();
      for (let d = 1; d <= daysInMonth(y, m); d++) {
        const info = describe(toKey(y, m, d), loaded);
        days[info.key] = info;
        if (info.panchang) {
          const last = lunarMonths[lunarMonths.length - 1];
          const { maas, adhik = false } = info.panchang;
          if (!last || last.maas !== maas || last.adhik !== adhik) lunarMonths.push({ maas, adhik });
        }
        if (info.samvat) samvats.add(info.samvat);
      }
      return {
        y,
        m,
        weeks: buildMonthGrid(y, m),
        days,
        lunarMonths,
        samvats: [...samvats],
        hasData: Boolean(loaded),
      };
    },

    getDateInfo,

    getTodayInfo(now = new Date()) {
      return getDateInfo(todayKey(now));
    },

    async getOccasionsForDate(key) {
      return (await getDateInfo(key)).occasions;
    },

    /** Occasions with fromKey <= date <= toKey, in date order (spans year boundaries). */
    async getOccasionsInRange(fromKey, toKey_) {
      const span = diffDays(fromKey, toKey_);
      if (span < 0) return [];
      const from = parseKey(fromKey);
      const to = parseKey(toKey_);
      const result = [];
      for (let year = from.y; year <= to.y; year++) {
        const loaded = await loadYear(year);
        if (!loaded) continue;
        for (const o of loaded.data.occasions) {
          if (o.date >= fromKey && o.date <= toKey_) result.push(o);
        }
      }
      return result.sort((a, b) => a.date.localeCompare(b.date) || byImportance(a, b));
    },

    /** Upcoming occasions from a date, optionally filtered by importance. */
    async getUpcomingOccasions(fromKey, days, { minImportance = 'low' } = {}) {
      const maxRank = IMPORTANCE_LEVELS.indexOf(minImportance);
      const list = await this.getOccasionsInRange(fromKey, addDays(fromKey, days));
      return list.filter((o) => IMPORTANCE_LEVELS.indexOf(o.importance) <= maxRank);
    },
  };
}

export const calendarService = createCalendarService(calendarRepository);
