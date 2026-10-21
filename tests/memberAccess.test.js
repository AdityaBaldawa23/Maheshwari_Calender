import { describe, expect, it } from 'vitest';
import { AUTH_DOMAIN, maskPhone, normalizeIndianMobile, syntheticEmail, uidForPhone } from '../src/shared/phoneIdentity.js';
import { DISTRICTS, DISTRICT_ID_PATTERN, matchDistrict } from '../src/shared/districts.js';
import { AuthError, FREE_ATTEMPTS, createMemberAuth } from '../src/services/auth/memberAuth.js';
import { suggestMapping } from '../src/shared/import/mapping.js';
import { buildImportPlan } from '../src/shared/import/plan.js';
import { validateMemberForm, EMPTY_MEMBER_FORM } from '../src/shared/memberForm.js';
import { prepareDirectory } from '../admin/src/services/api.js';
import { verifyDirectorySnapshot, buildDirectorySnapshot } from '../src/shared/snapshot.js';
import { popupCandidates } from '../src/services/noticePopups.js';
import { checkNotice } from '../src/utils/validators.js';

describe('[11] phone number → sign-in identity', () => {
  it('normalises every common way of writing the same mobile number to one value', () => {
    const forms = ['9876543210', '+91 98765 43210', '+91-98765-43210', '919876543210', '09876543210', '(987) 654-3210', ' 98765 43210 ', '९८७६५४३२१०', 9876543210];
    expect(new Set(forms.map(normalizeIndianMobile))).toEqual(new Set(['9876543210']));
  });

  it('rejects numbers that are not 10-digit Indian mobiles', () => {
    for (const bad of ['12345', '5876543210', '98765432101', '+1 9876543210', '0233 2345678', 'abc', '', null, undefined]) {
      expect(normalizeIndianMobile(bad), String(bad)).toBeNull();
    }
  });

  it('derives one deterministic, collision-free synthetic email and UID per number', () => {
    expect(AUTH_DOMAIN.endsWith('.invalid')).toBe(true); // reserved: can never be registered or receive mail
    expect(syntheticEmail('9876543210')).toBe('9876543210@maharashtrapradheshmaheshwariyuvasanghatan.invalid');
    expect(uidForPhone('9876543210')).toBe('p9876543210');
    const a = normalizeIndianMobile('+91 98765 43210');
    const b = normalizeIndianMobile('098765-43210');
    expect(syntheticEmail(a)).toBe(syntheticEmail(b));
    expect(uidForPhone('9876543210')).not.toBe(uidForPhone('9876543211'));
    expect(() => syntheticEmail('+919876543210')).toThrow(); // only normalised input
    expect(maskPhone('9876543210')).toBe('98•••••210');
  });
});

describe('districts', () => {
  it('has unique ids that match the Security Rules pattern', () => {
    const ids = DISTRICTS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => DISTRICT_ID_PATTERN.test(id))).toBe(true);
  });

  it('matches common spellings, old names and Marathi/Hindi forms', () => {
    expect(matchDistrict('Sangli')).toBe('sangli');
    expect(matchDistrict('जिल्हा सांगली')).toBe('sangli');
    expect(matchDistrict('Aurangabad')).toBe('chhatrapati-sambhajinagar');
    expect(matchDistrict('Ahmednagar Dist.')).toBe('ahilyanagar');
    expect(matchDistrict('Osmanabad')).toBe('dharashiv');
    expect(matchDistrict('Atlantis')).toBeNull();
  });
});

/** Firebase Auth REST stand-in. */
function fakeFirebase({ accounts = { '9876543210@maharashtrapradheshmaheshwariyuvasanghatan.invalid': 'pattern-pw' }, disabled = new Set() } = {}) {
  const calls = [];
  let tokenNo = 0;
  const json = (status, body) => ({ ok: status === 200, status, json: async () => body });
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('accounts:signInWithPassword')) {
      const { email, password } = JSON.parse(init.body);
      if (disabled.has(email)) return json(400, { error: { message: 'USER_DISABLED' } });
      if (!(email in accounts)) return json(400, { error: { message: 'EMAIL_NOT_FOUND' } });
      if (accounts[email] !== password) return json(400, { error: { message: 'INVALID_PASSWORD' } });
      return json(200, { localId: `p${email.slice(0, 10)}`, idToken: `id-${++tokenNo}`, refreshToken: 'refresh-1', expiresIn: '3600' });
    }
    if (url.includes('/v1/token')) {
      if (disabled.size) return json(400, { error: { message: 'USER_DISABLED' } });
      return json(200, { id_token: `id-${++tokenNo}`, refresh_token: 'refresh-1', expires_in: '3600', user_id: 'p9876543210' });
    }
    return json(404, {});
  };
  return { calls, fetchImpl, disabled };
}

function memoryStorage() {
  const map = new Map();
  return { map, get: async (k) => structuredClone(map.get(k) ?? null), set: async (k, v) => void map.set(k, structuredClone(v)), remove: async (k) => void map.delete(k) };
}

describe('member sign-in (phone + password)', () => {
  it('[5] signs in with the phone number only — the synthetic email is derived internally', async () => {
    const fb = fakeFirebase();
    const auth = createMemberAuth({ apiKey: 'k', fetchImpl: fb.fetchImpl, storage: memoryStorage() });
    const session = await auth.signIn('+91 98765 43210', 'pattern-pw');
    expect(session).toEqual({ uid: 'p9876543210', phone: '9876543210' });
    expect(fb.calls[0].url).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=k');
    expect(JSON.parse(fb.calls[0].init.body).email).toBe('9876543210@maharashtrapradheshmaheshwariyuvasanghatan.invalid');
    expect(await auth.getIdToken()).toBe('id-1');
  });

  it('[18] stays signed in across app launches; the password is never stored', async () => {
    const fb = fakeFirebase();
    const storage = memoryStorage();
    await createMemberAuth({ apiKey: 'k', fetchImpl: fb.fetchImpl, storage }).signIn('9876543210', 'pattern-pw');
    expect(JSON.stringify([...storage.map.values()])).not.toContain('pattern-pw');

    const relaunched = createMemberAuth({ apiKey: 'k', fetchImpl: fb.fetchImpl, storage });
    await relaunched.load();
    expect(relaunched.getSession()).toEqual({ uid: 'p9876543210', phone: '9876543210' });
    expect(await relaunched.getIdToken()).toBe('id-2'); // fresh ID token from the stored refresh token
    expect(fb.calls.at(-1).url).toBe('https://securetoken.googleapis.com/v1/token?key=k');
    expect(fb.calls.at(-1).init.body).toBe('grant_type=refresh_token&refresh_token=refresh-1');
  });

  it('gives the same generic error for a wrong password, an unknown number and a disabled account', async () => {
    const fb = fakeFirebase({ disabled: new Set(['9000000009@maharashtrapradheshmaheshwariyuvasanghatan.invalid']) });
    const auth = createMemberAuth({ apiKey: 'k', fetchImpl: fb.fetchImpl, storage: memoryStorage() });
    for (const [phone, pw] of [['9876543210', 'wrong'], ['9111111111', 'x'], ['9000000009', 'x']]) {
      await expect(auth.signIn(phone, pw)).rejects.toMatchObject({ code: 'invalid' });
    }
    await expect(auth.signIn('12345', 'x')).rejects.toMatchObject({ code: 'invalid-phone' });
  });

  it('locks the form after repeated failures (without contacting the server)', async () => {
    let clock = 1_000_000;
    const fb = fakeFirebase();
    const auth = createMemberAuth({ apiKey: 'k', fetchImpl: fb.fetchImpl, storage: memoryStorage(), now: () => clock });
    for (let i = 0; i < FREE_ATTEMPTS - 1; i++) await expect(auth.signIn('9876543210', 'wrong')).rejects.toMatchObject({ code: 'invalid' });
    await expect(auth.signIn('9876543210', 'wrong')).rejects.toMatchObject({ code: 'throttled' });
    const calls = fb.calls.length;
    await expect(auth.signIn('9876543210', 'pattern-pw')).rejects.toBeInstanceOf(AuthError);
    expect(fb.calls.length).toBe(calls);
    clock += 31_000;
    await expect(auth.signIn('9876543210', 'pattern-pw')).resolves.toMatchObject({ uid: 'p9876543210' });
    expect(await auth.lockRemaining()).toBe(0);
  });

  it('ends the session when Firebase refuses the refresh token (e.g. account disabled)', async () => {
    const fb = fakeFirebase();
    const storage = memoryStorage();
    let clock = 0;
    const auth = createMemberAuth({ apiKey: 'k', fetchImpl: fb.fetchImpl, storage, now: () => clock });
    await auth.signIn('9876543210', 'pattern-pw');
    clock += 3_600_000;
    fb.disabled.add('x');
    await expect(auth.getIdToken()).rejects.toMatchObject({ code: 'session-ended' });
    expect(auth.getSession()).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it('reports offline without dropping the session', async () => {
    const storage = memoryStorage();
    await createMemberAuth({ apiKey: 'k', fetchImpl: fakeFirebase().fetchImpl, storage }).signIn('9876543210', 'pattern-pw');
    const offline = createMemberAuth({ apiKey: 'k', fetchImpl: async () => { throw new TypeError('Failed to fetch'); }, storage });
    await expect(offline.getIdToken()).rejects.toMatchObject({ code: 'offline' });
    expect(offline.getSession()).not.toBeNull();
    await expect(offline.signIn('9876543210', 'x')).rejects.toMatchObject({ code: 'offline' });
  });
});

describe('[17] Excel import and publishing with districts', () => {
  const rows = (cells) => cells.map((c, i) => ({ rowNumber: i + 2, cells: c }));

  it('maps a District column and normalises district names; unknown names are errors', () => {
    const headers = ['N', 'Name', 'Mobile No', 'District', 'जिल्हा'];
    const mapping = suggestMapping(headers);
    expect(mapping).toEqual({ 0: null, 1: 'name', 2: 'phone', 3: 'district', 4: null });
    const plan = buildImportPlan({
      dataRows: rows([['1', 'Ram Malu', '9876543210', 'Sangli'], ['2', 'Shyam', '9876543211', 'Aurangabad'], ['3', 'Gopal', '9876543212', 'Narnia']]),
      mapping, existing: new Map(), mode: 'create', options: {}, fingerprint: 'f', today: '2026-10-21',
    });
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'new', 'invalid']);
    expect(plan.writes.map((w) => w.data.district)).toEqual(['sangli', 'chhatrapati-sambhajinagar']);
  });

  it('applies a default district to new rows, and never creates access records', () => {
    const plan = buildImportPlan({
      dataRows: rows([['Ram Malu', '9876543210']]),
      mapping: { 0: 'name', 1: 'phone' }, existing: new Map(), mode: 'create', options: { defaultDistrict: 'pune' }, fingerprint: 'f', today: '2026-10-21',
    });
    expect(plan.writes[0].data).toMatchObject({ district: 'pune', status: 'active' });
    expect(plan.writes.every((w) => w.kind === 'create' || w.kind === 'update')).toBe(true);
    expect(Object.keys(plan.writes[0].data)).not.toContain('access');
  });

  it('the member form validates the district', () => {
    expect(validateMemberForm({ ...EMPTY_MEMBER_FORM, nameEn: 'Ram', district: 'sangli' }, { today: '2026-10-21', isNew: true }).record.district).toBe('sangli');
    expect(validateMemberForm({ ...EMPTY_MEMBER_FORM, nameEn: 'Ram', district: 'gotham' }, { today: '2026-10-21', isNew: true }).errors.district).toBeTruthy();
  });

  it('prepares one verified snapshot per district; members without a district are not published', () => {
    const members = [
      { id: 'A', nameEn: 'A', status: 'active', district: 'sangli', adminNote: 'secret' },
      { id: 'B', nameEn: 'B', status: 'active', district: 'pune' },
      { id: 'C', nameEn: 'C', status: 'active' },
      { id: 'D', nameEn: 'D', status: 'inactive', district: 'sangli' },
    ];
    const prepared = prepareDirectory(members);
    expect(prepared.districts.map((d) => [d.district, d.publicMembers.map((m) => m.id)])).toEqual([['sangli', ['A']], ['pune', ['B']]]);
    expect(prepared.noDistrict).toEqual(['C']);
    expect(prepared.problems).toEqual([]);
    const sangli = prepared.districts[0].publicMembers;
    expect(sangli[0]).toEqual({ id: 'A', nameEn: 'A' }); // no admin note, no district/status fields
    const { meta, chunks } = buildDirectorySnapshot(sangli, { version: 5, publishedAt: 'x', district: 'sangli' });
    expect(meta.district).toBe('sangli');
    expect(verifyDirectorySnapshot(meta, chunks).ok).toBe(true);
  });
});

describe('admin notices as pop-ups (MINOR_UI_CHANGES.md, Change 3)', () => {
  const n = (id, extra = {}) => ({ id, title: { hi: 'सूचना' }, body: { hi: 'सभा रविवार को' }, active: true, priority: 1, ...extra });

  it('picks active pop-up notices for today that were not dismissed', () => {
    const notices = [n('a', { popup: true }), n('b'), n('c', { popup: true, active: false }), n('d', { popup: true, endDate: '2026-10-01' }), n('e', { popup: true })];
    expect(popupCandidates(notices, '2026-10-21', ['e']).map((x) => x.id)).toEqual(['a']);
  });

  it('validates the popup flag', () => {
    expect(checkNotice(n('a', { popup: true }))).toEqual([]);
    expect(checkNotice(n('a', { popup: 'yes' }))).not.toEqual([]);
  });
});
