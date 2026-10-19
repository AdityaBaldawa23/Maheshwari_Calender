/**
 * User settings: shape, defaults and sanitising of stored values (stored data
 * may come from an older app version, or be corrupted — never trust it blindly).
 */
import { isValidTime } from '../utils/date.js';
import { REMINDER_GROUPS } from '../constants/categories.js';

export const SETTINGS_KEY = 'settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  /** Master switch. Off until the user opts in (and grants permission). */
  remindersEnabled: false,
  /** null = use each occasion's own default time (usually 07:00). */
  reminderTime: null,
  sameDay: true,
  dayBefore: false,
  groups: Object.freeze({ festival: true, community: true, vrat: false }),
  /** Occasion ids (year-independent, e.g. "ekadashi-nirjala") the user muted. */
  mutedOccasions: Object.freeze([]),
  /** Permission-flow bookkeeping, so we never nag. */
  permissionAsked: false,
  reminderPromoDismissed: false,
  /** Language for calendar dates, months and weekdays: 'hi' (१२ अक्टूबर, रवि) or 'en' (12 October, Sun). */
  dateLang: 'hi',
});

export function sanitizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const groups = {};
  for (const key of Object.keys(REMINDER_GROUPS)) {
    groups[key] = bool(s.groups?.[key], DEFAULT_SETTINGS.groups[key]);
  }
  return {
    remindersEnabled: bool(s.remindersEnabled, DEFAULT_SETTINGS.remindersEnabled),
    reminderTime: isValidTime(s.reminderTime) ? s.reminderTime : null,
    sameDay: bool(s.sameDay, DEFAULT_SETTINGS.sameDay),
    dayBefore: bool(s.dayBefore, DEFAULT_SETTINGS.dayBefore),
    groups,
    mutedOccasions: Array.isArray(s.mutedOccasions) ? s.mutedOccasions.filter((x) => typeof x === 'string') : [],
    permissionAsked: bool(s.permissionAsked, false),
    reminderPromoDismissed: bool(s.reminderPromoDismissed, false),
    dateLang: s.dateLang === 'en' ? 'en' : 'hi',
  };
}
