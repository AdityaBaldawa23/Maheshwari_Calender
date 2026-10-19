import { useMemo, useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import { Button, Card, ConfirmDialog, Field, Notice, StatusPill, downloadText, en, inputClass } from '../components/ui.jsx';
import { commitImport, deactivateMembers, fileFingerprint, getImport, loadMembers } from '../services/api.js';
import { parseCsv, toCsv } from '../../../src/shared/import/csv.js';
import { IMPORT_TARGETS, checkMapping, isSerialHeader, splitHeader, suggestMapping } from '../../../src/shared/import/mapping.js';
import { buildImportPlan, findMissingRecords } from '../../../src/shared/import/plan.js';
import { MEMBER_FIELDS } from '../../../src/shared/directorySchema.js';
import { DEFAULT_ORG, ORGANIZATIONS, orgLabel, orgOf } from '../../../src/shared/organizations.js';
import { PROFESSIONS } from '../../../src/shared/professions.js';
import { todayKey } from '../../../src/utils/date.js';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20000;

// Same layout as the community's member sheet. Only Name is required; optional columns may be removed.
// Leave unknown values blank or write N/A. Member ID is optional (filled automatically; keep it once exported).
const TEMPLATE_HEADERS = [
  'N', 'Name', 'Mobile No', 'Birth Date', 'Anniversary', 'Blood Group', 'Profession', 'Profession Details', 'Designation',
  'Photo URL', 'Member ID', "Father's Name", "Mother's Name", 'City', 'Note',
];
const TEMPLATE_EXAMPLE = [
  '1', 'EXAMPLE NAME SURNAME', '9800000000', '16/02/2005', 'N/A', 'B Positive', 'Software Engineer', 'ABC Technologies', '',
  'https://res.cloudinary.com/<cloud>/image/upload/v1/members/example.jpg', '', '', '', 'Sangli', '',
];

async function readRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return parseCsv(await file.text());
  if (name.endsWith('.xlsx')) return readSheet(file); // first sheet; cached values only — formulas are never executed
  throw new Error('Only .xlsx or .csv files are supported');
}

const fieldLabel = (f) => MEMBER_FIELDS[f]?.label.en ?? IMPORT_TARGETS[f]?.en ?? f;
const STEP_LABELS = { file: 'File', map: 'Map columns', preview: 'Preview', done: 'Result' };

export function ImportPage({ uid }) {
  const [step, setStep] = useState('file'); // file → map → preview → done
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState(null); // { headers, dataRows }
  const [mapping, setMapping] = useState({});
  const [mode, setMode] = useState('create');
  const [options, setOptions] = useState({ org: DEFAULT_ORG, allowCreate: false, clearBlank: false, matchByIdentity: false, defaultCity: '' });
  const [existing, setExisting] = useState(null);
  const [fingerprint, setFingerprint] = useState('');
  const [previous, setPrevious] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [filter, setFilter] = useState('');

  const importId = fingerprint ? `imp_${fingerprint}_${options.org}_${mode}` : '';
  const setOption = (key) => (e) => setOptions((o) => ({ ...o, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return setError('The file is larger than 5 MB.');
    setBusy(true);
    try {
      const rows = await readRows(f);
      const parsed = splitHeader(rows);
      if (!parsed.headers.length) throw new Error('The file is empty — no header row found.');
      if (parsed.dataRows.length > MAX_ROWS) throw new Error(`At most ${MAX_ROWS} rows per file — please split it.`);
      const [fp, members] = await Promise.all([fileFingerprint(f), loadMembers()]);
      setFile(f);
      setSheet(parsed);
      setMapping(suggestMapping(parsed.headers));
      setFingerprint(fp);
      setExisting(new Map(members.map((m) => [m.id, m])));
      setStep('map');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const mappingProblems = checkMapping(mapping).map(en);

  const plan = useMemo(() => {
    if (step !== 'preview' || !sheet || !existing) return null;
    return buildImportPlan({ dataRows: sheet.dataRows, mapping, existing, mode, options, fingerprint, today: todayKey() });
  }, [step, sheet, existing, mapping, mode, options, fingerprint]);

  const orgExisting = useMemo(
    () => (existing ? new Map([...existing].filter(([, m]) => orgOf(m) === options.org)) : null),
    [existing, options.org],
  );

  const toPreview = async () => {
    setPrevious(importId ? await getImport(importId).catch(() => null) : null);
    setStep('preview');
  };

  const commit = async () => {
    setBusy(true);
    setProgress({ done: 0, total: plan.writes.length });
    const r = await commitImport({
      importId,
      fileName: file.name,
      fileSize: file.size,
      mode,
      options,
      summary: plan.summary,
      writes: plan.writes,
      uid,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setBusy(false);
    setConfirm(null);
    setResult(r);
    if (r.ok) setStep('done');
  };

  const downloadReport = () => {
    const rows = [['Row', 'Status', 'Field', 'Message']];
    for (const r of plan.rows) {
      if (r.status === 'new' || r.status === 'update' || r.status === 'unchanged') continue;
      if (r.errors.length) r.errors.forEach((e) => rows.push([r.rowNumber, r.status, fieldLabel(e.field), en(e.message)]));
      else rows.push([r.rowNumber, r.status, '', en(r.reason ?? '')]);
    }
    downloadText(`import-errors-${todayKey()}.csv`, toCsv(rows));
  };

  const missing = plan && mode === 'update' && orgExisting ? findMissingRecords(orgExisting, plan) : [];
  const writesCount = plan?.writes.length ?? 0;
  const orgName = orgLabel(options.org, 'en');

  return (
    <>
      <Card
        title="Import members from Excel / CSV"
        actions={
          <Button variant="secondary" onClick={() => downloadText('directory-template.csv', toCsv([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]))}>
            Download template
          </Button>
        }
      >
        <ol className="mb-3 flex flex-wrap gap-2 text-xs">
          {Object.entries(STEP_LABELS).map(([s, label], i) => (
            <li key={s} className={`rounded-full px-3 py-1 ${step === s ? 'bg-maroon text-white' : 'bg-paper text-muted'}`}>
              {i + 1}. {label}
            </li>
          ))}
        </ol>
        {error && <Notice tone="error">{error}</Notice>}

        {step === 'file' && (
          <div className="space-y-3">
            <Field label="Import into organisation" hint="Each organisation keeps its own member list in the app (परिवार tabs).">
              <select value={options.org} onChange={setOption('org')} className={`${inputClass} max-w-sm`}>
                {ORGANIZATIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.en} — {o.hi}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-sm leading-relaxed">
              Choose the existing Excel (.xlsx) or CSV member sheet. It is read inside your browser and nothing is saved before you
              confirm. Max 5 MB, {MAX_ROWS} rows; first sheet of .xlsx. Photos: put the full Cloudinary https link in a “Photo URL”
              column. Professions: any wording (e.g. “Haldi trader”, “Software Engineer”) is mapped to one of {PROFESSIONS.length}{' '}
              categories.
            </p>
            <input type="file" accept=".xlsx,.csv" onChange={onFile} disabled={busy} className="block text-sm" aria-label="Choose file" />
            {busy && <p className="text-sm text-muted">Reading the file…</p>}
          </div>
        )}

        {step === 'map' && sheet && (
          <div className="space-y-3">
            <p className="text-sm">
              <strong>{file.name}</strong> — {sheet.dataRows.length} rows → <strong>{orgName}</strong>. Check the field for each column
              (unknown columns are ignored):
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {sheet.headers.map((h, i) => (
                <Field
                  key={i}
                  label={`Column ${i + 1}: “${h || '(no header)'}”`}
                  hint={isSerialHeader(h) ? 'Serial number — not a member ID, ignored' : undefined}
                >
                  <select
                    value={mapping[i] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value || null }))}
                    className={inputClass}
                  >
                    <option value="">— ignore —</option>
                    {Object.entries(IMPORT_TARGETS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.en}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <Field label="Default city / locality" hint="Given to new rows that have no city. Optional.">
              <input value={options.defaultCity} onChange={setOption('defaultCity')} placeholder="e.g. Sangli / सांगली" className={inputClass} />
            </Field>
            <fieldset className="space-y-1 rounded-xl border border-line p-3 text-sm">
              <legend className="px-1 font-semibold">Mode</legend>
              <label className="flex gap-2">
                <input type="radio" checked={mode === 'create'} onChange={() => setMode('create')} />
                <span>
                  <strong>Add new members</strong> (initial import) — existing IDs and likely duplicates are skipped
                </span>
              </label>
              <label className="flex gap-2">
                <input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} />
                <span>
                  <strong>Update existing members</strong> — matched by member ID; only changed fields are written
                </span>
              </label>
              {mode === 'update' && (
                <div className="ml-6 space-y-1">
                  <label className="flex gap-2">
                    <input type="checkbox" checked={options.matchByIdentity} onChange={setOption('matchByIdentity')} />
                    <span>
                      Without a member ID, match by <strong>name + date of birth</strong> (or name + mobile) — only when exactly one member
                      matches
                    </span>
                  </label>
                  <label className="flex gap-2">
                    <input type="checkbox" checked={options.allowCreate} onChange={setOption('allowCreate')} />
                    Add unmatched rows as new members
                  </label>
                  <label className="flex gap-2">
                    <input type="checkbox" checked={options.clearBlank} onChange={setOption('clearBlank')} />
                    Blank cells erase existing values (careful — normally off)
                  </label>
                </div>
              )}
            </fieldset>
            {mappingProblems.map((p) => (
              <Notice key={p} tone="error">
                {p}
              </Notice>
            ))}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep('file')}>
                Back
              </Button>
              <Button onClick={toPreview} disabled={mappingProblems.length > 0}>
                Preview
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && plan && (
          <div className="space-y-3">
            {previous && (
              <Notice tone="info">
                This file was imported the same way before (status: {previous.status}). Running it again is safe — no duplicates are created.
              </Notice>
            )}
            <div className="flex flex-wrap gap-2 text-sm">
              {Object.entries(plan.summary).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(filter === k ? '' : k)}
                  className={`rounded-full border px-3 py-1 ${filter === k ? 'border-maroon bg-gold-soft' : 'border-line'}`}
                >
                  {k === 'total' ? 'Total' : <StatusPill status={k} />} {v}
                </button>
              ))}
            </div>
            <p className="text-sm">
              Confirming writes <strong>{writesCount}</strong> records to <strong>{orgName}</strong>. Rows with errors, duplicates and skipped
              rows are not written — fix them in the source file and import again.
            </p>
            <div className="max-h-[28rem] overflow-auto rounded-xl border border-line">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-paper text-xs text-muted">
                  <tr>
                    <th className="px-2 py-1">Row</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Name / ID</th>
                    <th className="px-2 py-1">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {plan.rows
                    .filter((r) => !filter || filter === 'total' || r.status === filter)
                    .slice(0, 1000)
                    .map((r) => (
                      <tr key={r.rowNumber} className="align-top">
                        <td className="px-2 py-1">{r.rowNumber}</td>
                        <td className="px-2 py-1">
                          <StatusPill status={r.status} />
                        </td>
                        <td className="px-2 py-1">
                          {r.record.nameEn || r.record.nameHi || '—'}
                          <span className="block font-mono text-xs text-muted">{r.memberId || r.record.id || ''}</span>
                        </td>
                        <td className="px-2 py-1 text-xs">
                          {r.errors.map((e, i) => (
                            <p key={i} className="text-sunday">
                              {fieldLabel(e.field)}: {en(e.message)}
                            </p>
                          ))}
                          {r.reason && <p className="text-saffron">{en(r.reason)}</p>}
                          {r.matchedBy === 'identity' && <p className="text-muted">Matched by name + date of birth / mobile</p>}
                          {r.changes.map((c) => (
                            <p key={c.field}>
                              {fieldLabel(c.field)}: “{String(c.from || '—')}” → “{String(c.to || '—')}”
                            </p>
                          ))}
                          {r.warnings.map((w, i) => (
                            <p key={`w${i}`} className="text-muted">
                              ⚠ {fieldLabel(w.field)}: {en(w.message)}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {mode === 'update' && missing.length > 0 && (
              <Notice tone="info">
                {missing.length} active {orgName} members are not in this file. They will <strong>not</strong> be removed. If this is the
                complete list and they should be deactivated, use the separate “reconcile” step after the import.
              </Notice>
            )}
            {result && !result.ok && (
              <Notice tone="error">
                The import stopped part-way ({result.written}/{writesCount}): {result.error}. Retrying is safe — records already written
                are not duplicated.
              </Notice>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setStep('map')} disabled={busy}>
                Back
              </Button>
              <Button variant="secondary" onClick={downloadReport}>
                Download error report (CSV)
              </Button>
              <Button onClick={() => setConfirm('commit')} disabled={busy || writesCount === 0}>
                {result && !result.ok ? 'Retry' : `Save ${writesCount} records`}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && result?.ok && (
          <div className="space-y-3">
            <Notice tone="success">
              Import complete: {result.written} records saved to {orgName}. To show them in the app, open “Member directory” and press
              “Publish”.
            </Notice>
            {mode === 'update' && missing.length > 0 && (
              <Button variant="danger" onClick={() => setConfirm('reconcile')}>
                Reconcile: deactivate {missing.length} members missing from this file…
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setStep('file');
                setResult(null);
                setSheet(null);
              }}
            >
              New import
            </Button>
          </div>
        )}
        {progress && busy && (
          <p className="mt-2 text-sm text-muted" role="status">
            Writing… {progress.done}/{progress.total}
          </p>
        )}
      </Card>

      {confirm === 'commit' && (
        <ConfirmDialog title="Confirm import" busy={busy} onConfirm={commit} onCancel={() => setConfirm(null)} confirmLabel="Yes, save">
          <p>
            Organisation: <strong>{orgName}</strong> · New: {plan.summary.new} · Updates: {plan.summary.update} · Not written:{' '}
            {plan.summary.invalid + plan.summary.duplicate + plan.summary.skipped}
          </p>
          <p>No records are deleted. Saved records appear in the app only after you publish.</p>
        </ConfirmDialog>
      )}
      {confirm === 'reconcile' && (
        <ConfirmDialog
          title="Reconcile — deactivate members"
          danger
          confirmText={String(missing.length)}
          busy={busy}
          confirmLabel="Deactivate"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setBusy(true);
            await deactivateMembers(missing, uid);
            setBusy(false);
            setConfirm(null);
            setResult({ ...result, reconciled: missing.length });
          }}
        >
          <p>
            These {missing.length} members will be deactivated (not deleted) and disappear from the app after the next publish:{' '}
            <span className="font-mono text-xs">
              {missing.slice(0, 30).join(', ')}
              {missing.length > 30 ? ' …' : ''}
            </span>
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
