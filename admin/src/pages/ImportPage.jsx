import { useMemo, useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import { Button, Card, ConfirmDialog, Field, Notice, StatusPill, downloadText, inputClass } from '../components/ui.jsx';
import { commitImport, deactivateMembers, fileFingerprint, getImport, loadMembers } from '../services/api.js';
import { parseCsv, toCsv } from '../../../src/shared/import/csv.js';
import { IMPORT_TARGETS, checkMapping, isSerialHeader, splitHeader, suggestMapping } from '../../../src/shared/import/mapping.js';
import { buildImportPlan, findMissingRecords } from '../../../src/shared/import/plan.js';
import { MEMBER_FIELDS } from '../../../src/shared/directorySchema.js';
import { todayKey } from '../../../src/utils/date.js';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20000;

// Same layout as the community's member sheet. Only Name is required; optional columns may be removed.
// Leave unknown values blank or write N/A. Member ID is optional (filled automatically; keep it once exported).
const TEMPLATE_HEADERS = ['N', 'Name', 'Mobile No', 'Birth Date', 'Anniversary', 'Blood Group', 'Member ID', "Father's Name", "Mother's Name", 'City', 'Note'];
const TEMPLATE_EXAMPLE = ['1', 'EXAMPLE NAME SURNAME', '9800000000', '16/02/2005', 'N/A', 'B Positive', '', '', '', 'Sangli', ''];

async function readRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return parseCsv(await file.text());
  if (name.endsWith('.xlsx')) return readSheet(file); // first sheet; cached values only — formulas are never executed
  throw new Error('केवल .xlsx या .csv फ़ाइल — only .xlsx or .csv files are supported');
}

const fieldLabel = (f) => MEMBER_FIELDS[f]?.label.hi ?? IMPORT_TARGETS[f]?.hi ?? f;

export function ImportPage({ uid }) {
  const [step, setStep] = useState('file'); // file → map → preview → done
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState(null); // { headers, dataRows }
  const [mapping, setMapping] = useState({});
  const [mode, setMode] = useState('create');
  const [options, setOptions] = useState({ allowCreate: false, clearBlank: false, matchByIdentity: false, defaultCity: '' });
  const [existing, setExisting] = useState(null);
  const [fingerprint, setFingerprint] = useState('');
  const [previous, setPrevious] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [filter, setFilter] = useState('');

  const importId = fingerprint ? `imp_${fingerprint}_${mode}` : '';

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return setError('फ़ाइल 5 MB से बड़ी है — file too large');
    setBusy(true);
    try {
      const rows = await readRows(f);
      const parsed = splitHeader(rows);
      if (!parsed.headers.length) throw new Error('फ़ाइल खाली है — no header row found');
      if (parsed.dataRows.length > MAX_ROWS) throw new Error(`अधिकतम ${MAX_ROWS} पंक्तियाँ — too many rows; split the file`);
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

  const mappingProblems = checkMapping(mapping);

  const plan = useMemo(() => {
    if (step !== 'preview' || !sheet || !existing) return null;
    return buildImportPlan({ dataRows: sheet.dataRows, mapping, existing, mode, options, fingerprint, today: todayKey() });
  }, [step, sheet, existing, mapping, mode, options, fingerprint]);

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
      if (r.errors.length) r.errors.forEach((e) => rows.push([r.rowNumber, r.status, e.field, e.message]));
      else rows.push([r.rowNumber, r.status, '', r.reason ?? '']);
    }
    downloadText(`import-errors-${todayKey()}.csv`, toCsv(rows));
  };

  const missing = plan && mode === 'update' && existing ? findMissingRecords(existing, plan) : [];
  const writesCount = plan?.writes.length ?? 0;

  return (
    <>
      <Card
        title="Excel / CSV से सदस्य आयात"
        actions={
          <Button variant="secondary" onClick={() => downloadText('directory-template.csv', toCsv([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]))}>
            टेम्पलेट डाउनलोड
          </Button>
        }
      >
        <ol className="mb-3 flex flex-wrap gap-2 text-xs">
          {['file', 'map', 'preview', 'done'].map((s, i) => (
            <li key={s} className={`rounded-full px-3 py-1 ${step === s ? 'bg-maroon text-white' : 'bg-paper text-muted'}`}>
              {i + 1}. {{ file: 'फ़ाइल', map: 'कॉलम मिलान', preview: 'पूर्वावलोकन', done: 'परिणाम' }[s]}
            </li>
          ))}
        </ol>
        {error && <Notice tone="error">{error}</Notice>}

        {step === 'file' && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">
              समाज की मौजूदा Excel (.xlsx) या CSV फ़ाइल चुनें। फ़ाइल आपके ब्राउज़र में ही पढ़ी जाती है; पुष्टि से पहले कुछ भी सहेजा
              नहीं जाता। (Max 5 MB, {MAX_ROWS} rows; first sheet of .xlsx.)
            </p>
            <input type="file" accept=".xlsx,.csv" onChange={onFile} disabled={busy} className="block text-sm" aria-label="फ़ाइल चुनें" />
            {busy && <p className="text-sm text-muted">फ़ाइल पढ़ी जा रही है…</p>}
          </div>
        )}

        {step === 'map' && sheet && (
          <div className="space-y-3">
            <p className="text-sm">
              <strong>{file.name}</strong> — {sheet.dataRows.length} पंक्तियाँ। हर कॉलम का फ़ील्ड जाँचें (अनजान कॉलम अनदेखे होंगे):
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {sheet.headers.map((h, i) => (
                <Field
                  key={i}
                  label={`कॉलम ${i + 1}: “${h || '(बिना शीर्षक)'}”`}
                  hint={isSerialHeader(h) ? 'क्रम संख्या — सदस्य क्रमांक नहीं, अनदेखा (serial number, ignored)' : undefined}
                >
                  <select
                    value={mapping[i] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value || null }))}
                    className={inputClass}
                  >
                    <option value="">— अनदेखा करें (ignore) —</option>
                    {Object.entries(IMPORT_TARGETS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.hi} · {v.en}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <Field
              label="डिफ़ॉल्ट शहर / स्थान (Default city)"
              hint="जिन नई पंक्तियों में शहर नहीं है, उन्हें यह शहर मिलेगा — खाली छोड़ सकते हैं"
            >
              <input
                value={options.defaultCity}
                onChange={(e) => setOptions((o) => ({ ...o, defaultCity: e.target.value }))}
                placeholder="जैसे: सांगली"
                className={inputClass}
              />
            </Field>
            <fieldset className="space-y-1 rounded-xl border border-line p-3 text-sm">
              <legend className="px-1 font-semibold">आयात का प्रकार (Mode)</legend>
              <label className="flex gap-2">
                <input type="radio" checked={mode === 'create'} onChange={() => setMode('create')} />
                <span>
                  <strong>नए सदस्य जोड़ें</strong> (प्रारंभिक आयात) — मौजूदा क्रमांक/संभावित दोहराव छोड़े जाएँगे
                </span>
              </label>
              <label className="flex gap-2">
                <input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} />
                <span>
                  <strong>मौजूदा सदस्य अपडेट करें</strong> — सदस्य क्रमांक से मिलान; केवल बदले हुए फ़ील्ड लिखे जाएँगे
                </span>
              </label>
              {mode === 'update' && (
                <div className="ml-6 space-y-1">
                  <label className="flex gap-2">
                    <input type="checkbox" checked={options.matchByIdentity} onChange={(e) => setOptions((o) => ({ ...o, matchByIdentity: e.target.checked }))} />
                    <span>
                      सदस्य क्रमांक न हो तो <strong>नाम + जन्म तिथि</strong> (या नाम + मोबाइल) से मिलान करें — केवल जब ठीक एक सदस्य मेल खाए
                    </span>
                  </label>
                  <label className="flex gap-2">
                    <input type="checkbox" checked={options.allowCreate} onChange={(e) => setOptions((o) => ({ ...o, allowCreate: e.target.checked }))} />
                    बिना मिलान वाली पंक्तियों को नए सदस्य के रूप में जोड़ें
                  </label>
                  <label className="flex gap-2">
                    <input type="checkbox" checked={options.clearBlank} onChange={(e) => setOptions((o) => ({ ...o, clearBlank: e.target.checked }))} />
                    खाली सेल से मौजूदा मान मिटाएँ (सावधानी — सामान्यतः बंद रखें)
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
                वापस
              </Button>
              <Button onClick={toPreview} disabled={mappingProblems.length > 0}>
                पूर्वावलोकन देखें
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && plan && (
          <div className="space-y-3">
            {previous && (
              <Notice tone="info">
                यह फ़ाइल इसी प्रकार से पहले भी आयात की गई थी (स्थिति: {previous.status})। दोबारा चलाना सुरक्षित है — कोई दोहराव नहीं
                बनेगा।
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
                  {k === 'total' ? 'कुल' : <StatusPill status={k} />} {v}
                </button>
              ))}
            </div>
            <p className="text-sm">
              पुष्टि करने पर <strong>{writesCount}</strong> रिकॉर्ड लिखे जाएँगे। त्रुटि/दोहराव/छोड़ी गई पंक्तियाँ नहीं लिखी जाएँगी — उन्हें
              स्रोत फ़ाइल में ठीक करके दोबारा आयात करें।
            </p>
            <div className="max-h-[28rem] overflow-auto rounded-xl border border-line">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-paper text-xs text-muted">
                  <tr>
                    <th className="px-2 py-1">पंक्ति</th>
                    <th className="px-2 py-1">स्थिति</th>
                    <th className="px-2 py-1">नाम / क्रमांक</th>
                    <th className="px-2 py-1">विवरण</th>
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
                          {r.record.nameHi || r.record.nameEn || '—'}
                          <span className="block font-mono text-xs text-muted">{r.memberId || r.record.id || ''}</span>
                        </td>
                        <td className="px-2 py-1 text-xs">
                          {r.errors.map((e, i) => (
                            <p key={i} className="text-sunday">
                              {fieldLabel(e.field)}: {e.message}
                            </p>
                          ))}
                          {r.reason && <p className="text-saffron">{r.reason}</p>}
                          {r.matchedBy === 'identity' && <p className="text-muted">नाम + जन्म तिथि/मोबाइल से मिलान</p>}
                          {r.changes.map((c) => (
                            <p key={c.field}>
                              {fieldLabel(c.field)}: “{String(c.from || '—')}” → “{String(c.to || '—')}”
                            </p>
                          ))}
                          {r.warnings.map((w, i) => (
                            <p key={`w${i}`} className="text-muted">
                              ⚠ {fieldLabel(w.field)}: {w.message}
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
                {missing.length} सक्रिय सदस्य इस फ़ाइल में नहीं हैं। वे <strong>नहीं हटेंगे</strong>। यदि यह पूरी सूची है और उन्हें निष्क्रिय
                करना है, तो आयात के बाद अलग से “सुलह (reconcile)” करें।
              </Notice>
            )}
            {result && !result.ok && (
              <Notice tone="error">
                आयात अधूरा रहा ({result.written}/{writesCount}): {result.error}. “पुनः प्रयास” सुरक्षित है — पहले से लिखे रिकॉर्ड दोहराए नहीं जाएँगे।
              </Notice>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setStep('map')} disabled={busy}>
                वापस
              </Button>
              <Button variant="secondary" onClick={downloadReport}>
                त्रुटि रिपोर्ट (CSV)
              </Button>
              <Button onClick={() => setConfirm('commit')} disabled={busy || writesCount === 0}>
                {result && !result.ok ? 'पुनः प्रयास करें' : `${writesCount} रिकॉर्ड सहेजें`}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && result?.ok && (
          <div className="space-y-3">
            <Notice tone="success">
              आयात पूर्ण: {result.written} रिकॉर्ड सहेजे गए। ऐप में दिखाने के लिए “सदस्य निर्देशिका” में जाकर “प्रकाशित करें” दबाएँ।
            </Notice>
            {mode === 'update' && missing.length > 0 && (
              <Button variant="danger" onClick={() => setConfirm('reconcile')}>
                सुलह: फ़ाइल में न मौजूद {missing.length} सदस्य निष्क्रिय करें…
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
              नया आयात
            </Button>
          </div>
        )}
        {progress && busy && (
          <p className="mt-2 text-sm text-muted" role="status">
            लिखा जा रहा है… {progress.done}/{progress.total}
          </p>
        )}
      </Card>

      {confirm === 'commit' && (
        <ConfirmDialog title="आयात की पुष्टि करें" busy={busy} onConfirm={commit} onCancel={() => setConfirm(null)} confirmLabel="हाँ, सहेजें">
          <p>
            नए: {plan.summary.new} · अपडेट: {plan.summary.update} · छोड़े जाएँगे: {plan.summary.invalid + plan.summary.duplicate + plan.summary.skipped}
          </p>
          <p>कोई रिकॉर्ड हटाया नहीं जाएगा। सहेजने के बाद भी ऐप में तभी दिखेगा जब आप प्रकाशित करेंगे।</p>
        </ConfirmDialog>
      )}
      {confirm === 'reconcile' && (
        <ConfirmDialog
          title="सुलह — सदस्य निष्क्रिय करें"
          danger
          confirmText={String(missing.length)}
          busy={busy}
          confirmLabel="निष्क्रिय करें"
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
            ये {missing.length} सदस्य निष्क्रिय (हटाए नहीं) होंगे और अगले प्रकाशन के बाद ऐप में नहीं दिखेंगे:{' '}
            <span className="font-mono text-xs">{missing.slice(0, 30).join(', ')}{missing.length > 30 ? ' …' : ''}</span>
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
