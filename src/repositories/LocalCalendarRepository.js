/**
 * CalendarRepository — the only layer that knows where calendar data comes from.
 *
 * Contract (any future RemoteCalendarRepository must implement the same):
 *   getAvailableYears(): number[]
 *   loadYear(year): Promise<YearData | null>
 *       YearData = { year, meta, days: { "YYYY-MM-DD": DayRecord }, occasions: Occasion[] }
 *       Occasions already include recurring (fixed-date) ones and are guaranteed valid.
 *   loadAdvertisements(): Promise<Ad[]>
 *   loadNotices(): Promise<Notice[]>
 *
 * V1 reads JSON bundled into the app (works fully offline). Each year is a
 * separate chunk loaded on demand, so adding years does not slow startup.
 * Malformed optional records are skipped with a console warning instead of
 * crashing the app; `npm run validate-data` catches them at build time.
 */
import { checkAdvertisement, checkDayRecord, checkNotice, checkOccasion, checkRecurringOccasion } from '../utils/validators.js';
import { isValidKey } from '../utils/date.js';

function keepValid(items, check, label) {
  return items.filter((item) => {
    const problems = check(item);
    if (problems.length) console.warn(`[data] skipping invalid ${label} ${item?.id ?? ''}:`, problems);
    return problems.length === 0;
  });
}

function yearFromPath(path) {
  const match = /(\d{4})\.json$/.exec(path);
  return match ? Number(match[1]) : null;
}

function indexLoaders(modules) {
  const byYear = new Map();
  for (const [path, loader] of Object.entries(modules)) {
    const year = yearFromPath(path);
    if (year !== null) byYear.set(year, loader);
  }
  return byYear;
}

function normalizeDays(days, year) {
  const out = {};
  for (const [key, record] of Object.entries(days ?? {})) {
    if (!key.startsWith(`${year}-`) || !isValidKey(key) || checkDayRecord(record).length) {
      console.warn(`[data] skipping invalid day ${key}`);
      continue;
    }
    out[key] = record;
  }
  return out;
}

function expandRecurring(recurring, year) {
  return keepValid(recurring, checkRecurringOccasion, 'recurring occasion')
    .map(({ monthDay, ...rest }) => ({ ...rest, date: `${year}-${monthDay}` }))
    .filter((o) => isValidKey(o.date)); // 02-29 in non-leap years
}

function dedupe(occasions) {
  const seen = new Set();
  return occasions.filter((o) => {
    const key = `${o.id}|${o.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function safeOverride(getOverride, year) {
  try {
    const value = await getOverride(year);
    return value && Array.isArray(value.occasions) ? value : null;
  } catch (err) {
    console.warn('[data] occasion override unavailable', err);
    return null;
  }
}

const isWithinDates = (item, today) =>
  (!item.startDate || item.startDate <= today) && (!item.endDate || item.endDate >= today);

/**
 * @param {object} sources  Injected for tests; defaults to the bundled JSON.
 * @param {Record<string, () => Promise<object>>} sources.calendarModules
 * @param {Record<string, () => Promise<object>>} sources.occasionModules
 * @param {object[]} sources.recurring
 * @param {() => Promise<object>} sources.loadAds
 * @param {() => Promise<object>} sources.loadNotices
 * @param {(year:number) => Promise<{occasions: object[], verified: boolean}|null>} [sources.getOccasionOverride]
 */
export function createLocalCalendarRepository(sources) {
  const calendarLoaders = indexLoaders(sources.calendarModules);
  const occasionLoaders = indexLoaders(sources.occasionModules);

  return {
    getAvailableYears() {
      return [...calendarLoaders.keys()].sort((a, b) => a - b);
    },

    async loadYear(year) {
      const loadCalendar = calendarLoaders.get(year);
      if (!loadCalendar) return null;
      try {
        const calendar = await loadCalendar();
        // Admin-published occasions (cached from the server) replace the bundled
        // list for that year; otherwise the bundled JSON is used. Tithis always
        // come from the bundled, generated calendar file.
        const override = sources.getOccasionOverride ? await safeOverride(sources.getOccasionOverride, year) : null;
        const loadOccasions = occasionLoaders.get(year);
        const bundledFile = loadOccasions ? await loadOccasions() : { occasions: [] };
        const occasionFile = override ?? bundledFile;
        const occasionsVerified = override ? override.verified === true : bundledFile.meta?.verified === true;
        const occasions = dedupe([
          ...keepValid(occasionFile.occasions ?? [], (o) => checkOccasion(o, year), 'occasion'),
          ...expandRecurring(sources.recurring ?? [], year),
        ]);
        return {
          year,
          meta: { ...(calendar.meta ?? {}), occasionsVerified, occasionsSource: override ? 'published' : 'bundled' },
          days: normalizeDays(calendar.days, year),
          occasions,
        };
      } catch (err) {
        console.error(`[data] failed to load year ${year}`, err);
        return null;
      }
    },

    async loadAdvertisements(today) {
      try {
        const file = await sources.loadAds();
        return keepValid(file.ads ?? [], checkAdvertisement, 'advertisement')
          .filter((ad) => ad.active && isWithinDates(ad, today))
          .sort((a, b) => a.priority - b.priority);
      } catch (err) {
        console.error('[data] failed to load advertisements', err);
        return [];
      }
    },

    async loadNotices(today) {
      try {
        const file = await sources.loadNotices();
        return keepValid(file.notices ?? [], checkNotice, 'notice')
          .filter((n) => n.active && isWithinDates(n, today))
          .sort((a, b) => a.priority - b.priority);
      } catch (err) {
        console.error('[data] failed to load notices', err);
        return [];
      }
    },
  };
}
