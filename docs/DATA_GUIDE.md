# Calendar Data Guide

Everything the app shows comes from plain JSON files in `src/data/`. You can edit them with any text
editor (VS Code recommended — it highlights mistakes). After **every** change run:

```bash
npm run validate-data
```

It tells you exactly which line is wrong. The app cannot be built while there are errors.

> **JSON rules of thumb:** text in "double quotes", a comma between items but **not** after the last
> one, dates as `"YYYY-MM-DD"`, times as `"HH:MM"` (24-hour, e.g. `"07:00"`, `"18:30"`).

---

## 1. Add an occasion (festival, community event, anniversary)

Open `src/data/occasions/<year>.json` and add one line inside `"occasions": [ … ]`:

```json
{"id":"samaj-sammelan","date":"2027-01-17","title":{"hi":"माहेश्वरी समाज सम्मेलन","en":"Maheshwari Samaj Sammelan"},"description":{"hi":"जयपुर में वार्षिक सम्मेलन।"},"category":"event","importance":"high","reminder":{"enabled":true,"defaultTime":"08:00"},"source":"manual"}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | lowercase-with-hyphens, unique per date. Re-use the same id every year for the same occasion (users can mute reminders by id). |
| `date` | yes | `YYYY-MM-DD`, must be in that file's year |
| `title.hi` | yes | Hindi (Devanagari). `title.en` optional but recommended |
| `description` | no | `{"hi": "…", "en": "…"}` — shown in the date details |
| `category` | yes | `maheshwari`, `marwadi`, `festival`, `vrat`, `jayanti` (birth anniversary), `punyatithi` (death anniversary), `event`, `national` |
| `importance` | yes | `high` (highlighted in the calendar), `medium`, `low` |
| `reminder` | no | `{"enabled": true, "defaultTime": "07:00"}` — `enabled:false` means no reminder is ever offered |
| `source` | no | `manual` or `generated` (informational) |

**Same date every year** (e.g. 15 August)? Add it once to `src/data/occasions/recurring.json` with
`"monthDay": "08-15"` instead of `date`.

## 2. Change or correct a tithi

Open `src/data/calendar/<year>.json`. Each day is one line:

```json
"2027-06-12": {"tithi":9,"paksha":"shukla","maas":"jyeshtha","tithiStart":"2027-06-12T03:46","tithiEnd":"2027-06-13T02:45","sunrise":"05:41","sunset":"19:13"},
```

| Field | Values |
| --- | --- |
| `tithi` | 1–14, or 15 = पूर्णिमा (shukla) / अमावस्या (krishna) |
| `paksha` | `shukla` or `krishna` |
| `maas` | `chaitra`, `vaishakh`, `jyeshtha`, `ashadh`, `shravan`, `bhadrapad`, `ashwin`, `kartik`, `margashirsha`, `paush`, `magh`, `phalgun` — **purnimanta** naming (Krishna paksha belongs to the following month) |
| `adhik` | `true` only during an adhik (purushottam) maas; omit otherwise |
| `tithiStart` / `tithiEnd` | when that tithi begins / ends, IST, `YYYY-MM-DDTHH:MM` (optional; shown as प्रारंभ / समाप्ति — e.g. Amavasya start and end) |
| `sunrise` / `sunset` | IST at the reference location (Ujjain), `HH:MM` (optional) |
| `kshaya` | `{"tithi": 10, "paksha": "shukla", "start": "…", "end": "…"}` if a tithi begins and ends between this sunrise and the next (optional) |

The validator checks that the tithi advances sensibly from day to day (0, 1 or 2 steps) and will
flag likely typos.

## 3. Verify a year before release (required)

Generated data has `"verified": false` in its `meta`. Before a release:

1. Compare the dates in `occasions/<year>.json` (all festivals and ekadashis) and a sample of tithis
   in `calendar/<year>.json` against the panchang your community trusts.
2. Correct any difference by hand (sections 1–2). Local traditions sometimes differ by a day — the
   community's practice wins.
3. Set `"verified": true` in the `meta` of both files.
4. `npm run validate-data -- --strict` must pass (it fails while anything is unverified).

## 4. Add a new year

```bash
npm run generate-panchang -- 2029
```

This writes `src/data/calendar/2029.json` and `src/data/occasions/2029.json` (existing files are
never overwritten unless you add `--force`). Then: add community-specific occasions (section 1),
verify (section 3), validate, test, and release an app update. Nothing in the app code changes —
the new year appears automatically.

Lunar festival placement rules live in `scripts/festival-rules.json` (amanta month, paksha, tithi and
the time of day that matters — sunrise, pradosh, nishita, etc.). To add a festival that recurs every
year on a lunar date, add a rule there instead of editing every year by hand.

## 5. Add or change an advertisement

1. Put the image in `public/ads/` (WebP or JPG, about **1280 × 640 px**, under 150 KB; 2:1 ratio).
2. Add an entry to `src/data/advertisements/ads.json`:

```json
{
  "id": "ad-sharma-jewellers",
  "title": { "hi": "शर्मा ज्वेलर्स", "en": "Sharma Jewellers" },
  "description": { "hi": "दीपावली पर विशेष छूट" },
  "image": "ads/sharma-jewellers.webp",
  "sponsor": { "hi": "प्रायोजित" },
  "link": { "type": "tel", "value": "+91 98765 43210" },
  "active": true,
  "priority": 1,
  "startDate": "2027-10-01",
  "endDate": "2027-11-15"
}
```

- `link.type` may be `tel`, `whatsapp` (phone number), `mailto` or `https` (website). Anything else is rejected.
- `priority`: lower numbers are shown first. `active: false` hides an ad without deleting it.
- `startDate`/`endDate` are optional.
- Remove the two `ad-sample-…` placeholders once real ads exist.

## 6. Add a community notice

Add an entry to `src/data/notices/notices.json` — same idea as ads, with `title` and `body`
(`{"hi": "…"}`), `active`, `priority`, optional `startDate`/`endDate`.

## 7. Bulk editing in a spreadsheet

The one-line-per-record layout is deliberately spreadsheet-friendly. If editors prefer Excel/Google
Sheets, a CSV → JSON converter can be added later; validation already guarantees that whatever is
imported is checked before it can ship.
