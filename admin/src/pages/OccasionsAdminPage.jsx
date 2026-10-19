import { useCallback, useState } from 'react';
import { Button, Card, ConfirmDialog, Field, Notice, TextInput, inputClass } from '../components/ui.jsx';
import { PublishBar } from '../components/PublishBar.jsx';
import { diffLists, useDraft } from '../services/useDraft.js';
import { CATEGORIES, IMPORTANCE_LEVELS } from '../../../src/constants/categories.js';
import { checkOccasion } from '../../../src/utils/validators.js';

// Bundled occasion files are the starting point for each year (tithis are never edited here).
const bundled = import.meta.glob('../../../src/data/occasions/[0-9][0-9][0-9][0-9].json', { import: 'default' });
const YEARS = Object.keys(bundled).map((p) => Number(p.match(/(\d{4})\.json$/)[1])).sort();

const blankOccasion = (year) => ({
  id: '', date: `${year}-01-01`, title: { hi: '', en: '' }, description: { hi: '' }, category: 'event', importance: 'medium',
  reminder: { enabled: true, defaultTime: '07:00' }, source: 'manual',
});

function OccasionDialog({ value, year, onSave, onCancel }) {
  const [o, setO] = useState(value);
  const problems = checkOccasion(o, year);
  return (
    <ConfirmDialog title={value.id ? `Edit: ${value.title.en || value.title.hi}` : 'New occasion'} confirmLabel="OK" onCancel={onCancel} onConfirm={() => !problems.length && onSave(o)}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="ID (lowercase-with-hyphens)">
          <TextInput value={o.id} onChange={(e) => setO({ ...o, id: e.target.value.trim() })} />
        </Field>
        <Field label="Date (YYYY-MM-DD)">
          <TextInput type="date" value={o.date} onChange={(e) => setO({ ...o, date: e.target.value })} />
        </Field>
        <Field label="Title (Hindi)">
          <TextInput value={o.title.hi} onChange={(e) => setO({ ...o, title: { ...o.title, hi: e.target.value } })} />
        </Field>
        <Field label="Title (English)">
          <TextInput value={o.title.en ?? ''} onChange={(e) => setO({ ...o, title: { ...o.title, en: e.target.value } })} />
        </Field>
        <Field label="Category">
          <select value={o.category} onChange={(e) => setO({ ...o, category: e.target.value })} className={inputClass}>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <option key={k} value={k}>
                {c.label.en}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Importance">
          <select value={o.importance} onChange={(e) => setO({ ...o, importance: e.target.value })} className={inputClass}>
            {IMPORTANCE_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Reminder time (HH:MM)">
          <TextInput
            value={o.reminder?.defaultTime ?? ''}
            onChange={(e) => setO({ ...o, reminder: { enabled: o.reminder?.enabled ?? true, defaultTime: e.target.value } })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={o.reminder?.enabled ?? false}
            onChange={(e) => setO({ ...o, reminder: { defaultTime: o.reminder?.defaultTime ?? '07:00', enabled: e.target.checked } })}
          />
          Reminder available
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={o.holiday === true} onChange={(e) => setO({ ...o, holiday: e.target.checked || undefined })} />
          Public holiday (shown in red)
        </label>
      </div>
      <Field label="Description (Hindi)">
        <TextInput value={o.description?.hi ?? ''} onChange={(e) => setO({ ...o, description: { ...(o.description ?? {}), hi: e.target.value } })} />
      </Field>
      {problems.length > 0 && <Notice tone="error">{problems.join(' · ')}</Notice>}
    </ConfirmDialog>
  );
}

function YearEditor({ year, uid }) {
  const makeDefault = useCallback(async () => {
    const file = await bundled[`../../../src/data/occasions/${year}.json`]();
    return { year, verified: file.meta?.verified === true, occasions: file.occasions };
  }, [year]);
  const draftState = useDraft(`occasions_${year}`, makeDefault, uid);
  const { draft, loading, error, update, published } = draftState;
  const [editing, setEditing] = useState(null); // { index, value }
  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="error">{error}</Notice>;

  const occasions = [...draft.occasions].map((o, index) => ({ o, index })).sort((a, b) => a.o.date.localeCompare(b.o.date));
  const save = (value) => {
    update((d) => ({
      ...d,
      occasions: editing.index === -1 ? [...d.occasions, value] : d.occasions.map((x, i) => (i === editing.index ? value : x)),
    }));
    setEditing(null);
  };
  const remove = (index) => update((d) => ({ ...d, occasions: d.occasions.filter((_, i) => i !== index) }));
  const changes = diffLists(draft.occasions, published?.occasions, (o) => `${o.id}|${o.date}`, (o) => `${o.date} ${o.title?.hi}`);

  return (
    <>
      <Card
        title={`Occasions ${year} (${draft.occasions.length})`}
        actions={<Button onClick={() => setEditing({ index: -1, value: blankOccasion(year) })}>+ New occasion</Button>}
      >
        <label className="mb-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={draft.verified === true} onChange={(e) => update((d) => ({ ...d, verified: e.target.checked }))} className="mt-1" />
          <span>
            I have <strong>verified</strong> this year’s festival dates against a trusted panchang (removes the “verification pending”
            note in the app). Tithi/paksha values are not changed here.
          </span>
        </label>
        <div className="max-h-[32rem] overflow-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-paper text-xs text-muted">
              <tr>
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Occasion</th>
                <th className="px-2 py-1">Category</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {occasions.map(({ o, index }) => (
                <tr key={`${o.id}-${o.date}-${index}`}>
                  <td className="px-2 py-1 whitespace-nowrap">{o.date}</td>
                  <td className="px-2 py-1">
                    {o.title?.hi}
                    <span className="block font-mono text-xs text-muted">{o.id}</span>
                  </td>
                  <td className="px-2 py-1">{CATEGORIES[o.category]?.label.en}{o.holiday && <span className="ml-1 rounded bg-holiday px-1 text-xs text-white">Holiday</span>}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <Button variant="ghost" onClick={() => setEditing({ index, value: structuredClone(o) })}>
                      Edit
                    </Button>
                    <Button variant="ghost" className="!text-sunday" onClick={() => remove(index)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <PublishBar draftState={draftState} changes={changes} />
      {editing && <OccasionDialog value={editing.value} year={year} onSave={save} onCancel={() => setEditing(null)} />}
    </>
  );
}

export function OccasionsAdminPage({ uid }) {
  const [year, setYear] = useState(() => (YEARS.includes(new Date().getFullYear()) ? new Date().getFullYear() : YEARS[0]));
  return (
    <>
      <Card title="Calendar occasions">
        <p className="text-sm leading-relaxed text-muted">
          Occasions published here replace the occasions bundled in the app for that year. Tithi/paksha/sunrise values stay bundled
          and are not changed here; a new year’s panchang comes with an app update (docs/DATA_GUIDE.md). Tick “Public holiday” for
          bank/public holidays (e.g. Eid, Muharram, Parsi New Year) — they are shown in red.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {YEARS.map((y) => (
            <Button key={y} variant={y === year ? 'primary' : 'secondary'} onClick={() => setYear(y)}>
              {y}
            </Button>
          ))}
        </div>
      </Card>
      <YearEditor key={year} year={year} uid={uid} />
    </>
  );
}
