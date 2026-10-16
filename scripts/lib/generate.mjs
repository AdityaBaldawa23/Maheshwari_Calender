/**
 * DEVELOPMENT-ONLY: turns the astronomical model into the app's JSON data shape.
 * See scripts/lib/panchang.mjs for conventions.
 */
import {
  DEFAULT_LOCATION,
  MAAS_ORDER,
  buildLunarModel,
  buildSolarDays,
  describeDay,
  findSankranti,
  findTithiIntervals,
  istKey,
  istMidnight,
  observanceDay,
  purnimantaMonth,
} from './panchang.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REMINDER = { enabled: true, defaultTime: '07:00' };

function addDaysToKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return istKey(new Date(istMidnight(y, m, d).getTime() + n * DAY_MS + DAY_MS / 2));
}

/** Builds the shared astronomical context for one Gregorian year (with margins). */
export function buildYearContext(year, location = DEFAULT_LOCATION) {
  const from = istMidnight(year - 1, 12, 1);
  const to = istMidnight(year + 1, 2, 1);
  const model = buildLunarModel(from, to);
  const dayCount = Math.round((to - from) / DAY_MS);
  const solarDays = buildSolarDays(location, { y: year - 1, m: 12, d: 1 }, dayCount);
  return { year, location, model, solarDays };
}

const inYear = (key, year) => key.startsWith(`${year}-`);

export function generateCalendarYear(ctx) {
  const days = {};
  for (const solarDay of ctx.solarDays) {
    if (inYear(solarDay.key, ctx.year)) days[solarDay.key] = describeDay(ctx.model, solarDay);
  }

  // Vikram Samvat increments on Chaitra Shukla Pratipada (nija Chaitra).
  const chaitra = findTithiIntervals(ctx.model, { maas: 'chaitra', paksha: 'shukla', tithi: 1 })
    .map((interval) => observanceDay(ctx.solarDays, interval, 'sunrise'))
    .find((key) => key && inYear(key, ctx.year));

  return {
    year: ctx.year,
    meta: {
      source: 'generated',
      verified: false,
      generatedBy: 'scripts/generate-panchang.mjs',
      location: { name: ctx.location.name, lat: ctx.location.lat, lon: ctx.location.lon },
      timezone: 'Asia/Kolkata',
      monthSystem: 'purnimanta',
      vikramSamvat: { newYearDate: chaitra, before: ctx.year + 56, from: ctx.year + 57 },
      note: 'Computed astronomically. Must be verified against a trusted printed panchang before release; set verified=true afterwards.',
    },
    days,
  };
}

function occasionRecord(rule, date, overrides = {}) {
  return {
    id: overrides.id ?? rule.id,
    date,
    title: overrides.title ?? rule.title,
    ...(rule.description || overrides.description
      ? { description: overrides.description ?? rule.description }
      : {}),
    category: rule.category,
    importance: rule.importance,
    reminder: rule.reminder ?? DEFAULT_REMINDER,
    source: 'generated',
  };
}

function resolveRule(ctx, rule, resolved) {
  const { type } = rule.rule;
  if (type === 'tithi') {
    return findTithiIntervals(ctx.model, rule.rule)
      .map((interval) => observanceDay(ctx.solarDays, interval, rule.rule.at ?? 'sunrise', { avoidBhadra: Boolean(rule.rule.avoidBhadra), nextDayMinDayFraction: rule.rule.nextDayMinDayFraction ?? 0 }))
      .filter(Boolean);
  }
  if (type === 'offset') {
    const base = resolved.get(rule.rule.of);
    if (!base) throw new Error(`Rule "${rule.id}" depends on "${rule.rule.of}", which must be listed earlier`);
    return base.map((key) => addDaysToKey(key, rule.rule.days));
  }
  if (type === 'sankranti') {
    const instant = findSankranti(rule.rule.rashi, istMidnight(ctx.year, 1, 1));
    const key = istKey(instant);
    // A sankranti after sunset is observed the following day.
    const day = ctx.solarDays.find((d) => d.key === key);
    return [day && instant > day.sunset ? addDaysToKey(key, 1) : key];
  }
  throw new Error(`Unknown rule type "${type}" in "${rule.id}"`);
}

function ekadashiOccasions(ctx, config) {
  const out = [];
  for (const t of ctx.model.tithis) {
    if (t.n !== 11 && t.n !== 26) continue;
    const date = observanceDay(ctx.solarDays, t, 'sunrise');
    if (!date || !inYear(date, ctx.year)) continue;
    const paksha = t.n === 11 ? 'shukla' : 'krishna';
    const month = purnimantaMonth(ctx.model, t);
    const name = config.names[month.adhik ? 'adhik' : month.maas]?.[paksha];
    if (!name) throw new Error(`No ekadashi name for ${month.maas}/${paksha}`);
    out.push({
      id: `${config.idPrefix}-${name.id}`,
      date,
      title: { hi: name.hi, en: name.en },
      category: config.category,
      importance: config.importance,
      reminder: DEFAULT_REMINDER,
      source: 'generated',
    });
  }
  return out;
}

export function generateOccasionsYear(ctx, rules) {
  const resolved = new Map();
  const occasions = [];
  for (const rule of rules.festivals) {
    const dates = resolveRule(ctx, rule, resolved);
    resolved.set(rule.id, dates);
    for (const date of dates) {
      if (inYear(date, ctx.year)) occasions.push(occasionRecord(rule, date));
    }
  }
  occasions.push(...ekadashiOccasions(ctx, rules.ekadashi));
  occasions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { year: ctx.year, meta: { source: 'generated', verified: false }, occasions };
}

export { MAAS_ORDER };
