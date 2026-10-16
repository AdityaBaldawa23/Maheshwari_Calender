/**
 * Glue between calendar data, settings and the device: loads upcoming
 * occasions, plans reminders and syncs them. Called on app start, on resume
 * (to roll the scheduling window forward) and whenever settings change.
 */
import { addDays, todayKey } from '../utils/date.js';
import { REMINDER_HORIZON_DAYS, planReminders } from './reminderPlanner.js';
import { calendarService as defaultCalendarService } from './calendarService.js';
import { notificationService as defaultNotificationService } from './notificationService.js';

export function createReminderService({
  calendar = defaultCalendarService,
  notifications = defaultNotificationService,
} = {}) {
  let running = Promise.resolve();

  async function sync(settings, now = new Date()) {
    if (!notifications.isSupported()) return { ok: false, error: 'unsupported', scheduled: 0 };
    if (!settings.remindersEnabled) {
      await notifications.cancelAll();
      return { ok: true, scheduled: 0, cancelled: 'all' };
    }
    if ((await notifications.checkPermission()) !== 'granted') {
      return { ok: false, error: 'permission', scheduled: 0 };
    }
    const from = todayKey(now);
    const occasions = await calendar.getOccasionsInRange(from, addDays(from, REMINDER_HORIZON_DAYS));
    return notifications.syncReminders(planReminders(occasions, settings, now));
  }

  return {
    /** Serialised so overlapping triggers (resume + settings change) never race. */
    sync(settings, now) {
      const next = running.then(() => sync(settings, now));
      running = next.catch(() => {});
      return next;
    },
  };
}

export const reminderService = createReminderService();
