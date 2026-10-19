import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Field, Notice, TextInput, inputClass } from '../components/ui.jsx';
import { loadDraft, loadMembers, saveDraft } from '../services/api.js';
import { POSTER_TEXT, canvasToBlob, renderPoster } from '../services/poster.js';
import { buildCelebrationIndex, celebrationLabel, celebrationsOn } from '../../../src/services/celebrations.js';
import { memberName, photoThumb } from '../../../src/shared/directorySchema.js';
import { ORGANIZATIONS, orgOf } from '../../../src/shared/organizations.js';
import { whatsappUrl } from '../../../src/shared/whatsapp.js';
import { normalizeForSearch } from '../../../src/services/directorySearch.js';
import { formatDate, num } from '../../../src/utils/format.js';
import { todayKey } from '../../../src/utils/date.js';

const DEFAULT_BRAND = { hi: 'सांगली जिल्हा माहेश्वरी युवा संगठन', en: 'Sangli District Maheshwari Yuva Sangathan' };
const BRAND_KEY = 'mdc.posterBrand';
const GROUP_LINK = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/;

function readBrand() {
  try {
    return { ...DEFAULT_BRAND, ...JSON.parse(localStorage.getItem(BRAND_KEY) ?? '{}') };
  } catch {
    return DEFAULT_BRAND;
  }
}

function shareText(entry, name, brand) {
  return entry.kind === 'birthday'
    ? `🎂 ${name} को जन्मदिन की हार्दिक शुभकामनाएँ! 🙏\nHappy Birthday, ${name}!\n— ${brand.hi}`
    : `💐 ${name} को विवाह वर्षगांठ की हार्दिक शुभकामनाएँ! 🙏\nHappy Anniversary, ${name}!\n— ${brand.hi}`;
}

/** Saved WhatsApp community groups (invite links), kept in drafts/whatsappGroups (admin-only). */
function GroupsEditor({ groups, onSave }) {
  const [list, setList] = useState(groups);
  const [error, setError] = useState(null);
  useEffect(() => setList(groups), [groups]);
  const valid = list.every((g) => g.name.trim() && GROUP_LINK.test(g.link.trim()));
  return (
    <div className="space-y-2">
      {list.map((g, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <TextInput placeholder="Group name" value={g.name} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <TextInput
            placeholder="https://chat.whatsapp.com/…"
            value={g.link}
            invalid={g.link && !GROUP_LINK.test(g.link.trim())}
            onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, link: e.target.value } : x)))}
          />
          <Button variant="ghost" className="!text-sunday" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setList((l) => [...l, { name: '', link: '' }])}>
          + Add group
        </Button>
        <Button
          disabled={!valid}
          onClick={async () => {
            setError(null);
            try {
              await onSave(list.map((g) => ({ name: g.name.trim(), link: g.link.trim() })));
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          Save groups
        </Button>
      </div>
      <p className="text-xs text-muted">
        Use the group&apos;s invite link (Group info → Invite via link). Opening it on a phone or WhatsApp Web where you are a member
        opens that group&apos;s chat.
      </p>
    </div>
  );
}

export function WishesPage({ uid }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const [date, setDate] = useState(todayKey());
  const [org, setOrg] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null); // { member, kind, years }
  const [nameLang, setNameLang] = useState('hi');
  const [showYears, setShowYears] = useState(false);
  const [message, setMessage] = useState('');
  const [brand, setBrand] = useState(readBrand);
  const [status, setStatus] = useState(null);
  const [groups, setGroups] = useState([]);
  const [editingGroups, setEditingGroups] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    loadMembers()
      .then((list) => setMembers(list.filter((m) => m.status === 'active')))
      .catch((err) => setError(`Could not load members: ${err.message}`));
    loadDraft('whatsappGroups')
      .then((d) => setGroups(Array.isArray(d?.groups) ? d.groups : []))
      .catch(() => {});
  }, []);

  const scoped = useMemo(() => (members ?? []).filter((m) => !org || orgOf(m) === org), [members, org]);
  const index = useMemo(() => buildCelebrationIndex(scoped), [scoped]);
  const entries = useMemo(() => celebrationsOn(index, date), [index, date]);
  const searchResults = useMemo(() => {
    const t = normalizeForSearch(query);
    if (t.length < 2) return [];
    return scoped.filter((m) => normalizeForSearch(`${m.nameEn} ${m.nameHi} ${m.id}`).includes(t)).slice(0, 8);
  }, [scoped, query]);

  const posterName = selected ? (nameLang === 'hi' ? selected.member.nameHi || selected.member.nameEn : selected.member.nameEn || selected.member.nameHi) || '' : '';

  const draw = useCallback(async () => {
    if (!selected || !canvasRef.current) return;
    const yearsLabel = showYears && selected.years > 0 ? celebrationLabel(selected, num) : '';
    const r = await renderPoster(canvasRef.current, {
      kind: selected.kind,
      name: posterName,
      photoUrl: selected.member.photo,
      yearsLabel,
      brandHi: brand.hi,
      brandEn: brand.en,
      message,
      dateLabel: formatDate(date),
    });
    setStatus(r.photoLoaded ? null : { tone: 'info', text: 'The photo could not be loaded into the poster (link unreachable or not CORS-enabled) — initials are shown instead.' });
  }, [selected, posterName, showYears, brand, message, date]);

  useEffect(() => {
    draw();
  }, [draw]);

  const choose = (member, kind, years) => {
    setSelected({ member, kind, years });
    setShowYears(kind === 'anniversary');
    setMessage('');
    setStatus(null);
  };

  const posterFile = async () => {
    const blob = await canvasToBlob(canvasRef.current);
    const safe = (posterName || 'member').replace(/[^\p{L}\p{N}]+/gu, '-');
    return new File([blob], `${selected.kind}-${safe}.png`, { type: 'image/png' });
  };

  const download = async () => {
    const file = await posterFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const share = async () => {
    const file = await posterFile();
    const text = shareText(selected, posterName, brand);
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        setStatus({ tone: 'success', text: 'Shared.' });
      } catch (err) {
        if (err?.name !== 'AbortError') setStatus({ tone: 'error', text: `Sharing failed: ${err.message}` });
      }
    } else {
      await download();
      window.open(`https://api.whatsapp.com/send/?text=${encodeURIComponent(text)}&type=custom_url&app_absent=0`, '_blank', 'noopener');
      setStatus({
        tone: 'info',
        text: 'This browser cannot share images directly. The poster was downloaded and WhatsApp opened with the message — choose the group(s), then attach the downloaded image.',
      });
    }
  };

  const copyImage = async () => {
    try {
      const blob = await canvasToBlob(canvasRef.current);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setStatus({ tone: 'success', text: 'Poster copied. Open a group below and paste it (Ctrl+V) in WhatsApp Web / Desktop.' });
    } catch {
      setStatus({ tone: 'error', text: 'This browser cannot copy images — use Download or Share instead.' });
    }
  };

  const dm = selected ? whatsappUrl(selected.member.phone, shareText(selected, posterName, brand)) : null;

  return (
    <>
      <Card title="Birthday & anniversary wishes">
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" />
          </Field>
          <Field label="Organisation">
            <select value={org} onChange={(e) => setOrg(e.target.value)} className={`${inputClass} w-auto`}>
              <option value="">All organisations</option>
              {ORGANIZATIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.en}
                </option>
              ))}
            </select>
          </Field>
          <Button variant="secondary" onClick={() => setDate(todayKey())}>
            Today
          </Button>
        </div>

        <h3 className="mt-4 text-sm font-semibold text-ink">
          {members ? `${entries.length} celebration${entries.length === 1 ? '' : 's'} on ${new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}` : 'Loading members…'}
        </h3>
        <ul className="mt-1 divide-y divide-line">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.member.id}`} className="flex items-center gap-3 py-2">
              {e.member.photo ? (
                <img src={photoThumb(e.member.photo, 80)} alt="" className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gold-soft text-maroon">{e.kind === 'birthday' ? '🎂' : '💐'}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{e.member.nameEn || e.member.nameHi}</span>
                <span className="block text-xs text-muted">
                  {e.kind === 'birthday' ? `Birthday (${e.years})` : `Wedding anniversary (${e.years} years)`} · {e.member.phone || 'no phone'}
                </span>
              </span>
              <Button variant={selected?.member.id === e.member.id && selected.kind === e.kind ? 'primary' : 'secondary'} onClick={() => choose(e.member, e.kind, e.years)}>
                Create poster
              </Button>
            </li>
          ))}
          {members && entries.length === 0 && <li className="py-2 text-sm text-muted">No birthdays or anniversaries on this date.</li>}
        </ul>

        <div className="mt-4">
          <Field label="Or create a poster for any member">
            <TextInput type="search" placeholder="Search by name or ID" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-md" />
          </Field>
          {searchResults.length > 0 && (
            <ul className="mt-1 max-w-md divide-y divide-line rounded-lg border border-line">
              {searchResults.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                  <span>{m.nameEn || m.nameHi}</span>
                  <span className="flex gap-1">
                    <Button variant="ghost" onClick={() => choose(m, 'birthday', 0)}>
                      Birthday
                    </Button>
                    <Button variant="ghost" onClick={() => choose(m, 'anniversary', 0)}>
                      Anniversary
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {selected && (
        <Card title={`Poster — ${memberName(selected.member)} (${selected.kind === 'birthday' ? 'birthday' : 'anniversary'})`}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
            <canvas ref={canvasRef} className="w-full max-w-[420px] rounded-xl shadow-lg" aria-label="Poster preview" />
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-2">
                  Name in
                  <select value={nameLang} onChange={(e) => setNameLang(e.target.value)} className={`${inputClass} w-auto`}>
                    <option value="hi">Hindi (if available)</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showYears} onChange={(e) => setShowYears(e.target.checked)} />
                  Show {selected.kind === 'birthday' ? 'age' : 'years'} on poster
                </label>
              </div>
              <Field label="Message (optional — default blessing is used when empty)">
                <TextInput value={message} onChange={(e) => setMessage(e.target.value)} placeholder={POSTER_TEXT[selected.kind].blessing} />
              </Field>
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-maroon">Organisation name on posters</summary>
                <div className="mt-2 grid gap-2">
                  <TextInput value={brand.hi} onChange={(e) => setBrand((b) => ({ ...b, hi: e.target.value }))} />
                  <TextInput value={brand.en} onChange={(e) => setBrand((b) => ({ ...b, en: e.target.value }))} />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      try {
                        localStorage.setItem(BRAND_KEY, JSON.stringify(brand));
                      } catch {
                        /* storage unavailable */
                      }
                      setStatus({ tone: 'success', text: 'Organisation name saved for future posters (this browser).' });
                    }}
                  >
                    Remember
                  </Button>
                </div>
              </details>

              {status && <Notice tone={status.tone}>{status.text}</Notice>}

              <div className="space-y-2 rounded-xl border border-line p-3">
                <p className="text-sm font-semibold text-ink">Send</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={share}>Share to WhatsApp groups…</Button>
                  <Button variant="secondary" onClick={copyImage}>
                    Copy image
                  </Button>
                  <Button variant="secondary" onClick={download}>
                    Download PNG
                  </Button>
                  {dm && (
                    <a href={dm} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-full border border-maroon px-4 text-sm font-semibold text-maroon">
                      Message {selected.member.nameEn?.split(' ')[0] || 'member'} on WhatsApp
                    </a>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  <strong>On a phone</strong>, “Share” opens the share sheet — pick WhatsApp, then tick one or more community groups; the
                  poster and message are sent together. <strong>On a computer</strong>, use “Copy image”, open a group below in WhatsApp
                  Web/Desktop and paste. WhatsApp does not allow apps to post into a group automatically.
                </p>
                {groups.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {groups.map((g) => (
                      <a
                        key={g.link}
                        href={g.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-10 items-center gap-1 rounded-full bg-[#1f7a43] px-4 text-sm font-semibold text-white"
                      >
                        Open “{g.name}”
                      </a>
                    ))}
                  </div>
                )}
                <Button variant="ghost" onClick={() => setEditingGroups((v) => !v)}>
                  {editingGroups ? 'Close group list' : groups.length ? 'Edit community groups' : '+ Add community WhatsApp groups'}
                </Button>
                {editingGroups && (
                  <GroupsEditor
                    groups={groups}
                    onSave={async (list) => {
                      await saveDraft('whatsappGroups', { groups: list }, uid);
                      setGroups(list);
                      setEditingGroups(false);
                      setStatus({ tone: 'success', text: 'Community groups saved.' });
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
