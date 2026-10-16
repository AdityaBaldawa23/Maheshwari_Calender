import { describe, expect, it } from 'vitest';
import { readSheet } from 'read-excel-file/node';
import writeExcelFile from 'write-excel-file/node';
import { parseCsv, toCsv } from '../src/shared/import/csv.js';
import { checkMapping, splitHeader, suggestMapping } from '../src/shared/import/mapping.js';
import { normalizeBloodGroup, normalizeDate, normalizePhone } from '../src/shared/import/normalize.js';
import { buildImportPlan, findMissingRecords } from '../src/shared/import/plan.js';

const TODAY = '2026-10-16';

function planFromRows(rows, { existing = [], mode = 'create', options, fingerprint = 'file-1' } = {}) {
  const { headers, dataRows } = splitHeader(rows);
  const mapping = suggestMapping(headers);
  return buildImportPlan({
    dataRows,
    mapping,
    existing: new Map(existing.map((m) => [m.id, m])),
    mode,
    options,
    fingerprint,
    today: TODAY,
  });
}

describe('CSV parsing', () => {
  it('handles quotes, embedded commas/newlines, CRLF and a BOM', () => {
    const csv = '﻿नाम,पता\r\n"शर्मा, राम","line1\nline2"\r\n"He said ""hi""",x\r\n';
    expect(parseCsv(csv)).toEqual([
      ['नाम', 'पता'],
      ['शर्मा, राम', 'line1\nline2'],
      ['He said "hi"', 'x'],
    ]);
  });
  it('detects semicolon and tab delimiters', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('neutralises formula injection on export but keeps phone numbers', () => {
    const out = toCsv([['=HYPERLINK("x")', '+919876543210', '@SUM(A1)']]);
    expect(out).toContain(`"'=HYPERLINK(""x"")"`);
    expect(out).toContain(',+919876543210,');
    expect(out).toContain("'@SUM(A1)");
  });
});

describe('header mapping', () => {
  it('maps Hindi and English header variants', () => {
    const m = suggestMapping(['Sr', 'Member ID', 'नाम', 'पिता का नाम', 'Date of Birth', 'Blood Group', 'Mobile No.', 'शहर', 'Unknown']);
    expect(Object.values(m)).toEqual([null, 'id', 'name', 'fatherName', 'dob', 'bloodGroup', 'phone', 'city', null]);
  });
  it("normalises punctuation like \"Father's Name:\"", () => {
    expect(suggestMapping(["Father's Name:", 'D.O.B', 'blood_group'])).toEqual({ 0: 'fatherName', 1: 'dob', 2: 'bloodGroup' });
  });
  it('requires a name column and rejects mapping one field twice', () => {
    expect(checkMapping({ 0: 'dob' })[0]).toMatch(/name/);
    expect(checkMapping({ 0: 'name', 1: 'dob', 2: 'dob' })[0]).toMatch(/dob/);
  });
  it('skips blank rows and reports Excel row numbers', () => {
    const { headers, dataRows } = splitHeader([[], ['नाम'], ['', ''], ['राम'], [null], ['श्याम']]);
    expect(headers).toEqual(['नाम']);
    expect(dataRows.map((r) => r.rowNumber)).toEqual([4, 6]);
  });
});

describe('value normalisation', () => {
  it.each([
    ['15/08/1990', '1990-08-15'],
    ['15-8-1990', '1990-08-15'],
    ['1990-08-15', '1990-08-15'],
    ['१५/०८/१९९०', '1990-08-15'],
    [33100, '1990-08-15'], // Excel serial
    [new Date(Date.UTC(1990, 7, 15)), '1990-08-15'],
  ])('date %s → %s', (input, out) => expect(normalizeDate(input).value).toBe(out));

  it.each(['31/02/1990', '15/08/90', 'kal', '1890-01-01'])('rejects date %s', (bad) => {
    expect(normalizeDate(bad).error).toBeTruthy();
  });
  it('rejects future birth dates', () => expect(normalizeDate('01/01/2030', { notAfter: TODAY }).error).toMatch(/future/));

  it.each([
    ['a +ve', 'A+'],
    ['B Positive', 'B+'],
    ['ab-', 'AB-'],
    ['O NEG', 'O-'],
    ['0+', 'O+'],
  ])('blood group %s → %s', (input, out) => expect(normalizeBloodGroup(input).value).toBe(out));
  it('rejects unknown blood groups', () => expect(normalizeBloodGroup('C+').error).toBeTruthy());

  it.each([
    ['98765 43210', '+919876543210'],
    ['+91-98765-43210', '+919876543210'],
    [9876543210, '+919876543210'],
    ['०९८७६५४३२१०', '+919876543210'],
    ['0233 2345678', '02332345678'],
  ])('phone %s → %s', (input, out) => expect(normalizePhone(input).value).toBe(out));
  it('keeps the first of several numbers with a warning', () => {
    expect(normalizePhone('9876543210 / 9123456789')).toMatchObject({ value: '+919876543210', warning: expect.any(String) });
  });
  it('rejects invalid phones', () => expect(normalizePhone('12345').error).toBeTruthy());
});

const HEADER = ['Member ID', 'नाम', 'पिता का नाम', 'जन्म तिथि', 'रक्त समूह', 'मोबाइल', 'शहर', 'Age'];

describe('import plan — initial import (create mode)', () => {
  it('creates valid rows, rejects invalid ones with row/field messages', () => {
    const plan = planFromRows([
      HEADER,
      ['', 'राम शर्मा', 'श्याम शर्मा', '15/08/1990', 'B+', '9876543210', 'सांगली', ''],
      ['', 'Sita Rathi', '', '31/02/1990', 'X+', '12', 'Miraj', ''],
      ['', '', '', '', '', '', '', ''], // blank row ignored
      ['', 'मोहन', '', '', '', '', 'सांगली', '45'],
    ]);
    expect(plan.summary).toMatchObject({ total: 3, new: 2, invalid: 1 });
    const bad = plan.rows.find((r) => r.status === 'invalid');
    expect(bad.rowNumber).toBe(3);
    expect(bad.errors.map((e) => e.field).sort()).toEqual(['bloodGroup', 'dob', 'phone']);
    const ram = plan.writes.find((w) => w.data.nameHi === 'राम शर्मा').data;
    expect(ram).toMatchObject({ dob: '1990-08-15', bloodGroup: 'B+', phone: '+919876543210', city: 'सांगली', status: 'active' });
    expect(ram.age).toBeUndefined();
    expect(plan.writes.find((w) => w.data.nameHi === 'मोहन').data.age).toBe(45); // supplied age kept (no DOB)
  });

  it('never stores an age when a DOB is present (computed instead)', () => {
    const plan = planFromRows([HEADER, ['', 'राम', '', '15/08/1990', '', '', '', '20']]);
    expect(plan.writes[0].data.age).toBeUndefined();
    expect(plan.rows[0].warnings[0].message).toMatch(/computed from DOB/);
  });

  it('marks duplicate member IDs inside the file as invalid', () => {
    const plan = planFromRows([HEADER, ['M1', 'राम', '', '', '', '', '', ''], ['M1', 'श्याम', '', '', '', '', '', '']]);
    expect(plan.summary.invalid).toBe(2);
    expect(plan.writes).toHaveLength(0);
  });

  it('treats same names with different IDs as different people', () => {
    const plan = planFromRows([HEADER, ['M1', 'राम शर्मा', '', '', '', '', '', ''], ['M2', 'राम शर्मा', '', '', '', '', '', '']]);
    expect(plan.summary.new).toBe(2);
  });

  it('flags likely duplicates (same name + DOB) without IDs instead of silently creating two', () => {
    const plan = planFromRows([HEADER, ['', 'राम शर्मा', '', '15/08/1990', '', '', '', ''], ['', 'राम  शर्मा', '', '15-08-1990', '', '', '', '']]);
    expect(plan.summary).toMatchObject({ new: 1, duplicate: 1 });
  });

  it('flags rows matching an existing member, and existing IDs in create mode', () => {
    const existing = [{ id: 'M9', nameHi: 'राम शर्मा', dob: '1990-08-15', status: 'active' }];
    const plan = planFromRows(
      [HEADER, ['', 'राम शर्मा', '', '15/08/1990', '', '', '', ''], ['M9', 'कोई', '', '', '', '', '', '']],
      { existing },
    );
    expect(plan.rows.map((r) => r.status)).toEqual(['duplicate', 'duplicate']);
    expect(plan.rows[0].existingId).toBe('M9');
  });

  it('generates stable IDs: re-planning the same file yields the same IDs (idempotent retry)', () => {
    const rows = [HEADER, ['', 'राम', '', '', '', '', '', ''], ['', 'श्याम', '', '', '', '', '', '']];
    const a = planFromRows(rows).writes.map((w) => w.id);
    const b = planFromRows(rows).writes.map((w) => w.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(2);
    expect(planFromRows(rows, { fingerprint: 'other-file' }).writes[0].id).not.toBe(a[0]);
  });

  it('keeps formula-like text as plain text with a warning (never evaluated)', () => {
    const plan = planFromRows([HEADER, ['', '=CMD("calc")', '', '', '', '', '@SUM(A1)', '']]);
    const row = plan.rows[0];
    expect(row.status).toBe('new');
    expect(row.record.nameEn).toBe('=CMD("calc")');
    expect(row.warnings.some((w) => /formula-like/.test(w.message))).toBe(true);
  });

  it('rejects excessively long text', () => {
    const plan = planFromRows([HEADER, ['', 'क'.repeat(150), '', '', '', '', '', '']]);
    expect(plan.rows[0].status).toBe('invalid');
  });
});

describe('import plan — update existing records', () => {
  const existing = [
    { id: 'M1', nameHi: 'राम शर्मा', city: 'सांगली', phone: '+919876543210', bloodGroup: 'B+', status: 'active' },
    { id: 'M2', nameHi: 'सीता', city: 'मिरज', status: 'active' },
  ];

  it('updates only changed fields of records matched by member ID', () => {
    const plan = planFromRows(
      [HEADER, ['M1', 'राम शर्मा', '', '', 'B+', '9876543210', 'कुपवाड़', ''], ['M2', 'सीता', '', '', '', '', 'मिरज', '']],
      { existing, mode: 'update' },
    );
    expect(plan.rows.map((r) => r.status)).toEqual(['update', 'unchanged']);
    expect(plan.writes).toEqual([{ kind: 'update', id: 'M1', data: { city: 'कुपवाड़' }, rowNumber: 2 }]);
    expect(plan.rows[0].changes).toEqual([{ field: 'city', from: 'सांगली', to: 'कुपवाड़' }]);
  });

  it('does not erase existing values for blank cells (partial spreadsheets are safe)', () => {
    const plan = planFromRows([HEADER, ['M1', 'राम शर्मा', '', '', '', '', '', '']], { existing, mode: 'update' });
    expect(plan.rows[0].status).toBe('unchanged');
    const clearing = planFromRows([HEADER, ['M1', 'राम शर्मा', '', '', '', '', '', '']], { existing, mode: 'update', options: { clearBlank: true } });
    expect(clearing.writes[0].data).toMatchObject({ city: '', phone: '', bloodGroup: '' });
  });

  it('skips unmatched or ID-less rows unless "create new" is enabled', () => {
    const rows = [HEADER, ['M77', 'नया', '', '', '', '', '', ''], ['', 'बिना आईडी', '', '', '', '', '', '']];
    expect(planFromRows(rows, { existing, mode: 'update' }).summary).toMatchObject({ skipped: 2, new: 0 });
    expect(planFromRows(rows, { existing, mode: 'update', options: { allowCreate: true } }).summary).toMatchObject({ new: 2 });
  });

  it('never deletes records missing from the file; reconciliation only lists them', () => {
    const plan = planFromRows([HEADER, ['M1', 'राम शर्मा', '', '', '', '', '', '']], { existing, mode: 'update' });
    expect(plan.writes.every((w) => w.kind !== 'delete')).toBe(true);
    expect(findMissingRecords(new Map(existing.map((m) => [m.id, m])), plan)).toEqual(['M2']);
  });
});

describe('XLSX files', () => {
  it('reads an .xlsx produced by Excel-compatible software, including date cells', async () => {
    const buffer = await writeExcelFile([
      [{ value: 'Member ID' }, { value: 'Name' }, { value: 'DOB' }, { value: 'Blood Group' }, { value: 'Mobile' }],
      [{ value: 'S-001' }, { value: 'Ram Sharma' }, { value: new Date(Date.UTC(1990, 7, 15)), type: Date, format: 'dd/mm/yyyy' }, { value: 'b+' }, { value: 9876543210, type: Number }],
      [{ value: 'S-002' }, { value: 'राधा' }, { value: '01/01/1985' }, { value: '' }, { value: '' }],
    ]).toBuffer();
    const rows = await readSheet(buffer);
    const plan = planFromRows(rows);
    expect(plan.summary).toMatchObject({ new: 2, invalid: 0 });
    expect(plan.writes[0].data).toMatchObject({ id: 'S-001', nameEn: 'Ram Sharma', dob: '1990-08-15', bloodGroup: 'B+', phone: '+919876543210' });
    expect(plan.writes[1].data).toMatchObject({ id: 'S-002', nameHi: 'राधा', dob: '1985-01-01' });
  });
});

describe('large files', () => {
  it('plans 10,000 rows quickly', () => {
    const rows = [HEADER];
    for (let i = 0; i < 10000; i++) rows.push([`M${i}`, `सदस्य ${i}`, `पिता ${i}`, '01/01/1980', 'O+', `98${String(i).padStart(8, '0')}`, 'सांगली', '']);
    const start = performance.now();
    const plan = planFromRows(rows);
    expect(plan.summary.new).toBe(10000);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
