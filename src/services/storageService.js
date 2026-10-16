/**
 * Small persistent key-value store. Uses Capacitor Preferences (Android
 * SharedPreferences on device, localStorage in the browser). Failures never
 * throw: callers get the fallback value and the app keeps working.
 */
import { Preferences } from '@capacitor/preferences';

const PREFIX = 'mdc.';

export function createStorageService(backend = Preferences) {
  return {
    async getJSON(key, fallback) {
      try {
        const { value } = await backend.get({ key: PREFIX + key });
        return value == null ? fallback : JSON.parse(value);
      } catch (err) {
        console.warn(`[storage] could not read ${key}`, err);
        return fallback;
      }
    },

    async setJSON(key, value) {
      try {
        await backend.set({ key: PREFIX + key, value: JSON.stringify(value) });
        return true;
      } catch (err) {
        console.warn(`[storage] could not write ${key}`, err);
        return false;
      }
    },

    async remove(key) {
      try {
        await backend.remove({ key: PREFIX + key });
      } catch (err) {
        console.warn(`[storage] could not remove ${key}`, err);
      }
    },
  };
}

export const storageService = createStorageService();
