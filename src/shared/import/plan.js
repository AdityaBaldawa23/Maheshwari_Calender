/**
 * Builds an import plan from parsed spreadsheet rows WITHOUT writing anything.
 * The admin reviews the plan (row statuses, field changes, errors) and must
 * confirm before the portal commits `plan.writes`.
 *
 * Row statuses:
 *   new        — will create a record
 *   update     — matched an existing record by member ID; only `changes` are written
 *   unchanged  — matched, nothing differs
 *   invalid    — has errors; never written (fix the source file or exclude)
 *   duplicate  — duplicate inside the file or of an existing record; excluded by default
 *   skipped    — not applicable in this mode (e.g. no member ID in update mode)
 *
 * Safety rules: names are never treated as unique; records missing from the
 * file are never deleted or deactivated here (see findMissingRecords); member
 * IDs for new rows are derived from the file fingerprint + row number, so
 * retrying the same import is idempotent.
 */
import { fnv1a } from '../hash.js';
import { ageOn } from '../directorySchema.js';
import {
  cleanText, isBlank, isDevanagari, isPlaceholder, looksLikeFormula, normalizeAge, normalizeBloodGroup, normalizeDate,
  normalizeMemberId, normalizePhone, normalizeText, titleCaseIfAllCaps,
} from './normalize.js';

/** Fields of the admin master record that an import can set. */
export const IMPORTABLE_FIELDS = [
  'nameHi', 'nameEn', 'dob', 'age', 'anniversary', 'bloodGroup', 'fatherName', 'motherName', 'phone', 'city', 'publicNote', 'adminNote',
];

const TEXT_LIMITS = { nameHi: 100, nameEn: 100, fatherName: 100, motherName: 100, city: 100, publicNote: 300, adminNote: 500 };
/** Fields whose ALL-CAPS English values ("ADITYA ANAND MALU") are stored in Title Case. */
const TITLE_CASE_FIELDS = new Set(['nameEn', 'fatherName', 'motherName', 'city']);

/** Normalised text used to compare names (case/space/punctuation-insensitive). */
export const matchKey = (s) => cleanText(s).toLowerCase().replace(/[.,'’]/g, '').replace(/\s+/g, ' ');

function readCell(cells, index) {
  const v = cells[index];
  return v === undefined ? null : v;
}

/** Turns one spreadsheet row into a candidate record + errors/warnings. */
export function parseRow(cells, mapping, { today }) {
  const record = {};
  const errors = [];
  const warnings = [];
  const set = (field, result, label = field) => {
    if (result.error) errors.push({ field: label, message: result.error });
    else if (result.value !== '' && result.value !== undefined) record[field] = result.value;
    if (result.warning) warnings.push({ field: label, message: result.warning });
  };

  for (const [indexText, target] of Object.entries(mapping)) {
    if (!target) continue;
    const raw = readCell(cells, Number(indexText));
    if (isBlank(raw) || isPlaceholder(raw)) continue; // "N/A", "-", "नहीं" … = no value
    if (typeof raw === 'object' && !(raw instanceof Date)) {
      errors.push({ field: target, message: 'असमर्थित सेल प्रकार — unsupported cell type' });
      continue;
    }
    if (looksLikeFormula(raw)) {
      warnings.push({ field: target, message: 'सूत्र जैसा मान, सादे पाठ के रूप में लिया गया — formula-like text kept as plain text' });
    }
    const value = typeof raw === 'boolean' ? String(raw) : raw;
    switch (target) {
      case 'id':
        set('id', normalizeMemberId(value));
        break;
      case 'name': {
        const r = normalizeText(value, TEXT_LIMITS.nameHi);
        if (r.error) errors.push({ field: 'name', message: r.error });
        else if (r.value) {
          if (isDevanagari(r.value)) record._autoNameHi = r.value;
          else record._autoNameEn = titleCaseIfAllCaps(r.value);
        }
        break;
      }
      case 'dob':
        set('dob', normalizeDate(value, { notAfter: today }));
        break;
      case 'anniversary':
        set('anniversary', normalizeDate(value, { notAfter: today }));
        break;
      case 'age':
        set('age', normalizeAge(value));
        break;
      case 'bloodGroup':
        set('bloodGroup', normalizeBloodGroup(value));
        break;
      case 'phone':
        set('phone', normalizePhone(value));
        break;
      default:
        if (TEXT_LIMITS[target]) {
          const r = normalizeText(value, TEXT_LIMITS[target]);
          set(target, TITLE_CASE_FIELDS.has(target) && r.value ? { value: titleCaseIfAllCaps(r.value) } : r);
        }
    }
  }

  // Explicit Hindi/English name columns win over the auto-detected "name" column.
  if (record._autoNameHi && !record.nameHi) record.nameHi = record._autoNameHi;
  if (record._autoNameEn && !record.nameEn) record.nameEn = record._autoNameEn;
  delete record._autoNameHi;
  delete record._autoNameEn;

  if (!record.nameHi && !record.nameEn && !errors.some((e) => e.field.startsWith('name'))) {
    errors.push({ field: 'name', message: 'नाम आवश्यक है — name is required' });
  }
  if (record.dob && record.age !== undefined) {
    const computed = ageOn(record.dob, today);
    if (computed !== record.age) {
      warnings.push({ field: 'age', message: `आयु जन्म तिथि से गणना होगी (${computed}) — age will be computed from DOB` });
    }
    delete record.age; // never store an age that will go stale
  }
  return { record, errors, warnings };
}

const identityKeys = (r) => {
  const name = matchKey(r.nameHi || r.nameEn || '');
  if (!name) return [];
  const keys = [];
  if (r.dob) keys.push(`${name}|dob:${r.dob}`);
  if (r.phone) keys.push(`${name}|phone:${r.phone}`);
  if (r.fatherName) keys.push(`${name}|father:${matchKey(r.fatherName)}`);
  return keys;
};

/**
 * Member ID for a new row without one. Derived from the person's identity
 * (name + birth date, else name + mobile, else name + father) so that the SAME
 * person gets the SAME ID when an updated copy of the sheet is uploaded again.
 * Rows with no identifying detail fall back to file fingerprint + row number.
 */
function generatedId(record, fingerprint, rowNumber, taken) {
  const basis = identityKeys(record)[0] ?? `${fingerprint}:${rowNumber}`;
  let id = `M${fnv1a(basis).toUpperCase()}`;
  for (let n = 2; taken.has(id); n++) id = `M${fnv1a(`${basis}#${n}`).toUpperCase()}`;
  taken.add(id);
  return id;
}

const sameValue = (a, b) => (a ?? '') === (b ?? '');

/**
 * @param {object} input
 * @param {{rowNumber:number, cells:any[]}[]} input.dataRows
 * @param {Record<number,string|null>} input.mapping  column index → target
 * @param {Map<string,object>} input.existing         member id → existing master record
 * @param {'create'|'update'} input.mode
 * @param {{allowCreate?:boolean, clearBlank?:boolean, matchByIdentity?:boolean, defaultCity?:string}} [input.options]
 *   matchByIdentity: in update mode, rows WITHOUT a member ID are matched to an existing
 *     record by name + birth date (or name + mobile / father) — only if exactly one record matches.
 *   defaultCity: city for new rows that have none (e.g. a sheet without a city column).
 * @param {string} input.fingerprint                   stable hash of the uploaded file
 * @param {string} input.today                         "YYYY-MM-DD"
 */
export function buildImportPlan({ dataRows, mapping, existing, mode, options = {}, fingerprint, today }) {
  const { allowCreate = false, clearBlank = false, matchByIdentity = false } = options;
  const defaultCity = cleanText(options.defaultCity ?? '').slice(0, TEXT_LIMITS.city);
  const parsed = dataRows.map(({ rowNumber, cells }) => ({ rowNumber, ...parseRow(cells, mapping, { today }) }));

  // Duplicate member IDs inside the file: every such row is invalid.
  const idRows = new Map();
  for (const p of parsed) {
    if (p.record.id) idRows.set(p.record.id, [...(idRows.get(p.record.id) ?? []), p.rowNumber]);
  }
  for (const p of parsed) {
    const rowsWithId = idRows.get(p.record.id);
    if (rowsWithId && rowsWithId.length > 1) {
      p.errors.push({ field: 'id', message: `सदस्य क्रमांक दोहराया गया (पंक्तियाँ ${rowsWithId.join(', ')}) — duplicate member ID in file` });
    }
  }

  // Index existing records by identity (name + DOB / name + father) for duplicate detection.
  const existingByIdentity = new Map(); // identity key → Set of member ids
  for (const rec of existing.values()) {
    for (const key of identityKeys(rec)) {
      if (!existingByIdentity.has(key)) existingByIdentity.set(key, new Set());
      existingByIdentity.get(key).add(rec.id);
    }
  }
  const identityMatches = (record) => {
    const ids = new Set();
    for (const key of identityKeys(record)) existingByIdentity.get(key)?.forEach((id) => ids.add(id));
    return [...ids];
  };

  const taken = new Set(existing.keys());
  for (const id of idRows.keys()) taken.add(id);
  const seenIdentity = new Map(); // identity key → first rowNumber (rows without IDs)
  const rows = [];
  const writes = [];

  for (const p of parsed) {
    const row = { rowNumber: p.rowNumber, record: p.record, errors: p.errors, warnings: p.warnings, changes: [] };
    rows.push(row);
    if (p.errors.length) {
      row.status = 'invalid';
      continue;
    }

    let match = p.record.id ? existing.get(p.record.id) : undefined;
    const duplicateOfFileRow = !p.record.id && identityKeys(p.record).map((k) => seenIdentity.get(k)).find(Boolean);
    const sameIdentity = p.record.id ? [] : identityMatches(p.record);
    const duplicateOfExisting = sameIdentity.join(', ');
    if (!p.record.id) identityKeys(p.record).forEach((k) => !seenIdentity.has(k) && seenIdentity.set(k, p.rowNumber));

    const asNew = () => {
      if (duplicateOfFileRow) {
        row.status = 'duplicate';
        row.reason = `पंक्ति ${duplicateOfFileRow} जैसी (नाम + जन्म तिथि/पिता) — possible duplicate of row ${duplicateOfFileRow}`;
      } else if (duplicateOfExisting) {
        row.status = 'duplicate';
        row.reason = `मौजूदा सदस्य ${duplicateOfExisting} जैसा — possible duplicate of existing member ${duplicateOfExisting}`;
        row.existingId = duplicateOfExisting;
      } else {
        const id = p.record.id || generatedId(p.record, fingerprint, p.rowNumber, taken);
        row.status = 'new';
        row.memberId = id;
        const data = { ...p.record, id, status: 'active' };
        if (!data.city && defaultCity) data.city = defaultCity;
        writes.push({ kind: 'create', id, data, rowNumber: p.rowNumber });
      }
    };

    if (mode === 'create') {
      if (match) {
        row.status = 'duplicate';
        row.reason = `सदस्य क्रमांक ${p.record.id} पहले से मौजूद — ID already exists (use update mode)`;
        row.existingId = p.record.id;
      } else {
        asNew();
      }
      continue;
    }

    // mode === 'update'
    if (!match && !p.record.id && matchByIdentity && !duplicateOfFileRow) {
      if (sameIdentity.length === 1) {
        match = existing.get(sameIdentity[0]);
        row.matchedBy = 'identity';
      } else if (sameIdentity.length > 1) {
        row.status = 'skipped';
        row.reason = `अस्पष्ट: ${sameIdentity.length} सदस्य मेल खाते हैं (${sameIdentity.join(', ')}) — ambiguous match, add a member ID`;
        continue;
      }
    }
    if (match) {
      row.memberId = match.id;
      const data = {};
      for (const field of IMPORTABLE_FIELDS) {
        const incoming = p.record[field];
        if (incoming === undefined) {
          const mappedForField = Object.values(mapping).includes(field) || (field.startsWith('name') && Object.values(mapping).includes('name'));
          if (clearBlank && mappedForField && !isBlank(match[field])) {
            data[field] = '';
            row.changes.push({ field, from: match[field], to: '' });
          }
        } else if (!sameValue(incoming, match[field])) {
          data[field] = incoming;
          row.changes.push({ field, from: match[field] ?? '', to: incoming });
        }
      }
      if (data.dob && match.age !== undefined) data.age = ''; // DOB now known: drop the stored age
      if (row.changes.length) {
        row.status = 'update';
        writes.push({ kind: 'update', id: match.id, data, rowNumber: p.rowNumber });
      } else {
        row.status = 'unchanged';
      }
    } else if (allowCreate) {
      asNew();
    } else {
      row.status = 'skipped';
      row.reason = p.record.id
        ? `सदस्य क्रमांक ${p.record.id} नहीं मिला — not found (enable "create new")`
        : 'सदस्य क्रमांक नहीं — update mode needs a member ID (or enable "create new")';
    }
  }

  const summary = { total: rows.length, new: 0, update: 0, unchanged: 0, invalid: 0, duplicate: 0, skipped: 0 };
  for (const r of rows) summary[r.status]++;
  return { rows, writes, summary };
}

/**
 * Active records not present in a (full) spreadsheet. Only used by the separate,
 * explicitly confirmed "reconcile" action — never applied automatically.
 */
export function findMissingRecords(existing, plan) {
  const present = new Set(plan.rows.map((r) => r.memberId || r.record.id || r.existingId).filter(Boolean));
  return [...existing.values()].filter((m) => m.status === 'active' && !present.has(m.id)).map((m) => m.id);
}
