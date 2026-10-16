import { useCallback } from 'react';
import { Button, Card, Field, Notice, TextInput, inputClass } from '../components/ui.jsx';
import { PublishBar } from '../components/PublishBar.jsx';
import { diffLists, useDraft } from '../services/useDraft.js';
import bundledAds from '../../../src/data/advertisements/ads.json';
import bundledNotices from '../../../src/data/notices/notices.json';

const makeDefault = async () => ({ ads: bundledAds.ads, notices: bundledNotices.notices });

const nextId = (prefix, list) => {
  let n = list.length + 1;
  while (list.some((x) => x.id === `${prefix}-${String(n).padStart(3, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(3, '0')}`;
};

function LocalizedInput({ label, value, onChange }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label={`${label} (हिंदी)`}>
        <TextInput value={value?.hi ?? ''} onChange={(e) => onChange({ ...(value ?? {}), hi: e.target.value })} />
      </Field>
      <Field label={`${label} (English)`}>
        <TextInput value={value?.en ?? ''} onChange={(e) => onChange({ ...(value ?? {}), en: e.target.value })} />
      </Field>
    </div>
  );
}

function Common({ item, onChange }) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={item.active} onChange={(e) => onChange({ ...item, active: e.target.checked })} />
        सक्रिय
      </label>
      <Field label="क्रम (छोटा पहले)">
        <TextInput type="number" value={item.priority} onChange={(e) => onChange({ ...item, priority: Number(e.target.value) })} />
      </Field>
      <Field label="आरंभ तिथि">
        <TextInput type="date" value={item.startDate ?? ''} onChange={(e) => onChange({ ...item, startDate: e.target.value || undefined })} />
      </Field>
      <Field label="समाप्ति तिथि">
        <TextInput type="date" value={item.endDate ?? ''} onChange={(e) => onChange({ ...item, endDate: e.target.value || undefined })} />
      </Field>
    </div>
  );
}

export function ContentAdminPage({ uid }) {
  const draftState = useDraft('content', useCallback(makeDefault, []), uid);
  const { draft, loading, error, update, published } = draftState;
  if (loading) return <p className="text-muted">लोड हो रहा है…</p>;
  if (error) return <Notice tone="error">{error}</Notice>;

  const setItem = (list, i) => (value) => update((d) => ({ ...d, [list]: d[list].map((x, j) => (j === i ? value : x)) }));
  const removeItem = (list, i) => update((d) => ({ ...d, [list]: d[list].filter((_, j) => j !== i) }));
  const changes = [
    ...diffLists(draft.notices, published?.notices, (x) => x.id, (x) => `सूचना: ${x.title?.hi}`),
    ...diffLists(draft.ads, published?.ads, (x) => x.id, (x) => `विज्ञापन: ${x.title?.hi}`),
  ];

  return (
    <>
      <Card
        title="समाज सूचनाएँ"
        actions={
          <Button onClick={() => update((d) => ({ ...d, notices: [...d.notices, { id: nextId('notice', d.notices), title: { hi: '' }, body: { hi: '' }, active: true, priority: d.notices.length + 1 }] }))}>
            + सूचना
          </Button>
        }
      >
        <div className="space-y-3">
          {draft.notices.map((n, i) => (
            <fieldset key={n.id} className="space-y-2 rounded-xl border border-line p-3">
              <legend className="px-1 font-mono text-xs">{n.id}</legend>
              <LocalizedInput label="शीर्षक" value={n.title} onChange={(title) => setItem('notices', i)({ ...n, title })} />
              <LocalizedInput label="विवरण" value={n.body} onChange={(body) => setItem('notices', i)({ ...n, body })} />
              <Common item={n} onChange={setItem('notices', i)} />
              <Button variant="ghost" className="!text-sunday" onClick={() => removeItem('notices', i)}>
                हटाएँ
              </Button>
            </fieldset>
          ))}
        </div>
      </Card>

      <Card
        title="विज्ञापन"
        actions={
          <Button onClick={() => update((d) => ({ ...d, ads: [...d.ads, { id: nextId('ad', d.ads), title: { hi: '' }, active: true, priority: d.ads.length + 1 }] }))}>
            + विज्ञापन
          </Button>
        }
      >
        <Notice tone="info">
          चित्र: https:// लिंक (लगभग 1280×640, 150 KB से कम) या ऐप में बंडल “ads/…” फ़ाइल। लिंक केवल फ़ोन, व्हाट्सऐप, ईमेल या https वेबसाइट।
        </Notice>
        <div className="mt-3 space-y-3">
          {draft.ads.map((a, i) => (
            <fieldset key={a.id} className="space-y-2 rounded-xl border border-line p-3">
              <legend className="px-1 font-mono text-xs">{a.id}</legend>
              <LocalizedInput label="शीर्षक" value={a.title} onChange={(title) => setItem('ads', i)({ ...a, title })} />
              <LocalizedInput label="विवरण" value={a.description} onChange={(description) => setItem('ads', i)({ ...a, description })} />
              <LocalizedInput label="प्रायोजक" value={a.sponsor} onChange={(sponsor) => setItem('ads', i)({ ...a, sponsor })} />
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="चित्र (URL)">
                  <TextInput value={a.image ?? ''} onChange={(e) => setItem('ads', i)({ ...a, image: e.target.value || undefined })} />
                </Field>
                <Field label="लिंक प्रकार">
                  <select
                    value={a.link?.type ?? ''}
                    onChange={(e) => setItem('ads', i)({ ...a, link: e.target.value ? { type: e.target.value, value: a.link?.value ?? '' } : undefined })}
                    className={inputClass}
                  >
                    <option value="">कोई नहीं</option>
                    <option value="tel">फ़ोन</option>
                    <option value="whatsapp">व्हाट्सऐप</option>
                    <option value="mailto">ईमेल</option>
                    <option value="https">वेबसाइट</option>
                  </select>
                </Field>
                <Field label="लिंक मान">
                  <TextInput
                    value={a.link?.value ?? ''}
                    disabled={!a.link}
                    onChange={(e) => setItem('ads', i)({ ...a, link: { ...a.link, value: e.target.value } })}
                  />
                </Field>
              </div>
              <Common item={a} onChange={setItem('ads', i)} />
              <Button variant="ghost" className="!text-sunday" onClick={() => removeItem('ads', i)}>
                हटाएँ
              </Button>
            </fieldset>
          ))}
        </div>
      </Card>
      <PublishBar draftState={draftState} changes={changes} />
    </>
  );
}
