# माहेश्वरी कैलेंडर — Maheshwari Digital Calendar

An offline-first, Hindi-first Android calendar for the Maheshwari / Marwadi community: daily tithi,
paksha and month (purnimanta), festivals and community occasions, local reminders, and a "back page"
for community notices and advertisements.

- **No backend, no account, no analytics, no internet needed.** All data ships inside the app.
- **Lightweight:** ~92 KB gzipped JS; each year of panchang data is a separate ~5 KB chunk loaded on demand.
- **Stack:** React 19 · Vite 6 · Tailwind CSS 4 · Capacitor 7 (Android, target SDK 36) · Vitest.

## Quick start

Requirements: Node ≥ 20.18, JDK 21, Android SDK Platform 36 (for Android builds).

```bash
npm install
npm run dev            # browser preview at http://localhost:5173 (reminders are Android-only)
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Validates data, then builds `dist/` (fails on malformed data) |
| `npm run preview` | Serves the production build |
| `npm run validate-data` | Checks every data file (`-- --strict` also fails on warnings) |
| `npm run test` | Unit + component tests |
| `npm run lint` | ESLint |
| `npm run generate-panchang -- <year>` | Pre-computes a new year's panchang + festivals (dev-only) |
| `npm run cap:sync` | Build and copy the web app into the Android project |
| `npm run cap:open` | Open the Android project in Android Studio |

## Project structure

```
src/
  App.jsx, main.jsx         app shell (views, sheet, Android back button, splash/status bar)
  pages/                    CalendarPage (full-screen month grid), OccasionsPage (month events, Purnima/Amavasya times),
                            BackPage (notices/ads), SettingsPage (reminders)
  components/               CalendarGrid, TodayCard, DayDetailSheet, MonthNavigator, AdCard, …
  hooks/                    useSettings, useReminders (permission flow), useCalendarData, useToday, useSwipe
  services/
    calendarService.js      month/date/today/occasion lookups (no React)
    reminderPlanner.js      pure: occasions + settings → exact list of notifications
    notificationService.js  Capacitor Local Notifications wrapper (sync, cancel, permissions)
    reminderService.js      glue: data → plan → device
    storageService.js       Capacitor Preferences wrapper
    settings.js             settings defaults + sanitising
  repositories/             CalendarRepository contract + LocalCalendarRepository (bundled JSON)
  data/
    calendar/<year>.json    daily panchang (tithi, paksha, maas, sunrise/sunset, tithi end)
    occasions/<year>.json   festivals & occasions with dates
    occasions/recurring.json fixed Gregorian dates (e.g. 15 Aug)
    advertisements/ads.json back-page ads
    notices/notices.json    back-page community notices
  constants/                Hindi/English vocabulary, categories
  utils/                    integer-only date math, Hindi formatting, validators, safe links
scripts/
  validate-data.mjs         build-time data validation
  generate-panchang.mjs     dev-only panchang generator (uses astronomy-engine)
  festival-rules.json       where each lunar festival falls (editable)
tests/                      Vitest suites (dates, service, reminders, validation, generator, UI)
android/                    Capacitor Android project (committed)
resources/                  icon source (SVG)
docs/                       data guide, release process, Play Store prep, privacy policy
```

## Architecture

```
UI (React) ──► calendarService ──► CalendarRepository ──► LocalCalendarRepository ──► bundled JSON
                                                     └─► (V2) RemoteCalendarRepository ──► API ──► DB
UI ──► useReminders ──► reminderService ──► reminderPlanner (pure) ──► notificationService ──► Android
```

- **Data ≠ UI.** JSON stores codes (`"tithi": 9, "paksha": "shukla", "maas": "jyeshtha"`); Hindi/English
  names come from `src/constants/terms.js`. English UI later needs no data changes.
- **Swappable data source.** Components never import JSON. To add a server in V2, implement the
  contract documented in `src/repositories/LocalCalendarRepository.js` and switch `src/repositories/index.js`.
- **Never crash on bad data.** At runtime, malformed optional records are skipped (with a console
  warning); at build time `validate-data` fails the build.
- **Dates.** All calendar logic uses `"YYYY-MM-DD"` keys and integer arithmetic — no `new Date("…")`
  parsing, so no UTC day-shift. "Today" is the phone's local date and rolls over at midnight/resume.
  Panchang data is computed for India (IST, reference location Ujjain).

### Reminders

Local notifications only (no Firebase). On every app start/resume and settings change, the app plans
reminders for the next 120 days (max 64), then makes the device match: unchanged ones are kept,
stale ones cancelled, new ones scheduled. IDs are a deterministic hash of `occasionId|date|kind`, so
re-syncing never duplicates. Permission is requested only when the user turns reminders on, after an
in-app explanation; if denied, the app explains how to enable it in phone settings and never re-prompts.
Exact-alarm permission is not used, so reminders may arrive a few minutes late (Doze).

## Panchang data — important

The bundled 2026–2028 data was **computed astronomically** by `scripts/generate-panchang.mjs`
(udaya tithi at Ujjain sunrise, Lahiri ayanamsa, purnimanta months, adhik maas, Bhadra rules for
Holika Dahan / Raksha Bandhan). It is checked by golden tests against 30+ observed festival dates
for 2025–2026, but it is marked `"verified": false` and **must be checked against a trusted printed
panchang before release**. See [docs/DATA_GUIDE.md](docs/DATA_GUIDE.md).

## Documentation

- [docs/DATA_GUIDE.md](docs/DATA_GUIDE.md) — add an occasion, fix a tithi, add an ad/notice, add a year
- [docs/RELEASE.md](docs/RELEASE.md) — signed AAB, versioning, release checklist
- [docs/PLAY_STORE.md](docs/PLAY_STORE.md) — listing text, data safety, content rating, assets
- [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md) — privacy policy text
