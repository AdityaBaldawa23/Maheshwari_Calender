/**
 * Pure reminder planning: given occasions and settings, decide exactly which
 * local notifications should exist. No Capacitor or React here, so it is
 * fully unit-tested. notificationService then makes the device match the plan.
 */
import { CATEGORIES } from '../constants/categories.js';
import { addDays, toLocalDateTime } from '../utils/date.js';
import { txt } from '../utils/format.js';

/** How far ahead reminders are scheduled. Re-planned on every app start/resume. */
export const REMINDER_HORIZON_DAYS = 120;
/** Hard cap — Android limits pending alarms per app (~500); we stay far below. */
export const MAX_SCHEDULED = 64;
export const DEFAULT_REMINDER_TIME = '07:00';

/**
 * Deterministic positive 31-bit notification id from occasion id + date + kind
 * (FNV-1a). The same occasion on the same date always gets the same id, so
 * re-scheduling replaces instead of duplicating.
 */
export function notificationId(occasionId, date, kind) {
  const input = `${occasionId}|${date}|${kind}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 1) || 1; // Java int range, never 0
}

export function isOccasionReminderEligible(occasion, settings) {
  if (!occasion?.reminder?.enabled) return false;
  if (settings.mutedOccasions.includes(occasion.id)) return false;
  const group = CATEGORIES[occasion.category]?.reminderGroup;
  return Boolean(group && settings.groups[group]);
}

function messageFor(occasion, kind) {
  const title = txt(occasion.title);
  return kind === 'sameDay'
    ? { title: `आज ${title} है 🙏`, body: txt(occasion.description) || 'माहेश्वरी कैलेंडर की ओर से शुभकामनाएँ।' }
    : { title: `कल ${title} है 🙏`, body: txt(occasion.description) || 'तैयारी के लिए स्मरण।' };
}

/**
 * @param {object[]} occasions  occasions in [today, today + horizon]
 * @param {object} settings     sanitised settings
 * @param {Date} now
 * @returns {{id:number, at:Date, title:string, body:string, occasionId:string, date:string, kind:string}[]}
 *          sorted by time, at most MAX_SCHEDULED, all strictly in the future.
 */
export function planReminders(occasions, settings, now = new Date()) {
  if (!settings.remindersEnabled) return [];
  const kinds = [];
  if (settings.sameDay) kinds.push({ kind: 'sameDay', offset: 0 });
  if (settings.dayBefore) kinds.push({ kind: 'dayBefore', offset: -1 });
  if (kinds.length === 0) return [];

  const plan = [];
  const ids = new Set();
  for (const occasion of occasions) {
    if (!isOccasionReminderEligible(occasion, settings)) continue;
    const time = settings.reminderTime ?? occasion.reminder.defaultTime ?? DEFAULT_REMINDER_TIME;
    for (const { kind, offset } of kinds) {
      const at = toLocalDateTime(addDays(occasion.date, offset), time);
      if (!at || at <= now) continue;
      const id = notificationId(occasion.id, occasion.date, kind);
      if (ids.has(id)) continue; // duplicate occasion record or (astronomically unlikely) hash collision
      ids.add(id);
      plan.push({ id, at, ...messageFor(occasion, kind), occasionId: occasion.id, date: occasion.date, kind });
    }
  }
  plan.sort((a, b) => a.at - b.at || a.id - b.id);
  return plan.slice(0, MAX_SCHEDULED);
}
