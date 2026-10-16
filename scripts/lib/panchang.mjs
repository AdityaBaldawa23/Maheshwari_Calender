/**
 * DEVELOPMENT-ONLY panchang pre-computation.
 *
 * This module is NOT shipped in the app. It is used by
 * `npm run generate-panchang` to produce the static JSON files in
 * src/data/calendar and src/data/occasions, which humans then verify against a
 * trusted printed panchang before release.
 *
 * Conventions used (documented in docs/DATA_GUIDE.md):
 *  - Tithi = floor((moonLon − sunLon) / 12°) + 1, the tithi prevailing at local sunrise
 *    at the reference location (udaya tithi).
 *  - Lunar months are amanta internally (new moon → new moon), named by the sidereal
 *    (Lahiri) rashi of the Sun at the starting new moon. A lunation containing no
 *    sankranti is adhik (intercalary) and takes the name of the following month.
 *  - Display months are purnimanta (North Indian / Marwadi usage): a Krishna paksha
 *    belongs to the *next* month name, and an adhik month stays a contiguous block.
 */
import { createRequire } from 'node:module';

// astronomy-engine's ESM build lacks a "type": "module" marker, so load its CommonJS build.
const Astronomy = createRequire(import.meta.url)('astronomy-engine');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const MAAS_ORDER = [
  'chaitra', 'vaishakh', 'jyeshtha', 'ashadh', 'shravan', 'bhadrapad',
  'ashwin', 'kartik', 'margashirsha', 'paush', 'magh', 'phalgun',
];

export const DEFAULT_LOCATION = { name: { hi: 'उज्जैन', en: 'Ujjain' }, lat: 23.1765, lon: 75.7885, height: 490 };

// ---------------------------------------------------------------- time helpers

const pad2 = (n) => String(n).padStart(2, '0');

/** UTC instant of 00:00 IST on the given civil date. */
export function istMidnight(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/** Civil parts of an instant in IST. */
export function istParts(date) {
  const s = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    y: s.getUTCFullYear(),
    m: s.getUTCMonth() + 1,
    d: s.getUTCDate(),
    hh: s.getUTCHours(),
    mm: s.getUTCMinutes(),
  };
}

export function istKey(date) {
  const p = istParts(date);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

/** "HH:MM" in IST, rounded to the nearest minute. */
export function istTime(date) {
  const p = istParts(new Date(Math.round(date.getTime() / MINUTE_MS) * MINUTE_MS));
  return `${pad2(p.hh)}:${pad2(p.mm)}`;
}

/** "YYYY-MM-DDTHH:MM" in IST, rounded to the nearest minute. */
export function istDateTime(date) {
  const rounded = new Date(Math.round(date.getTime() / MINUTE_MS) * MINUTE_MS);
  return `${istKey(rounded)}T${istTime(rounded)}`;
}

// ----------------------------------------------------------- astronomy helpers

/** Lahiri ayanamsa (degrees), linear model — accurate to well under an arc-minute for 1900–2100. */
export function lahiriAyanamsa(date) {
  const yearsFromJ2000 = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (365.25 * DAY_MS);
  return 23.853 + (50.2879 / 3600) * yearsFromJ2000;
}

/** Sidereal (Lahiri) ecliptic longitude of the Sun, 0–360°. */
export function siderealSunLongitude(date) {
  const lon = Astronomy.SunPosition(date).elon - lahiriAyanamsa(date);
  return ((lon % 360) + 360) % 360;
}

const rashiOf = (date) => Math.floor(siderealSunLongitude(date) / 30);

/** Instant the Sun enters sidereal rashi `rashi` (0 = Mesha … 9 = Makara), searching forward from `start`. */
export function findSankranti(rashi, start) {
  // Coarse daily scan to bracket the crossing, then bisect to ~1 second.
  let lo = start;
  for (let i = 0; i < 400; i++) {
    const hi = new Date(lo.getTime() + DAY_MS);
    if (rashiOf(lo) !== rashi && rashiOf(hi) === rashi) {
      let a = lo.getTime();
      let b = hi.getTime();
      while (b - a > 1000) {
        const mid = (a + b) / 2;
        if (rashiOf(new Date(mid)) === rashi) b = mid;
        else a = mid;
      }
      return new Date(b);
    }
    lo = hi;
  }
  throw new Error(`Sankranti for rashi ${rashi} not found after ${start.toISOString()}`);
}

function searchPhase(targetDeg, start, limitDays) {
  const t = Astronomy.SearchMoonPhase(targetDeg, start, limitDays);
  if (!t) throw new Error(`Moon phase ${targetDeg}° not found after ${start.toISOString()}`);
  return t.date;
}

function sunEvent(observer, direction, start) {
  const t = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, direction, start, 1.5);
  if (!t) throw new Error(`Sun ${direction > 0 ? 'rise' : 'set'} not found after ${start.toISOString()}`);
  return t.date;
}

// --------------------------------------------------------------- core model

/**
 * Builds lunations (with amanta month + adhik flag) and the 30 tithi intervals of
 * each, covering [from, to].
 */
export function buildLunarModel(from, to) {
  const newMoons = [];
  let cursor = new Date(from.getTime() - 40 * DAY_MS);
  while (cursor.getTime() < to.getTime() + 40 * DAY_MS) {
    const nm = searchPhase(0, cursor, 35);
    newMoons.push(nm);
    cursor = new Date(nm.getTime() + DAY_MS);
  }

  const lunations = [];
  for (let i = 0; i < newMoons.length - 1; i++) {
    const start = newMoons[i];
    const end = newMoons[i + 1];
    const rashiStart = rashiOf(start);
    const rashiEnd = rashiOf(end);
    lunations.push({
      start,
      end,
      maasIndex: (rashiStart + 1) % 12,
      adhik: rashiStart === rashiEnd,
      tithis: [],
    });
  }

  const tithis = [];
  lunations.forEach((lun, li) => {
    let prev = lun.start;
    for (let n = 1; n <= 30; n++) {
      const end = n === 30 ? lun.end : searchPhase(n * 12, prev, 3);
      const t = { n, start: prev, end, lunation: li };
      lun.tithis.push(t);
      tithis.push(t);
      prev = end;
    }
  });

  return { lunations, tithis };
}

/** Tithi interval containing the instant (binary search over the sorted list). */
export function tithiAt(model, instant) {
  const time = instant.getTime();
  let lo = 0;
  let hi = model.tithis.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = model.tithis[mid];
    if (time < t.start.getTime()) hi = mid - 1;
    else if (time >= t.end.getTime()) lo = mid + 1;
    else return t;
  }
  throw new Error(`No tithi covers ${instant.toISOString()} — extend the model range`);
}

const pakshaOf = (n) => (n <= 15 ? 'shukla' : 'krishna');
const tithiInPaksha = (n) => (n <= 15 ? n : n - 15);

/** Purnimanta month label for a tithi (see module header). */
export function purnimantaMonth(model, t) {
  const lun = model.lunations[t.lunation];
  if (t.n <= 15 || lun.adhik) return { maas: MAAS_ORDER[lun.maasIndex], adhik: lun.adhik };
  const next = model.lunations[t.lunation + 1];
  const nextIndex = next ? next.maasIndex : (lun.maasIndex + 1) % 12;
  return { maas: MAAS_ORDER[nextIndex], adhik: false };
}

/** Sunrise/sunset for every civil day in [fromKey-range], keyed "YYYY-MM-DD". */
export function buildSolarDays(location, startYmd, dayCount) {
  const observer = new Astronomy.Observer(location.lat, location.lon, location.height ?? 0);
  const days = [];
  const base = istMidnight(startYmd.y, startYmd.m, startYmd.d).getTime();
  for (let i = 0; i < dayCount; i++) {
    const midnight = new Date(base + i * DAY_MS);
    days.push({
      key: istKey(midnight),
      midnight,
      sunrise: sunEvent(observer, +1, midnight),
      sunset: sunEvent(observer, -1, midnight),
    });
  }
  days.forEach((day, i) => {
    day.nextSunrise = days[i + 1]?.sunrise ?? sunEvent(observer, +1, new Date(day.midnight.getTime() + DAY_MS));
  });
  return days;
}

/** Day record written to src/data/calendar/<year>.json. */
export function describeDay(model, solarDay) {
  const t = tithiAt(model, solarDay.sunrise);
  const month = purnimantaMonth(model, t);
  const record = {
    tithi: tithiInPaksha(t.n),
    paksha: pakshaOf(t.n),
    maas: month.maas,
  };
  if (month.adhik) record.adhik = true;
  record.tithiStart = istDateTime(t.start);
  record.tithiEnd = istDateTime(t.end);
  record.sunrise = istTime(solarDay.sunrise);
  record.sunset = istTime(solarDay.sunset);

  // Kshaya: a tithi that begins and ends between this sunrise and the next.
  const kshaya = model.tithis.find(
    (x) => x.start > solarDay.sunrise && x.end < solarDay.nextSunrise,
  );
  if (kshaya) {
    record.kshaya = {
      tithi: tithiInPaksha(kshaya.n),
      paksha: pakshaOf(kshaya.n),
      start: istDateTime(kshaya.start),
      end: istDateTime(kshaya.end),
    };
  }
  return record;
}

// ------------------------------------------------------- observance resolution

const at = (base, fraction, span) => new Date(base.getTime() + fraction * span);

/** Time windows (per civil day) during which a festival's tithi must prevail. */
const WINDOWS = {
  // Udaya tithi: the instant of sunrise.
  sunrise: (day) => [day.sunrise, day.sunrise],
  // Pradosh: three muhurtas (144 min) after sunset.
  pradosh: (day) => [day.sunset, new Date(day.sunset.getTime() + 144 * MINUTE_MS)],
  // Madhyahna / Aparahna: 3rd and 4th fifths of daytime.
  madhyahna: (day) => {
    const span = day.sunset - day.sunrise;
    return [at(day.sunrise, 0.4, span), at(day.sunrise, 0.6, span)];
  },
  aparahna: (day) => {
    const span = day.sunset - day.sunrise;
    return [at(day.sunrise, 0.6, span), at(day.sunrise, 0.8, span)];
  },
  // Nishita: the 8th of 15 night muhurtas (around midnight).
  nishita: (day) => {
    const span = day.nextSunrise - day.sunset;
    return [at(day.sunset, 7 / 15, span), at(day.sunset, 8 / 15, span)];
  },
};

function overlapMs([wStart, wEnd], { start, end }) {
  if (wStart.getTime() === wEnd.getTime()) {
    return wStart >= start && wStart < end ? 1 : 0; // point window (sunrise)
  }
  return Math.max(0, Math.min(wEnd, end) - Math.max(wStart, start));
}

/**
 * Removes Bhadra (Vishti karana) from a tithi interval. Karanas are half-tithis;
 * within a lunation the 60 halves run Kimstughna, then Bava…Vishti cycling ×8,
 * so Vishti is half number 8, 15, 22 … 57 (e.g. the first half of Purnima).
 */
export function withoutBhadra(interval) {
  const firstHalf = 2 * interval.n - 1;
  const isVishti = (k) => k >= 8 && k <= 57 && (k - 8) % 7 === 0;
  if (!isVishti(firstHalf) && !isVishti(firstHalf + 1)) return interval;
  const mid = searchPhase(12 * (interval.n - 1) + 6, interval.start, 2);
  return isVishti(firstHalf)
    ? { ...interval, start: mid }
    : { ...interval, end: mid };
}

/**
 * Civil day on which a tithi interval is observed:
 *  1. the day whose window (sunrise, pradosh, nishita, …) overlaps the tithi most
 *     (first day wins ties);
 *  2. otherwise the day whose sunrise falls inside the tithi;
 *  3. otherwise (kshaya tithi) the day during which the tithi begins.
 *
 * With `avoidBhadra`, Bhadra is excluded from the tithi first (Holika Dahan,
 * Raksha Bandhan). If that leaves no window overlap, the observance moves to the
 * next day only when the tithi still lasts long enough after that sunrise
 * (`nextDayMinDayFraction` of daytime); otherwise it stays on the first day,
 * after Bhadra ends.
 */
export function observanceDay(
  solarDays,
  interval,
  window = 'sunrise',
  { avoidBhadra = false, nextDayMinDayFraction = 0 } = {},
) {
  const windowOf = WINDOWS[window];
  if (!windowOf) throw new Error(`Unknown observance window "${window}"`);
  const effective = avoidBhadra ? withoutBhadra(interval) : interval;

  let best = null;
  let bestOverlap = 0;
  for (const day of solarDays) {
    const overlap = overlapMs(windowOf(day), effective);
    if (overlap > bestOverlap) {
      best = day;
      bestOverlap = overlap;
    }
  }
  if (best) return best.key;

  const sunriseInside = solarDays.find((day) => day.sunrise >= effective.start && day.sunrise < effective.end);
  if (sunriseInside) {
    const lastsEnough =
      effective.end - sunriseInside.sunrise >=
      nextDayMinDayFraction * (sunriseInside.sunset - sunriseInside.sunrise);
    if (!avoidBhadra || lastsEnough) return sunriseInside.key;
  }

  const containing = solarDays.find((day) => effective.start >= day.sunrise && effective.start < day.nextSunrise);
  return containing ? containing.key : null;
}

/** All non-adhik tithi intervals matching an amanta month/paksha/tithi rule. */
export function findTithiIntervals(model, { maas, paksha, tithi }) {
  const maasIndex = MAAS_ORDER.indexOf(maas);
  if (maasIndex < 0) throw new Error(`Unknown maas "${maas}"`);
  const n = paksha === 'shukla' ? tithi : tithi + 15;
  return model.lunations
    .filter((lun) => lun.maasIndex === maasIndex && !lun.adhik)
    .map((lun) => lun.tithis[n - 1]);
}
