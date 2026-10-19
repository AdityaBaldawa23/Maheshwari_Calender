import { describe, expect, it } from 'vitest';
import { PROFESSIONS, isCategoryName, matchProfession } from '../src/shared/professions.js';
import { ORGANIZATIONS, orgOf } from '../src/shared/organizations.js';
import { checkPublishedMember, photoThumb, toPublicMember } from '../src/shared/directorySchema.js';
import { splitHeader, suggestMapping } from '../src/shared/import/mapping.js';
import { buildImportPlan } from '../src/shared/import/plan.js';
import { normalizePhotoUrl } from '../src/shared/import/normalize.js';
import { buildDirectoryIndex, searchDirectory } from '../src/services/directorySearch.js';
import { validateMemberForm } from '../src/shared/memberForm.js';
import { wrapLines } from '../admin/src/services/poster.js';

const TODAY = '2026-10-19';
const CLOUD = 'https://res.cloudinary.com/demo/image/upload/v1712/members/ram.jpg';

function plan(rows, { existing = [], mode = 'create', options = {} } = {}) {
  const { headers, dataRows } = splitHeader(rows);
  return buildImportPlan({
    dataRows, mapping: suggestMapping(headers), existing: new Map(existing.map((m) => [m.id, m])), mode, options, fingerprint: 'f', today: TODAY,
  });
}

describe('profession categories', () => {
  it('provides ~30 broad categories with Hindi and English names', () => {
    expect(PROFESSIONS.length).toBeGreaterThanOrEqual(25);
    expect(PROFESSIONS.length).toBeLessThanOrEqual(32);
    expect(new Set(PROFESSIONS.map((p) => p.id)).size).toBe(PROFESSIONS.length);
    expect(PROFESSIONS.every((p) => p.hi && p.en)).toBe(true);
  });

  it.each([
    ['Software Engineer', 'software-it'],
    ['IT', 'software-it'],
    ['CA', 'ca'],
    ['C.S.', 'cs'],
    ['Cardiologist', 'doctor-health'],
    ['MCA student', 'student'],
    ['Haldi trader', 'agri-trade'],
    ['Turmeric commission agent', 'agri-trade'],
    ['हल्दी व्यापारी', 'agri-trade'],
    ['Jewellery shop', 'jewellery'],
    ['Saree shop', 'textile'],
    ['Kirana store', 'retail'],
    ['Civil Engineer', 'engineer'],
    ['Bank Manager', 'banking-finance'],
    ['Housewife', 'homemaker'],
    ['businessman', 'self-employed'],
    ['Chartered Accountant (CA)', 'ca'],
  ])('“%s” → %s', (text, id) => expect(matchProfession(text)).toBe(id));

  it('returns null for unknown text and recognises plain category names', () => {
    expect(matchProfession('xyz')).toBeNull();
    expect(isCategoryName('homemaker', 'Housewife')).toBe(true);
    expect(isCategoryName('ca', 'C.A.')).toBe(true);
    expect(isCategoryName('agri-trade', 'Haldi trader')).toBe(false);
  });
});

describe('photos', () => {
  it('accepts https links, upgrades Cloudinary http, rejects others', () => {
    expect(normalizePhotoUrl(CLOUD).value).toBe(CLOUD);
    expect(normalizePhotoUrl('http://res.cloudinary.com/demo/image/upload/a.jpg').value).toBe('https://res.cloudinary.com/demo/image/upload/a.jpg');
    expect(normalizePhotoUrl('http://example.com/a.jpg').error).toBeTruthy();
    expect(normalizePhotoUrl('photo.jpg').error).toBeTruthy();
    expect(normalizePhotoUrl('N/A').error).toBeTruthy(); // placeholders are filtered earlier, in parseRow
  });

  it('builds small face-centred Cloudinary thumbnails; other hosts unchanged', () => {
    expect(photoThumb(CLOUD, 160)).toBe('https://res.cloudinary.com/demo/image/upload/c_fill,g_face,w_160,h_160,q_auto,f_auto/v1712/members/ram.jpg');
    expect(photoThumb('https://example.org/me.jpg')).toBe('https://example.org/me.jpg');
    expect(photoThumb('javascript:alert(1)')).toBeNull();
  });

  it('validates published photo / profession / organisation fields', () => {
    expect(checkPublishedMember({ id: 'M1', nameEn: 'A', photo: CLOUD, profession: 'ca', org: 'mahila' })).toEqual([]);
    expect(checkPublishedMember({ id: 'M1', nameEn: 'A', photo: 'http://x.com/a.jpg' })).not.toEqual([]);
    expect(checkPublishedMember({ id: 'M1', nameEn: 'A', profession: 'astronaut' })).not.toEqual([]);
    expect(checkPublishedMember({ id: 'M1', nameEn: 'A', org: 'club' })).not.toEqual([]);
    expect(toPublicMember({ id: 'M1', nameEn: 'A', photo: CLOUD, profession: 'ca', professionDetail: 'Audit', designation: 'President', org: 'pragati', adminNote: 'x' }))
      .toEqual({ id: 'M1', nameEn: 'A', photo: CLOUD, profession: 'ca', professionDetail: 'Audit', designation: 'President', org: 'pragati' });
  });
});

describe('import with photo, profession, designation and organisation', () => {
  const HEADER = ['N', 'Name', 'Mobile No', 'Birth Date', 'Profession', 'Designation', 'Photo URL'];

  it('maps the new columns', () => {
    expect(Object.values(suggestMapping(HEADER))).toEqual([null, 'name', 'phone', 'dob', 'profession', 'designation', 'photo']);
    expect(suggestMapping(['व्यवसाय', 'पद', 'फोटो', 'Firm Name'])).toEqual({ 0: 'profession', 1: 'designation', 2: 'photo', 3: 'professionDetail' });
  });

  it('stores the category, keeps informative wording as detail, flags unknown professions', () => {
    const p = plan([HEADER,
      [1, 'RAM TEST', 9800000001, '01/01/1990', 'Haldi trader', 'President', CLOUD],
      [2, 'SITA TEST', 9800000002, '02/02/1991', 'Housewife', '', 'N/A'],
      [3, 'GOPAL TEST', 9800000003, '03/03/1992', 'Astronaut', '', ''],
    ], { options: { org: 'mahasabha' } });
    const [ram, sita, gopal] = p.writes.map((w) => w.data);
    expect(ram).toMatchObject({ profession: 'agri-trade', professionDetail: 'Haldi trader', designation: 'President', photo: CLOUD, org: 'mahasabha' });
    expect(sita).toMatchObject({ profession: 'homemaker' });
    expect(sita.professionDetail).toBeUndefined();
    expect(sita.photo).toBeUndefined(); // N/A photo = no photo, not an error
    expect(gopal).toMatchObject({ profession: 'other', professionDetail: 'Astronaut' });
    expect(p.rows[2].warnings.some((w) => w.field === 'profession')).toBe(true);
  });

  it('rejects a non-https photo link with a row-level error', () => {
    const p = plan([HEADER, [1, 'RAM TEST', 9800000001, '01/01/1990', '', '', 'www.photos.com/ram.jpg']]);
    expect(p.rows[0]).toMatchObject({ status: 'invalid' });
    expect(p.rows[0].errors[0].field).toBe('photo');
  });

  it('keeps organisations separate: the same person can be in two organisations', () => {
    const rows = [HEADER, [1, 'RAM TEST', 9800000001, '01/01/1990', '', '', '']];
    const yuva = plan(rows, { options: { org: 'yuva' } }).writes.map((w) => ({ ...w.data }));
    const again = plan(rows, { existing: yuva, options: { org: 'yuva' } });
    expect(again.summary).toMatchObject({ duplicate: 1, new: 0 }); // same org → duplicate
    const pragati = plan(rows, { existing: yuva, options: { org: 'pragati' } });
    expect(pragati.summary.new).toBe(1); // other org → its own record
    expect(pragati.writes[0].id).not.toBe(yuva[0].id);
    expect(pragati.writes[0].data.org).toBe('pragati');
  });

  it('records created before organisations existed count as Yuva Sangathan', () => {
    expect(orgOf({ id: 'M1' })).toBe('yuva');
    expect(ORGANIZATIONS.map((o) => o.id)).toEqual(['yuva', 'mahasabha', 'mahila', 'pragati']);
  });

  it('manual form validates photo, profession and organisation', () => {
    const base = { nameEn: 'Ram', status: 'active' };
    expect(validateMemberForm({ ...base, photo: CLOUD, profession: 'ca', org: 'mahila' }, { today: TODAY, isNew: true }).record)
      .toMatchObject({ photo: CLOUD, profession: 'ca', org: 'mahila' });
    expect(validateMemberForm({ ...base, photo: 'ftp://x' }, { today: TODAY, isNew: true }).errors.photo).toBeTruthy();
    expect(validateMemberForm({ ...base, profession: 'nope' }, { today: TODAY, isNew: true }).errors.profession).toBeTruthy();
  });
});

describe('directory search with professions and designations', () => {
  const members = [
    { id: 'A', nameEn: 'Ram', profession: 'ca', designation: 'President' },
    { id: 'B', nameEn: 'Sita', profession: 'software-it', professionDetail: 'Infosys' },
    { id: 'C', nameEn: 'Gopal', profession: 'ca', org: 'pragati' },
  ];
  const index = buildDirectoryIndex(members);

  it('filters by profession and by organisation', () => {
    expect(searchDirectory(index, { profession: 'ca' }).map((m) => m.id)).toEqual(['C', 'A']);
    expect(searchDirectory(index, { profession: 'ca', org: 'yuva' }).map((m) => m.id)).toEqual(['A']);
    expect(index.professions).toEqual(['software-it', 'ca']);
    expect(index.orgCounts).toEqual({ yuva: 2, pragati: 1 });
  });

  it('finds members by designation, profession name (Hindi/English) and detail', () => {
    expect(searchDirectory(index, { query: 'president' }).map((m) => m.id)).toEqual(['A']);
    expect(searchDirectory(index, { query: 'infosys' }).map((m) => m.id)).toEqual(['B']);
    expect(searchDirectory(index, { query: 'चार्टर्ड' }).map((m) => m.id).sort()).toEqual(['A', 'C']);
  });
});

describe('poster text wrapping', () => {
  const ctx = { measureText: (s) => ({ width: s.length * 10 }) };
  it('wraps long names into two lines and ellipsises the rest', () => {
    expect(wrapLines(ctx, 'Short Name', 200)).toEqual(['Short Name']);
    expect(wrapLines(ctx, 'Aaaaaaaa Bbbbbbbb Cccccccc', 180)).toEqual(['Aaaaaaaa Bbbbbbbb', 'Cccccccc']);
    const lines = wrapLines(ctx, 'One Two Three Four Five Six Seven', 90, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });
});
