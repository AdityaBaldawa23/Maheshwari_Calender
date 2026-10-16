/**
 * The app-wide repository instance. To move to a server in V2, create a
 * RemoteCalendarRepository with the same contract (see LocalCalendarRepository.js)
 * and switch it here — no UI changes needed.
 */
import { createLocalCalendarRepository } from './LocalCalendarRepository.js';
import recurringFile from '../data/occasions/recurring.json';
import { syncManager } from '../services/sync/syncManager.js';

export const calendarRepository = createLocalCalendarRepository({
  calendarModules: import.meta.glob('../data/calendar/[0-9][0-9][0-9][0-9].json', { import: 'default' }),
  occasionModules: import.meta.glob('../data/occasions/[0-9][0-9][0-9][0-9].json', { import: 'default' }),
  recurring: recurringFile.occasions,
  // Admin-published ads/notices (cached) win over the bundled samples.
  loadAds: () => {
    const published = syncManager.get('content').snapshot?.data;
    return published ? Promise.resolve({ ads: published.ads }) : import('../data/advertisements/ads.json').then((m) => m.default);
  },
  loadNotices: () => {
    const published = syncManager.get('content').snapshot?.data;
    return published ? Promise.resolve({ notices: published.notices }) : import('../data/notices/notices.json').then((m) => m.default);
  },
  getOccasionOverride: (year) => syncManager.getOccasionOverride(year),
});
