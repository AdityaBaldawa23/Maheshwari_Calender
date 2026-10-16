/**
 * The app-wide repository instance. To move to a server in V2, create a
 * RemoteCalendarRepository with the same contract (see LocalCalendarRepository.js)
 * and switch it here — no UI changes needed.
 */
import { createLocalCalendarRepository } from './LocalCalendarRepository.js';
import recurringFile from '../data/occasions/recurring.json';

export const calendarRepository = createLocalCalendarRepository({
  calendarModules: import.meta.glob('../data/calendar/[0-9][0-9][0-9][0-9].json', { import: 'default' }),
  occasionModules: import.meta.glob('../data/occasions/[0-9][0-9][0-9][0-9].json', { import: 'default' }),
  recurring: recurringFile.occasions,
  loadAds: () => import('../data/advertisements/ads.json').then((m) => m.default),
  loadNotices: () => import('../data/notices/notices.json').then((m) => m.default),
});
