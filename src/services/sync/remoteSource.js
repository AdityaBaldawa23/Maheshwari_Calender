/**
 * Firestore access via the REST API — no SDK, no listeners, just a few requests
 * when the app syncs.
 *
 *   - Public documents (published/*) are read without signing in.
 *   - The member directory (districts/{id}) and the member's own access record
 *     are read with the signed-in member's ID token (`{ token }`); Security Rules
 *     decide what that member may read.
 *   - submitAccessRequest() is the only write the app ever makes.
 */
import { decodeDocument, encodeFields } from '../../shared/firestoreRest.js';

const TIMEOUT_MS = 15000;

export class RemoteError extends Error {
  constructor(message, { offline = false, status } = {}) {
    super(message);
    this.offline = offline;
    this.status = status;
    /** Security Rules refused the request (not signed in / not authorised). */
    this.denied = status === 401 || status === 403;
  }
}

export function createRemoteSource({ projectId, apiKey, emulatorHost = '', fetchImpl = (...a) => fetch(...a) }) {
  const root = `projects/${projectId}/databases/(default)/documents`;
  const base = emulatorHost ? `http://${emulatorHost}/v1/${root}` : `https://firestore.googleapis.com/v1/${root}`;
  const keyParam = apiKey ? `key=${encodeURIComponent(apiKey)}` : '';
  const withKey = (url) => (keyParam ? `${url}${url.includes('?') ? '&' : '?'}${keyParam}` : url);
  const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

  async function request(url, init = {}) {
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
    /** Document as a plain object, or null if it does not exist. */
    async getDoc(path, { token } = {}) {
      const res = await request(withKey(`${base}/${path}`), { headers: authHeaders(token) });
      if (res.status === 404) return null;
      if (!res.ok) throw new RemoteError(`GET ${path} failed: HTTP ${res.status}`, { status: res.status });
      return decodeDocument(await res.json());
    },

    /** Several documents in ONE request. Missing documents come back as null, in input order. */
    async getDocs(paths, { token } = {}) {
      if (paths.length === 0) return [];
      const res = await request(withKey(`${base}:batchGet`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
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

    /**
     * Creates (or, after the IT Head asked for more information, re-submits)
     * accessRequests/{phone10}, with the server's time as `submittedAt`.
     * No account is needed; Security Rules validate every field.
     */
    async submitAccessRequest(phone10, fields) {
      const name = `${root}/accessRequests/${phone10}`;
      const res = await request(withKey(`${base}:commit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          writes: [
            {
              update: { name, fields: encodeFields({ ...fields, phone: phone10, status: 'pending' }) },
              updateTransforms: [{ fieldPath: 'submittedAt', setToServerValue: 'REQUEST_TIME' }],
            },
          ],
        }),
      });
      if (!res.ok) throw new RemoteError(`access request failed: HTTP ${res.status}`, { status: res.status });
    },
  };
}
