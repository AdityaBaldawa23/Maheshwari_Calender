/**
 * Member sign-in: mobile number + password, through Firebase Authentication's
 * Email/Password provider (REST API — the app ships no Firebase SDK).
 *
 *   phone "98765 43210" → normalised "9876543210"
 *                       → synthetic id "9876543210@<reserved .invalid domain>" (src/shared/phoneIdentity.js)
 *                       → accounts:signInWithPassword
 *
 * The member never sees or types an email address. The synthetic id does NOT
 * prove phone ownership; approval by the IT Head does (docs/MEMBER_ACCESS.md).
 *
 * Session: the long-lived refresh token is kept in app-private storage
 * (Capacitor Preferences; Android backup is disabled) so members stay signed in
 * across launches. The short-lived ID token (1 hour) stays in memory and is
 * refreshed when needed. Passwords are never stored.
 *
 * Errors are deliberately generic ('invalid' for any credential problem, also for
 * unknown or disabled accounts) so the screen never reveals whether a number has
 * an account. Repeated failures lock the form for an increasing time on this
 * device; Firebase additionally throttles failed attempts server-side.
 */
import { Preferences } from '@capacitor/preferences';
import { normalizeIndianMobile, syntheticEmail } from '../../shared/phoneIdentity.js';

const SESSION_KEY = 'mdc.auth.session';
const THROTTLE_KEY = 'mdc.auth.throttle';
const TIMEOUT_MS = 15000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Failed attempts allowed before the form locks; then 30 s, 1 min, 2 min … up to 15 min. */
export const FREE_ATTEMPTS = 5;
const LOCK_BASE_MS = 30 * 1000;
const LOCK_MAX_MS = 15 * 60 * 1000;

const CREDENTIAL_ERRORS = ['INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'USER_DISABLED', 'INVALID_EMAIL'];
const SESSION_ENDED_ERRORS = ['TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND', 'INVALID_REFRESH_TOKEN', 'INVALID_GRANT_TYPE', 'MISSING_REFRESH_TOKEN'];

/** code: 'invalid-phone' | 'invalid' | 'throttled' | 'offline' | 'unavailable' | 'session-ended' */
export class AuthError extends Error {
  constructor(code, { retryAt } = {}) {
    super(code);
    this.code = code;
    this.retryAt = retryAt;
  }
}

export function createPreferencesStorage(prefs = Preferences) {
  return {
    async get(key) {
      try {
        const { value } = await prefs.get({ key });
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      await prefs.set({ key, value: JSON.stringify(value) });
    },
    async remove(key) {
      await prefs.remove({ key });
    },
  };
}

const errorCode = async (res) => {
  try {
    const body = await res.json();
    return String(body?.error?.message ?? '').split(' ')[0].split(':')[0];
  } catch {
    return '';
  }
};

export function createMemberAuth({
  apiKey,
  authEmulatorHost = '',
  fetchImpl = (...a) => fetch(...a),
  storage = createPreferencesStorage(),
  now = () => Date.now(),
}) {
  const identity = authEmulatorHost ? `http://${authEmulatorHost}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  const secureToken = authEmulatorHost ? `http://${authEmulatorHost}/securetoken.googleapis.com` : 'https://securetoken.googleapis.com';
  const key = encodeURIComponent(apiKey || 'emulator');

  let session = null; // { uid, phone, refreshToken }
  let idToken = null;
  let expiresAt = 0;
  let refreshing = null;
  let loaded = null;
  const listeners = new Set();
  const emit = () => listeners.forEach((l) => l());

  async function post(url, body, contentType = 'application/json') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: contentType === 'application/json' ? JSON.stringify(body) : body,
        signal: controller.signal,
      });
    } catch {
      throw new AuthError('offline');
    } finally {
      clearTimeout(timer);
    }
  }

  async function throttleState() {
    return (await storage.get(THROTTLE_KEY)) ?? { failures: 0, lockedUntil: 0 };
  }

  async function recordFailure() {
    const t = await throttleState();
    const failures = t.failures + 1;
    const lockedUntil = failures >= FREE_ATTEMPTS ? now() + Math.min(LOCK_MAX_MS, LOCK_BASE_MS * 2 ** (failures - FREE_ATTEMPTS)) : 0;
    await storage.set(THROTTLE_KEY, { failures, lockedUntil });
    return lockedUntil;
  }

  async function clearSession() {
    session = null;
    idToken = null;
    expiresAt = 0;
    await storage.remove(SESSION_KEY);
    emit();
  }

  const api = {
    /** Restores a saved session (call once at startup; works offline). */
    load() {
      loaded ??= storage.get(SESSION_KEY).then((saved) => {
        if (saved?.uid && saved.refreshToken && saved.phone) session = saved;
        emit();
      });
      return loaded;
    },

    /** { uid, phone } of the signed-in member, or null. */
    getSession() {
      return session ? { uid: session.uid, phone: session.phone } : null;
    },

    /** Remaining lock time of the sign-in form on this device (ms), 0 if unlocked. */
    async lockRemaining() {
      return Math.max(0, (await throttleState()).lockedUntil - now());
    },

    async signIn(phoneInput, password) {
      const phone = normalizeIndianMobile(phoneInput);
      if (!phone) throw new AuthError('invalid-phone');
      if (typeof password !== 'string' || password.length === 0) throw new AuthError('invalid');
      const { lockedUntil } = await throttleState();
      if (lockedUntil > now()) throw new AuthError('throttled', { retryAt: lockedUntil });

      const res = await post(`${identity}/v1/accounts:signInWithPassword?key=${key}`, {
        email: syntheticEmail(phone),
        password,
        returnSecureToken: true,
      });
      if (!res.ok) {
        const code = await errorCode(res);
        if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER') throw new AuthError('throttled', { retryAt: await recordFailure() });
        if (CREDENTIAL_ERRORS.includes(code) || res.status === 400) {
          const retryAt = await recordFailure();
          throw new AuthError(retryAt > now() ? 'throttled' : 'invalid', { retryAt });
        }
        throw new AuthError('unavailable');
      }
      const body = await res.json();
      await storage.remove(THROTTLE_KEY);
      session = { uid: body.localId, phone, refreshToken: body.refreshToken };
      idToken = body.idToken;
      expiresAt = now() + Number(body.expiresIn ?? 3600) * 1000;
      await storage.set(SESSION_KEY, session);
      emit();
      return api.getSession();
    },

    /**
     * Valid ID token for Firestore requests (refreshing it if needed), or null
     * when signed out. Throws AuthError('offline') without network and
     * AuthError('session-ended') when Firebase no longer accepts the session
     * (account disabled/deleted, password reset) — the session is then cleared.
     */
    async getIdToken({ forceRefresh = false } = {}) {
      await api.load();
      if (!session) return null;
      if (!forceRefresh && idToken && expiresAt - now() > REFRESH_MARGIN_MS) return idToken;
      refreshing ??= (async () => {
        const current = session;
        const res = await post(
          `${secureToken}/v1/token?key=${key}`,
          `grant_type=refresh_token&refresh_token=${encodeURIComponent(current.refreshToken)}`,
          'application/x-www-form-urlencoded',
        );
        if (!res.ok) {
          const code = await errorCode(res);
          if (SESSION_ENDED_ERRORS.includes(code) || res.status === 400) {
            await clearSession();
            throw new AuthError('session-ended');
          }
          throw new AuthError('unavailable');
        }
        const body = await res.json();
        if (session !== current) throw new AuthError('session-ended'); // signed out meanwhile
        idToken = body.id_token;
        expiresAt = now() + Number(body.expires_in ?? 3600) * 1000;
        if (body.refresh_token && body.refresh_token !== session.refreshToken) {
          session = { ...session, refreshToken: body.refresh_token };
          await storage.set(SESSION_KEY, session);
        }
        return idToken;
      })().finally(() => {
        refreshing = null;
      });
      return refreshing;
    },

    async signOut() {
      await clearSession();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return api;
}
