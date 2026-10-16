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
10. **Upload** the `.aab` to Play Console → Internal testing first, then Production.
    Release notes (Hindi + English) go in the release form.

## Build configuration notes

- `minifyEnabled` + `shrinkResources` are on for release (R8). Capacitor ships its own keep rules.
- `webContentsDebuggingEnabled` is `false`; Capacitor logging is debug-only.
- Release builds are unsigned unless `android/keystore.properties` exists.
- Target SDK 36 / compile SDK 36 (Android 16); min SDK 23 (Android 6). Edge-to-edge is handled by
  `android.adjustMarginsForEdgeToEdge: "force"` in `capacitor.config.json`.
- Android permissions in the merged manifest: `INTERNET` (WebView serving local files; the app makes
  no network requests), `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`. Exact-alarm
  permissions are explicitly removed.
- App ID `com.maheshwaricalendar.app` **cannot change after the first Play upload**. Change it in
  `capacitor.config.json`, `android/app/build.gradle` (`applicationId`, `namespace`) and the Java
  package folder *before* the first upload if a different ID is wanted.

## Upgrading later

The toolchain is pinned to Node-20-compatible versions (Capacitor 7, Vite 6). When the build machine
moves to Node 22+, Capacitor 8 / Vite 7+ can be adopted with `npx cap migrate`.
