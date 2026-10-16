import { describe, expect, it } from 'vitest';
import { buildDirectoryIndex, normalizeForSearch, searchDirectory } from '../src/services/directorySearch.js';
import { ageOn, checkPublishedMember, displayAge, toPublicMember } from '../src/shared/directorySchema.js';
import { buildDirectorySnapshot, verifyDirectorySnapshot } from '../src/shared/snapshot.js';

const members = [
  { id: 'M1', nameHi: 'राम शर्मा', nameEn: 'Ram Sharma', fatherName: 'श्याम शर्मा', bloodGroup: 'B+', city: 'सांगली', phone: '+919876543210' },
  { id: 'M2', nameHi: 'सीता राठी', bloodGroup: 'O+', city: 'मिरज' },
  { id: 'M3', nameEn: 'Mohan Mundada', bloodGroup: 'B+', city: 'Sangli' },
  { id: 'M4', nameHi: 'फ़तेहचंद', city: 'सांगली' }, // no blood group, no phone
];

describe('offline directory search', () => {
  const index = buildDirectoryIndex(members);

  it('finds by Hindi name, English name and father name', () => {
    expect(searchDirectory(index, { query: 'राम' }).map((m) => m.id)).toEqual(['M1']);
    expect(searchDirectory(index, { query: 'mundada' }).map((m) => m.id)).toEqual(['M3']);
    expect(searchDirectory(index, { query: 'RAM sharma' }).map((m) => m.id)).toEqual(['M1']);
    expect(searchDirectory(index, { query: 'श्याम' }).map((m) => m.id)).toEqual(['M1']);
  });

  it('ignores extra whitespace and nukta differences', () => {
    expect(searchDirectory(index, { query: '  राम    शर्मा ' }).map((m) => m.id)).toEqual(['M1']);
    expect(searchDirectory(index, { query: 'फतेहचंद' }).map((m) => m.id)).toEqual(['M4']);
  });

  it('finds by phone digits (with or without +91, Devanagari digits too)', () => {
    expect(searchDirectory(index, { query: '9876543210' }).map((m) => m.id)).toEqual(['M1']);
    expect(searchDirectory(index, { query: '९८७६५' }).map((m) => m.id)).toEqual(['M1']);
  });

  it('filters by blood group, locality, and both combined with search', () => {
    expect(searchDirectory(index, { bloodGroup: 'B+' }).map((m) => m.id).sort()).toEqual(['M1', 'M3']);
    expect(searchDirectory(index, { city: normalizeForSearch('सांगली') }).map((m) => m.id).sort()).toEqual(['M1', 'M4']);
    expect(searchDirectory(index, { bloodGroup: 'B+', city: normalizeForSearch('सांगली') }).map((m) => m.id)).toEqual(['M1']);
    expect(searchDirectory(index, { query: 'mohan', bloodGroup: 'O+' })).toEqual([]);
  });

  it('lists filter options only from existing data', () => {
    expect(index.bloodGroups).toEqual(['B+', 'O+']);
    expect(index.cities.map((c) => c.label).sort()).toEqual(['Sangli', 'मिरज', 'सांगली'].sort());
  });

  it('returns everything for an empty query and nothing for no match', () => {
    expect(searchDirectory(index, {})).toHaveLength(4);
    expect(searchDirectory(index, { query: 'zzz' })).toEqual([]);
  });

  it('searches 10,000 members fast enough for per-keystroke filtering', () => {
    const big = Array.from({ length: 10000 }, (_, i) => ({ id: `M${i}`, nameHi: `सदस्य ${i}`, city: i % 2 ? 'सांगली' : 'मिरज', bloodGroup: 'O+' }));
    const bigIndex = buildDirectoryIndex(big);
    const start = performance.now();
    for (const q of ['स', 'सद', 'सदस्य 99', 'सदस्य 999']) searchDirectory(bigIndex, { query: q, city: normalizeForSearch('सांगली') });
    expect(performance.now() - start).toBeLessThan(400);
    expect(searchDirectory(bigIndex, { query: 'सदस्य 9999' }).map((m) => m.id)).toEqual(['M9999']);
  });
});

describe('member schema', () => {
  it('computes age from DOB on the given day (birthday boundary)', () => {
    expect(ageOn('1990-10-16', '2026-10-15')).toBe(35);
    expect(ageOn('1990-10-16', '2026-10-16')).toBe(36);
    expect(ageOn('2000-02-29', '2027-02-28')).toBe(26); // leap-day birthdays
    expect(displayAge({ age: 45 }, '2026-10-16')).toBe(45); // supplied age without DOB
    expect(displayAge({}, '2026-10-16')).toBeNull();
  });

  it('publishes only public fields, trims, and never publishes admin notes', () => {
    const pub = toPublicMember({ id: 'M1', nameHi: ' राम ', publicNote: 'समिति सदस्य', adminNote: 'private', phone: '', status: 'active', updatedBy: 'uid' });
    expect(pub).toEqual({ id: 'M1', nameHi: 'राम', note: 'समिति सदस्य' });
  });

  it('drops a stored age when a DOB exists', () => {
    expect(toPublicMember({ id: 'M1', nameHi: 'राम', dob: '1990-01-01', age: 20 })).toEqual({ id: 'M1', nameHi: 'राम', dob: '1990-01-01' });
  });

  it('accepts records with missing optional fields; rejects malformed ones', () => {
    expect(checkPublishedMember({ id: 'M4', nameHi: 'फ़तेहचंद' })).toEqual([]);
    expect(checkPublishedMember({ id: 'M5' })).not.toEqual([]);
    expect(checkPublishedMember({ id: 'M5', nameEn: 'X', bloodGroup: 'Z' })).not.toEqual([]);
    expect(checkPublishedMember({ id: 'M5', nameEn: 'X', secret: 1 })).not.toEqual([]);
  });
});

describe('directory snapshots', () => {
  it('round-trips through chunks and verifies the checksum', () => {
    const many = Array.from({ length: 950 }, (_, i) => ({ id: `M${i}`, nameEn: `Member ${String(i).padStart(4, '0')}` }));
    const { meta, chunks } = buildDirectorySnapshot(many, { version: 7, publishedAt: 'x' });
    expect(meta).toMatchObject({ version: 7, recordCount: 950, chunkCount: 3 });
    const result = verifyDirectorySnapshot(meta, [...chunks].reverse());
    expect(result.ok).toBe(true);
    expect(result.members).toHaveLength(950);
  });

  it('rejects incomplete, tampered, mixed-version or invalid snapshots', () => {
    const { meta, chunks } = buildDirectorySnapshot(members, { version: 3, publishedAt: 'x' });
    expect(verifyDirectorySnapshot(meta, []).ok).toBe(false);
    const tampered = [{ ...chunks[0], members: [{ ...chunks[0].members[0], nameHi: 'बदला' }, ...chunks[0].members.slice(1)] }];
    expect(verifyDirectorySnapshot(meta, tampered).error).toMatch(/checksum/);
    expect(verifyDirectorySnapshot(meta, [{ ...chunks[0], version: 2 }]).ok).toBe(false);
    expect(verifyDirectorySnapshot({ ...meta, schemaVersion: 99 }, chunks).error).toMatch(/schemaVersion/);
  });
});
