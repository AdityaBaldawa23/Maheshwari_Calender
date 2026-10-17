/**
 * The community's member sheet layout:
 *   N | Name | Mobile No | Birth Date | Anniversary | Blood Group
 * (ALL-CAPS English names, numeric mobiles, DD/MM/YYYY dates, "N/A" for missing
 * anniversaries, "B Positive" blood groups, no member ID column).
 * All names below are synthetic test data.
 */
import { describe, expect, it } from 'vitest';
import { readSheet } from 'read-excel-file/node';
import writeExcelFile from 'write-excel-file/node';
import { splitHeader, suggestMapping } from '../src/shared/import/mapping.js';
import { buildImportPlan } from '../src/shared/import/plan.js';
import { isPlaceholder, titleCaseIfAllCaps } from '../src/shared/import/normalize.js';

const TODAY = '2026-10-17';
const HEADER = ['N', 'Name', 'Mobile No', 'Birth Date', 'Anniversary', 'Blood Group'];
const ROWS = [
  [1, 'RAHUL SURESH TESTWAL', 9800000001, '16/02/2005', 'N/A', 'B Positive'],
  [2, 'PRIYA MAHESH DEMOKAR', 9800000002, '04/02/1998', '21/04/2025', 'A Positive'],
  [3, 'VIJAY ANAND SAMPLE', 9800000003, '23/10/1987', '24/06/2012', 'AB Positive'],
  [4, 'KIRAN GIRISH EXAMPLE', 9800000004, '01/02/2001', 'N/A', 'O Negative'],
];

const toCells = (rows) =>
  rows.map((r) => r.map((v) => (typeof v === 'number' ? { value: v, type: Number } : { value: v })));

function plan(rows, { existing = [], mode = 'create', options, fingerprint = 'sheet-a' } = {}) {
  const { headers, dataRows } = splitHeader(rows);
  return buildImportPlan({
    dataRows,
    mapping: suggestMapping(headers),
    existing: new Map(existing.map((m) => [m.id, m])),
    mode,
    options,
    fingerprint,
    today: TODAY,
  });
}

describe("community member sheet (N | Name | Mobile No | Birth Date | Anniversary | Blood Group)", () => {
  it('maps the columns and ignores the serial-number column', () => {
    expect(Object.values(suggestMapping(HEADER))).toEqual([null, 'name', 'phone', 'dob', 'anniversary', 'bloodGroup']);
    expect(suggestMapping(['Sr. No.', 'Name'])[0]).toBeNull();
    expect(suggestMapping(['क्र.', 'नाम'])[0]).toBeNull();
  });

  it('imports an .xlsx in this layout: N/A anniversaries are blank, not errors', async () => {
    const buffer = await writeExcelFile(toCells([HEADER, ...ROWS])).toBuffer();
    const p = plan(await readSheet(buffer));
    expect(p.summary).toMatchObject({ total: 4, new: 4, invalid: 0 });
    const [rahul, priya, vijay, kiran] = p.writes.map((w) => w.data);
    expect(rahul).toMatchObject({ nameEn: 'Rahul Suresh Testwal', phone: '+919800000001', dob: '2005-02-16', bloodGroup: 'B+' });
    expect(rahul.anniversary).toBeUndefined();
    expect(priya).toMatchObject({ anniversary: '2025-04-21', bloodGroup: 'A+' });
    expect(vijay.bloodGroup).toBe('AB+');
    expect(kiran.bloodGroup).toBe('O-');
    expect(kiran.anniversary).toBeUndefined();
    expect(p.rows.every((r) => r.errors.length === 0)).toBe(true);
  });

  it('applies a default city to rows without one', () => {
    const p = plan([HEADER, ...ROWS], { options: { defaultCity: 'सांगली' } });
    expect(p.writes.every((w) => w.data.city === 'सांगली')).toBe(true);
  });

  it('gives the same person the same ID in a later copy of the sheet (re-sorted, new rows added)', () => {
    const first = plan([HEADER, ...ROWS], { fingerprint: 'sheet-a' });
    const resorted = [HEADER, [1, 'NEW PERSON EXTRA', 9800000009, '05/05/1995', 'N/A', 'O Positive'], ...[...ROWS].reverse()];
    const second = plan(resorted, { fingerprint: 'sheet-b' });
    const idOf = (pl, name) => pl.writes.find((w) => w.data.nameEn === name).id;
    expect(idOf(second, 'Rahul Suresh Testwal')).toBe(idOf(first, 'Rahul Suresh Testwal'));
    expect(idOf(second, 'Kiran Girish Example')).toBe(idOf(first, 'Kiran Girish Example'));
  });

  it('re-uploading the whole sheet in create mode adds only new people (no duplicates)', () => {
    const existing = plan([HEADER, ...ROWS]).writes.map((w) => w.data);
    const next = plan([HEADER, ...ROWS, [5, 'NEW PERSON EXTRA', 9800000009, '05/05/1995', 'N/A', 'O Positive']], { existing });
    expect(next.summary).toMatchObject({ new: 1, duplicate: 4 });
  });

  it('update mode can match by name + birth date when there is no member ID, and updates only changes', () => {
    const existing = plan([HEADER, ...ROWS]).writes.map((w) => w.data);
    const changed = ROWS.map((r) => [...r]);
    changed[0][2] = 9811111111; // new mobile
    changed[1][4] = 'N/A'; // blank anniversary does not erase the stored one
    const p = plan([HEADER, ...changed], { existing, mode: 'update', options: { matchByIdentity: true } });
    expect(p.summary).toMatchObject({ update: 1, unchanged: 3 });
    expect(p.writes[0].data).toEqual({ phone: '+919811111111' });
    expect(p.rows[0].matchedBy).toBe('identity');
    // Without the option, ID-less rows are not guessed.
    expect(plan([HEADER, ...changed], { existing, mode: 'update' }).summary.skipped).toBe(4);
  });

  it('refuses to guess when two existing members share the same name and birth date', () => {
    const existing = [
      { id: 'A1', nameEn: 'Rahul Suresh Testwal', dob: '2005-02-16', status: 'active' },
      { id: 'A2', nameEn: 'Rahul Suresh Testwal', dob: '2005-02-16', status: 'active' },
    ];
    const p = plan([HEADER, ROWS[0]], { existing, mode: 'update', options: { matchByIdentity: true } });
    expect(p.rows[0].status).toBe('skipped');
    expect(p.rows[0].reason).toMatch(/ambiguous/);
  });
});

describe('placeholders and capitalisation', () => {
  it.each(['N/A', 'n/a', 'NA', '-', '#N/A', 'nil', 'नहीं', ' N/A '])('%s means "no value"', (v) => expect(isPlaceholder(v)).toBe(true));
  it.each(['Nagpur', 'NAVA', 'Anil'])('%s is a real value', (v) => expect(isPlaceholder(v)).toBe(false));
  it('title-cases only ALL-CAPS English', () => {
    expect(titleCaseIfAllCaps('ADITYA RAMESH DODIYA')).toBe('Aditya Ramesh Dodiya');
    expect(titleCaseIfAllCaps("D'SOUZA A. K.")).toBe("D'Souza A. K.");
    expect(titleCaseIfAllCaps('McDonald')).toBe('McDonald');
    expect(titleCaseIfAllCaps('राम शर्मा')).toBe('राम शर्मा');
  });
});
