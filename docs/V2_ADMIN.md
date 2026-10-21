# V2 — Firebase, Admin Portal, Directory & Emergency Contacts

Audience: the developer/maintainer setting up Firebase and the administrators running the portal.

> **Member access (V2.1):** the directory and birthdays/anniversaries are no longer public. Members sign in with
> mobile number + password, the IT Head approves them and assigns ONE district, and each phone downloads only that
> district. Approval, provisioning, recovery, offline behaviour and costs: **[MEMBER_ACCESS.md](MEMBER_ACCESS.md)**.

## 1. Architecture

```
Android app (Capacitor)                         Admin portal (web, Firebase Hosting)
 ├─ Calendar: bundled JSON (always offline)      ├─ Firebase Auth (email/password, no sign-up UI)
 ├─ Sync (launch / resume ≥30 min / manual)      ├─ members/*        master records (private)
 │   GET published/* via Firestore REST          ├─ drafts/*         emergency, content, occasions_<year>
 │   (no SDK, no listeners)                      ├─ imports/*        import history
 ├─ Member sign-in (phone + password, REST)      ├─ publications/*   audit log + rollback payloads
 │   GET districts/{own district} with ID token  ├─ Member access: accessRequests, memberAccess, accessAudit
 ├─ Two-slot snapshot cache (internal storage)   └─ writes published/* (public) and districts/* (members)
 └─ Offline search/filter in memory
                     ▲                                        │
                     └────────── Cloud Firestore ◄────────────┘
          published/** = public read · districts/{d} = members approved for d · rest = admins
```

The UI talks only to repositories/services (`src/repositories`, `src/services/sync`), never to Firestore directly.
No Cloud Functions, servers or Firebase Storage are required (works on the free **Spark** plan). Member accounts are
created by a local Admin SDK script on the IT Head computer ([MEMBER_ACCESS.md](MEMBER_ACCESS.md) §4).

## 2. Firestore schema

| Path | Read | Write | Contents |
| --- | --- | --- | --- |
| `admins/{uid}` | self / admins | **nobody** (console only) | `{ active: true, email, name }` |
| `members/{id}` | admins | admins | master record: `id, nameHi, nameEn, dob, age, anniversary, bloodGroup, fatherName, motherName, phone, city, district, publicNote, adminNote, status (active/inactive), createdAt, updatedAt, updatedBy, importId` (+ photo, profession, designation, org) |
| `drafts/{emergency \| content \| occasions_YYYY}` | admins | admins | unpublished edits |
| `imports/{importId}` | admins | create/update by admins, never deleted | file name, mode, options, summary, status, written |
| `publications/{auto}` | admins | append-only | dataset, action, version, meta/payload, publishedBy |
| `districts/{district}` | admins + members approved for that district | admins | `{ district, version, schemaVersion, recordCount, chunkCount, checksum, publishedAt }` |
| `districts/{district}/chunks/{version}_{n}` | same | admins | `{ version, index, members: [≤400 directory records] }` |
| `accessRequests/{phone10}` | admins | **create by anyone** (validated, `pending` only, one per number); admins | name, phone, district, optional father/city/org/note, status, submittedAt |
| `memberAccess/p{phone10}` | admins + the member themself | admins only | `{ phone, name, district, status (approved/revoked), memberId?, account* (set by the provisioning script) }` |
| `accessAudit/{auto}` | admins | append-only | action, target, district/reason, by, at |
| `published/directory` (+ chunks) | admins only (**retired** V2.0 public directory) | nobody (delete only) | remove with *Members → Remove old public directory* |
| `published/emergency` | **public** | admins | `{ version, schemaVersion, contacts[4], services[3], hospitals[4] }` |
| `published/content` | **public** | admins | `{ version, schemaVersion, ads[], notices[] }` |
| `published/calendar` | **public** | admins | `{ version, years: { "2027": <version> } }` |
| `published/occasions_YYYY` | **public** | admins | `{ version, year, verified, occasions[] }` |

District directory records contain only: `id, nameHi, nameEn, dob, age (only if no DOB), anniversary,
bloodGroup, fatherName, motherName, phone, city, note, photo, profession, professionDetail, designation, org`.
**Admin notes, districts, statuses and inactive members are never published.**

Rules: [`firestore.rules`](../firestore.rules). Indexes: [`firestore.indexes.json`](../firestore.indexes.json)
(single-field indexes cover everything else). Rules tests: `npm run test:rules` (Firestore + Auth emulators; Java 11+ required).

## 3. Firebase project setup (one-time)

1. <https://console.firebase.google.com> → **Add project** (Analytics: off). Plan: **Spark (free)**.
2. **Build → Firestore Database → Create database** → production mode → location **asia-south1 (Mumbai)**
   (cannot be changed later).
3. **Build → Authentication → Get started → Email/Password → Enable.**
   Then *Settings → User actions* → untick **Enable create (sign-up)** so nobody can self-register.
   (Even if someone did, the rules give them no access — see §4.)
4. **Project settings → Your apps → Web (</>)** → register "admin-portal". Copy `apiKey`, `authDomain`, `projectId`, `appId`.
5. In the repo root create `.env.local` (git-ignored) from `.env.example` and fill all four values.
   These are public identifiers, not secrets.
6. Deploy rules, indexes and the portal:
   ```bash
   cp .firebaserc.example .firebaserc     # put your project ID in it
   npx firebase-tools@15.34.0 login
   npm run admin:deploy                   # builds dist-admin/ and deploys hosting + firestore rules/indexes
   ```
   The portal URL is shown at the end (`https://<project>.web.app`).
7. Rebuild the Android app with the same `.env.local` (`npm run cap:sync`) so it can download published data.
8. **Budget alert:** Spark has no billing, so quotas simply stop requests until the daily reset. If you ever move to
   Blaze, immediately create a budget (Google Cloud console → Billing → Budgets & alerts, e.g. ₹200/month, alerts at 50/90/100%).

## 4. Admin accounts (provisioning / revoking)
  
Grant:
1. Authentication → Users → **Add user** (email + temporary password). Tell the person to sign in and use “पासवर्ड भूल गए?” to set their own password.
2. Copy the user’s **UID**.
3. Firestore → collection `admins` → **Add document** with ID = UID → fields `active` (boolean) = `true`, `email`, `name`.

Revoke: set `active` to `false` (or delete the document) **and** disable the user in Authentication.

The `admins` collection cannot be changed from any client, including the portal (`allow write: if false`).
Every portal write is checked server-side by the rules; hiding buttons is not the security boundary.

## 5. Directory: import, edit, publish

### Excel / CSV template

The community's existing member sheet can be uploaded **as is**:

| N | Name | Mobile No | Birth Date | Anniversary | Blood Group |
| --- | --- | --- | --- | --- | --- |
| 1 | ABHIJIT … (ALL CAPS ok) | 98xxxxxxxx | 16/02/2005 | N/A | B Positive |

* **N / Sr No / क्र.** (serial number) is always ignored. It is not a member ID, because it changes whenever the sheet is sorted.
* **Anniversary is optional.** `N/A`, `NA`, `-`, `#N/A`, `nil`, `नहीं` or an empty cell all mean "no value" (in any column).
* ALL-CAPS English names are stored in Title Case ("Abhijit Nitin Attal"). Hindi names are kept as written.
* No city column? Enter **डिफ़ॉल्ट शहर** (e.g. सांगली) on the mapping screen. It is applied to new rows only.
* Extra optional columns can be added at any time: `Profession`, `Profession Details`, `Designation` (e.g. President),
  `Photo URL`, `Member ID`, `Father's Name`, `Mother's Name`, `City`, `Note`.
* **Organisation:** each import goes into one organisation, chosen on the first screen (Yuva Sangathan, Maha Sabha,
  Mahila Sangathan, Pragati Mandal). They are the sub-tabs of परिवार in the app. Duplicate checks and update matching stay
  inside that organisation, so a person active in two organisations is simply in both lists.
* **Photos:** upload them to Cloudinary and put each image's full `https://res.cloudinary.com/…` link in the `Photo URL`
  column. The app downloads small face-centred thumbnails automatically (Cloudinary transformation `c_fill,g_face`), and
  initials are shown when a member has no photo. Any other https image host also works, without the thumbnail saving.
* **Profession:** write any wording; it is mapped to one of 30 categories. See [PROFESSIONS.md](PROFESSIONS.md).
  “टेम्पलेट डाउनलोड” gives exactly this layout.

The first non-empty row must be the header. Recognised headers (case/punctuation-insensitive; anything else can be
mapped manually or ignored):

| Field | Example headers | Rules |
| --- | --- | --- |
| Member ID | `Member ID`, `ID`, `सदस्य क्रमांक` | optional; letters/digits/`-`/`_`, ≤40; unique in file. If absent, a **stable ID is derived from name + birth date** (else name + mobile, else name + father), so the same person keeps the same ID in later uploads |
| Name (auto) | `Name`, `नाम`, `पूरा नाम` | Devanagari → Hindi name, otherwise English name |
| Name Hindi / English | `नाम हिंदी`, `Name English` | ≤100 chars; at least one name required |
| DOB / Anniversary | `DOB`, `जन्म तिथि`, `Anniversary`, `विवाह वर्षगांठ` | `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`, Excel date cells; 4-digit year; not in the future |
| Age | `Age`, `आयु` | 0–125; kept **only if there is no DOB** (otherwise computed daily) |
| Blood group | `Blood Group`, `रक्त समूह` | A+ A- B+ B- AB+ AB- O+ O- (`b +ve`, `O Positive` accepted) |
| Father / Mother | `पिता का नाम`, `Father's Name`, `माता का नाम` | ≤100 chars |
| Phone | `Mobile`, `मोबाइल`, `Contact` | 10-digit mobile (→ `+91…`), landline with STD code; first of several numbers kept (warning) |
| City | `City`, `शहर`, `गाँव`, `स्थान` | ≤100 chars |
| Profession | `Profession`, `Occupation`, `Business`, `व्यवसाय` | mapped to a category; informative wording kept as details; unknown → Other (warning) |
| Profession details | `Profession Details`, `Firm Name`, `Company` | ≤120 chars |
| Designation | `Designation`, `Post`, `पद` | ≤80 chars |
| Photo URL | `Photo`, `Photo URL`, `Image`, `फोटो` | full https link (Cloudinary http links are upgraded to https) |
| Public note / Internal note | `टिप्पणी` / `Internal note` | public ≤300 (shown in app), internal ≤500 (never published) |

Formulas are never evaluated (`.xlsx` cached values only); formula-like text (`=…`, `@…`) is kept as plain text with a
warning, and CSV export prefixes such cells with `'` to prevent spreadsheet formula injection. Max 5 MB / 20,000 rows; first sheet only.

### Import modes

* **नए सदस्य जोड़ें (create)** — initial import. Rows whose ID already exists, or which look like an existing member
  (same name + DOB, or same name + father), are marked *duplicate* and **not** written.
* **मौजूदा अपडेट करें (update)** — matched by member ID. For sheets without IDs, tick **“नाम + जन्म तिथि से मिलान”**:
  a row then matches an existing member with the same name + birth date (or name + mobile / name + father), and **only if
  exactly one** member matches. Otherwise it is skipped as ambiguous. Only changed fields are written. Blank / `N/A` cells
  do **not** erase data unless “खाली सेल से मान मिटाएँ” is ticked. Unmatched rows are skipped unless “create new” is ticked.
* Typical yearly workflow with the community sheet: upload the updated sheet in **create** mode to add newcomers (people
  already present are reported as duplicates and skipped). Then upload it in **update** mode with name + birth-date matching to
  apply changed mobiles or blood groups. Alternatively, export CSV from the portal (it includes Member IDs) and edit that.
* Names are never used as identity. Two rows with the same ID in one file are both rejected (ambiguous).
* Nothing is deleted by an import. After an update import, an optional, separately confirmed **reconcile** step can
  *deactivate* (not delete) active members missing from the file — you must type the count to confirm.
* Every row gets a status (new / update / unchanged / invalid / duplicate / skipped) with row numbers and field-level
  reasons; “त्रुटि रिपोर्ट (CSV)” downloads them for correction.
* **Idempotent:** the import ID is the SHA-256 of the file + mode, and generated member IDs derive from it, so retrying
  after a network failure never creates duplicates.

### Publishing

Imports and manual edits change only the private `members` collection. **Member directory → Publish** validates every
active record, requires the publication-permission confirmation (see [V2_DATA_POLICY.md](V2_DATA_POLICY.md)) and
publishes **one snapshot per district**: per district it uploads the chunks, then switches `districts/{district}` in one
write. Unchanged districts are skipped; members without a district are not published (the dialog lists them). A phone
keeps its previous snapshot until a complete, checksum-verified new version of its own district is stored.

The spreadsheet may have a **District** column (`District`, `जिला`, `जिल्हा`; names such as *Sangli*, *सांगली*,
*Aurangabad* → Chhatrapati Sambhajinagar are recognised, unknown names are row errors) or use the import's
**Default district**. Importing never gives anyone access to the app.

## 6. Emergency contacts, occasions, ads & notices

Each is edited as a **draft** (`drafts/*`, invisible to the app) → **validated** → **preview** (list of changes) → **publish**.

* Emergency: exactly 4 community contacts, police/ambulance/fire, exactly 4 hospitals. An entry appears in the app only if it is
  *active* with a name and a valid number. Directions appear only for an `https://` map link. Bundled defaults
  (112/100, 108, 101) are in `src/data/emergency/services.json` with status **needs-confirmation** — confirm them with the
  Sangli district police / health department, then mark *सत्यापित* in the portal (or the JSON) with source and date.
* Occasions: per year, starting from the bundled list. Published occasions replace the bundled ones for that year; tithis,
  paksha, sunrise etc. always come from the bundled, generated calendar and cannot be changed here. Tick “सत्यापित” only
  after checking against a trusted panchang. Reminders on devices are re-planned automatically (deterministic IDs → no duplicates).
* Ads & notices: title/description (hi/en), optional `https://` image (≈1280×640, <150 KB), link (tel / WhatsApp / mailto /
  https), start/end date, order, active.

## 6a. Birthday & anniversary wishes (posters)

**Birthday & anniversary wishes** lists everyone with a birthday or wedding anniversary on the chosen date (all
organisations or one). **Create poster** draws a 1080×1350 greeting poster in the browser: the member's photo, name,
the greeting in Hindi and English, and the organisation name. Only the photo and name change between members. Options:
name in Hindi or English, show the age or the years married, a custom message, and the organisation name (remembered in
that browser).

Sending:
* **Phone (recommended):** open the portal on your phone and tap **Share to WhatsApp groups…**. The share sheet opens;
  pick WhatsApp, then tick one or several community groups. The poster and message are sent together.
* **Computer:** **Copy image**, then press one of the saved **Open “group”** buttons (WhatsApp Web/Desktop) and paste.
  Group invite links (`https://chat.whatsapp.com/…`) are saved once under "Add community WhatsApp groups". They are
  stored privately in `drafts/whatsappGroups`.
* **Message <name> on WhatsApp** opens a personal chat with that member and the greeting text.

WhatsApp offers no public way for an app or website to post into a group automatically. Every send needs one tap
by the admin. This also means no WhatsApp Business account or paid API is needed.

## 6b. Public holidays

Occasions with `holiday: true` are shown in red in the app. The fixed national/Maharashtra holidays are in
`src/data/occasions/recurring.json`: Republic Day, Shivaji Jayanti, Ambedkar Jayanti, Maharashtra Day, Independence Day,
Gandhi Jayanti, Christmas. Festival holidays are generated from `scripts/festival-rules.json`: Mahashivratri, Holi,
Gudi Padwa, Ram Navami, Mahavir Jayanti, Buddha Purnima, Ganesh Chaturthi, Dussehra, Diwali, Balipratipada,
Guru Nanak Jayanti, and Good Friday (computed from Easter).
Holidays that depend on moon sighting (Ramzan Eid, Bakri Eid, Muharram, Id-e-Milad) and Parsi New Year are added each year
under **Calendar occasions → New occasion** with **Public holiday** ticked. Check the year's official RBI / Maharashtra
holiday notification and adjust.

## 7. Versioning, rollback and recovery

* Every publication gets `version = publish time (ms)` and is logged in `publications`.
* **Rollback:** History → “Re-publish this version”. Directory: the newest 3 chunk sets per district are retained (the
  districts changed by that publication are switched back); small datasets store their full payload in the log, so any
  logged version can be restored.
* **Backups:** Spark has no managed export. Download **CSV निर्यात** (all members incl. inactive + internal notes) after each
  significant change and store it securely offline. It can be re-imported in update mode.
* App side: a failed/partial download never replaces the cached snapshot; corrupt cache files fall back to the previous slot.

## 8. Costs (estimates — check current pricing before relying on them)

Spark plan free quotas (Firestore, per project, at the time of writing): ~50,000 document reads/day, 20,000 writes/day,
20,000 deletes/day, 1 GiB storage; Hosting 10 GB storage / ~360 MB per day transfer. On Spark, exceeding a quota makes
requests fail until the daily reset — it does **not** create charges.

| Activity | Reads/writes |
| --- | --- |
| App launch/resume (≤ every 30 min) | ~3 reads (public version docs); signed-in member +3 (own access record, district version, rule look-up) |
| New district version reaching a member's phone | + 1 read per 400 members of that district (+ rule look-ups) |
| Access request | 1 write |
| Admin opens member list | 1 read per member (+1 rules check per write request) |
| Import of N rows / publish | ~N writes / chunks + 2 writes |

Example: 1,000 users × 3 app opens/day ≈ 12,000 reads/day — well inside the free tier, so the expected recurring cost is
**₹0 on Spark**, comfortably below the ₹1,000/year target. Risks: very large user growth, frequent republishing to many
devices, or upgrading to Blaze without a budget alert. Monitor *Firestore → Usage* weekly after launch. Member-access
costs and the full service/plan table: [MEMBER_ACCESS.md](MEMBER_ACCESS.md) §8.

## 9. Local testing with emulators

```bash
npm run test:rules        # security rules + provisioning + sign-in tests (Firestore + Auth emulators)
# full local stack:
npx firebase-tools@15.34.0 emulators:start --only auth,firestore --project demo-mdc
VITE_FIREBASE_API_KEY=fake VITE_FIREBASE_PROJECT_ID=demo-mdc VITE_FIREBASE_AUTH_DOMAIN=demo-mdc.firebaseapp.com \
  VITE_FIREBASE_APP_ID=1:1:web:1 VITE_USE_FIREBASE_EMULATORS=true npm run admin:dev
VITE_FIREBASE_PROJECT_ID=demo-mdc VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 VITE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run dev
# member accounts on the emulator: FIREBASE_PROJECT_ID=demo-mdc FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
#   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run provision -- --apply
```
Emulator switches are ignored in production builds.
