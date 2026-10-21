import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, ConfirmDialog, Field, Notice, StatusPill, TextInput, downloadText, en, inputClass } from '../components/ui.jsx';
import {
  deleteLegacyPublicDirectory, deleteMember, getLegacyPublicDirectory, loadDistrictMetas, loadMembers, prepareDirectory, publishDirectory,
  saveMember,
} from '../services/api.js';
import { BLOOD_GROUPS, memberName, photoThumb } from '../../../src/shared/directorySchema.js';
import { EMPTY_MEMBER_FORM, newMemberId, toForm, validateMemberForm } from '../../../src/shared/memberForm.js';
import { normalizeForSearch } from '../../../src/services/directorySearch.js';
import { PROFESSIONS, professionLabel } from '../../../src/shared/professions.js';
import { ORGANIZATIONS, orgLabel, orgOf } from '../../../src/shared/organizations.js';
import { DISTRICTS, districtLabel } from '../../../src/shared/districts.js';
import { toCsv } from '../../../src/shared/import/csv.js';
import { todayKey } from '../../../src/utils/date.js';

const EXPORT_COLUMNS = [
  ['id', 'Member ID'], ['org', 'Organisation'], ['nameHi', 'Name Hindi'], ['nameEn', 'Name English'], ['dob', 'Date of Birth'],
  ['age', 'Age'], ['anniversary', 'Anniversary'], ['bloodGroup', 'Blood Group'], ['fatherName', "Father's Name"],
  ['motherName', "Mother's Name"], ['phone', 'Mobile'], ['city', 'City'], ['district', 'District'], ['profession', 'Profession'],
  ['professionDetail', 'Profession Details'], ['designation', 'Designation'], ['photo', 'Photo URL'],
  ['publicNote', 'Public Note'], ['adminNote', 'Internal Note'], ['status', 'Status'],
];

const millis = (ts) => (ts?.toMillis ? ts.toMillis() : 0);

function Thumb({ member, size = 36 }) {
  const src = member.photo ? photoThumb(member.photo, size * 2) : null;
  return src ? (
    <img src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid place-items-center rounded-full bg-gold-soft text-xs font-semibold text-maroon" style={{ width: size, height: size }}>
      {memberName(member).slice(0, 1).toUpperCase()}
    </span>
  );
}

function MemberForm({ initial, isNew, existingIds, defaultOrg, onSave, onCancel }) {
  const [form, setForm] = useState(() => toForm(initial ?? { ...EMPTY_MEMBER_FORM, org: defaultOrg }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const { record, errors: errs } = validateMemberForm(form, { today: todayKey(), isNew });
    if (isNew && !record.id) record.id = newMemberId(record.nameEn);
    if (isNew && existingIds.has(record.id)) errs.id = 'This member ID already exists';
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
    <Field label={label} error={en(errors[k])}>
      <TextInput value={form[k]} onChange={set(k)} invalid={Boolean(errors[k])} {...props} />
    </Field>
  );
  const previewPhoto = form.photo && /^https:\/\//.test(form.photo) ? photoThumb(form.photo, 160) : null;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/50 p-4">
      <form onSubmit={submit} className="card mx-auto max-w-2xl space-y-3 p-5" aria-label="Member details">
        <h2 className="font-display text-xl text-maroon">{isNew ? 'Add member' : `Edit: ${memberName(initial)}`}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Organisation">
            <select value={form.org} onChange={set('org')} className={inputClass}>
              {ORGANIZATIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.en} — {o.hi}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={set('status')} className={inputClass}>
              <option value="active">Active — published in the app</option>
              <option value="inactive">Inactive — not published</option>
            </select>
          </Field>
          {text('id', 'Member ID', { disabled: !isNew, placeholder: isNew ? 'Leave empty to generate' : '' })}
          {text('designation', 'Designation (e.g. President)')}
          {text('nameEn', 'Name (English)')}
          {text('nameHi', 'Name (Hindi)')}
          {text('dob', 'Date of birth (DD/MM/YYYY)', { placeholder: '15/08/1990' })}
          {text('age', 'Age (only if no date of birth)', { inputMode: 'numeric' })}
          {text('anniversary', 'Anniversary (DD/MM/YYYY, optional)')}
          <Field label="Blood group" error={en(errors.bloodGroup)}>
            <select value={form.bloodGroup} onChange={set('bloodGroup')} className={inputClass}>
              <option value="">—</option>
              {BLOOD_GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          {text('fatherName', "Father's name")}
          {text('motherName', "Mother's name")}
          {text('phone', 'Mobile / phone', { inputMode: 'tel' })}
          {text('city', 'City / locality')}
          <Field label="District" error={en(errors.district)} hint="The directory is published per district. Without a district the member is not published.">
            <select value={form.district} onChange={set('district')} className={inputClass}>
              <option value="">— not set —</option>
              {DISTRICTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.en} — {d.hi}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Profession" error={en(errors.profession)}>
            <select value={form.profession} onChange={set('profession')} className={inputClass}>
              <option value="">—</option>
              {PROFESSIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.en}
                </option>
              ))}
            </select>
          </Field>
          {text('professionDetail', 'Profession details (firm, specialisation)')}
        </div>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">{text('photo', 'Photo URL (Cloudinary https link)', { inputMode: 'url' })}</div>
          {previewPhoto && <img src={previewPhoto} alt="Photo preview" className="h-16 w-16 rounded-full object-cover" referrerPolicy="no-referrer" />}
        </div>
        {text('publicNote', 'Public note (shown in the app)')}
        {text('adminNote', 'Internal note (never published)')}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function PublishDialog({ prepared, published, busy, onConfirm, onCancel }) {
  const [attested, setAttested] = useState(false);
  const blocked = prepared.problems.length > 0;
  const publishedTotal = Object.values(published ?? {}).reduce((n, p) => n + (p.recordCount ?? 0), 0);
  return (
    <ConfirmDialog
      title="Publish directory (per district)"
      confirmLabel={blocked ? 'Fix errors first' : 'Publish'}
      busy={busy}
      onConfirm={() => !blocked && attested && onConfirm()}
      onCancel={onCancel}
    >
      <ul className="list-disc pl-5">
        <li>
          Will be published: {prepared.publicCount} active members in {prepared.districts.length} district(s) (all organisations)
        </li>
        <li>Not published: {prepared.inactiveCount} inactive</li>
        <li>Currently in the app: {publishedTotal ? `${publishedTotal} members` : 'nothing yet'}</li>
        <li>Internal notes and districts are never part of the published records.</li>
      </ul>
      {prepared.noDistrict.length > 0 && (
        <Notice tone="error">
          {prepared.noDistrict.length} active member(s) have no district and will NOT be published. Set their district (Members →
          Edit, or re-import with a District column): {prepared.noDistrict.slice(0, 8).join(', ')}
          {prepared.noDistrict.length > 8 && ' …'}
        </Notice>
      )}
      {blocked && (
        <Notice tone="error">
          {prepared.problems.length} records are invalid — fix them first:{' '}
          {prepared.problems.slice(0, 5).map((p) => `${p.id} (${p.problems[0]})`).join('; ')}
        </Notice>
      )}
      <p className="text-xs text-muted">
        Each district&apos;s list is visible only to members the IT Head approved for that district, including dates of birth, blood
        groups, parents&apos; names, phone numbers and photos.
      </p>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-1" />
        <span>
          I confirm that appropriate permission has been obtained to share these members&apos; details (and photos) with approved
          members of their district, in line with the organisation&apos;s policy (docs/V2_DATA_POLICY.md).
        </span>
      </label>
      {!attested && !blocked && <p className="text-xs text-sunday">Confirmation is required before publishing.</p>}
    </ConfirmDialog>
  );
}

export function MembersPage({ uid }) {
  const [members, setMembers] = useState(null);
  const [published, setPublished] = useState(null); // { districtId: meta }
  const [legacy, setLegacy] = useState(null); // retired public directory still stored?
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [editing, setEditing] = useState(null); // { member?, isNew }
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(100);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [list, pub, old] = await Promise.all([loadMembers(), loadDistrictMetas(), getLegacyPublicDirectory().catch(() => null)]);
      setMembers(list);
      setPublished(pub);
      setLegacy(old);
    } catch (err) {
      setError(`Could not load members: ${err.message}`);
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
      .filter((m) => !orgFilter || orgOf(m) === orgFilter)
      .filter((m) => !districtFilter || (districtFilter === 'none' ? !m.district : m.district === districtFilter))
      .filter((m) => {
        if (!tokens.length) return true;
        const hay = normalizeForSearch([m.id, m.nameHi, m.nameEn, m.fatherName, m.city, m.phone, m.designation, professionLabel(m.profession, 'en')].join(' '));
        return tokens.every((t) => hay.includes(t));
      })
      .sort((a, b) => memberName(a).localeCompare(memberName(b), 'hi'));
  }, [members, query, statusFilter, orgFilter, districtFilter]);

  const existingIds = useMemo(() => new Set((members ?? []).map((m) => m.id)), [members]);
  const pendingChanges = useMemo(() => {
    const since = Math.max(0, ...Object.values(published ?? {}).map((p) => p.version ?? 0));
    return (members ?? []).filter((m) => millis(m.updatedAt) > since).length;
  }, [members, published]);

  const save = async (record) => {
    await saveMember(record, uid);
    setEditing(null);
    setMessage({ tone: 'success', text: `Saved: ${memberName(record)}. Press “Publish” to update the app.` });
    await reload();
  };

  const toggleStatus = async (m) => {
    await saveMember({ ...m, status: m.status === 'active' ? 'inactive' : 'active', updatedAt: undefined }, uid);
    await reload();
  };

  const exportCsv = () => {
    const rows = [EXPORT_COLUMNS.map(([, h]) => h), ...(members ?? []).map((m) => EXPORT_COLUMNS.map(([k]) => (k === 'org' ? orgOf(m) : (m[k] ?? ''))))];
    downloadText(`maheshwari-directory-${todayKey()}.csv`, toCsv(rows));
  };

  const runPublish = async () => {
    setBusy(true);
    try {
      const result = await publishDirectory(confirm.prepared, uid);
      const changed = Object.keys(result.published).length;
      setMessage({
        tone: 'success',
        text: `Published ${result.recordCount} members. ${changed} district(s) updated, ${result.unchanged.length} unchanged. Approved members' phones update the next time the app syncs.`,
      });
      setConfirm(null);
      await reload();
    } catch (err) {
      setMessage({ tone: 'error', text: `Publishing failed — the previous version is still live: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const runLegacyCleanup = async () => {
    setBusy(true);
    try {
      const n = await deleteLegacyPublicDirectory(uid);
      setMessage({ tone: 'success', text: `Removed the old public directory (${n} documents).` });
      setConfirm(null);
      await reload();
    } catch (err) {
      setMessage({ tone: 'error', text: `Cleanup failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    setBusy(true);
    try {
      await deleteMember(confirm.member.id);
      setMessage({ tone: 'success', text: `Deleted ${memberName(confirm.member)}. It disappears from the app after the next publish.` });
      setConfirm(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const c = {};
    for (const m of members ?? []) c[orgOf(m)] = (c[orgOf(m)] ?? 0) + 1;
    return c;
  }, [members]);
  const districtCounts = useMemo(() => {
    const c = { none: 0 };
    for (const m of members ?? []) c[m.district || 'none'] = (c[m.district || 'none'] ?? 0) + 1;
    return c;
  }, [members]);
  const publishedTotal = Object.values(published ?? {}).reduce((n, p) => n + (p.recordCount ?? 0), 0);
  const publishedDistricts = Object.values(published ?? {}).filter((p) => p.recordCount > 0).length;

  return (
    <>
      <Card
        title="Member directory"
        actions={
          <>
            <Button onClick={() => setEditing({ isNew: true })}>+ Add member</Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!members?.length}>
              Export CSV
            </Button>
            <Button onClick={() => setConfirm({ type: 'publish', prepared: prepareDirectory(members ?? []) })} disabled={!members}>
              Publish
            </Button>
          </>
        }
      >
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {legacy && (
          <Notice tone="error">
            The old <strong>public</strong> directory (published/directory, {legacy.chunkDocs} chunk documents) is still stored in
            Firestore. The new Security Rules already block public reads of it; remove the stored copy once every district has been
            published.{' '}
            <Button variant="ghost" onClick={() => setConfirm({ type: 'legacy' })}>
              Remove old public directory…
            </Button>
          </Notice>
        )}
        <p className="mt-2 text-sm text-muted">
          {members ? `${members.length} records (${members.filter((m) => m.status === 'active').length} active)` : 'Loading…'}
          {publishedDistricts ? ` · In the app: ${publishedTotal} members in ${publishedDistricts} district(s)` : ' · Not published yet'}
          {districtCounts.none > 0 && ` · ${districtCounts.none} without a district (not published)`}
          {pendingChanges > 0 && ` · ${pendingChanges} unpublished changes`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <TextInput
            type="search"
            placeholder="Search name, ID, father, city, phone, profession"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-md"
          />
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">All organisations</option>
            {ORGANIZATIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.en} ({counts[o.id] ?? 0})
              </option>
            ))}
          </select>
          <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} className={`${inputClass} w-auto`} aria-label="District">
            <option value="">All districts</option>
            <option value="none">No district ({districtCounts.none})</option>
            {DISTRICTS.filter((d) => districtCounts[d.id]).map((d) => (
              <option key={d.id} value={d.id}>
                {d.en} ({districtCounts[d.id]})
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Card>

      {members && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs text-muted">
              <tr>
                <th className="px-3 py-2">
                  <span className="sr-only">Photo</span>
                </th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Organisation</th>
                <th className="px-3 py-2">Profession</th>
                <th className="px-3 py-2">City / district</th>
                <th className="px-3 py-2">Blood</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.slice(0, limit).map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2">
                    <Thumb member={m} />
                  </td>
                  <td className="px-3 py-2">
                    {m.nameEn || m.nameHi || '—'}
                    {m.nameEn && m.nameHi && <span className="block text-xs text-muted">{m.nameHi}</span>}
                    <span className="block font-mono text-xs text-muted">
                      {m.id}
                      {m.designation && ` · ${m.designation}`}
                    </span>
                  </td>
                  <td className="px-3 py-2">{orgLabel(orgOf(m), 'en')}</td>
                  <td className="px-3 py-2">{m.profession ? professionLabel(m.profession, 'en') : '—'}</td>
                  <td className="px-3 py-2">
                    {m.city || '—'}
                    <span className={`block text-xs ${m.district ? 'text-muted' : 'text-sunday'}`}>{m.district ? districtLabel(m.district, 'en') : 'No district'}</span>
                  </td>
                  <td className="px-3 py-2">{m.bloodGroup || '—'}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={m.status} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Button variant="ghost" onClick={() => setEditing({ member: m, isNew: false })}>
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => toggleStatus(m)}>
                      {m.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button variant="ghost" className="!text-sunday" onClick={() => setConfirm({ type: 'delete', member: m })}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > limit && (
            <div className="p-3 text-center">
              <Button variant="secondary" onClick={() => setLimit((l) => l + 200)}>
                Show more ({filtered.length - limit})
              </Button>
            </div>
          )}
          {filtered.length === 0 && <p className="p-4 text-center text-muted">No records.</p>}
        </div>
      )}

      {editing && (
        <MemberForm
          initial={editing.member}
          isNew={editing.isNew}
          existingIds={existingIds}
          defaultOrg={orgFilter || 'yuva'}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {confirm?.type === 'delete' && (
        <ConfirmDialog
          title="Delete member permanently?"
          danger
          confirmLabel="Delete"
          confirmText={confirm.member.id}
          busy={busy}
          onConfirm={runDelete}
          onCancel={() => setConfirm(null)}
        >
          <p>
            The record of <strong>{memberName(confirm.member)}</strong> ({confirm.member.id}) will be deleted. To only hide it from the
            app, “Deactivate” is usually better.
          </p>
        </ConfirmDialog>
      )}

      {confirm?.type === 'legacy' && (
        <ConfirmDialog
          title="Remove the old public directory?"
          danger
          confirmLabel="Remove"
          confirmText="REMOVE"
          busy={busy}
          onConfirm={runLegacyCleanup}
          onCancel={() => setConfirm(null)}
        >
          <p>
            Deletes published/directory and its chunks. Master member records and district directories are not touched. Phones
            that downloaded the old public list keep their copy until the app is updated (the new app version deletes it).
          </p>
        </ConfirmDialog>
      )}

      {confirm?.type === 'publish' && (
        <PublishDialog prepared={confirm.prepared} published={published} busy={busy} onConfirm={runPublish} onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}
