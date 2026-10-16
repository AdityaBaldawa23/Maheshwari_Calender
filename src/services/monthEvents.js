/**
 * Builds the "अवसर" (this month's events) list from month data: every occasion,
 * plus each Purnima and Amavasya with its exact start and end time.
 *
 * A Purnima/Amavasya that spans two sunrises (vriddhi) is listed once, on the
 * first day; one that falls entirely between two sunrises (kshaya) is listed on
 * the day it occurs, using its own start/end.
 */

/**
 * @param {object|null} monthData  result of calendarService.getCalendarForMonth
 * @returns {{dateKey: string, type: 'occasion'|'moon', occasion?: object,
 *            paksha?: 'shukla'|'krishna', start?: string, end?: string}[]}
 */
export function buildMonthEvents(monthData) {
  if (!monthData) return [];
  const events = [];
  const seenMoon = new Set();

  const addMoon = (dateKey, paksha, start, end) => {
    const id = `${paksha}|${start ?? dateKey}`;
    if (seenMoon.has(id)) return;
    seenMoon.add(id);
    events.push({ dateKey, type: 'moon', paksha, start, end });
  };

  for (const day of Object.values(monthData.days)) {
    const p = day.panchang;
    if (p?.tithi === 15) addMoon(day.key, p.paksha, p.tithiStart, p.tithiEnd);
    if (p?.kshaya?.tithi === 15) addMoon(day.key, p.kshaya.paksha, p.kshaya.start, p.kshaya.end);
    for (const occasion of day.occasions) events.push({ dateKey: day.key, type: 'occasion', occasion });
  }

  // Date order; on the same day the Purnima/Amavasya row comes first.
  return events.sort(
    (a, b) => a.dateKey.localeCompare(b.dateKey) || (a.type === b.type ? 0 : a.type === 'moon' ? -1 : 1),
  );
}
