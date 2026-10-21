# Member Access — Sign-in, IT Head Approval, District Privacy

Audience: the IT Head (who approves members and runs provisioning) and the developer maintaining the app.

The **calendar, occasions, emergency contacts and notices stay public** and work without signing in. The
**member directory and birthdays/anniversaries** are shown only to members the IT Head approved, and only for the
**one district** assigned to them. Everything runs on the free **Firebase Spark** plan.

## 1. How it fits together

```
 Member's phone (app)                         Firestore (Security Rules decide)            IT Head
 ───────────────────                          ─────────────────────────────────            ───────
 "पहुँच का अनुरोध" form  ── create ──────────▶ accessRequests/{phone}  (no read-back)
                                                                     ◀─ review ── Admin portal → Member access
                                               memberAccess/{p<phone>} ◀─ approve + district ─┘
                                               { status, district }       (admins only)
                                                                     ◀─ read ──── provisioning script (local, Admin SDK)
 Firebase Auth  ◀──────────────────────────────────────── create/enable/disable account ─────┘
   ▲ phone + password (synthetic id)
 Sign in ─ ID token ─▶ memberAccess/{own uid}   (own record only)
                    ─▶ districts/{district}      (only if approved for exactly this district)
                       districts/{district}/chunks/*
```

Data never published anywhere public: master records, internal notes, access requests, access decisions.

## 2. Sign-in: phone number → synthetic identifier

Members type only their **mobile number and password**. They are never asked for an email address.

| Step | Example |
| --- | --- |
| Typed | `+91 98765-43210`, `098765 43210`, `९८७६५४३२१०` … |
| Normalised (`normalizeIndianMobile`) | `9876543210` — strips spaces, `-`, `()`, `+91` / `91` / leading `0`, converts Devanagari digits; must be 10 digits starting 6–9 |
| Firebase Auth sign-in id (`syntheticEmail`) | `9876543210@maharashtrapradheshmaheshwariyuvasanghatan.invalid` |
| Firebase Auth UID (`uidForPhone`) | `p9876543210` |

All three live in one file, `src/shared/phoneIdentity.js`, used by the app, the portal and the provisioning script, so
every format of a number maps to the same account (no duplicates).

**Domain.** The proposed `maharashtrapradheshmaheshwariyuvasanghatan.com` was checked on 2026-10-21 and is **not
registered** (no RDAP record, no DNS). If anyone registered it later, they could receive mail sent to these
addresses. With the owner's agreement the reserved top-level domain **`.invalid`** (RFC 2606/6761) is used instead.
It can never be registered and never receives mail. **Changing `AUTH_DOMAIN` later orphans every account.**

**Limits of the synthetic id:**
- It does **not** prove that the person owns the phone number. No SMS is sent (no SMS OTP on Spark). Ownership and
  membership are checked by the IT Head **before** approving (§3).
- It cannot receive email, so Firebase "forgot password" emails are **not** used for members (see §5).

**Firebase acceptance.** The Auth emulator accepts the `.invalid` address (tested). Before the first real member is
provisioned, create one test account in the production project, sign in with it and delete it. This needs the owner's
approval, because it touches production.

**Session.** After sign-in the app keeps Firebase's refresh token in app-private storage. Android cloud backup is
disabled for the app (`allowBackup="false"`). The member stays signed in across launches, and the 1-hour ID token is
refreshed automatically. Passwords are never stored by the app or written to Firestore.

**Errors and throttling.** Any credential problem shows one generic message: wrong password, unknown number or
disabled account alike, so the screen never reveals whether a number has an account. After 5 failed attempts the form
locks on that device for 30 s, then 1, 2, 4 … up to 15 minutes. Firebase also throttles failed attempts on its servers
(`TOO_MANY_ATTEMPTS_TRY_LATER`). In Firebase console → Authentication → Settings, keep **Email enumeration
protection** on and **User actions → Enable create (sign-up)** off, so nobody can create accounts through the public API.

## 3. Requests and approval (IT Head only)

1. In the app, *माहेश्वरी परिवार → नए सदस्य? पहुँच का अनुरोध करें*: the person enters their name, mobile, district and,
   optionally, father's name, city, organisation and membership details. No account is needed. The request is stored as
   `accessRequests/{10-digit number}` with status `pending`. Security Rules validate every field, force `pending` and
   the server time, and do not let anyone read requests back. A number can have only one request. It can be re-submitted
   only after the IT Head marks it "info requested".
2. Portal → **Member access** shows open requests with **match indicators**: whether the phone number matches a directory
   record, whether the name matches, and whether the district matches. **A match is never approval.**
3. Verify the person through the agreed process: call the number, or confirm with a known office-bearer. Then:
   - **Approve…**: choose the district they may see (and optionally link their directory record). This writes
     `memberAccess/p<phone>` = `{ status: 'approved', district }` plus an audit entry.
   - **Request info…**: marks the request; contact the person by WhatsApp or phone. They cannot read the message in the app.
   - **Reject…** or **Delete**.
4. **Provision the sign-in** on the IT Head computer (§4). Until then the member cannot sign in.
5. Tell the member they can sign in with their mobile number and the organisation's existing password pattern.

Other actions under *Members with access*: **Revoke…**, **Restore…**, **District…** (change), and *Grant access without
a request*. Every decision is written to `accessAudit` (append-only; who, when, what; no passwords).

Only administrators (`admins/{uid}` with `active: true`, editable only in the Firebase console) can do any of this.
There are no district representatives or other roles. Members can never write `memberAccess`, so they cannot approve
themselves, change their district or map their account to another number. **Excel imports never grant access.**

## 4. Provisioning script (local, Spark-compatible)

Accounts are created by `scripts/provision-members.mjs` with the Firebase Admin SDK. It runs **only on the IT Head's
computer**, never in the app, the browser or a server. That is why no Cloud Functions or Blaze plan are needed.

**One-time setup**
1. Firebase console → Project settings → Service accounts → *Generate new private key*. Save the JSON **outside**
   this folder, e.g. `C:\secure\mdc-service-account.json`. Never email, share or commit it; the script refuses keys
   inside the repository. Anyone holding this file has full control of the project. Delete it from that computer when
   it is no longer needed, and revoke old keys in Google Cloud console → IAM → Service accounts.
2. Copy `scripts/password-pattern.example.mjs` to `scripts/local/password-pattern.mjs` (the folder is git-ignored) and
   implement the organisation's **existing** password pattern in `passwordFor(member)`, unchanged. It receives
   `{ phone, name, memberId, district, member }`; `member` is the linked directory record, if any. The pattern
   is not in the repository.

**Each time after approving / revoking in the portal** (PowerShell):
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\mdc-service-account.json"
$env:FIREBASE_PROJECT_ID = "<your project id>"
npm run provision                 # dry run: lists what would change
npm run provision -- --apply      # does it
```

What it does, for every `memberAccess` record:

| Access record | Account | Action |
| --- | --- | --- |
| approved | missing | create: UID `p<phone>`, synthetic id, password from the pattern hook |
| approved | disabled | enable |
| revoked | enabled | disable + revoke refresh tokens (the phone is signed out at its next sync) |
| — (none) | member-style account `p<phone>` | disable (orphan) |

- **Approval is verified:** only `memberAccess` records written by an admin count. Requests and imported members never
  create accounts.
- **No duplicates / safe retries:** the UID is deterministic. Running the script again changes nothing, and a run that
  failed half-way can simply be repeated. An existing account with the same sign-in id but another UID is reported as a
  **conflict** and left alone for the IT Head to resolve in the Firebase console.
- Results appear in the portal (*Sign-in account*: ready / awaiting provisioning / failed). They are also appended
  to `scripts/local/provisioning-log.jsonl` (git-ignored) with **masked numbers only and never passwords**.

## 5. Password recovery (no email possible)

1. The member contacts the IT Head (phone or in person). **Verify their identity** through the agreed process (for
   example a call to the registered number plus a known detail, or confirmation by a known office-bearer). Never act on
   a message from a different number alone.
2. On the IT Head computer: `npm run provision -- --reset 98XXXXXXXX` (dry run), then add `--apply`. This sets the
   password back to the pattern value and signs out the member's other devices.
3. Tell the member to sign in again.

If the pattern value itself is compromised (others know it), the account should be revoked rather than reset, because
the frozen pattern would produce the same password again. See §9.

## 6. District directory and sync

- The portal publishes **one snapshot per district** (`districts/{id}` meta + 400-member chunks). Members without a
  district are not published and are listed as a warning. Unchanged districts are skipped, and a district that becomes
  empty gets an empty snapshot so phones drop the old list.
- On launch, on resume (at most every 30 minutes) and on manual refresh, a signed-in phone:
  1. refreshes its ID token. If Firebase refuses it (account disabled or deleted), the phone signs out and deletes the
     directory.
  2. reads its own `memberAccess`. If it is not approved or is revoked, the directory is deleted from the phone.
  3. checks the district. If it changed, the old district's copy is deleted.
  4. reads only that district's version document. If the version is unchanged, nothing is downloaded. If it changed,
     the phone downloads the chunks, verifies the schema, record count, IDs and checksum, then swaps the copy
     atomically (two-slot store). A failed or partial download keeps the last good copy.
- Search, filters, birthdays and anniversaries work **offline** from that copy.

**Offline limitation (important).** A phone that is completely offline cannot learn that access was revoked. It keeps
showing its last downloaded district copy until it connects again, and only then deletes it. Revocation does **not**
instantly erase data from a disconnected phone. Two safeguards:
- the server refuses every new request immediately after revocation, even with a still-valid sign-in;
- if a phone has not confirmed its access online for **30 days**, the app hides the copy until it can check again.

Anything a person copied, photographed or shared while they had access cannot be recalled by any software.

## 7. Birthdays and anniversaries

They are computed on the phone from the protected district copy only. There is no separate dataset, no endpoint and no
extra Firestore reads. Signed-out, pending, rejected and revoked users have no copy, so the calendar shows no
birthdays/anniversaries and the directory tab shows the sign-in screen. Invalid or missing dates are skipped. The
celebration lists show day and month; the member detail sheet shows what the organisation publishes for that district
(see V2_DATA_POLICY.md to minimise fields such as the full date of birth).

## 8. Costs and Firebase plan

| Service | Status | Needs Blaze / billing? | Notes |
| --- | --- | --- | --- |
| Cloud Firestore | already used | No | Spark quotas (check the console; at the time of writing ~50k reads, 20k writes, 20k deletes per day, 1 GiB). Exceeding them blocks requests until the daily reset; on Spark it never charges. |
| Firebase Authentication, Email/Password | already used (admins), now also members | No | Email/password sign-in is free on Spark. **Not used:** phone/SMS auth (SMS is billed, Blaze only). |
| Firebase Hosting (admin portal) | already used | No | 10 GB storage / ~360 MB/day transfer on Spark. |
| Security Rules | already used | No | Rule look-ups (`get`/`exists`) count as document reads. |
| Firebase Admin SDK (local script) | **new** | No | A library that talks to the same Auth/Firestore APIs; it runs on the IT Head computer. A service-account key is free. |
| Cloud Functions / Cloud Run | **not used** | Yes (Blaze) | Not needed: provisioning is done by the local script. |
| Firebase Cloud Messaging (instant push) | **not used** | FCM itself is free, but *sending* needs a trusted server or Functions | Admin notices therefore reach phones at their next sync (MINOR_UI_CHANGES.md, Change 3). |
| App Check (Play Integrity) | not used (optional hardening) | No | Could limit access-request spam to the genuine app; not enabled to keep setup simple. |

Rough reads per signed-in member sync: ~6 (3 public version documents, own access record, district version + one rule
look-up). A new district version costs about +1 read per 400 members of that district (+ rule look-ups). Example:
3,000 members × 2 app opens/day ≈ 36,000 reads/day, below the ~50,000 Spark limit but not by a wide margin. If usage
grows, the first lever is to make the launch sync follow the 30-minute throttle too. Watch *Firestore → Usage* after launch.

## 9. Limitations and risks (read before launch)

1. **Predictable passwords.** If the organisation's pattern derives passwords from details other members know (name,
   number, date of birth), anyone who knows those details can sign in as that member and see their district. This is the
   largest remaining risk. The pattern is frozen by the owner's instruction and was not changed. Mitigations available
   without changing it: revoke quickly, keep throttling on, and watch the audit trail. Changing to individual passwords
   would be the real fix.
2. **No phone ownership proof** (no SMS on Spark). It rests on the IT Head's verification (§3).
3. **Offline copies** (§6) and screenshots cannot be recalled.
4. **Access requests are public writes.** Rules restrict shape and size and allow one per number, but a determined
   person could submit many fake requests and use up write quota (20k/day). Mitigations: delete junk in the portal;
   optionally enable App Check.
5. **Old app versions** (with the earlier public directory) keep their cached list until updated. The new rules stop
   them from downloading anything new. After all districts are published, use *Members → Remove old public directory*.
6. **Admin portal = full access.** Protect admin accounts (strong unique passwords; few admins).
7. **Firebase acceptance of `.invalid`** in production is still to be confirmed with one test account (§2).

## 10. Migration and rollback

Order (needs the owner's go-ahead; nothing here has been deployed):
1. Set every member's **District** (Members → Edit, or re-import with a District column / default district).
2. Deploy rules + portal: `npm run admin:deploy`. From this moment the old public directory is no longer readable by
   the public, so existing app versions keep only their cached copy.
3. Members → **Publish** (creates `districts/*`). Then *Remove old public directory*.
4. Release the new app version (RELEASE.md). On first start it deletes any public directory cached by older versions.
5. Approve members (§3) and provision accounts (§4).

**Rollback:** redeploy the previous `firestore.rules` and portal from git (`git checkout <previous tag> -- firestore.rules
admin/` then `npm run admin:deploy`), and re-publish with the old portal. District snapshots can be rolled back
individually in *History* (last 3 versions per district). Auth accounts can be disabled in bulk by revoking access and
running the script, or deleted in the Firebase console.

## 11. Testing

`npm run test` (unit: identity mapping, sign-in client, throttling, session persistence, district sync, revocation,
celebrations, import) and `npm run test:rules` (emulators: Security Rules for every collection, provisioning script,
real phone + password sign-in, protected reads with real tokens). Both need no cloud access.
