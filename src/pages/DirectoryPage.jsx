import { useDeferredValue, useMemo, useState } from 'react';
import { useDataset } from '../hooks/useSync.js';
import { syncManager } from '../services/sync/syncManager.js';
import { buildDirectoryIndex, searchDirectory } from '../services/directorySearch.js';
import { memberName } from '../shared/directorySchema.js';
import { formatDateTime, num } from '../utils/format.js';
import { MemberSheet } from '../components/MemberSheet.jsx';

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
      return <p className="card p-4 text-sm text-muted" role="status">निर्देशिका डाउनलोड हो रही है…</p>;
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

/** "माहेश्वरी परिवार" — public directory, searchable offline from the cached snapshot. */
export function DirectoryPage({ today }) {
  const state = useDataset('directory');
  const members = state.snapshot?.data;
  const index = useMemo(() => (Array.isArray(members) ? buildDirectoryIndex(members) : null), [members]);

  const [query, setQuery] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [city, setCity] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState(null);
  const deferredQuery = useDeferredValue(query); // keeps typing smooth on large directories

  const results = useMemo(
    () => (index ? searchDirectory(index, { query: deferredQuery, bloodGroup, city }) : []),
    [index, deferredQuery, bloodGroup, city],
  );
  const open = openId ? members?.find((m) => m.id === openId) : null;
  const refresh = () => syncManager.syncAll({ force: true });
  const resetPaging = () => setLimit(PAGE_SIZE);

  return (
    <div className="space-y-3 px-3 py-2">
      <div className="flex items-end justify-between gap-2 px-1">
        <h2 className="font-display text-2xl text-maroon">माहेश्वरी परिवार</h2>
        {index && (
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

      <StatusNote state={state} hasData={Boolean(index)} onRetry={refresh} />

      {index && (
        <>
          <div className="card space-y-2 p-3">
            <label htmlFor="dir-search" className="sr-only">
              नाम, पिता का नाम, शहर या फ़ोन से खोजें
            </label>
            <input
              id="dir-search"
              type="search"
              inputMode="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPaging();
              }}
              placeholder="नाम / पिता / शहर / फ़ोन से खोजें"
              className="min-h-12 w-full rounded-xl border border-line bg-paper px-3 text-base text-ink placeholder:text-muted"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                रक्त समूह
                <select
                  value={bloodGroup}
                  onChange={(e) => {
                    setBloodGroup(e.target.value);
                    resetPaging();
                  }}
                  className="mt-0.5 min-h-11 w-full rounded-xl border border-line bg-paper px-2 text-base text-ink"
                >
                  <option value="">सभी</option>
                  {index.bloodGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                शहर / स्थान
                <select
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    resetPaging();
                  }}
                  className="mt-0.5 min-h-11 w-full rounded-xl border border-line bg-paper px-2 text-base text-ink"
                >
                  <option value="">सभी</option>
                  {index.cities.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-muted" role="status" aria-live="polite">
              {num(results.length)} / {num(index.size)} सदस्य
              {(state.status === 'offline' || state.status === 'error') && ' · ऑफ़लाइन — सहेजी गई सूची'}
              {state.snapshot?.savedAt && ` · अद्यतन: ${lastUpdatedLabel(state.snapshot.savedAt)}`}
            </p>
          </div>

          {results.length === 0 ? (
            <p className="card p-4 text-center text-sm text-muted">कोई सदस्य नहीं मिला। खोज या फ़िल्टर बदलकर देखें।</p>
          ) : (
            <ul className="card divide-y divide-line px-3" aria-label="सदस्य सूची">
              {results.slice(0, limit).map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setOpenId(m.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{memberName(m)}</span>
                      <span className="block truncate text-sm text-muted">
                        {[m.fatherName && `पिता: ${m.fatherName}`, m.city].filter(Boolean).join(' · ') || ' '}
                      </span>
                    </span>
                    {m.bloodGroup && (
                      <span className="shrink-0 rounded-full bg-saffron-soft px-2 py-0.5 text-sm font-semibold text-maroon" aria-label={`रक्त समूह ${m.bloodGroup}`}>
                        {m.bloodGroup}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              className="card w-full p-3 font-semibold text-maroon"
            >
              और दिखाएँ ({num(results.length - limit)} शेष)
            </button>
          )}
          <p className="px-1 text-xs leading-relaxed text-muted">
            यह निर्देशिका समाज द्वारा प्रकाशित सार्वजनिक जानकारी है। अपनी जानकारी में सुधार या उसे हटाने के लिए संगठन के
            पदाधिकारियों से संपर्क करें।
          </p>
        </>
      )}

      {open && <MemberSheet member={open} today={today} onClose={() => setOpenId(null)} />}
    </div>
  );
}

export default DirectoryPage;
