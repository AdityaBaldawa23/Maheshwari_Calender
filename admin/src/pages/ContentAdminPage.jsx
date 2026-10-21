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
      <Field label={`${label} (Hindi)`}>
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
        Active
      </label>
      <Field label="Order (lower first)">
        <TextInput type="number" value={item.priority} onChange={(e) => onChange({ ...item, priority: Number(e.target.value) })} />
      </Field>
      <Field label="Start date">
        <TextInput type="date" value={item.startDate ?? ''} onChange={(e) => onChange({ ...item, startDate: e.target.value || undefined })} />
      </Field>
      <Field label="End date">
        <TextInput type="date" value={item.endDate ?? ''} onChange={(e) => onChange({ ...item, endDate: e.target.value || undefined })} />
      </Field>
    </div>
  );
}

export function ContentAdminPage({ uid }) {
  const draftState = useDraft('content', useCallback(makeDefault, []), uid);
  const { draft, loading, error, update, published } = draftState;
  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <Notice tone="error">{error}</Notice>;

  const setItem = (list, i) => (value) => update((d) => ({ ...d, [list]: d[list].map((x, j) => (j === i ? value : x)) }));
  const removeItem = (list, i) => update((d) => ({ ...d, [list]: d[list].filter((_, j) => j !== i) }));
  const changes = [
    ...diffLists(draft.notices, published?.notices, (x) => x.id, (x) => `Notice: ${x.title?.en || x.title?.hi}`),
    ...diffLists(draft.ads, published?.ads, (x) => x.id, (x) => `Ad: ${x.title?.en || x.title?.hi}`),
  ];

  return (
    <>
      <Card
        title="Community notices"
        actions={
          <Button onClick={() => update((d) => ({ ...d, notices: [...d.notices, { id: nextId('notice', d.notices), title: { hi: '' }, body: { hi: '' }, active: true, priority: d.notices.length + 1 }] }))}>
            + Notice
          </Button>
        }
      >
        <div className="space-y-3">
          {draft.notices.map((n, i) => (
            <fieldset key={n.id} className="space-y-2 rounded-xl border border-line p-3">
              <legend className="px-1 font-mono text-xs">{n.id}</legend>
              <LocalizedInput label="Title" value={n.title} onChange={(title) => setItem('notices', i)({ ...n, title })} />
              <LocalizedInput label="Text" value={n.body} onChange={(body) => setItem('notices', i)({ ...n, body })} />
              <Common item={n} onChange={setItem('notices', i)} />
              {/* MINOR_UI_CHANGES.md, Change 3: pop-up notices */}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={n.popup === true}
                  onChange={(e) => setItem('notices', i)({ ...n, popup: e.target.checked || undefined })}
                  className="mt-1"
                />
                <span>
                  <strong>Pop-up notification</strong> — after publishing, each phone shows this notice once as a notification
                  (if notifications are allowed) and as a pop-up, the next time the app is opened with internet. Not an instant
                  push. To notify again, add a new notice.
                </span>
              </label>
              <Button variant="ghost" className="!text-sunday" onClick={() => removeItem('notices', i)}>
                Delete
              </Button>
            </fieldset>
          ))}
        </div>
      </Card>

      <Card
        title="Advertisements"
        actions={
          <Button onClick={() => update((d) => ({ ...d, ads: [...d.ads, { id: nextId('ad', d.ads), title: { hi: '' }, active: true, priority: d.ads.length + 1 }] }))}>
            + Advertisement
          </Button>
        }
      >
        <Notice tone="info">
          Image: an https:// link (about 1280×640, under 150 KB) or a bundled “ads/…” file. Links: phone, WhatsApp, email or an https website only.
        </Notice>
        <div className="mt-3 space-y-3">
          {draft.ads.map((a, i) => (
            <fieldset key={a.id} className="space-y-2 rounded-xl border border-line p-3">
              <legend className="px-1 font-mono text-xs">{a.id}</legend>
              <LocalizedInput label="Title" value={a.title} onChange={(title) => setItem('ads', i)({ ...a, title })} />
              <LocalizedInput label="Description" value={a.description} onChange={(description) => setItem('ads', i)({ ...a, description })} />
              <LocalizedInput label="Sponsor label" value={a.sponsor} onChange={(sponsor) => setItem('ads', i)({ ...a, sponsor })} />
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Image (URL)">
                  <TextInput value={a.image ?? ''} onChange={(e) => setItem('ads', i)({ ...a, image: e.target.value || undefined })} />
                </Field>
                <Field label="Link type">
                  <select
                    value={a.link?.type ?? ''}
                    onChange={(e) => setItem('ads', i)({ ...a, link: e.target.value ? { type: e.target.value, value: a.link?.value ?? '' } : undefined })}
                    className={inputClass}
                  >
                    <option value="">None</option>
                    <option value="tel">Phone</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="mailto">Email</option>
                    <option value="https">Website</option>
                  </select>
                </Field>
                <Field label="Link value">
                  <TextInput
                    value={a.link?.value ?? ''}
                    disabled={!a.link}
                    onChange={(e) => setItem('ads', i)({ ...a, link: { ...a.link, value: e.target.value } })}
                  />
                </Field>
              </div>
              <Common item={a} onChange={setItem('ads', i)} />
              <Button variant="ghost" className="!text-sunday" onClick={() => removeItem('ads', i)}>
                Delete
              </Button>
            </fieldset>
          ))}
        </div>
      </Card>
      <PublishBar draftState={draftState} changes={changes} />
    </>
  );
}
