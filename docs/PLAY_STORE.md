# Google Play Store Preparation

Nothing is published automatically. This is the material to enter in Play Console.

## App details

| Field | Value |
| --- | --- |
| App name (max 30) | `माहेश्वरी कैलेंडर – पंचांग` |
| Default language | Hindi – hi-IN (add English – en-IN as a second listing if wanted) |
| App or game | App |
| Free or paid | Free |
| Category | **Lifestyle** (alternative: Books & Reference) |
| Tags | Calendar, Religion, Lifestyle |
| Package | `com.maheshwaricalendar.app` |

### Short description (max 80)

- **hi:** `तिथि, पंचांग, त्योहार व माहेश्वरी समाज के अवसर — बिना इंटरनेट, त्योहार स्मरण सहित`
- **en:** `Hindi panchang & festival calendar for the Maheshwari community — works offline`

### Full description (hi)

```
माहेश्वरी कैलेंडर — आपके घर की दीवार वाले पंचांग का डिजिटल रूप, अब आपके फ़ोन में।

✦ आज की तिथि, पक्ष, मास एवं विक्रम संवत
✦ हर दिन की तिथि, सूर्योदय-सूर्यास्त व तिथि समाप्ति का समय
✦ महेश नवमी, गणगौर, तीज, शीतला अष्टमी, करवा चौथ, दीपावली सहित सभी प्रमुख त्योहार
✦ सभी एकादशी व व्रत
✦ त्योहारों का स्मरण — उसी दिन या एक दिन पहले, आपके चुने समय पर
✦ समाज सूचनाएँ
✦ पूरी तरह ऑफ़लाइन — इंटरनेट की आवश्यकता नहीं
✦ कोई खाता नहीं, कोई व्यक्तिगत जानकारी एकत्र नहीं

तिथियाँ उदया तिथि (उज्जैन सूर्योदय) पर आधारित हैं एवं माह पूर्णिमांत पद्धति से दर्शाए गए हैं।
```

### Full description (en)

```
Maheshwari Calendar is the digital version of the traditional printed panchang, made for the
Maheshwari and Marwadi community.

• Today's tithi, paksha, lunar month and Vikram Samvat
• Daily tithi with sunrise, sunset and tithi end time
• Mahesh Navami, Gangaur, Teej, Shitala Ashtami, Karwa Chauth, Diwali and all major festivals
• Every Ekadashi and vrat
• Festival reminders — same day or a day before, at your chosen time
• Community notices
• Works completely offline — no internet needed
• No account, no personal data collected
```

## Graphics (in `docs/play-store/`)

| Asset | Spec | Status |
| --- | --- | --- |
| App icon | 512 × 512 PNG | `icon-512.png` ✓ |
| Feature graphic | 1024 × 500 PNG | `feature-graphic-1024x500.png` ✓ |
| Phone screenshots | 2–8, 1080 × 1920 (9:16) or similar | Capture from a real phone/emulator: (1) calendar with today card, (2) month with festivals, (3) date details sheet, (4) reminder settings, (5) back page. Use a month with a big festival (e.g. Diwali). |

Regenerate icons from `resources/icon-foreground.svg` (background `#7A1F2B`) if the brand changes —
e.g. with `npx @capacitor/assets generate` from a 1024 px PNG export.

## App content declarations

**Privacy policy:** host `docs/PRIVACY_POLICY.md` (filled in) at a public URL.

**Data safety form** — answers that match the V2 code (re-check if features change):

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes — collected, not shared.** *Personal info → Name* and *Phone number* (access request form; also the sign-in id), plus *Other info* (district, optional father's name / city / membership note). Purpose: **Account management** and **App functionality** (verifying membership). Not used for ads or analytics; not shared with third parties (Google Firebase acts as the service provider). Collection is **optional** — the calendar works without it. |
| App activity / identifiers / location / device IDs | Not collected. |
| Is all user data encrypted in transit? | Yes — HTTPS only (Firestore and Firebase Authentication REST). |
| Do you provide a way for users to request data deletion? | **Yes** — by contacting the organisation (privacy policy contact); the IT Head deletes the request / revokes and deletes the account. Signing out deletes the directory copy from the phone. Play requires a deletion route for apps with accounts: publish the contact (or a web form) in the listing and privacy policy. |

The directory shows **personal information about community members** (names, phone numbers, dates of birth, blood
groups). This is not data collected from app users. Google Play's *User Data* / *Personal and Sensitive Information*
policies still require that it is published with permission and that the privacy policy explains it (done in
PRIVACY_POLICY.md). Keep the consent records described in V2_DATA_POLICY.md; reviewers may ask about them.
Admin sign-in happens only in the separate web portal. Members sign in in the app (mobile number + password); the
directory is visible only to approved members of the same district ([MEMBER_ACCESS.md](MEMBER_ACCESS.md)).
**App access for review:** Play reviewers need a working test login — provision a reviewer account (approved for a
test district with dummy data) and enter it under *App content → App access*.

**Ads declaration:** "Does your app contain ads?" — **Yes** once real sponsor ads are on the back
page (they are static, bundled content, no ad SDK). While only the placeholders exist, answer No.

**Content rating (IARC questionnaire):** Category *Reference, News, or Educational* / *Other*; answer
**No** to violence, sexuality, language, controlled substances, gambling, user interaction, sharing
location, and digital purchases. Expected rating: Everyone / 3+.

**Target audience:** 18+ (or 13+). Not designed for children.

**Government app:** No. **Financial features:** None. **Health:** None.

**Permissions:** Notifications (POST_NOTIFICATIONS) for local festival reminders and admin notice pop-ups; INTERNET for
downloading published content and member sign-in.
No exact-alarm, location, camera, contacts, storage or microphone permissions.

## Pre-launch checklist

- [ ] Panchang & occasions verified, `validate-data -- --strict` passes
- [ ] Sample ads replaced or removed
- [ ] Privacy policy URL live
- [ ] versionCode bumped, signed AAB built
- [ ] Tested release APK on a real device in airplane mode (see RELEASE.md step 9)
- [ ] Internal testing track used before production
