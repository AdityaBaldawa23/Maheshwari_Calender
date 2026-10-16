import { describe, expect, it } from 'vitest';
import { MAX_SCHEDULED, notificationId, planReminders } from '../src/services/reminderPlanner.js';
import { createNotificationService } from '../src/services/notificationService.js';
import { createReminderService } from '../src/services/reminderService.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/services/settings.js';

const occasion = (id, date, extra = {}) => ({
  id,
  date,
  title: { hi: id === 'mahesh-navami' ? 'महेश नवमी' : 'पर्व' },
  category: 'maheshwari',
  importance: 'high',
  reminder: { enabled: true, defaultTime: '08:00' },
  ...extra,
});
const settings = (extra = {}) => sanitizeSettings({ ...DEFAULT_SETTINGS, remindersEnabled: true, ...extra });
const NOW = new Date(2027, 5, 1, 9, 0); // 1 June 2027, 09:00 local

describe('notificationId', () => {
  it('is deterministic and a positive 31-bit integer', () => {
    const a = notificationId('mahesh-navami', '2027-06-12', 'sameDay');
    expect(a).toBe(notificationId('mahesh-navami', '2027-06-12', 'sameDay'));
    expect(Number.isInteger(a) && a > 0 && a <= 0x7fffffff).toBe(true);
  });
  it('differs by date and kind', () => {
    const ids = new Set([
      notificationId('mahesh-navami', '2027-06-12', 'sameDay'),
      notificationId('mahesh-navami', '2027-06-12', 'dayBefore'),
      notificationId('mahesh-navami', '2028-06-01', 'sameDay'),
    ]);
    expect(ids.size).toBe(3);
  });
});

describe('planReminders', () => {
  it('plans "आज … है 🙏" at the occasion default time on the same day', () => {
    const [r] = planReminders([occasion('mahesh-navami', '2027-06-12')], settings(), NOW);
    expect(r.title).toBe('आज महेश नवमी है 🙏');
    expect([r.at.getFullYear(), r.at.getMonth(), r.at.getDate(), r.at.getHours(), r.at.getMinutes()]).toEqual([2027, 5, 12, 8, 0]);
  });

  it('uses the user-selected time and adds a day-before reminder', () => {
    const plan = planReminders([occasion('mahesh-navami', '2027-06-12')], settings({ reminderTime: '06:30', dayBefore: true }), NOW);
    expect(plan.map((r) => [r.kind, r.at.getDate(), r.at.getHours(), r.at.getMinutes()])).toEqual([
      ['dayBefore', 11, 6, 30],
      ['sameDay', 12, 6, 30],
    ]);
    expect(plan[0].title).toBe('कल महेश नवमी है 🙏');
  });

  it('returns nothing when reminders are disabled or no kind is selected', () => {
    expect(planReminders([occasion('a', '2027-06-12')], settings({ remindersEnabled: false }), NOW)).toEqual([]);
    expect(planReminders([occasion('a', '2027-06-12')], settings({ sameDay: false, dayBefore: false }), NOW)).toEqual([]);
  });

  it('respects reminder groups, muted occasions and per-occasion reminder flags', () => {
    const list = [
      occasion('vrat-one', '2027-06-12', { category: 'vrat' }), // vrat group off by default
      occasion('muted', '2027-06-12'),
      occasion('no-reminder', '2027-06-12', { reminder: { enabled: false } }),
      occasion('kept', '2027-06-12', { category: 'festival' }),
    ];
    const plan = planReminders(list, settings({ mutedOccasions: ['muted'] }), NOW);
    expect(plan.map((r) => r.occasionId)).toEqual(['kept']);
  });

  it('never schedules in the past', () => {
    const plan = planReminders(
      [occasion('earlier-today', '2027-06-01'), occasion('later-today', '2027-06-01', { reminder: { enabled: true, defaultTime: '18:00' } })],
      settings(),
      NOW,
    );
    expect(plan.map((r) => r.occasionId)).toEqual(['later-today']);
  });

  it('prevents duplicates from repeated occasion records', () => {
    const plan = planReminders([occasion('dup', '2027-06-12'), occasion('dup', '2027-06-12')], settings(), NOW);
    expect(plan).toHaveLength(1);
  });

  it('caps the number of scheduled notifications', () => {
    const many = Array.from({ length: 200 }, (_, i) => occasion(`o-${i}`, '2027-06-20'));
    expect(planReminders(many, settings({ dayBefore: true }), NOW)).toHaveLength(MAX_SCHEDULED);
  });
});

/** In-memory stand-in for @capacitor/local-notifications. */
function fakePlugin({ permission = 'granted' } = {}) {
  const pending = new Map();
  const calls = { schedule: 0, cancel: 0 };
  return {
    calls,
    pending,
    checkPermissions: async () => ({ display: permission }),
    requestPermissions: async () => ({ display: permission }),
    createChannel: async () => {},
    getPending: async () => ({ notifications: [...pending.values()] }),
    schedule: async ({ notifications }) => {
      calls.schedule++;
      notifications.forEach((n) => pending.set(n.id, { ...n, schedule: { at: n.schedule.at } }));
    },
    cancel: async ({ notifications }) => {
      calls.cancel++;
      notifications.forEach((n) => pending.delete(n.id));
    },
    addListener: () => ({ remove: () => {} }),
  };
}

describe('notificationService.syncReminders', () => {
  it('schedules, then is idempotent (no duplicates, no churn)', async () => {
    const plugin = fakePlugin();
    const svc = createNotificationService({ plugin, isNative: true });
    const plan = planReminders([occasion('mahesh-navami', '2027-06-12')], settings({ dayBefore: true }), NOW);

    expect(await svc.syncReminders(plan)).toMatchObject({ ok: true, scheduled: 2, cancelled: 0, kept: 0 });
    expect(await svc.syncReminders(plan)).toMatchObject({ ok: true, scheduled: 0, cancelled: 0, kept: 2 });
    expect(plugin.pending.size).toBe(2);
  });

  it('cancels reminders that are no longer wanted and reschedules changed ones', async () => {
    const plugin = fakePlugin();
    const svc = createNotificationService({ plugin, isNative: true });
    const occ = [occasion('a', '2027-06-12'), occasion('b', '2027-06-13')];
    await svc.syncReminders(planReminders(occ, settings(), NOW));

    const changedTime = planReminders([occ[0]], settings({ reminderTime: '06:00' }), NOW);
    expect(await svc.syncReminders(changedTime)).toMatchObject({ scheduled: 1, cancelled: 2, kept: 0 });
    const [only] = plugin.pending.values();
    expect(only.extra.occasionId).toBe('a');
    expect(new Date(only.schedule.at).getHours()).toBe(6);
  });

  it('reports failures instead of throwing', async () => {
    const plugin = { ...fakePlugin(), getPending: async () => { throw new Error('boom'); } };
    const svc = createNotificationService({ plugin, isNative: true });
    expect(await svc.syncReminders([])).toMatchObject({ ok: false, error: 'boom' });
  });

  it('is a safe no-op in the browser', async () => {
    const svc = createNotificationService({ plugin: fakePlugin(), isNative: false });
    expect(await svc.checkPermission()).toBe('unsupported');
    expect((await svc.syncReminders([])).ok).toBe(false);
  });
});

describe('reminderService.sync', () => {
  const calendar = { getOccasionsInRange: async () => [occasion('mahesh-navami', '2027-06-12')] };

  it('plans from calendar data and syncs to the device', async () => {
    const plugin = fakePlugin();
    const svc = createReminderService({ calendar, notifications: createNotificationService({ plugin, isNative: true }) });
    expect(await svc.sync(settings(), NOW)).toMatchObject({ ok: true, scheduled: 1 });
  });

  it('does not schedule without permission', async () => {
    const plugin = fakePlugin({ permission: 'denied' });
    const svc = createReminderService({ calendar, notifications: createNotificationService({ plugin, isNative: true }) });
    expect(await svc.sync(settings(), NOW)).toMatchObject({ ok: false, error: 'permission' });
    expect(plugin.pending.size).toBe(0);
  });

  it('cancels everything when reminders are switched off', async () => {
    const plugin = fakePlugin();
    const notifications = createNotificationService({ plugin, isNative: true });
    const svc = createReminderService({ calendar, notifications });
    await svc.sync(settings(), NOW);
    await svc.sync(settings({ remindersEnabled: false }), NOW);
    expect(plugin.pending.size).toBe(0);
  });
});

describe('sanitizeSettings', () => {
  it('repairs corrupted stored settings', () => {
    const s = sanitizeSettings({ remindersEnabled: 'yes', reminderTime: '99:99', groups: { vrat: true }, mutedOccasions: [1, 'x'] });
    expect(s).toMatchObject({ remindersEnabled: false, reminderTime: null, groups: { festival: true, community: true, vrat: true }, mutedOccasions: ['x'] });
    expect(sanitizeSettings(null)).toEqual(sanitizeSettings(DEFAULT_SETTINGS));
  });
});
