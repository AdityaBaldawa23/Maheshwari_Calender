# Release Process (Google Play)

Requirements: Node ≥ 20.18, JDK 21, Android SDK Platform 36 + Build-Tools 36, Android Studio (optional).

## One-time: create the upload key

Google Play uses **Play App Signing**: you sign uploads with an *upload key*, Google re-signs for users.

```bash
mkdir release-keys
keytool -genkeypair -v -keystore release-keys/maheshwari-calendar-upload.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
cp android/keystore.properties.example android/keystore.properties   # then fill in the passwords
```

`release-keys/`, `*.jks` and `android/keystore.properties` are git-ignored. **Back up the keystore and
passwords somewhere safe** (password manager + offline copy). Losing them means contacting Google to
reset the upload key.

## Every release

0. **Environment** — `.env.local` must contain the production `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_API_KEY`
   (see [V2_ADMIN.md](V2_ADMIN.md)); otherwise the app builds without directory/emergency/content sync.
   Run `npm run test:rules` and deploy rules (`npm run admin:deploy`) before shipping an app that depends on them.

1. **Update calendar data** — see [DATA_GUIDE.md](DATA_GUIDE.md). Verify against a trusted panchang and
   set `"verified": true`.
2. **Validate** — `npm run validate-data -- --strict` (no errors, no warnings).
3. **Test** — `npm run test` and `npm run lint`.
4. **Bump the version** — in `android/app/build.gradle` increase `versionCode` (integer, must always go
   up: 1, 2, 3 …) and set `versionName` (e.g. `1.1.0`); set the same `version` in `package.json`.
5. **Build the web app** — `npm run build`.
6. **Sync Capacitor** — `npx cap sync android`.
7. **Build the signed AAB**
   ```bash
   cd android
   ./gradlew clean bundleRelease          # Windows: gradlew.bat clean bundleRelease
   ```
   Output: `android/app/build/outputs/bundle/release/app-release.aab`.
   (Or Android Studio → *Build → Generate Signed App Bundle*.)
8. **Verify version and signature**
   ```bash
   keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab   # shows your upload cert
   ```
   and check versionCode/versionName in Play Console after upload.
9. **Test the release build on a real phone** (ideally Android 8, 13 and 15/16):
   ```bash
   ./gradlew assembleRelease
   adb install -r app/build/outputs/apk/release/app-release.apk
   ```
   Check with **airplane mode on**: app opens, today is correct, months navigate, date details open,
   back page shows, reminders can be enabled (permission dialog appears once), a test reminder fires
   (temporarily set the reminder time a few minutes ahead on a day with an occasion), Android back
   button behaves, no layout clipping.
   Then **online** (member access, docs/MEMBER_ACCESS.md): the loader shows both logos and "Developed by iKRA Studio";
   the directory tab asks only for mobile number + password; an access request can be sent; a provisioned test member
   signs in, sees only their district, stays signed in after closing the app; after revoking that member in the portal,
   pull-refresh removes the directory; a pop-up notice published from the portal appears once.
10. **Upload** the `.aab` to Play Console → Internal testing first, then Production.
    Release notes (Hindi + English) go in the release form.

## Build configuration notes

- `minifyEnabled` + `shrinkResources` are on for release (R8). Capacitor ships its own keep rules.
- `webContentsDebuggingEnabled` is `false`; Capacitor logging is debug-only.
- Release builds are unsigned unless `android/keystore.properties` exists.
- Target SDK 36 / compile SDK 36 (Android 16); min SDK 23 (Android 6). Edge-to-edge is handled by
  `android.adjustMarginsForEdgeToEdge: "force"` in `capacitor.config.json`.
- Android permissions in the merged manifest: `INTERNET` (read-only download of published Firestore
  data; CSP allows only firestore.googleapis.com + https ad images), `POST_NOTIFICATIONS`,
  `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`. Exact-alarm and storage permissions are not requested.
- App ID `com.maheshwaricalendar.app` **cannot change after the first Play upload**. Change it in
  `capacitor.config.json`, `android/app/build.gradle` (`applicationId`, `namespace`) and the Java
  package folder *before* the first upload if a different ID is wanted.

## iOS (Apple App Store) — requires a Mac

Not set up in this repository (it cannot be built or verified on Windows). On macOS with Xcode 16+:

```bash
npm i -E @capacitor/ios@7.6.9
npx cap add ios && npm run build && npx cap sync ios && npx cap open ios
```

Then in Xcode: set the bundle ID (`com.maheshwaricalendar.app`), team/signing, app icon (from `resources/`), and
display name; Local Notifications needs no extra entitlement for local reminders. Test on a device (airplane mode
too), then archive and upload with Xcode → Organizer. App Store review will ask about the public directory. Reuse
the privacy text and consent policy.

## Upgrading later

The toolchain is pinned to Node-20-compatible versions (Capacitor 7, Vite 6). When the build machine
moves to Node 22+, Capacitor 8 / Vite 7+ can be adopted with `npx cap migrate`.
