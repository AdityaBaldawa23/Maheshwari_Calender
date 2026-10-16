/**
 * Read-only access to PUBLISHED Firestore documents via the REST API.
 * No SDK, no sign-in, no listeners — just a few GETs when the app syncs.
 */
import { decodeDocument } from '../../shared/firestoreRest.js';

const TIMEOUT_MS = 15000;

export class RemoteError extends Error {
  constructor(message, { offline = false, status } = {}) {
    super(message);
    this.offline = offline;
    this.status = status;
  }
}

export function createRemoteSource({ projectId, apiKey, fetchImpl = (...a) => fetch(...a) }) {
  const root = `projects/${projectId}/databases/(default)/documents`;
  const base = `https://firestore.googleapis.com/v1/${root}`;
  const keyParam = apiKey ? `key=${encodeURIComponent(apiKey)}` : '';

  async function request(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      return res;
    } catch (err) {
      throw new RemoteError(`network error: ${err?.message ?? err}`, { offline: true });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** Published document as a plain object, or null if it does not exist. */
    async getDoc(path) {
      const res = await request(`${base}/${path}${keyParam ? `?${keyParam}` : ''}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new RemoteError(`GET ${path} failed: HTTP ${res.status}`, { status: res.status });
      return decodeDocument(await res.json());
    },

    /** Several documents in ONE request. Missing documents come back as null, in input order. */
    async getDocs(paths) {
      if (paths.length === 0) return [];
      const res = await request(`${base}:batchGet${keyParam ? `?${keyParam}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: paths.map((p) => `${root}/${p}`) }),
      });
      if (!res.ok) throw new RemoteError(`batchGet failed: HTTP ${res.status}`, { status: res.status });
      const results = await res.json();
      const byName = new Map();
      for (const r of Array.isArray(results) ? results : []) {
        if (r.found) byName.set(r.found.name, decodeDocument(r.found));
      }
      return paths.map((p) => byName.get(`${root}/${p}`) ?? null);
    },
  };
}
