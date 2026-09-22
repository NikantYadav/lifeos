# LifeOS: Steps to Test and Publish

This is a beginner-friendly checklist. Do the steps roughly in order —
later steps depend on earlier ones. Check items off as you go. If you
get stuck on any step, come back and ask for help with that specific step.

---

## Part 1 — Test what's already built (do this first, costs nothing)

### 1.1 Run the backend locally
- [ ] Open a terminal in `lifeos-backend/`
- [ ] Run `npm install` (only needed once, or after pulling new code)
- [ ] Run `npm run dev` — this starts the API server on `http://localhost:3000`
- [ ] Leave this terminal running

### 1.2 Run the app on an emulator or your phone
- [ ] Open a second terminal in `lifeos-frontend/`
- [ ] Run `npm install` (only needed once)
- [ ] Check `.env.local` in `lifeos-frontend/` — `EXPO_PUBLIC_API_BASE_URL` must point at your backend:
  - Android **emulator**: `http://10.0.2.2:3000`
  - **Physical phone** on the same WiFi: `http://<your-computer's-LAN-IP>:3000` (find it with `ipconfig` on Windows or `ip a` on Linux/Mac)
- [ ] If you change `.env.local`, restart with `npx expo start --clear` (not just `npx expo start`)
- [ ] Run `npx expo start`
- [ ] To test on your **own Android phone**: install the "Expo Go" app from the Play Store, then scan the QR code shown in the terminal
- [ ] To test on an **emulator**: install Android Studio, create a virtual device (Android Studio → Device Manager), start it, then press `a` in the Expo terminal

### 1.3 Click through the app yourself and check these work
- [ ] Sign up as a new user
- [ ] Go through the onboarding chat (talk to the AI, build a plan, accept it)
- [ ] See your trackers appear on the Today screen
- [ ] Log an entry on a tracker (check a box, enter a number, etc.)
- [ ] Try the daily check-in card
- [ ] Try the weekly review (may need a week of data to show anything)
- [ ] Go to Settings → try "Export my data" (should share/download a file)
- [ ] Go to Settings → try "Sign Out"
- [ ] Sign back in → try Settings → "Delete account" (**careful — this permanently deletes the account**, only do this with a throwaway test account)

If anything breaks or looks wrong, note it down — that's real, useful signal before you publish.

---

## Part 2 — Fill in the missing pieces

### 2.1 Legal text (you need to decide these yourself)
Open these three files and replace the placeholders:
- `docs/privacy-policy.md`
- `docs/terms-of-service.md`
- `docs/data-safety-questionnaire.md`

Fill in:
- [ ] `[LifeOS developer legal name]` — your legal name (or business name if you have one)
- [ ] `[contact email]` — already set to `nikantyadav16@gmail.com`, double check it's still correct
- [ ] `[jurisdiction]` — the country/state whose laws govern the app (usually wherever you live)
- [ ] `[date this is published]` — today's date, or whenever you actually publish

> These are draft documents, not reviewed by a lawyer. For a solo hobby app this is normal and common, but know that's the tradeoff you're making.

### 2.2 Host the account-deletion page publicly
Google Play requires a **public web page** describing how users delete their account, even though the in-app button already exists.
- [ ] Take `docs/account-deletion.html` and `docs/privacy-policy.md` (as HTML or a simple hosted page)
- [ ] Put them somewhere public and stable. Easiest free options:
  - GitHub Pages (if you put this repo, or just the `docs/` folder, on GitHub)
  - Netlify or Vercel (drag-and-drop the `docs/` folder, free tier)
- [ ] Note down the final public URLs — you'll need them in the Play Console later

### 2.3 App icon and splash screen (branding)
Right now the app still uses Expo's default placeholder icon — not broken, just not yours.
- [ ] Design or generate these images (any size tool like Figma, Canva, or even asking an AI image generator works):
  - `icon.png` — 1024×1024
  - `android-icon-foreground.png` — 512×512
  - `android-icon-background.png` — 512×512 (solid color or simple background)
  - `android-icon-monochrome.png` — 432×432 (single-color silhouette version)
  - A splash screen image — 1024×1024
- [ ] Replace the existing files in `lifeos-frontend/assets/`
- [ ] Splash screen also needs a config step — ask for help wiring in `expo-splash-screen` when you get here, there's a known dependency-install quirk in this project

### 2.4 Deploy the backend somewhere public
Right now `lifeos-backend` only runs on your own computer. Your phone app in the real world needs a real internet address to talk to.
- [ ] Pick a host — easiest for a Next.js app is **Vercel** (free tier, deploys directly from GitHub)
- [ ] Push `lifeos-backend` to a GitHub repo (if it isn't already)
- [ ] Connect that repo to Vercel and deploy
- [ ] Add your environment variables (Supabase keys, Gemini key, RevenueCat secret) in Vercel's project settings — copy them from `lifeos-backend/.env.local`
- [ ] Once deployed, you'll get a real URL like `https://lifeos-backend.vercel.app`
- [ ] Update `lifeos-frontend`'s production environment (see step 2.6) to point at this URL instead of `localhost`/`10.0.2.2`

### 2.5 Subscriptions / billing (RevenueCat)
The code that *receives* payment events already exists, but nothing sends them yet.
- [ ] Create a free RevenueCat account at revenuecat.com
- [ ] Create a project, add your Android app (package id: `com.lifeos.app`)
- [ ] In Google Play Console (see Part 3), set up a subscription product
- [ ] Connect RevenueCat to your Play Console app (RevenueCat has a setup wizard for this)
- [ ] Copy the webhook secret RevenueCat gives you into your backend's `REVENUECAT_WEBHOOK_SECRET` environment variable (both locally and on Vercel)
- [ ] Install the RevenueCat SDK in `lifeos-frontend` (`npx expo install react-native-purchases`) and wire the "Upgrade" button in `TrialPaywall.tsx` to actually start a purchase — this is real coding work, come back for help on this step specifically

### 2.6 EAS build setup (this turns your code into an installable app)
- [ ] Create a free Expo account at expo.dev
- [ ] In `lifeos-frontend/`, run `npx eas login`
- [ ] Run `npx eas init` — this links the project to your Expo account and writes a real `projectId` into `app.json` (the `owner`/`extra.eas.projectId` fields)
- [ ] Run `npx eas build:configure` if prompted to fill in any remaining defaults in `eas.json`
- [ ] Create the three environments referenced in `eas.json` — easiest via the Expo dashboard (expo.dev → your project → Environment Variables), one each for `development`, `preview`, `production`
- [ ] In each environment, set `EXPO_PUBLIC_API_BASE_URL`:
  - `development`/`preview`: can still point at `10.0.2.2:3000` or your LAN IP if testing locally
  - `production`: your real deployed backend URL from step 2.4
- [ ] Install the dev client: `npx expo install expo-dev-client`

---

## Part 3 — Publish to the Play Store

**Important 2026 change**: Google now requires new developer accounts to complete **identity verification**
(legal name, address, phone, government photo ID) as part of sign-up — budget extra time for this, it's not
instant. Google also now requires every app to go through **closed testing before it can be released publicly**
— you can't skip straight to a public production release like older guides describe. The steps below already
account for this.

### 3.1 Play Console account
- [ ] Go to https://play.google.com/console/signup
- [ ] Pay the one-time $25 registration fee
- [ ] Complete identity verification (legal name, address, phone number, government-issued photo ID) — required for new accounts
- [ ] Fill in your developer profile

### 3.2 Build the real app file
- [ ] Run `npx eas build --profile production --platform android`
- [ ] This produces an `.aab` file (Android App Bundle) — EAS builds it in the cloud, you don't need Android Studio for this part
- [ ] Wait for the build to finish (usually 10-20 minutes), download the `.aab` when ready

### 3.3 Create the app listing in Play Console
- [ ] Create a new app, fill in name/description/category
- [ ] Upload at least 2 screenshots (take these from your emulator/phone testing in Part 1) and a feature graphic
- [ ] Fill in the **Data Safety** section using `docs/data-safety-questionnaire.md` as your answer key — every app must complete this, even ones that collect no data
- [ ] Paste in your privacy policy URL (from step 2.2)
- [ ] Add the account-deletion URL (from step 2.2) wherever Play Console asks for it

### 3.4 Upload to closed/internal testing first (now mandatory, not optional)
- [ ] Go to Testing → Internal testing (or Closed testing)
- [ ] Upload your `.aab` file
- [ ] Add yourself (and, if required, at least a handful of testers — Google's closed-testing requirement can call for a minimum number of opted-in testers over a minimum number of days before a production release is allowed; check the exact current numbers shown in your own Play Console, as this has changed over time)
- [ ] Install it via the testing link on your own phone, confirm it works
- [ ] Let the test run for the number of days Play Console tells you is required

### 3.5 Set up billing products (only possible after step 3.4's upload exists)
Google Play only lets you create subscription products once a build has been uploaded to a testing track — this is why billing setup (step 2.5) has to happen after your first upload, not before.
- [ ] In Play Console → your app → Monetize → Products, create your subscription (set a base plan: billing period, price, renewal type)
- [ ] Finish connecting RevenueCat to this product (step 2.5) now if you haven't already
- [ ] Confirm the subscription product shows as **Active** in Play Console, and that the package name matches `com.lifeos.app` exactly in both Play Console and RevenueCat

### 3.6 Go to production
- [ ] Once your closed/internal test has run long enough and you're happy with it, promote the release to Production in Play Console
- [ ] Submit for review
- [ ] Google reviews it (can take anywhere from a few hours to a few days)

---

## Suggested order if you want a simple path

1. Part 1 (test locally) — do this now, free, no accounts needed
2. 2.1 (legal text) — just needs your input, 10 minutes
3. 2.3 (icon/branding) — needs design decisions, can be simple
4. 2.4 (deploy backend) — needed before anything works "for real"
5. 2.6 (EAS setup) — needed to produce an installable app
6. 2.2 (host deletion page) — quick once backend/hosting is figured out
7. 3.1–3.4 (Play Console account + first closed/internal testing upload)
8. 2.5 + 3.5 (billing) — only possible after step 7's first upload exists; can genuinely come last, you can test/soft-launch without it and add subscriptions before going fully public
9. 3.6 (go to production)

Come back to this file and check items off, or ask for help on any single step — you don't have to do this all in one sitting.
