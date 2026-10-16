# माहेश्वरी कैलेंडर — Maheshwari Digital Calendar (V2)

A Hindi-first calendar and community app for the Maheshwari / Marwadi community:

- **पंचांग:** a traditional Panchang month view (weekdays down the left), tithi, paksha, month, Vikram Samvat,
  Purnima/Amavasya start–end times, festivals, local reminders. Fully offline from bundled data.
- **अवसर:** the month's occasions.
- **माहेश्वरी परिवार:** a public directory, downloaded from Firebase, cached on the phone, searchable and filterable offline.
- **आपातकालीन संपर्क:** police/ambulance/fire (bundled, offline), 4 community contacts and 4 hospitals.
- **अधिक:** community notices & advertisements, reminder settings.
- **Admin portal** (separate web app): Excel/CSV import, member editing, emergency contacts, occasions, ads/notices,
  draft → validate → preview → publish, history and rollback.

Stack: React 19 · Vite 6 · Tailwind CSS 4 · Capacitor 7 (Android, target SDK 36) · Firebase (Auth, Firestore, Hosting) · Vitest.
The app itself ships **no Firebase SDK**: it reads published documents through the Firestore REST API (~101 KB gzipped JS).

## Quick start

Requirements: Node ≥ 20.18, JDK 21 (also needed by the Firestore emulator), Android SDK Platform 36.

```bash
npm install
cp .env.example .env.local   # optional: Firebase project for directory/emergency/content sync
npm run dev                  # app at http://localhost:5173
npm run admin:dev            # admin portal at http://localhost:5174
```

Without `.env.local` the app still works fully offline (calendar, occasions, bundled emergency numbers); the
directory then says it is not yet published.

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `preview` | App development server / validated production build (`dist/`) / serve it |
| `npm run admin:dev` / `admin:build` / `admin:deploy` | Admin portal dev server / build (`dist-admin/`) / deploy hosting + rules |
| `npm run validate-data` | Checks every bundled data file (`-- --strict` also fails on warnings) |
| `npm run test` | Unit, component and integration tests (no emulator needed) |
| `npm run test:rules` | Firestore Security Rules tests on the local emulator |
| `npm run lint` | ESLint |
| `npm run generate-panchang -- <year>` | Pre-computes a new year's panchang + festivals (dev-only) |
| `npm run cap:sync` / `cap:open` | Build and copy into the Android project / open Android Studio |

## Project structure

```
src/
  App.jsx, main.jsx            app shell: 5 tabs, sheets, Android back button, sync on launch/resume
  pages/                       CalendarPage, OccasionsPage, DirectoryPage, EmergencyPage, MorePage (→ BackPage, SettingsPage)
  components/                  CalendarGrid (vertical weekdays), DayDetailSheet, MonthNavigator/MonthPicker, MemberSheet, …
  hooks/                       useSettings, useReminders, useCalendarData, useSync, useToday, useSwipe
  services/
    calendarService.js         month/date/occasion lookups, cache invalidation
    reminderPlanner.js …       local notification planning + reconciliation (unchanged from V1)
    directorySearch.js         offline index, search and filters
    sync/                      remoteSource (Firestore REST), datasets, syncEngine, snapshotStore (crash-safe cache), syncManager
  repositories/                LocalCalendarRepository (+ admin-published occasion overrides), emergencyRepository
  shared/                      code shared with the admin portal: schemas, snapshot format, hashing, import engine (csv, mapping, normalize, plan)
  data/                        bundled calendar, occasions, ads, notices, emergency services
admin/                         admin portal (React + Firebase SDK) → Firebase Hosting
firestore.rules, firestore.indexes.json, firebase.json
tests/                         Vitest suites;  rules-tests/  Security Rules tests (emulator)
android/                       Capacitor Android project
docs/                          guides (see below)
```

## Architecture in one paragraph

Bundled calendar JSON renders immediately and never depends on the network. On launch, on resume (at most every
30 minutes) and on manual refresh, `syncManager` reads small version documents from `published/*`. Only when a version
changed does it download the payload (the directory in chunks of 400 members), verify the schema, counts and checksum,
and store it in a two-slot snapshot file before activating it. A failed or interrupted update keeps the last good
snapshot. Search and filters run in memory on the cached snapshot. Admins write only through the portal; Firestore
Security Rules make `published/**` world-readable and everything else admin-only. Admin-published occasions
replace the bundled list for that year and trigger a reminder reconciliation (deterministic IDs, no duplicates).
Details: [docs/V2_ADMIN.md](docs/V2_ADMIN.md).

## Data verification — important

- The 2026–2028 panchang was **computed astronomically** by `scripts/generate-panchang.mjs` and is marked
  `"verified": false`. The app shows "सत्यापन लंबित" in the date details until occasions are verified.
  Check against a trusted panchang before release ([docs/DATA_GUIDE.md](docs/DATA_GUIDE.md)).
- Emergency numbers 112/100 (police), 108 (ambulance), 101 (fire) are bundled with status **needs-confirmation**.
  Confirm them with official Sangli/Maharashtra sources.
- No real personal data, community contacts or hospitals are in the repository. They are entered by admins.
  Read [docs/V2_DATA_POLICY.md](docs/V2_DATA_POLICY.md) before publishing the directory.

## Rebuilding V1

V1 is tagged `v1.0.0` (commit `1772fcc` on `main`): `git checkout v1.0.0 && npm ci && npm run cap:sync`.

## Documentation

- [docs/V2_ADMIN.md](docs/V2_ADMIN.md) — Firebase setup, admin provisioning, schema/rules, Excel import, publishing, rollback, costs
- [docs/V2_DATA_POLICY.md](docs/V2_DATA_POLICY.md) — directory publication & consent policy (owner must confirm)
- [docs/DATA_GUIDE.md](docs/DATA_GUIDE.md) — bundled calendar data: occasions, tithis, new years
- [docs/RELEASE.md](docs/RELEASE.md) — Android (and iOS) builds, signing, release checklist
- [docs/PLAY_STORE.md](docs/PLAY_STORE.md) — listing, data safety, content rating
- [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md) — privacy policy text
