/**
 * Generic, safe dataset synchronisation.
 *
 *   1. Read the dataset's version document (1 Firestore read).
 *   2. Same version as the cache → done (no download).
 *   3. Different → download + verify the payload.
 *   4. Persist (two-slot store) and only then report it as active.
 *   Any failure leaves the previously cached snapshot untouched.
 *
 * Calls for the same dataset are serialised, so overlapping triggers (launch +
 * resume + pull-to-refresh) cannot interleave writes.
 */
const locks = new Map();

function withLock(name, fn) {
  const previous = locks.get(name) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  locks.set(name, run.catch(() => {}));
  return run;
}

const failureStatus = (err) => (err?.offline ? 'offline' : err?.denied ? 'denied' : 'error');

/**
 * 'denied' = Security Rules refused the request (e.g. access revoked meanwhile);
 * the caller decides whether the cached copy must be discarded.
 * @returns {Promise<{status: 'updated'|'current'|'unpublished'|'offline'|'denied'|'error', snapshot: object|null, error?: string}>}
 */
export function syncDataset({ dataset, store, remote }) {
  return withLock(dataset.name, async () => {
    const cached = await store.load();
    let meta;
    try {
      meta = await dataset.fetchMeta(remote);
    } catch (err) {
      return { status: failureStatus(err), snapshot: cached, error: String(err?.message ?? err) };
    }
    if (!meta) return { status: 'unpublished', snapshot: cached };
    // Same version (and, for the directory, the same district) → nothing to download.
    if (cached?.meta?.version === meta.version && cached?.meta?.district === meta.district) return { status: 'current', snapshot: cached };

    try {
      const payload = await dataset.fetchPayload(remote, meta);
      const snapshot = await store.save(meta, payload);
      return { status: 'updated', snapshot };
    } catch (err) {
      // Keep using the previous valid snapshot.
      return { status: failureStatus(err), snapshot: cached, error: String(err?.message ?? err) };
    }
  });
}
