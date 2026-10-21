import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, ConfirmDialog, Field, Notice, TextInput, inputClass } from '../components/ui.jsx';
import {
  approveAccess, changeDistrict, deleteAccessRequest, listAccessAudit, listAccessRequests, listMemberAccess, loadMembers,
  rejectRequest, requestMoreInfo, restoreAccess, revokeAccess,
} from '../services/api.js';
import { DISTRICTS, districtLabel } from '../../../src/shared/districts.js';
import { maskPhone, normalizeIndianMobile, uidForPhone } from '../../../src/shared/phoneIdentity.js';
import { matchKey } from '../../../src/shared/import/plan.js';
import { memberName } from '../../../src/shared/directorySchema.js';
import { orgLabel } from '../../../src/shared/organizations.js';
import { whatsappUrl } from '../../../src/shared/whatsapp.js';

const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('en-IN') : '—');
const millis = (ts) => (ts?.toMillis ? ts.toMillis() : 0);

const REQUEST_STATUS = {
  pending: ['Pending', 'bg-gold-soft text-maroon'],
  info_requested: ['Info requested', 'bg-saffron-soft text-saffron'],
  approved: ['Approved', 'bg-green-100 text-vrat'],
  rejected: ['Rejected', 'bg-saffron-soft text-sunday'],
  revoked: ['Revoked', 'bg-saffron-soft text-sunday'],
};

function Pill({ status, map = REQUEST_STATUS }) {
  const [label, cls] = map[status] ?? [status, 'bg-paper text-muted'];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>{label}</span>;
}

/** Provisioning state written by the local Admin SDK script (scripts/provision-members.mjs). */
function accountState(a) {
  if (a.status === 'approved') {
    if (a.accountStatus === 'active') return ['Account ready', 'text-vrat'];
    if (a.accountStatus === 'error') return [`Provisioning failed: ${a.accountNote || 'see script log'}`, 'text-sunday'];
    return ['Awaiting provisioning', 'text-saffron'];
  }
  if (a.accountStatus === 'active') return ['Sign-in still enabled — run the script to disable', 'text-saffron'];
  if (a.accountStatus === 'disabled') return ['Sign-in disabled', 'text-muted'];
  return ['No account', 'text-muted'];
}

function DistrictSelect({ value, onChange, label = 'District' }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} required>
        <option value="">— choose —</option>
        {DISTRICTS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.en} — {d.hi}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Directory match indicators for one request. They only help the IT Head
 * decide — nothing is ever approved automatically because of a match.
 */
function matchesFor(request, membersByPhone, membersByName) {
  const byPhone = membersByPhone.get(request.phone) ?? [];
  const byName = (membersByName.get(matchKey(request.name)) ?? []).filter((m) => !byPhone.includes(m));
  const candidates = [...byPhone, ...byName];
  const wanted = matchKey(request.name);
  return {
    byPhone,
    byName,
    candidates,
    nameMatch: candidates.some((m) => [m.nameEn, m.nameHi].filter(Boolean).map(matchKey).includes(wanted)),
    districtMatch: candidates.some((m) => m.district === request.district),
  };
}

function MatchBadges({ match }) {
  const badge = (ok, text) => (
    <span className={`mr-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-green-100 text-vrat' : 'bg-paper text-muted'}`}>
      {ok ? '✓' : '✗'} {text}
    </span>
  );
  return (
    <div className="mt-1">
      {badge(match.byPhone.length > 0, match.byPhone.length ? `Phone matches ${match.byPhone.length} record(s)` : 'Phone not in directory')}
      {badge(match.nameMatch, match.nameMatch ? 'Name matches a record' : 'Name not matched')}
      {badge(match.districtMatch, 'District matches record')}
    </div>
  );
}

function RequestCard({ request, match, access, onAction }) {
  const wa = whatsappUrl(request.phone, '');
  return (
    <li className="space-y-1 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {request.name} <Pill status={request.status} />
          </p>
          <p className="text-sm text-muted">
            <span className="font-mono">{request.phone}</span>
            {request.fatherName && ` · Father: ${request.fatherName}`}
            {request.city && ` · ${request.city}`}
            {' · '}Requested district: <strong>{districtLabel(request.district, 'en') || request.district}</strong>
            {request.org && ` · ${orgLabel(request.org, 'en')}`}
          </p>
          {request.note && <p className="text-sm">“{request.note}”</p>}
          <p className="text-xs text-muted">
            Submitted {when(request.submittedAt)}
            {request.reviewedAt && ` · reviewed ${when(request.reviewedAt)}`}
            {request.reason && ` · reason: ${request.reason}`}
            {request.infoMessage && ` · asked: ${request.infoMessage}`}
          </p>
          <MatchBadges match={match} />
          {match.candidates.length > 0 && (
            <ul className="mt-1 text-xs text-muted">
              {match.candidates.slice(0, 4).map((m) => (
                <li key={m.id}>
                  {memberName(m)} ({m.id}) · {m.phone || 'no phone'} · {m.district ? districtLabel(m.district, 'en') : 'no district'} · {m.status}
                </li>
              ))}
            </ul>
          )}
          {access && (
            <p className="text-xs font-semibold text-saffron">
              This number already has access: {access.status}, {districtLabel(access.district, 'en')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {request.status !== 'approved' && <Button onClick={() => onAction('approve', request, match)}>Approve…</Button>}
          {['pending', 'info_requested'].includes(request.status) && (
            <>
              <Button variant="secondary" onClick={() => onAction('info', request)}>
                Request info…
              </Button>
              <Button variant="secondary" onClick={() => onAction('reject', request)}>
                Reject…
              </Button>
            </>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center px-3 text-sm font-semibold text-vrat underline">
              WhatsApp
            </a>
          )}
          <Button variant="ghost" className="!text-sunday" onClick={() => onAction('delete', request)}>
            Delete
          </Button>
        </div>
      </div>
    </li>
  );
}

/** Approve / reject / request-info / revoke / change-district dialogs. */
function ActionDialog({ action, busy, onCancel, onSubmit }) {
  const { type, request, access, match } = action;
  const [district, setDistrict] = useState(request?.district ?? access?.district ?? '');
  const [memberId, setMemberId] = useState(match?.byPhone.length === 1 ? match.byPhone[0].id : '');
  const [text, setText] = useState('');
  const titles = {
    approve: `Approve ${request?.name}`,
    reject: `Reject request of ${request?.name}`,
    info: `Ask ${request?.name} for more information`,
    delete: `Delete request of ${request?.name}?`,
    revoke: `Revoke access of ${access?.name}`,
    restore: `Restore access of ${access?.name}`,
    district: `Change district of ${access?.name}`,
  };
  const needsDistrict = type === 'approve' || type === 'district';
  const submit = () => {
    if (needsDistrict && !district) return;
    onSubmit({ district, memberId, text });
  };
  return (
    <ConfirmDialog title={titles[type]} danger={['reject', 'delete', 'revoke'].includes(type)} busy={busy} onCancel={onCancel} onConfirm={submit} confirmLabel="Confirm">
      {type === 'approve' && (
        <>
          <p>
            Only approve after verifying the person through the agreed process (e.g. a call to the number, a known office-bearer).
            A directory match alone is not proof.
          </p>
          <DistrictSelect value={district} onChange={setDistrict} label="District this member may see" />
          <Field label="Linked member record (optional)">
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputClass}>
              <option value="">— none —</option>
              {(match?.candidates ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {memberName(m)} ({m.id})
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-muted">
            After approving, run the provisioning script on the IT Head computer to create the sign-in account (see
            docs/MEMBER_ACCESS.md).
          </p>
        </>
      )}
      {type === 'district' && <DistrictSelect value={district} onChange={setDistrict} />}
      {type === 'district' && <p className="text-xs text-muted">The phone drops the old district&apos;s list at its next online sync.</p>}
      {['reject', 'info', 'revoke'].includes(type) && (
        <Field label={type === 'info' ? 'What information is needed?' : 'Reason (internal, optional)'}>
          <TextInput value={text} onChange={(e) => setText(e.target.value)} maxLength={300} />
        </Field>
      )}
      {type === 'info' && (
        <p className="text-xs text-muted">
          The requester cannot read this message in the app. Contact them (WhatsApp/phone); they can then re-submit the request
          with the missing details.
        </p>
      )}
      {type === 'revoke' && (
        <p className="text-xs text-muted">
          The directory is blocked for this member on their next online request. A phone that stays offline keeps its last
          downloaded copy until it reconnects. Run the provisioning script afterwards to also disable the sign-in.
        </p>
      )}
      {type === 'delete' && <p>The request is removed. This is recorded in the audit history.</p>}
      {type === 'restore' && <p>Access to {districtLabel(access?.district, 'en')} is restored. Run the provisioning script to re-enable the sign-in.</p>}
    </ConfirmDialog>
  );
}

const AUDIT_LABELS = {
  approve: 'Approved', grant: 'Granted manually', reject: 'Rejected', request_info: 'Requested info', revoke: 'Revoked',
  restore: 'Restored', change_district: 'Changed district', delete_request: 'Deleted request',
};

/**
 * Member access management — IT Head only (the whole portal is admin-only and
 * Security Rules restrict these collections to administrators).
 */
export function AccessPage({ uid }) {
  const [requests, setRequests] = useState(null);
  const [accessList, setAccessList] = useState(null);
  const [members, setMembers] = useState([]);
  const [auditLog, setAuditLog] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [accessFilter, setAccessFilter] = useState({ status: '', district: '', query: '' });
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [grant, setGrant] = useState({ phone: '', name: '', district: '' });

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [r, a, m, log] = await Promise.all([listAccessRequests(), listMemberAccess(), loadMembers(), listAccessAudit()]);
      setRequests(r.sort((x, y) => millis(y.submittedAt) - millis(x.submittedAt)));
      setAccessList(a);
      setMembers(m);
      setAuditLog(log);
    } catch (err) {
      setError(`Could not load access data: ${err.message}`);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const { membersByPhone, membersByName } = useMemo(() => {
    const byPhone = new Map();
    const byName = new Map();
    for (const m of members) {
      const p = normalizeIndianMobile(m.phone);
      if (p) byPhone.set(p, [...(byPhone.get(p) ?? []), m]);
      for (const n of new Set([m.nameEn, m.nameHi].filter(Boolean).map(matchKey))) byName.set(n, [...(byName.get(n) ?? []), m]);
    }
    return { membersByPhone: byPhone, membersByName: byName };
  }, [members]);
  const accessByUid = useMemo(() => new Map((accessList ?? []).map((a) => [a.uid, a])), [accessList]);

  const visibleRequests = (requests ?? []).filter((r) =>
    statusFilter === 'all' ? true : statusFilter === 'open' ? ['pending', 'info_requested'].includes(r.status) : r.status === statusFilter,
  );
  const openCount = (requests ?? []).filter((r) => ['pending', 'info_requested'].includes(r.status)).length;

  const visibleAccess = (accessList ?? [])
    .filter((a) => !accessFilter.status || a.status === accessFilter.status)
    .filter((a) => !accessFilter.district || a.district === accessFilter.district)
    .filter((a) => !accessFilter.query || `${a.name} ${a.phone}`.toLowerCase().includes(accessFilter.query.toLowerCase()))
    .sort((x, y) => (x.name ?? '').localeCompare(y.name ?? ''));
  const awaiting = (accessList ?? []).filter((a) => a.status === 'approved' && a.accountStatus !== 'active').length;
  const toDisable = (accessList ?? []).filter((a) => a.status === 'revoked' && a.accountStatus === 'active').length;

  const run = async (fn, success) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'success', text: success });
      setAction(null);
      await reload();
      return true;
    } catch (err) {
      setMessage({ tone: 'error', text: `Failed: ${err.message}` });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitAction = ({ district, memberId, text }) => {
    const { type, request, access } = action;
    if (type === 'approve') {
      const member = members.find((m) => m.id === memberId);
      return run(
        () => approveAccess({ phone: request.phone, name: request.name, district, memberId, org: member?.org ?? request.org, requestId: request.docId }, uid),
        `${request.name} approved for ${districtLabel(district, 'en')}. Now run the provisioning script to create the sign-in.`,
      );
    }
    if (type === 'reject') return run(() => rejectRequest(request, text, uid), `Request of ${request.name} rejected.`);
    if (type === 'info') return run(() => requestMoreInfo(request, text, uid), `Marked as “info requested”. Contact ${request.name} on WhatsApp/phone.`);
    if (type === 'delete') return run(() => deleteAccessRequest(request, uid), 'Request deleted.');
    if (type === 'revoke') return run(() => revokeAccess(access, text, uid), `Access of ${access.name} revoked.`);
    if (type === 'restore') return run(() => restoreAccess(access, uid), `Access of ${access.name} restored.`);
    if (type === 'district') return run(() => changeDistrict(access, district, uid), `${access.name} now sees ${districtLabel(district, 'en')}.`);
  };

  const submitGrant = (e) => {
    e.preventDefault();
    const phone = normalizeIndianMobile(grant.phone);
    if (!phone) return setMessage({ tone: 'error', text: 'Enter a valid 10-digit Indian mobile number.' });
    if (!grant.name.trim() || !grant.district) return setMessage({ tone: 'error', text: 'Name and district are required.' });
    const existing = accessByUid.get(uidForPhone(phone));
    if (existing) return setMessage({ tone: 'error', text: `This number already has an access record (${existing.status}). Use the list below.` });
    const match = membersByPhone.get(phone) ?? [];
    run(
      () => approveAccess({ phone, name: grant.name.trim(), district: grant.district, memberId: match.length === 1 ? match[0].id : '' }, uid),
      `Access granted to ${grant.name.trim()} (${maskPhone(phone)}). Run the provisioning script to create the sign-in.`,
    ).then((ok) => ok && setGrant({ phone: '', name: '', district: '' }));
  };

  return (
    <>
      <Card title="Member access" actions={<Button variant="secondary" onClick={reload}>Refresh</Button>}>
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <p className="text-sm text-muted">
          Only the IT Head approves, rejects, revokes and assigns districts. A member sees only the directory (and birthdays /
          anniversaries) of the one district assigned here. Excel imports never grant access.
        </p>
        {(awaiting > 0 || toDisable > 0) && (
          <Notice tone="info">
            Provisioning needed: {awaiting} approved member(s) without a ready sign-in, {toDisable} revoked member(s) whose sign-in is
            still enabled. On the IT Head computer run <code>npm run provision</code> (dry run), then{' '}
            <code>npm run provision -- --apply</code>.
          </Notice>
        )}
      </Card>

      <Card
        title={`Access requests (${openCount} open)`}
        actions={
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} w-auto`} aria-label="Request status">
            <option value="open">Open (pending + info requested)</option>
            <option value="pending">Pending</option>
            <option value="info_requested">Info requested</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        }
      >
        {!requests ? (
          <p className="text-muted">Loading…</p>
        ) : visibleRequests.length === 0 ? (
          <p className="text-muted">No requests.</p>
        ) : (
          <ul className="divide-y divide-line">
            {visibleRequests.slice(0, 200).map((r) => (
              <RequestCard
                key={r.docId}
                request={r}
                match={matchesFor(r, membersByPhone, membersByName)}
                access={accessByUid.get(`p${r.phone}`)}
                onAction={(type, request, match) => setAction({ type, request, match })}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Members with access">
        <div className="mb-2 flex flex-wrap gap-2">
          <TextInput placeholder="Search name or phone" value={accessFilter.query} onChange={(e) => setAccessFilter((f) => ({ ...f, query: e.target.value }))} className="max-w-xs" />
          <select value={accessFilter.status} onChange={(e) => setAccessFilter((f) => ({ ...f, status: e.target.value }))} className={`${inputClass} w-auto`} aria-label="Access status">
            <option value="">All statuses</option>
            <option value="approved">Approved</option>
            <option value="revoked">Revoked</option>
          </select>
          <select value={accessFilter.district} onChange={(e) => setAccessFilter((f) => ({ ...f, district: e.target.value }))} className={`${inputClass} w-auto`} aria-label="District">
            <option value="">All districts</option>
            {DISTRICTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.en}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs text-muted">
              <tr>
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Phone</th>
                <th className="px-2 py-1">District</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Sign-in account</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleAccess.slice(0, 300).map((a) => {
                const [label, cls] = accountState(a);
                return (
                  <tr key={a.uid}>
                    <td className="px-2 py-1">
                      {a.name}
                      {a.memberId && <span className="block font-mono text-xs text-muted">{a.memberId}</span>}
                    </td>
                    <td className="px-2 py-1 font-mono text-xs">{a.phone}</td>
                    <td className="px-2 py-1">{districtLabel(a.district, 'en')}</td>
                    <td className="px-2 py-1">
                      <Pill status={a.status} />
                      {a.reason && <span className="block text-xs text-muted">{a.reason}</span>}
                    </td>
                    <td className={`px-2 py-1 text-xs ${cls}`}>{label}</td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      {a.status === 'approved' ? (
                        <>
                          <Button variant="ghost" onClick={() => setAction({ type: 'district', access: a })}>
                            District…
                          </Button>
                          <Button variant="ghost" className="!text-sunday" onClick={() => setAction({ type: 'revoke', access: a })}>
                            Revoke…
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" onClick={() => setAction({ type: 'restore', access: a })}>
                          Restore…
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {accessList?.length === 0 && <p className="p-3 text-muted">Nobody has access yet.</p>}
        </div>
      </Card>

      <Card title="Grant access without a request">
        <form onSubmit={submitGrant} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Field label="Mobile number">
            <TextInput inputMode="tel" value={grant.phone} onChange={(e) => setGrant((g) => ({ ...g, phone: e.target.value }))} />
          </Field>
          <Field label="Name">
            <TextInput value={grant.name} onChange={(e) => setGrant((g) => ({ ...g, name: e.target.value }))} maxLength={100} />
          </Field>
          <DistrictSelect value={grant.district} onChange={(d) => setGrant((g) => ({ ...g, district: d }))} />
          <Button type="submit" disabled={busy}>
            Grant access
          </Button>
        </form>
      </Card>

      <Card title="Audit history">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs text-muted">
              <tr>
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">Action</th>
                <th className="px-2 py-1">Member</th>
                <th className="px-2 py-1">Details</th>
                <th className="px-2 py-1">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(auditLog ?? []).map((e) => (
                <tr key={e.docId}>
                  <td className="px-2 py-1 whitespace-nowrap">{when(e.at)}</td>
                  <td className="px-2 py-1">{AUDIT_LABELS[e.action] ?? e.action}</td>
                  <td className="px-2 py-1 font-mono text-xs">
                    {accessByUid.get(e.target)?.name ?? ''} {maskPhone(String(e.target ?? '').slice(1))}
                  </td>
                  <td className="px-2 py-1 text-xs">
                    {e.from && `${districtLabel(e.from, 'en')} → `}
                    {e.district && districtLabel(e.district, 'en')}
                    {e.reason && ` ${e.reason}`}
                  </td>
                  <td className="px-2 py-1 font-mono text-xs">{String(e.by ?? '').slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {auditLog?.length === 0 && <p className="p-3 text-muted">No decisions yet.</p>}
        </div>
      </Card>

      {action && <ActionDialog action={action} busy={busy} onCancel={() => setAction(null)} onSubmit={submitAction} />}
    </>
  );
}
