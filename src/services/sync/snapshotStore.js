/**
 * Crash-safe persistent snapshot storage for downloaded datasets.
 *
 * Each dataset has two file slots (A/B) in the app's private data directory
 * (Capacitor Filesystem → Android internal storage; IndexedDB in the browser)
 * and a small pointer in Preferences saying which slot is active.
 *
 * save(): write the INACTIVE slot → read it back and parse → flip the pointer.
 * If the app is killed mid-write, the pointer still names the previous, intact
 * slot, so the last valid snapshot always survives. load() falls back to the
 * other slot if the active file is unreadable.
 *
 * Not localStorage: a directory snapshot can be several MB.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

const FOLDER = 'snapshots';

export function createCapacitorFileBackend(fs = Filesystem) {
  const opts = (name) => ({ path: `${FOLDER}/${name}`, directory: Directory.Data, encoding: Encoding.UTF8 });
  return {
    async read(name) {
      try {
        const { data } = await fs.readFile(opts(name));
        return typeof data === 'string' ? data : null;
      } catch {
        return null; // missing file
      }
    },
    async write(name, text) {
      await fs.writeFile({ ...opts(name), data: text, recursive: true });
    },
  };
}

export function createPreferencesPointer(prefs = Preferences) {
  return {
    async get(key) {
      try {
        const { value } = await prefs.get({ key: `mdc.snap.${key}` });
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      await prefs.set({ key: `mdc.snap.${key}`, value: JSON.stringify(value) });
    },
  };
}

/**
 * @param {string} name  dataset name, e.g. "directory"
 * @param {{files?: ReturnType<typeof createCapacitorFileBackend>, pointer?: ReturnType<typeof createPreferencesPointer>}} deps
 */
export function createSnapshotStore(name, { files = createCapacitorFileBackend(), pointer = createPreferencesPointer() } = {}) {
  const fileFor = (slot) => `${name}-${slot}.json`;

  async function readSlot(slot) {
    const text = await files.read(fileFor(slot));
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && parsed.meta ? parsed : null;
    } catch {
      return null; // truncated/corrupt file
    }
  }

  return {
    name,

    /** @returns {Promise<{meta: object, data: any, savedAt: string} | null>} */
    async load() {
      const ptr = await pointer.get(name);
      const order = ptr?.slot === 'B' ? ['B', 'A'] : ['A', 'B'];
      if (!ptr) return null; // never saved successfully
      for (const slot of order) {
        const snap = await readSlot(slot);
        if (snap) return snap;
      }
      return null;
    },

    /** Persists a snapshot; resolves only after it is durably readable and active. */
    async save(meta, data) {
      const ptr = await pointer.get(name);
      const target = ptr?.slot === 'A' ? 'B' : 'A';
      const snapshot = { meta, data, savedAt: new Date().toISOString() };
      await files.write(fileFor(target), JSON.stringify(snapshot));
      const check = await readSlot(target);
      if (!check || check.meta?.version !== meta.version) throw new Error(`snapshot ${name}: write verification failed`);
      await pointer.set(name, { slot: target, version: meta.version, savedAt: snapshot.savedAt });
      return snapshot;
    },
  };
}
