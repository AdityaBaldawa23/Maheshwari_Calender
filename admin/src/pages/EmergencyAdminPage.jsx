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
        सक्रिय (ऐप में दिखाएँ) — नाम और मान्य फ़ोन आवश्यक
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
  ['name', 'नाम'],
  ['role', 'भूमिका / उद्देश्य'],
  ['phone', 'फ़ोन', { inputMode: 'tel' }],
  ['altPhone', 'वैकल्पिक फ़ोन', { inputMode: 'tel' }],
  ['address', 'पता / स्थान'],
  ['description', 'विवरण'],
];
const HOSPITAL_FIELDS = [
  ['name', 'अस्पताल का नाम'],
  ['phone', 'मुख्य फ़ोन', { inputMode: 'tel' }],
  ['emergencyPhone', 'आपातकालीन विभाग फ़ोन', { inputMode: 'tel' }],
  ['altPhone', 'वैकल्पिक फ़ोन', { inputMode: 'tel' }],
  ['address', 'पता'],
  ['city', 'शहर / स्थान'],
  ['mapUrl', 'मानचित्र लिंक (https://…)', { inputMode: 'url' }],
];
const SERVICE_FIELDS = [
  ['name', 'सेवा का नाम'],
  ['phone', 'मुख्य नंबर', { inputMode: 'tel' }],
  ['altPhone', 'वैकल्पिक नंबर', { inputMode: 'tel' }],
  ['jurisdiction', 'क्षेत्र'],
];

export function EmergencyAdminPage({ uid }) {
  const draftState = useDraft('emergency', useCallback(makeDefault, []), uid);
  const { draft, loading, error, update, published } = draftState;
  if (loading) return <p className="text-muted">लोड हो रहा है…</p>;
  if (error) return <Notice tone="error">{error}</Notice>;

  const setIn = (list, i) => (value) => update((d) => ({ ...d, [list]: d[list].map((x, j) => (j === i ? value : x)) }));
  const changes = [
    ...diffLists(draft.contacts, published?.contacts, (x) => x.slot, (x) => `संपर्क ${x.slot}: ${x.name || '(खाली)'}`),
    ...diffLists(draft.services, published?.services, (x) => x.id, (x) => `सेवा: ${x.name} ${x.phone}`),
    ...diffLists(draft.hospitals, published?.hospitals, (x) => x.slot, (x) => `अस्पताल ${x.slot}: ${x.name || '(खाली)'}`),
  ];

  return (
    <>
      <Card title="आपातकालीन सेवाएँ — पुलिस / एम्बुलेंस / अग्निशमन">
        <Notice tone="info">
          नंबर बदलने से पहले आधिकारिक स्रोत से पुष्टि करें। पुष्टि होने पर “सत्यापित” चुनें और स्रोत लिखें — ऐप में अपुष्ट नंबर पर सूचना
          दिखती है।
        </Notice>
        <div className="mt-3 space-y-3">
          {draft.services.map((s, i) => (
            <div key={s.id} className="space-y-2">
              <EntryEditor title={`${s.id}`} entry={s} fields={SERVICE_FIELDS} onChange={setIn('services', i)} />
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="सत्यापन स्थिति">
                  <select
                    value={s.verification?.status ?? 'needs-confirmation'}
                    onChange={(e) => setIn('services', i)({ ...s, verification: { ...(s.verification ?? {}), status: e.target.value } })}
                    className="min-h-10 w-full rounded-lg border border-line bg-white px-2"
                  >
                    <option value="needs-confirmation">पुष्टि लंबित</option>
                    <option value="verified">सत्यापित (आधिकारिक स्रोत से)</option>
                  </select>
                </Field>
                <Field label="जाँच तिथि (YYYY-MM-DD)">
                  <TextInput
                    value={s.verification?.checkedOn ?? ''}
                    onChange={(e) => setIn('services', i)({ ...s, verification: { ...(s.verification ?? {}), checkedOn: e.target.value } })}
                  />
                </Field>
                <Field label="स्रोत (URL / विभाग)">
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

      <Card title={`समाज के विशेष संपर्क (${CONTACT_SLOTS})`}>
        <div className="space-y-3">
          {draft.contacts.map((c, i) => (
            <EntryEditor key={c.slot} title={`संपर्क ${c.slot}`} entry={c} fields={CONTACT_FIELDS} onChange={setIn('contacts', i)} />
          ))}
        </div>
      </Card>

      <Card title={`अस्पताल (${HOSPITAL_SLOTS})`}>
        <div className="space-y-3">
          {draft.hospitals.map((h, i) => (
            <EntryEditor key={h.slot} title={`अस्पताल ${h.slot}`} entry={h} fields={HOSPITAL_FIELDS} onChange={setIn('hospitals', i)} />
          ))}
        </div>
      </Card>

      <PublishBar draftState={draftState} changes={changes} />
    </>
  );
}
