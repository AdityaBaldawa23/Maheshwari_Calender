import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, ConfirmDialog, Field, Notice, StatusPill, TextInput, downloadText, inputClass } from '../components/ui.jsx';
import { deleteMember, getPublished, loadMembers, prepareDirectory, publishDirectory, saveMember } from '../services/api.js';
import { BLOOD_GROUPS, memberName } from '../../../src/shared/directorySchema.js';
import { EMPTY_MEMBER_FORM, newMemberId, toForm, validateMemberForm } from '../../../src/shared/memberForm.js';
import { normalizeForSearch } from '../../../src/services/directorySearch.js';
import { toCsv } from '../../../src/shared/import/csv.js';
import { todayKey } from '../../../src/utils/date.js';

const EXPORT_COLUMNS = [
  ['id', 'Member ID'], ['nameHi', 'नाम हिंदी'], ['nameEn', 'Name English'], ['dob', 'Date of Birth'], ['age', 'Age'],
  ['anniversary', 'Anniversary'], ['bloodGroup', 'Blood Group'], ['fatherName', "Father's Name"], ['motherName', "Mother's Name"],
  ['phone', 'Mobile'], ['city', 'City'], ['publicNote', 'Public Note'], ['adminNote', 'Internal Note'], ['status', 'Status'],
];

const millis = (ts) => (ts?.toMillis ? ts.toMillis() : 0);

function MemberForm({ initial, isNew, existingIds, onSave, onCancel }) {
  const [form, setForm] = useState(() => toForm(initial ?? EMPTY_MEMBER_FORM));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const { record, errors: errs } = validateMemberForm(form, { today: todayKey(), isNew });
    if (isNew && !record.id) record.id = newMemberId(record.nameEn);
    if (isNew && existingIds.has(record.id)) errs.id = 'यह सदस्य क्रमांक पहले से मौजूद है — ID already exists';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSave(record);
    } finally {
      setBusy(false);
    }
  };

  const text = (k, label, props = {}) => (
    <Field label={label} error={errors[k]}>
      <TextInput value={form[k]} onChange={set(k)} invalid={Boolean(errors[k])} {...props} />
    </Field>
  );

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/50 p-4">
      <form onSubmit={submit} className="card mx-auto max-w-2xl space-y-3 p-5" aria-label="सदस्य विवरण">
        <h2 className="font-display text-xl text-maroon">{isNew ? 'नया सदस्य जोड़ें' : `संपादन: ${memberName(initial)}`}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {text('id', 'सदस्य क्रमांक (Member ID)', { disabled: !isNew, placeholder: isNew ? 'खाली छोड़ें = स्वतः' : '' })}
          <Field label="स्थिति (Status)">
            <select value={form.status} onChange={set('status')} className={inputClass}>
              <option value="active">सक्रिय — प्रकाशित होगा</option>
              <option value="inactive">निष्क्रिय — प्रकाशित नहीं</option>
            </select>
          </Field>
          {text('nameHi', 'नाम (हिंदी)')}
          {text('nameEn', 'Name (English)')}
          {text('dob', 'जन्म तिथि (DD/MM/YYYY)', { placeholder: '15/08/1990' })}
          {text('age', 'आयु (केवल जन्म तिथि न हो तो)', { inputMode: 'numeric' })}
          {text('anniversary', 'विवाह वर्षगांठ (DD/MM/YYYY)')}
          <Field label="रक्त समूह" error={errors.bloodGroup}>
            <select value={form.bloodGroup} onChange={set('bloodGroup')} className={inputClass}>
              <option value="">—</option>
              {BLOOD_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          {text('fatherName', 'पिता का नाम')}
          {text('motherName', 'माता का नाम')}
          {text('phone', 'मोबाइल / फ़ोन', { inputMode: 'tel' })}
          {text('city', 'शहर / स्थान')}
        </div>
        {text('publicNote', 'सार्वजनिक टिप्पणी (ऐप में दिखेगी)')}
        {text('adminNote', 'आंतरिक टिप्पणी (कभी प्रकाशित नहीं)')}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            रद्द करें
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'सहेजा जा रहा है…' : 'सहेजें'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function MembersPage({ uid }) {
  const [members, setMembers] = useState(null);
  const [published, setPublished] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState(null); // { member?, isNew }
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(100);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [list, pub] = await Promise.all([loadMembers(), getPublished('directory')]);
      setMembers(list);
      setPublished(pub);
    } catch (err) {
      setError(`लोड नहीं हो सका: ${err.message}`);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    if (!members) return [];
    const tokens = normalizeForSearch(query).split(' ').filter(Boolean);
    return members
      .filter((m) => !statusFilter || m.status === statusFilter)
      .filter((m) => {
        if (!tokens.length) return true;
        const hay = normalizeForSearch([m.id, m.nameHi, m.nameEn, m.fatherName, m.city, m.phone].join(' '));
        return tokens.every((t) => hay.includes(t));
      })
      .sort((a, b) => memberName(a).localeCompare(memberName(b), 'hi'));
  }, [members, query, statusFilter]);

  const existingIds = useMemo(() => new Set((members ?? []).map((m) => m.id)), [members]);
  const pendingChanges = useMemo(() => {
    const since = published?.version ?? 0;
    return (members ?? []).filter((m) => millis(m.updatedAt) > since).length;
  }, [members, published]);

  const save = async (record) => {
    await saveMember(record, uid);
    setEditing(null);
    setMessage({ tone: 'success', text: `सहेजा गया: ${memberName(record)} — ऐप में दिखाने के लिए “प्रकाशित करें” दबाएँ।` });
    await reload();
  };

  const toggleStatus = async (m) => {
    await saveMember({ ...m, status: m.status === 'active' ? 'inactive' : 'active', updatedAt: undefined }, uid);
    await reload();
  };

  const exportCsv = () => {
    const rows = [EXPORT_COLUMNS.map(([, h]) => h), ...(members ?? []).map((m) => EXPORT_COLUMNS.map(([k]) => m[k] ?? ''))];
    downloadText(`maheshwari-directory-${todayKey()}.csv`, toCsv(rows));
  };

  const startPublish = () => {
    const prepared = prepareDirectory(members ?? []);
    setConfirm({ type: 'publish', prepared });
  };

  const runPublish = async () => {
    setBusy(true);
    try {
      const meta = await publishDirectory(confirm.prepared.publicMembers, uid);
      setMessage({ tone: 'success', text: `प्रकाशित: ${meta.recordCount} सदस्य (संस्करण ${meta.version})। ऐप अगली बार खुलने पर अपडेट लेगा।` });
      setConfirm(null);
      await reload();
    } catch (err) {
      setMessage({ tone: 'error', text: `प्रकाशन असफल, पिछला संस्करण यथावत: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    setBusy(true);
    try {
      await deleteMember(confirm.member.id);
      setMessage({ tone: 'success', text: `हटाया गया: ${memberName(confirm.member)} — प्रकाशन के बाद ऐप से भी हट जाएगा।` });
      setConfirm(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card
        title="माहेश्वरी परिवार — सदस्य"
        actions={
          <>
            <Button onClick={() => setEditing({ isNew: true })}>+ नया सदस्य</Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!members?.length}>
              CSV निर्यात
            </Button>
            <Button onClick={startPublish} disabled={!members}>
              प्रकाशित करें
            </Button>
          </>
        }
      >
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <p className="mt-2 text-sm text-muted">
          {members ? `${members.length} रिकॉर्ड (${members.filter((m) => m.status === 'active').length} सक्रिय)` : 'लोड हो रहा है…'}
          {published
            ? ` · प्रकाशित: ${published.recordCount} सदस्य, ${new Date(published.version).toLocaleString('hi-IN')}`
            : ' · अभी तक प्रकाशित नहीं'}
          {pendingChanges > 0 && ` · ${pendingChanges} बदलाव अप्रकाशित`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <TextInput
            type="search"
            placeholder="खोजें — नाम, क्रमांक, पिता, शहर, फ़ोन"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-md"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">सभी</option>
            <option value="active">सक्रिय</option>
            <option value="inactive">निष्क्रिय</option>
          </select>
        </div>
      </Card>

      {members && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs text-muted">
              <tr>
                <th className="px-3 py-2">क्रमांक</th>
                <th className="px-3 py-2">नाम</th>
                <th className="px-3 py-2">पिता</th>
                <th className="px-3 py-2">शहर</th>
                <th className="px-3 py-2">रक्त</th>
                <th className="px-3 py-2">स्थिति</th>
                <th className="px-3 py-2">
                  <span className="sr-only">कार्य</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.slice(0, limit).map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2 font-mono text-xs">{m.id}</td>
                  <td className="px-3 py-2">
                    {m.nameHi || '—'}
                    {m.nameEn && <span className="block text-xs text-muted">{m.nameEn}</span>}
                  </td>
                  <td className="px-3 py-2">{m.fatherName || '—'}</td>
                  <td className="px-3 py-2">{m.city || '—'}</td>
                  <td className="px-3 py-2">{m.bloodGroup || '—'}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={m.status} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Button variant="ghost" onClick={() => setEditing({ member: m, isNew: false })}>
                      संपादन
                    </Button>
                    <Button variant="ghost" onClick={() => toggleStatus(m)}>
                      {m.status === 'active' ? 'निष्क्रिय करें' : 'सक्रिय करें'}
                    </Button>
                    <Button variant="ghost" className="!text-sunday" onClick={() => setConfirm({ type: 'delete', member: m })}>
                      हटाएँ
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > limit && (
            <div className="p-3 text-center">
              <Button variant="secondary" onClick={() => setLimit((l) => l + 200)}>
                और दिखाएँ ({filtered.length - limit})
              </Button>
            </div>
          )}
          {filtered.length === 0 && <p className="p-4 text-center text-muted">कोई रिकॉर्ड नहीं।</p>}
        </div>
      )}

      {editing && (
        <MemberForm
          initial={editing.member}
          isNew={editing.isNew}
          existingIds={existingIds}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {confirm?.type === 'delete' && (
        <ConfirmDialog
          title="सदस्य स्थायी रूप से हटाएँ?"
          danger
          confirmLabel="हटाएँ"
          confirmText={confirm.member.id}
          busy={busy}
          onConfirm={runDelete}
          onCancel={() => setConfirm(null)}
        >
          <p>
            <strong>{memberName(confirm.member)}</strong> ({confirm.member.id}) का रिकॉर्ड हटेगा। केवल छिपाने के लिए “निष्क्रिय करें”
            बेहतर है।
          </p>
        </ConfirmDialog>
      )}

      {confirm?.type === 'publish' && (
        <PublishDialog prepared={confirm.prepared} published={published} busy={busy} onConfirm={runPublish} onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}

function PublishDialog({ prepared, published, busy, onConfirm, onCancel }) {
  const [attested, setAttested] = useState(false);
  const blocked = prepared.problems.length > 0;
  return (
    <ConfirmDialog
      title="निर्देशिका प्रकाशित करें (Publish directory)"
      confirmLabel={blocked ? 'त्रुटियाँ ठीक करें' : 'प्रकाशित करें'}
      busy={busy}
      onConfirm={() => !blocked && attested && onConfirm()}
      onCancel={onCancel}
    >
      <ul className="list-disc pl-5">
        <li>प्रकाशित होंगे: {prepared.publicMembers.length} सक्रिय सदस्य</li>
        <li>प्रकाशित नहीं: {prepared.inactiveCount} निष्क्रिय</li>
        <li>वर्तमान ऐप संस्करण: {published ? `${published.recordCount} सदस्य` : 'कोई नहीं'}</li>
        <li>आंतरिक टिप्पणियाँ कभी प्रकाशित नहीं होतीं।</li>
      </ul>
      {blocked && (
        <Notice tone="error">
          {prepared.problems.length} रिकॉर्ड अमान्य हैं — पहले ठीक करें:{' '}
          {prepared.problems.slice(0, 5).map((p) => `${p.id} (${p.problems[0]})`).join('; ')}
        </Notice>
      )}
      <p className="text-xs text-muted">
        यह सूची ऐप डाउनलोड करने वाले हर व्यक्ति को दिखेगी (जन्म तिथि, रक्त समूह, माता-पिता के नाम, फ़ोन सहित)।
      </p>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-1" />
        <span>
          मैं पुष्टि करता/करती हूँ कि इन सदस्यों की जानकारी सार्वजनिक रूप से प्रकाशित करने की उचित अनुमति ली गई है, और समाज की
          प्रकाशन नीति (docs/V2_DATA_POLICY.md) का पालन किया गया है।
        </span>
      </label>
      {!attested && !blocked && <p className="text-xs text-sunday">प्रकाशन से पहले पुष्टि आवश्यक है।</p>}
    </ConfirmDialog>
  );
}
