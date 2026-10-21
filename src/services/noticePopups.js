/**
 * Admin notices shown as a pop-up (MINOR_UI_CHANGES.md, Change 3).
 *
 * The admin ticks "Pop-up notification" on a notice in the portal and publishes.
 * Each phone picks it up at its next sync (app opened / resumed — there is no
 * server push on the Spark plan, see docs/MEMBER_ACCESS.md → Costs), then:
 *   1. posts it once as a heads-up notification (if notifications are allowed), and
 *   2. shows it once as an in-app pop-up until the user closes it.
 * A notice is identified by its id: edit text freely, but create a NEW notice to
 * notify everyone again.
 */
import { createPreferencesStorage } from './auth/memberAuth.js';
import { notificationId } from './reminderPlanner.js';

const KEY = 'mdc.notices.popups';
const MAX_REMEMBERED = 200;

const withinDates = (n, today) => (!n.startDate || n.startDate <= today) && (!n.endDate || n.endDate >= today);

/** Active pop-up notices for today that have not been dismissed yet, in display order. */
export function popupCandidates(notices, today, dismissed = []) {
  if (!Array.isArray(notices)) return [];
  const done = new Set(dismissed);
  return notices
    .filter((n) => n?.popup === true && n.active && withinDates(n, today) && !done.has(n.id))
    .sort((a, b) => a.priority - b.priority);
}

export const noticeNotificationId = (noticeId) => notificationId(noticeId, 'notice', 'popup');

export function createPopupStore(storage = createPreferencesStorage()) {
  const trim = (list) => list.slice(-MAX_REMEMBERED);
  return {
    /** { notified: string[], dismissed: string[] } */
    async load() {
      const saved = await storage.get(KEY);
      return { notified: saved?.notified ?? [], dismissed: saved?.dismissed ?? [] };
    },
    async save(state) {
      await storage.set(KEY, { notified: trim(state.notified), dismissed: trim(state.dismissed) }).catch(() => {});
    },
  };
}
