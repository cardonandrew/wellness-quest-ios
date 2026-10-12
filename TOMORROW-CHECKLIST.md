# Wellness Quest — App Store Final Steps Checklist

Everything below needs you (Andrew). I've prepared all the files — they're in `~/workspace/wellness-quest-ios/`.

## What Changed (vs Original Plan)

**This is NOT a web wrapper.** The app is fully self-contained:
- The entire app UI is bundled locally (no server needed)
- All data (tasks, XP, journal, everything) lives in an on-device SQLite database
- Works 100% offline — no internet required after install
- All 10 data functions ported to run natively on the phone

## 1. Create GitHub Repo & Push Files (15 min)
- [ ] Go to github.com → New repository → name it `wellness-quest-ios` → Public or Private (your choice)
- [ ] Push the contents of `~/workspace/wellness-quest-ios/` to the repo
  - **Important:** GitHub will block pushing `.github/workflows/` via API — you'll need to add the workflow file manually through the GitHub web UI or via `git push` from a local clone
  - Files to push: `package.json`, `capacitor.config.js`, `www/`, `ios/`, `scripts/`, `.github/ExportOptions.plist`
  - Add `.github/workflows/ios-testflight.yml` separately through the web UI

## 2. Apple Developer Portal — App ID & Provisioning (20 min)
- [ ] Go to developer.apple.com → Certificates, Identifiers & Profiles
- [ ] **Identifiers** → New → App ID:
  - Description: `Wellness Quest`
  - Bundle ID: `com.andrewcardon.wellnessquest` (Explicit)
  - Capabilities: None needed (no push notifications, no in-app purchase for v1)
- [ ] **Profiles** → New → Distribution → App Store Connect:
  - Select the `com.andrewcardon.wellnessquest` App ID
  - Select your Distribution certificate
  - Name it: `wellnessquest`
  - Download the `.mobileprovision` file

## 3. GitHub Secrets (10 min)
In your `wellness-quest-ios` repo → Settings → Secrets and variables → Actions → New repository secret:
- [ ] `IOS_P12_BASE64` — Same as APTI (your distribution certificate, base64-encoded .p12)
- [ ] `IOS_P12_PASSWORD` — Same as APTI (the .p12 password)
- [ ] `IOS_PROVISIONING_PROFILE_BASE64` — Base64-encode the `wellnessquest.mobileprovision` file you downloaded:
  ```
  base64 -i wellnessquest.mobileprovision | pbcopy
  ```
- [ ] `IOS_PROVISIONING_PROFILE_NAME` — Value: `wellnessquest`
- [ ] `APP_STORE_CONNECT_API_KEY_ID` — Same as APTI
- [ ] `APP_STORE_CONNECT_ISSUER_ID` — Same as APTI

## 4. Trigger the Build (5 min + ~20 min wait)
- [ ] Push any commit to `main` branch (or use Actions → Run workflow)
- [ ] Watch the Actions tab — it will build and upload to TestFlight automatically
- [ ] You'll get an email when the build is ready in TestFlight

## 5. App Store Connect Listing (30 min)
- [ ] Go to appstoreconnect.apple.com → My Apps → New App:
  - Name: `Wellness Quest`
  - Bundle ID: `com.andrewcardon.wellnessquest`
  - SKU: `wellnessquest1`
- [ ] Fill in the listing using `app-store-listing.md` (description, keywords, subtitle)
- [ ] Upload the app icon: `assets/AppIcon-1024.png` (1024×1024)
- [ ] Upload screenshots (see below)
- [ ] Set pricing: Free
- [ ] Privacy Policy URL + Support URL: host `privacy.html` and `support.html` somewhere (GitHub Pages on this repo works — Settings → Pages → deploy from branch; then use the two URLs). Both files are ready to upload as-is.
- [ ] Age rating: 4+
- [ ] Select the TestFlight build → Submit for Review

## 6. Screenshots Needed
App Store requires screenshots for:
- 6.7" iPhone (1290×2796) — iPhone 15 Pro Max
- 6.5" iPhone (1242×2688) — iPhone 11 Pro Max
- 5.5" iPhone (1242×2208) — iPhone 8 Plus (optional but recommended)

I can generate mockup screenshots, or you can take real ones from TestFlight once the build is live. Real screenshots are better for review.

## 7. After Approval
- [ ] Apple reviews (typically 24-48 hours)
- [ ] Once approved, click "Release" in App Store Connect
- [ ] Your app is live! 🎉

---

## Files Ready in ~/workspace/wellness-quest-ios/
| File | Purpose |
|------|---------|
| `assets/AppIcon-1024.png` | 1024px app icon for App Store |
| `privacy-policy.md` | Privacy policy (needs hosting) |
| `app-store-listing.md` | Description, keywords, subtitle |
| `capacitor.config.js` | App config (bundle ID, name, offline) |
| `www/index.html` | Full app UI (1.1MB, bundled locally) |
| `www/native-actions.js` | All 10 data functions ported to on-device SQLite |
| `www/native-bridge.js` | Routes app data calls to local database |
| `ios/` | Full iOS Xcode project |
| `scripts/` | Icon decode script + base64 parts |
| `.github/workflows/ios-testflight.yml` | CI build workflow |
| `.github/ExportOptions.plist` | Export config for TestFlight |

## Secrets You Can Reuse from APTI
- `IOS_P12_BASE64` ✅ (same certificate)
- `IOS_P12_PASSWORD` ✅ (same password)
- `APP_STORE_CONNECT_API_KEY_ID` ✅ (same key)
- `APP_STORE_CONNECT_ISSUER_ID` ✅ (same issuer)

## New Secrets Needed
- `IOS_PROVISIONING_PROFILE_BASE64` (new — for wellnessquest)
- `IOS_PROVISIONING_PROFILE_NAME` = `wellnessquest`
