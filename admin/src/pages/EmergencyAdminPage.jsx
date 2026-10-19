import { useCallback } from 'react';
import { Card, Field, Notice, TextInput } from '../components/ui.jsx';
import { PublishBar } from '../components/PublishBar.jsx';
import { diffLists, useDraft } from '../services/useDraft.js';
import { CONTACT_SLOTS, HOSPITAL_SLOTS, emptyContact, emptyHospital } from '../../../src/shared/emergencySchema.js';
import bundledServices from '../../../src/data/emergency/services.json';

const makeDefault = async () => ({
  contacts: Array.from({ length: CONTACT_SLOTS }, (_, i) => emptyContact(i + 1)),
  hospitals: Array.from({ length: HOSPITAL_SLOTS }, (_, i) => emptyHospital(i + 1)),
  services: bundledServices.services,
});

function EntryEditor({ title, entry, fields, onChange }) {
  return (
    <fieldset className="space-y-2 rounded-xl border border-line p-3">
      <legend className="px-1 font-semibold text-maroon">{title}</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={entry.active} onChange={(e) => onChange({ ...entry, active: e.target.checked })} />
        Active (shown in the app) — needs a name and a valid phone number
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map(([key, label, props]) => (
          <Field key={key} label={label}>
            <TextInput value={entry[key] ?? ''} onChange={(e) => onChange({ ...entry, [key]: e.target.value })} {...props} />
          </Field>
        ))}
      </div>
    </fieldset>
  );
}

const CONTACT_FIELDS = [
  ['name', 'Name'],
  ['role', 'Role / purpose'],
  ['phone', 'Phone', { inputMode: 'tel' }],
  ['altPhone', 'Alternate phone', { inputMode: 'tel' }],
  ['address', 'Address / locality'],
  ['description', 'Description'],
];
const HOSPITAL_FIELDS = [
  ['name', 'Hospital name'],
  ['phone', 'Main phone', { inputMode: 'tel' }],
  ['emergencyPhone', 'Emergency department phone', { inputMode: 'tel' }],
  ['altPhone', 'Alternate phone', { inputMode: 'tel' }],
  ['address', 'Address'],
  ['city', 'City / locality'],
  ['mapUrl', 'Map link (https://…)', { inputMode: 'url' }],
];
const SERVICE_FIELDS = [
  ['name', 'Service name (shown in the app)'],
  ['phone', 'Main number', { inputMode: 'tel' }],
  ['altPhone', 'Alternate number', { inputMode: 'tel' }],
  ['jurisdiction', 'Jurisdiction'],
];

export function EmergencyAdminPage({ uid }) {
  const draftState = useDraft('emergency', useCallback(makeDefault, []), uid);
  const { draft, loading, error, update, published } = draftState;
  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="error">{error}</Notice>;

  const setIn = (list, i) => (value) => update((d) => ({ ...d, [list]: d[list].map((x, j) => (j === i ? value : x)) }));
  const changes = [
    ...diffLists(draft.contacts, published?.contacts, (x) => x.slot, (x) => `Contact ${x.slot}: ${x.name || '(empty)'}`),
    ...diffLists(draft.services, published?.services, (x) => x.id, (x) => `Service: ${x.name} ${x.phone}`),
    ...diffLists(draft.hospitals, published?.hospitals, (x) => x.slot, (x) => `Hospital ${x.slot}: ${x.name || '(empty)'}`),
  ];

  return (
    <>
      <Card title="Emergency services — police / ambulance / fire">
        <Notice tone="info">
          Confirm numbers with an official source before changing them. Once confirmed, choose “Verified” and note the source — the app
          shows a notice for unconfirmed numbers.
        </Notice>
        <div className="mt-3 space-y-3">
          {draft.services.map((s, i) => (
            <div key={s.id} className="space-y-2">
              <EntryEditor title={`${s.id}`} entry={s} fields={SERVICE_FIELDS} onChange={setIn('services', i)} />
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Verification status">
                  <select
                    value={s.verification?.status ?? 'needs-confirmation'}
                    onChange={(e) => setIn('services', i)({ ...s, verification: { ...(s.verification ?? {}), status: e.target.value } })}
                    className="min-h-10 w-full rounded-lg border border-line bg-white px-2"
                  >
                    <option value="needs-confirmation">Needs confirmation</option>
                    <option value="verified">Verified (official source)</option>
                  </select>
                </Field>
                <Field label="Checked on (YYYY-MM-DD)">
                  <TextInput
                    value={s.verification?.checkedOn ?? ''}
                    onChange={(e) => setIn('services', i)({ ...s, verification: { ...(s.verification ?? {}), checkedOn: e.target.value } })}
                  />
                </Field>
                <Field label="Sources (URLs / department)">
                  <TextInput
                    value={(s.verification?.sources ?? []).join(' ')}
                    onChange={(e) =>
                      setIn('services', i)({ ...s, verification: { ...(s.verification ?? {}), sources: e.target.value.split(/\s+/).filter(Boolean) } })
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={`Community contacts (${CONTACT_SLOTS})`}>
        <div className="space-y-3">
          {draft.contacts.map((c, i) => (
            <EntryEditor key={c.slot} title={`Contact ${c.slot}`} entry={c} fields={CONTACT_FIELDS} onChange={setIn('contacts', i)} />
          ))}
        </div>
      </Card>

      <Card title={`Hospitals (${HOSPITAL_SLOTS})`}>
        <div className="space-y-3">
          {draft.hospitals.map((h, i) => (
            <EntryEditor key={h.slot} title={`Hospital ${h.slot}`} entry={h} fields={HOSPITAL_FIELDS} onChange={setIn('hospitals', i)} />
          ))}
        </div>
      </Card>

      <PublishBar draftState={draftState} changes={changes} />
    </>
  );
}
