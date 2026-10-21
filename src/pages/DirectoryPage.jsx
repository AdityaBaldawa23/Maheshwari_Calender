import { useDeferredValue, useMemo, useState } from 'react';
import { useDataset } from '../hooks/useSync.js';
import { syncManager } from '../services/sync/syncManager.js';
import { buildDirectoryIndex, searchDirectory } from '../services/directorySearch.js';
import { memberName } from '../shared/directorySchema.js';
import { formatDateTime, num } from '../utils/format.js';
import { MemberSheet } from '../components/MemberSheet.jsx';
import { TodayCelebrations } from '../components/Celebrations.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { buildCelebrationIndex, celebrationsOn } from '../services/celebrations.js';
import { professionLabel } from '../shared/professions.js';
import { DEFAULT_ORG, ORGANIZATIONS, orgLabel, orgOf } from '../shared/organizations.js';
import { districtLabel } from '../shared/districts.js';
import { maskPhone } from '../shared/phoneIdentity.js';
import { AccessNotice, MemberGate } from '../components/MemberAccess.jsx';

const PAGE_SIZE = 50;

function lastUpdatedLabel(savedAt) {
  if (!savedAt) return '';
  const d = new Date(savedAt);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return formatDateTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
}

function StatusNote({ state, hasData, onRetry }) {
  const syncing = state.status === 'syncing';
  if (!syncManager.enabled) {
    return <p className="card p-4 text-sm leading-relaxed text-muted">माहेश्वरी परिवार निर्देशिका अभी प्रकाशित नहीं हुई है। जल्द उपलब्ध होगी।</p>;
  }
  if (!hasData) {
    if (syncing || !state.loaded || state.status === 'idle') {
      return (
        <p className="card p-4 text-sm text-muted" role="status">
          निर्देशिका डाउनलोड हो रही है…
        </p>
      );
    }
    if (state.status === 'unpublished') {
      return <p className="card p-4 text-sm text-muted">अभी कोई सदस्य प्रकाशित नहीं किया गया है।</p>;
    }
    return (
      <div className="card space-y-2 p-4 text-sm leading-relaxed" role="alert">
        <p className="text-ink">
          पहली बार निर्देशिका डाउनलोड करने के लिए इंटरनेट आवश्यक है। एक बार डाउनलोड होने के बाद यह बिना इंटरनेट भी खुलेगी
          और खोजी जा सकेगी।
        </p>
        <button type="button" onClick={onRetry} className="min-h-11 rounded-full bg-maroon px-5 font-semibold text-white">
          पुनः प्रयास करें
        </button>
      </div>
    );
  }
  return null;
}

function Select({ label, value, onChange, options, className = '' }) {
  return (
    <label className={`text-xs text-muted ${className}`}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 min-h-11 w-full rounded-xl border border-line bg-paper px-2 text-base text-ink"
      >
        <option value="">सभी</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Organisation sub-tabs: a horizontally scrollable pill bar (never wraps or crowds). */
function OrgTabs({ org, onChange, counts }) {
  return (
    <div role="tablist" aria-label="संगठन" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
      {ORGANIZATIONS.map((o) => {
        const active = o.id === org;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
              active ? 'border-maroon bg-maroon text-white shadow-sm' : 'border-line bg-card text-ink active:bg-gold-soft'
            }`}
          >
            {o.hi}
            <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/20' : 'bg-paper text-muted'}`}>{num(counts[o.id] ?? 0)}</span>
          </button>
        );
      })}
    </div>
  );
}

function subtitle(m) {
  return [m.designation, m.profession ? professionLabel(m.profession) : '', m.city].filter(Boolean).join(' · ');
}

/**
 * "माहेश्वरी परिवार" — the member's district directory (four organisations),
 * searchable and filterable offline from the cached snapshot.
 */
function DirectoryList({ today, access }) {
  const state = useDataset('directory');
  const members = state.snapshot?.data;
  const [org, setOrg] = useState(DEFAULT_ORG);
  const [query, setQuery] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [city, setCity] = useState('');
  const [profession, setProfession] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState(null);
  const deferredQuery = useDeferredValue(query); // keeps typing smooth on large directories

  const orgCounts = useMemo(() => {
    const counts = {};
    for (const m of members ?? []) counts[orgOf(m)] = (counts[orgOf(m)] ?? 0) + 1;
    return counts;
  }, [members]);
  const orgMembers = useMemo(() => (Array.isArray(members) ? members.filter((m) => orgOf(m) === org) : null), [members, org]);
  const index = useMemo(() => (orgMembers ? buildDirectoryIndex(orgMembers) : null), [orgMembers]);
  const celebrationIndex = useMemo(() => buildCelebrationIndex(orgMembers ?? []), [orgMembers]);
  const todays = useMemo(() => celebrationsOn(celebrationIndex, today), [celebrationIndex, today]);

  const results = useMemo(
    () => (index ? searchDirectory(index, { query: deferredQuery, bloodGroup, city, profession }) : []),
    [index, deferredQuery, bloodGroup, city, profession],
  );
  const open = openId ? members?.find((m) => m.id === openId) : null;
  const refresh = () => syncManager.syncAll({ force: true });
  const resetPaging = () => setLimit(PAGE_SIZE);
  const setFilter = (setter) => (value) => {
    setter(value);
    resetPaging();
  };
  const clearFilters = () => {
    setQuery('');
    setBloodGroup('');
    setCity('');
    setProfession('');
    resetPaging();
  };
  const switchOrg = (next) => {
    setOrg(next);
    clearFilters();
  };
  const filtersActive = Boolean(query || bloodGroup || city || profession);

  return (
    <div className="space-y-3 px-3 py-2">
      <div className="flex items-end justify-between gap-2 px-1">
        <div>
          <h2 className="font-display text-2xl text-maroon">माहेश्वरी परिवार</h2>
          <p className="text-xs text-muted">जिला: {districtLabel(access.district)}</p>
        </div>
        {members && (
          <button
            type="button"
            onClick={refresh}
            disabled={state.status === 'syncing'}
            className="min-h-10 rounded-full px-3 text-sm font-semibold text-maroon underline disabled:no-underline disabled:opacity-60"
          >
            {state.status === 'syncing' ? 'अपडेट हो रहा है…' : 'अपडेट करें'}
          </button>
        )}
      </div>

      <StatusNote state={state} hasData={Boolean(members)} onRetry={refresh} />

      {members && (
        <>
          <OrgTabs org={org} onChange={switchOrg} counts={orgCounts} />

          {index.size === 0 ? (
            <p className="card p-4 text-center text-sm text-muted">{orgLabel(org)} की सूची अभी प्रकाशित नहीं हुई है।</p>
          ) : (
            <>
              <TodayCelebrations entries={todays} onOpen={setOpenId} />

              <div className="card space-y-2 p-3">
                <label htmlFor="dir-search" className="sr-only">
                  नाम, पिता का नाम, शहर, व्यवसाय या फ़ोन से खोजें
                </label>
                <input
                  id="dir-search"
                  type="search"
                  inputMode="search"
                  value={query}
                  onChange={(e) => setFilter(setQuery)(e.target.value)}
                  placeholder="नाम / पिता / शहर / व्यवसाय / फ़ोन"
                  className="min-h-12 w-full rounded-xl border border-line bg-paper px-3 text-base text-ink placeholder:text-muted"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    label="रक्त समूह"
                    value={bloodGroup}
                    onChange={setFilter(setBloodGroup)}
                    options={index.bloodGroups.map((g) => ({ value: g, label: g }))}
                  />
                  <Select
                    label="शहर / स्थान"
                    value={city}
                    onChange={setFilter(setCity)}
                    options={index.cities.map((c) => ({ value: c.value, label: c.label }))}
                  />
                  <Select
                    label="व्यवसाय"
                    value={profession}
                    onChange={setFilter(setProfession)}
                    options={index.professions.map((p) => ({ value: p, label: professionLabel(p) }))}
                    className="col-span-2"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted" role="status" aria-live="polite">
                    {num(results.length)} / {num(index.size)} सदस्य
                    {(state.status === 'offline' || state.status === 'error') && ' · ऑफ़लाइन — सहेजी गई सूची'}
                    {state.snapshot?.savedAt && ` · अद्यतन: ${lastUpdatedLabel(state.snapshot.savedAt)}`}
                  </p>
                  {filtersActive && (
                    <button type="button" onClick={clearFilters} className="shrink-0 text-xs font-semibold text-maroon underline">
                      साफ़ करें
                    </button>
                  )}
                </div>
              </div>

              {results.length === 0 ? (
                <p className="card p-4 text-center text-sm text-muted">कोई सदस्य नहीं मिला। खोज या फ़िल्टर बदलकर देखें।</p>
              ) : (
                <ul className="card divide-y divide-line px-3" aria-label="सदस्य सूची">
                  {results.slice(0, limit).map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => setOpenId(m.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                        <Avatar member={m} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink">{memberName(m)}</span>
                          <span className="block truncate text-sm text-muted">{subtitle(m) || ' '}</span>
                        </span>
                        {m.bloodGroup && (
                          <span
                            className="shrink-0 rounded-full bg-saffron-soft px-2 py-0.5 text-sm font-semibold text-maroon"
                            aria-label={`रक्त समूह ${m.bloodGroup}`}
                          >
                            {m.bloodGroup}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {results.length > limit && (
                <button type="button" onClick={() => setLimit((l) => l + PAGE_SIZE)} className="card w-full p-3 font-semibold text-maroon">
                  और दिखाएँ ({num(results.length - limit)} शेष)
                </button>
              )}
            </>
          )}
          <p className="px-1 text-xs leading-relaxed text-muted">
            यह निर्देशिका केवल स्वीकृत सदस्यों के लिए है — इसकी जानकारी आगे साझा न करें। अपनी जानकारी में सुधार या उसे हटाने के
            लिए संगठन के पदाधिकारियों से संपर्क करें।
          </p>
        </>
      )}
      <div className="flex items-center justify-between gap-2 px-1 pb-2 text-xs text-muted">
        <span>साइन इन: {maskPhone(access.phone)}</span>
        <button type="button" onClick={() => syncManager.signOut()} className="min-h-10 font-semibold text-maroon underline">
          साइन आउट
        </button>
      </div>

      {open && <MemberSheet member={open} today={today} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/**
 * Directory tab. The directory and birthdays/anniversaries are shown ONLY to a
 * signed-in member whose access the IT Head approved; the data itself is
 * protected by Security Rules (this screen is not the security boundary).
 */
export function DirectoryPage({ today }) {
  const access = useDataset('access');
  const state = useDataset('directory');
  const retry = () => syncManager.syncAll({ force: true });

  let body;
  if (!syncManager.enabled) {
    body = <p className="card p-4 text-sm leading-relaxed text-muted">माहेश्वरी परिवार निर्देशिका अभी प्रकाशित नहीं हुई है। जल्द उपलब्ध होगी।</p>;
  } else if (!access.loaded) {
    body = null;
  } else if (access.status === 'signedOut' || !access.status) {
    body = <MemberGate />;
  } else if (access.status === 'approved' && state.status !== 'stale') {
    return <DirectoryList today={today} access={access} />;
  } else {
    body = <AccessNotice access={access} directoryStatus={state.status} onRetry={retry} />;
  }
  return (
    <div className="space-y-3 px-3 py-2">
      <h2 className="px-1 font-display text-2xl text-maroon">माहेश्वरी परिवार</h2>
      {body}
    </div>
  );
}

export default DirectoryPage;
