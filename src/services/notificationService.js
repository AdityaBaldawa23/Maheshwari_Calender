/**
 * Local notifications (no server, no Firebase). Makes the device's pending
 * notifications match a plan from reminderPlanner:
 *  - cancels pending reminders that are no longer wanted,
 *  - schedules new or changed ones,
 *  - leaves identical ones untouched.
 * Because ids are deterministic, re-running sync never creates duplicates.
 *
 * Android notes:
 *  - Android 13+ requires the POST_NOTIFICATIONS runtime permission (requestPermission()).
 *  - We do NOT request SCHEDULE_EXACT_ALARM (restricted on Play). The plugin then
 *    uses inexact `setAndAllowWhileIdle`, so a reminder may arrive a few minutes late.
 *  - The plugin re-arms pending reminders after a device reboot.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const CHANNEL_ID = 'occasion-reminders';
/** Community notices the admin marked as pop-up (MINOR_UI_CHANGES.md, Change 3). */
export const NOTICE_CHANNEL_ID = 'community-notices';
const SMALL_ICON = 'ic_stat_notify';
const ICON_COLOR = '#7A1F2B';

/** Normalised permission state: 'granted' | 'denied' | 'prompt' | 'unsupported'. */
function normalisePermission(display) {
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  return 'prompt'; // 'prompt' | 'prompt-with-rationale'
}

const sameMoment = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000;

export function createNotificationService({ plugin = LocalNotifications, isNative = Capacitor.isNativePlatform() } = {}) {
  let channelReady = false;

  async function ensureChannel() {
    if (channelReady) return;
    try {
      await plugin.createChannel({
        id: CHANNEL_ID,
        name: 'त्योहार स्मरण',
        description: 'त्योहारों एवं समाज के अवसरों के स्मरण',
        importance: 4,
        visibility: 1,
        vibration: true,
      });
    } catch (err) {
      // Channels exist only on Android 8+; failure must not block scheduling.
      console.warn('[notifications] channel creation failed', err);
    }
    channelReady = true;
  }

  return {
    isSupported: () => isNative,

    async checkPermission() {
      if (!isNative) return 'unsupported';
      try {
        return normalisePermission((await plugin.checkPermissions()).display);
      } catch (err) {
        console.warn('[notifications] checkPermissions failed', err);
        return 'denied';
      }
    },

    async requestPermission() {
      if (!isNative) return 'unsupported';
      try {
        return normalisePermission((await plugin.requestPermissions()).display);
      } catch (err) {
        console.warn('[notifications] requestPermissions failed', err);
        return 'denied';
      }
    },

    /**
     * @param {ReturnType<import('./reminderPlanner.js').planReminders>} plan
     * @returns {Promise<{ok: boolean, scheduled: number, cancelled: number, kept: number, error?: string}>}
     */
    async syncReminders(plan) {
      const result = { ok: true, scheduled: 0, cancelled: 0, kept: 0 };
      if (!isNative) return { ...result, ok: false, error: 'unsupported' };
      try {
        const { notifications: all = [] } = await plugin.getPending();
        const pending = all.filter((p) => p.extra?.kind !== 'notice'); // notice pop-ups are not reminders
        const wanted = new Map(plan.map((item) => [item.id, item]));

        const toCancel = pending.filter((p) => {
          const want = wanted.get(p.id);
          if (!want) return true;
          const unchanged = want.title === p.title && want.body === p.body && sameMoment(want.at, p.schedule?.at);
          if (unchanged) {
            wanted.delete(p.id);
            result.kept++;
            return false;
          }
          return true; // changed — cancel then re-schedule
        });

        if (toCancel.length) {
          await plugin.cancel({ notifications: toCancel.map((p) => ({ id: p.id })) });
          result.cancelled = toCancel.length;
        }

        const toSchedule = [...wanted.values()];
        if (toSchedule.length) {
          await ensureChannel();
          await plugin.schedule({
            notifications: toSchedule.map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              largeBody: item.body,
              channelId: CHANNEL_ID,
              smallIcon: SMALL_ICON,
              iconColor: ICON_COLOR,
              schedule: { at: item.at, allowWhileIdle: true },
              extra: { occasionId: item.occasionId, date: item.date, kind: item.kind },
            })),
          });
          result.scheduled = toSchedule.length;
        }
        return result;
      } catch (err) {
        console.error('[notifications] sync failed', err);
        return { ...result, ok: false, error: String(err?.message ?? err) };
      }
    },

    /**
     * Shows an admin notice as a heads-up notification right away (like festival
     * reminders, but on its own channel). Only when permission was already granted;
     * never prompts.
     */
    async showNotice({ id, title, body }) {
      if (!isNative) return false;
      try {
        if (normalisePermission((await plugin.checkPermissions()).display) !== 'granted') return false;
        await plugin.createChannel({
          id: NOTICE_CHANNEL_ID,
          name: 'समाज की सूचनाएँ',
          description: 'संगठन द्वारा भेजी गई सूचनाएँ',
          importance: 4,
          visibility: 1,
          vibration: true,
        }).catch(() => {});
        await plugin.schedule({
          notifications: [
            {
              id,
              title,
              body,
              largeBody: body,
              channelId: NOTICE_CHANNEL_ID,
              smallIcon: SMALL_ICON,
              iconColor: ICON_COLOR,
              schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true },
              extra: { kind: 'notice' },
            },
          ],
        });
        return true;
      } catch (err) {
        console.warn('[notifications] notice failed', err);
        return false;
      }
    },

    async cancelAll() {
      if (!isNative) return;
      try {
        const { notifications = [] } = await plugin.getPending();
        if (notifications.length) await plugin.cancel({ notifications: notifications.map((p) => ({ id: p.id })) });
      } catch (err) {
        console.warn('[notifications] cancelAll failed', err);
      }
    },

    async getPendingCount() {
      if (!isNative) return 0;
      try {
        return (await plugin.getPending()).notifications?.length ?? 0;
      } catch {
        return 0;
      }
    },

    /** Calls `handler(date)` when the user taps a reminder. Returns an unsubscribe function. */
    onReminderTapped(handler) {
      if (!isNative) return () => {};
      const subscription = plugin.addListener('localNotificationActionPerformed', (event) => {
        const date = event?.notification?.extra?.date;
        if (typeof date === 'string') handler(date);
      });
      return () => {
        Promise.resolve(subscription).then((s) => s?.remove?.()).catch(() => {});
      };
    },
  };
}

export const notificationService = createNotificationService();
