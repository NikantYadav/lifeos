# LifeOS → Public App: Roadmap

_As of 2026-09-21_

## 1. Where LifeOS stands today

LifeOS is a Next.js PWA, single user, single Redis blob, single shared password.
It already has real bones worth keeping: a typed `AppState`, a validated
`/api/state` endpoint with conflict detection and rotating backups, an existing
AI-powered "Sunday Review" (Gemini reads the week's data and proposes structured
diffs the user accepts/edits/rejects), and push notifications. That review
pipeline — context builder → LLM → typed diff → accept/edit/reject — is the
reusable pattern for everything AI-driven below.

Three decisions made tonight change the shape of this project significantly from
"add multi-tenancy to the existing app" to "rebuild the client, generalize the
backend, and make onboarding AI-authored":

1. **Client becomes React Native / Expo**, not a wrapped version of the existing
   Next.js UI. The current `src/app`/`src/components` React code is not reused
   directly — it's the reference implementation for what the RN screens need to do,
   not code that ports over.
2. **Onboarding is a conversation, not a form.** A new user talks to an AI chatbot
   about their goals, and the AI — not the user, not a wizard UI — writes their
   timetable, plans, and decides what custom trackers they need and what fields
   each one has. This means the tracker schema itself is AI-authored per user, not
   picked from a fixed list.
3. **Daily tracking is numeric-first, not just checkboxes**, and every missed
   target needs a reason (quick category + optional free text) that feeds back into
   the AI's reasoning.

These three decisions mean Phase 0 is no longer "port the existing schema to
Supabase" — it's "design a schema that can hold an AI's arbitrary output safely."
That's the hardest and most important part of this whole project, and where most
of the design thinking below is spent.

---

## 2. Phase 0 — The data model: safely holding AI-authored schemas

The core tension: the AI needs freedom to invent a tracker shaped however a user's
goals demand ("pages read", "cold approaches made", "mood 1–5 + note", "meditation
minutes"), but the app still needs to generically render, chart, validate, and
let its own AI review logic reason over *any* tracker it or a past session created.
The fix is a **fixed envelope with an AI-authored field list inside it** — the AI
never invents a new *kind* of storage, only new *fields* within kinds you define.

**Tracker envelope (fixed, code-defined):**

```
trackers
  id, user_id, name, description
  kind: 'checkbox' | 'numeric' | 'counter' | 'timed' | 'scale' | 'log'
  unit          -- e.g. "hours", "reps", "pages" (numeric/counter/timed only)
  target        -- optional daily/weekly target, drives "missed" detection
  cadence       -- daily | weekly | custom days-of-week
  fields        -- JSONB: AI-authored EXTRA fields for 'log' kind only (see below)
  plan_id       -- optional link to the goal/plan this tracker serves
  created_by    -- 'ai_onboarding' | 'ai_review' | 'user', for auditability
  archived_at
```

Five of the six `kind`s (`checkbox`, `numeric`, `counter`, `timed`, `scale`) are
fixed shapes with predictable columns on their entries — this covers the vast
majority of what any user's goals will need (study hours = numeric, approaches
made = counter, meditation = timed, mood = scale). The AI's job for these is just
to pick the kind, name it, set a unit/target — not invent structure.

**The one AI-schema-authoring kind is `log`:** free-form structured notes (e.g. a
workout log with sets/reps/weight per exercise, or a dating-approach-style log with
custom fields). Here the AI *does* write a field schema, stored as JSON:

```
fields: [
  { "key": "location", "type": "text", "label": "Where" },
  { "key": "outcome", "type": "select", "label": "Outcome", "options": ["good","meh","bad"] },
  { "key": "duration_min", "type": "number", "label": "Minutes" }
]
```

**Validation is mandatory and server-side, not optional:**
- A strict JSON Schema (or Zod schema) validates any AI-proposed `fields` array
  before it's stored — allowed `type`s only (`text`/`number`/`select`/`boolean`/
  `date`), max field count (e.g. 12), max option count per select, no nested
  objects, key names restricted to `[a-z_][a-z0-9_]*`.
- Every `log` entry's `data` JSONB is validated against its tracker's stored
  `fields` schema at write time — reject entries with unknown keys or wrong types,
  same as validating a normal form submission.
- Treat AI-generated schema output exactly like user input: never trust it, never
  `eval` it, never let it control anything beyond field rendering (it must never be
  able to specify a raw SQL type, a component name, or anything executable).

**Entries table (works for every kind uniformly):**

```
tracker_entries
  id, tracker_id, user_id, date
  value          -- numeric: the number; checkbox: 0/1; counter: integer; timed: seconds; scale: integer
  data           -- JSONB, log kind only, validated against tracker.fields
  note           -- free text, always available regardless of kind
  missed         -- boolean, derived: true if target set and value/completion fell short
  miss_category  -- enum, only set when missed=true (see Phase 3)
  miss_note      -- free text, optional, only when missed=true
  created_at
```

One entries table for every tracker kind keeps queries, charts, and the AI review
context builder generic — it never needs to branch on tracker kind to read history,
only to render it.

**Rest of the schema**, same as before but every table gets `user_id` + RLS:

- `profiles` (display name, plan start date, timezone, onboarding status)
- `plans` (the AI-authored goals, replacing the fixed `Plan[]`)
- `schedule_blocks` (AI-authored timetable, replacing the fixed `schedule`)
- `tasks`, `habits`, `milestone_checks`, `reviews` — same shape as today, generic
  already, just gain `user_id`
- `onboarding_sessions` — the chat transcript + the diff of what got created from
  it, kept for the user to review/undo and for you to debug bad AI output
- Every table: `user_id uuid references auth.users not null`, RLS policy
  `user_id = auth.uid()` for all operations. This is the real security boundary —
  never rely on API-route logic alone to keep users' data apart.
- Keep `rev`/`updated_at` optimistic-concurrency columns, same pattern as today's
  `/api/state`.

**Migration:** your own current data (the approach log, weight entries, fixed plan)
becomes the first seed under your own account — approach log → a `log`-kind
tracker with an AI-shaped-but-hand-written field schema matching what
`Person`/`Approach` already look like; weight → a `numeric` tracker.

---

## 3. Phase 1 — Auth & backend API

- **Supabase Auth**: email/password or magic link first, Google OAuth as a
  fast-follow. Replaces `LIFEOS_PASSWORD` + `src/proxy.ts` entirely.
- **Backend role for the Next.js app**: once the client is React Native, the
  Next.js app's job is to be the API layer for **every** data operation, not just
  the AI endpoints. **Locked decision (superseding an earlier draft of this
  section): the RN app never holds the Supabase service-role key and never calls
  `.from(...)` on a `public.*` table directly** — it only uses the Supabase client
  for Auth (sign up/in, token refresh) with the anon/publishable key, which is
  safe to embed on-device. All CRUD (trackers, entries, plans, tasks, habits,
  schedule) goes through Next.js API routes that verify the caller's Supabase JWT
  server-side and query with the service-role key, scoped by the verified user id
  in application code — see `lifeos-backend/src/lib/apiRoute.ts`'s `withApi`
  wrapper, which every data route is built on. RLS (`user_id = auth.uid()` on
  every table) stays on as defense-in-depth, but it is never the only gate, and a
  direct-from-RN-to-Supabase write path (skipping this backend) is intentionally
  not something to build — see the `lifeos-public-app-direction` memory and the
  comments in `supabaseAdmin.ts`/`supabase.ts` in both repos for the full
  reasoning.
- Every data route (not just the AI ones) is built with `withApi`, which makes
  auth + entitlement checks opt-out rather than opt-in — a new route can't ship
  ungated by accident. The AI endpoints (onboarding chat, daily check-in, weekly
  review) additionally need a server-side Gemini API key and Phase 0's
  schema-validation layer (`lib/validation/*.ts`), which also only lives here,
  never on the client.

---

## 4. Phase 2 — AI-driven onboarding

This is now the core of "first run," not a side feature.

- **Chat flow:** a conversational screen (RN) where the AI asks about the user's
  goals, current routine, and constraints — a handful of turns, not an
  open-ended interview.
- **Structured extraction step:** once the chat has enough signal, a
  server-side call asks the model to emit a structured proposal: plans/goals,
  schedule blocks, and a list of trackers (kind + name + unit + target for the five
  fixed kinds; kind + fields for any `log` tracker) — as JSON matching a strict
  schema, the same discipline the existing Sunday Review already uses for
  `ProposedDiff`.
- **Validate, then preview, then commit:** run the Phase 0 validation on
  everything proposed; show the user a review screen ("here's the plan I built
  from our chat") before writing anything, same accept/edit/reject trust model as
  the existing weekly review — never write AI output straight to the DB unseen.
- **Escape hatch:** always let the user skip the chat and start blank, or hand-edit
  anything the AI proposed before accepting.

---

## 5. Phase 3 — Daily tracking + accountability

- **Logging a day's entries** now means, per tracker: a checkbox tap, a number
  input, a counter increment, a timer, or a 1–5 scale tap — not just done/not-done.
  The RN UI needs one input component per `kind`, generic across every tracker of
  that kind (five components total, not one per tracker).
- **Missed-target detection:** at day/period rollover, any tracker with a `target`
  that wasn't met gets flagged `missed = true` and the UI prompts for a reason
  before the day can be closed out (or the next day, gently, if they didn't log it
  live) — same UX moment as today's `SkipReasonPrompt`, generalized to any
  tracker, not just fixed checks.
- **Reason capture — category + optional free text:**
  - Structured category, extending the existing `SkipReason` enum pattern:
    `tired | too_busy | no_motivation | no_plan | sick | forgot | other`.
  - Optional free-text note for more context.
  - Both are stored on the entry (`miss_category`/`miss_note`) and feed directly
    into the AI review context — this is exactly the `skipReasons` array the
    existing `reviewContext.ts` already assembles, just sourced from generic
    tracker entries instead of one hardcoded check list.
- **Daily AI check-in / nudge:** a lighter-weight sibling to the weekly Sunday
  Review — a short daily message (push notification) that references *why* the
  user missed things recently ("you've said 'too busy' three days running on study
  hours — want to lower the target or move the time block?"), generated from the
  same context-builder pattern, never writing to state without going through the
  same accept/edit/reject flow.

---

## 6. Phase 4 — React Native / Expo client build

- **Expo managed workflow** — fastest path to a real installable Android app with
  OTA updates, and iOS later from the same codebase for free.
- **Screens to build** (mapped from the existing panels, but note kind/fields are
  now dynamic, not fixed): onboarding chat, today view (dynamic tracker entry
  list), plans/goals, timetable, trackers management (add/edit/archive), weekly
  review, settings.
- **State/data layer:** `@supabase/supabase-js` client with RLS doing the security
  work; React Query (or Expo's recommended data layer) for caching/sync, replacing
  `useAppState.ts`'s hand-rolled fetch/save/conflict logic — Supabase's realtime
  subscriptions can also replace a chunk of the manual conflict-detection code
  from the old `/api/state`.
- **Push notifications:** Expo's push service replaces the current
  web-push/VAPID setup (`push.ts`, `usePush.ts`) — different API, same concept
  (daily nudge, weekly review ready).
- **Auth:** Supabase Auth's RN/Expo SDK, with secure token storage
  (`expo-secure-store`) instead of the current httpOnly cookie approach.

---

## 7. Phase 5 — Play Store packaging (proper native app, not TWA)

- **EAS Build config now exists** (`eas.json`, as of 2026-09-22, three
  profiles: development/preview/production) — this is a genuine native
  Android build config, not a wrapped web view. **Still can't actually run
  a build**: needs a real EAS account + `projectId`, three EAS
  `environment`s created and populated with the Supabase URL/anon key/API
  base URL, and `expo-dev-client` installed for the development profile.
  App icon/adaptive-icon/splash config in `app.json` is correctly wired at
  the right sizes, but the images themselves are still Expo's own
  `create-expo` scaffold artwork, not LifeOS branding — real branded
  artwork at five exact sizes is needed before this ships. Splash screen
  specifically isn't wired at all yet (needs the `expo-splash-screen`
  plugin, which currently can't be installed in this project — `npx expo
  install` is broken on a pre-existing peer-dependency conflict, root
  cause not yet diagnosed; this will block adding any new dependency to
  `lifeos-frontend`, not just this one).
- Play Console developer account (one-time $25), app icons/screenshots, **privacy
  policy** (non-negotiable here — you're collecting personal habit/behavior data
  and sending user-authored text to an AI provider; the Data Safety form needs to
  say so accurately), Data Safety questionnaire, content rating questionnaire.
- Internal testing track first (instant, no review wait) before production
  submission (production review can take days) — use internal testing to dogfood
  with a few real accounts before the public listing goes live.

---

## 8. Phase 6 — Hardening before public launch

- **Account deletion is now BUILT** (as of 2026-09-22): `POST
  /api/account/delete` (entitlement-exempt, confirmed FK-cascade-delete
  via direct `pg_constraint` query across all 11 `user_id`-bearing
  tables), a Settings UI confirm-and-delete flow, and a static
  `docs/account-deletion.html` public-web-URL page satisfying the other
  half of Google's requirement. Live-verified end to end against the real
  Supabase project. **Still open before Play Console submission**: the
  static HTML page needs real hosting at a stable public URL (not done —
  a deployment decision, out of scope for the page itself). Its contact
  email is now resolved (`nikantyadav16@gmail.com`, same value used
  across all `docs/` files as of 2026-09-22).
- **Data export is now BUILT** (as of 2026-09-22): `GET /api/account/export`
  returns every row the authenticated user owns across all 11 tables,
  paginated per table to avoid PostgREST row-cap truncation, plus an
  "Export my data" button in Settings (shares the JSON via React Native's
  `Share` API). Live-verified end to end including an IDOR disjointness
  check between two users.
- **RevenueCat webhook receiver now exists** (as of 2026-09-22, `POST
  /api/webhooks/revenuecat`) — this closes only the server-side receiving
  half of billing. No real RevenueCat account exists yet, and the client-
  side purchase flow (the RN app calling `Purchases.logIn`/making a
  purchase) is still entirely unbuilt, so nothing actually triggers this
  webhook in practice today. Handles INITIAL_PURCHASE/RENEWAL/
  CANCELLATION/UNCANCELLATION/EXPIRATION/BILLING_ISSUE against the
  existing `subscriptions` table, static-shared-secret auth (verified live
  against real DB entitlement logic). RevenueCat also documents a newer
  HMAC-signature scheme as their current recommendation — not implemented,
  worth revisiting once a real account exists.
- **Rate limiting & AI cost ceiling.** Daily check-in and weekly review already
  have DB-level once-per-day/week generation guards (migration 008). **Onboarding
  now also has a hard cap** (as of 2026-09-22, migrations 009/010): a real
  unbounded-spend loop was found and closed — `skip` followed by a new chat
  message previously created a fresh session with a fresh 40-turn budget every
  time, with no lifetime limit. Now capped at 5 lifetime onboarding sessions per
  user (`profiles.onboarding_sessions_started_count`, enforced race-free inside
  one SQL function), bounding worst-case lifetime Gemini calls per user at
  5 × 40 = 200. **The frontend now shows a clean message for this cap** (as of
  2026-09-22, eleventh session) instead of generic error text. Still open: no
  per-user daily/monthly cross-feature cost ceiling exists yet (each feature's
  cap is independent), and no request-level rate limiting (e.g. per-IP) exists
  at all. **The `MAX_TOKENS` truncation flake is now fixed** (as of 2026-09-22,
  twelfth session): `maxOutputTokens` raised 8000→16000 in `lib/ai/gemini.ts`
  after live-reproducing the truncation first, shared by `checkin/generate`,
  `review/generate`, and onboarding's extraction call.
- **profiles.timezone is now actually used, AND actually set from the
  client** (as of 2026-09-22, twelfth session — closing a gap flagged across
  five prior sessions). Daily check-in's and weekly review's 7-day lookback
  *context* windows, and the `tracker-entries` POST fallback for a missing
  `entry_date`, compute the user's local calendar day via `lib/time.ts`
  (DST-safe, `Intl.DateTimeFormat`-based) instead of server UTC (eleventh
  session). **The once-per-day/week *generation guards* are now ALSO
  local-timezone-aware** (twelfth session, migration
  `011_reviews_local_day_week_generation_guards`): `reviews` gained plain
  `local_day`/`local_week` date columns, written explicitly by
  `checkin/generate`/`review/generate` via `lib/time.ts`'s
  `todayInTimeZone`/`weekStartInTimeZone`, with new partial unique indexes
  keyed on those columns replacing migration 008's UTC-instant-keyed ones —
  generation now rolls over at the user's local midnight, not UTC's. `PATCH
  /api/me` sets `profiles.timezone` (validated via a live
  `Intl.DateTimeFormat` construction); the RN client now calls it too
  (twelfth session: `lifeos-frontend/src/lib/me.ts`'s `syncDeviceTimezone()`,
  fired on Settings-screen mount, only PATCHes on an actual mismatch). Known
  residual gap: a user who never opens Settings stays at `'UTC'` — closing
  that needs the same sync wired into `useSession` too, not done yet.
- **Schema-validation is your main attack surface now.** Because the AI writes
  tracker field schemas, fuzz/adversarially test the validation layer from Phase 0
  specifically — a malicious or jailbroken chat session trying to get invalid
  `fields` JSON persisted is the novel risk this architecture introduces that the
  old single-user app never had. **A real adversarial pass was run on
  2026-09-22 (eleventh session)** against `lib/validation/trackers.ts` and
  `validateEntryDataAgainstFields`, live against the real API and DB, and found
  2 real bugs (both fixed): explicit `null` in a log-field's `data` bypassed
  app-level validation and hit a raw Postgres 500 (now a clean 400 — note this
  is a client-facing semantic change, clearing a field now requires omitting
  its key, not setting it to `null`), and calendar-invalid dates
  (`"2026-13-40"`) passed regex-shape checks but failed the DB's
  `pg_jsonschema` date format, another live 500 (now caught by a proper
  calendar-validity check). Everything else tested — field-key regex bypasses,
  count/option boundaries, type confusion, `.strict()`/prototype-pollution
  attempts, forging `created_by` via the user-facing route, a live IDOR check,
  and the onboarding-commit path's reuse of the same schema — was already
  correctly rejected. **Both residual risks are now fixed** (as of 2026-09-22,
  same-day follow-up, per direct user decisions): editing a log tracker's
  field `type` via `PATCH /api/trackers/[id]` now returns 409
  `cannot_change_field_type_with_existing_entries` whenever any entry already
  exists for that tracker (archive + create a new tracker is the path once
  entries exist) — live-verified allowed-before/blocked-after/label-still-
  editable. And migration `012_tighten_trackers_fields_db_constraint` closed
  the DB/Zod lockstep gap: the `pg_jsonschema` CHECK now enforces label
  `minLength`, "select needs ≥1 option," and "options only on select" via
  JSON Schema `if`/`then`/`else` (verified against a temp table, then the real
  table); duplicate field keys — which JSON Schema can't express as a
  cross-item constraint — are caught by a new `trackers_fields_unique_keys`
  trigger instead. `lib/validation/trackers.ts`'s docblock now accurately
  claims lockstep with three DB-side guards, not falsely with two.
- **Privacy policy + Terms of Service**, written to actually reflect what's
  collected (personal goals, daily behavior data, chat transcripts sent to an AI
  provider) — required for Play Store and owed to real users. Drafts exist at
  `docs/privacy-policy.md`, `docs/terms-of-service.md`,
  `docs/data-safety-questionnaire.md`. Two placeholders were resolved with real
  decisions on 2026-09-22: **contact email is `nikantyadav16@gmail.com`**, and
  **the Gemini API key is confirmed still on Google AI Studio's free tier**
  (whose terms permit Google to review/use submitted content to improve its own
  products — the privacy policy now states this plainly instead of as a TBD).
  Still placeholder, needing a real (human) decision: legal name, jurisdiction,
  data retention period, Supabase hosting region, publish date.
- **Once-per-day/week AI-generation guards now HAVE DB-level enforcement**
  (as of 2026-09-22): migration `008_reviews_generation_guard_unique_indexes`
  added two partial unique indexes on `reviews` — one per user per UTC day
  for `daily_checkin`, one per user per UTC-Monday-start week for `weekly`.
  Both `(generated_at AT TIME ZONE 'UTC')::date` and `date_trunc('week',
  generated_at AT TIME ZONE 'UTC')` were confirmed live to be accepted
  directly as unique-index expressions — no generated column was needed for
  either, reversing an earlier assumption in this document. Both
  `/generate` routes now map the resulting 23505 to the same clean 409
  they already returned for the check-then-insert case, live-verified with
  a real forced concurrent-request race for both routes. This is a real
  cap now, not just a cost nudge.
- **Monitoring/error tracking**: **backend half now BUILT** (as of 2026-09-22,
  twelfth session) — `@sentry/nextjs` wired into `lifeos-backend` via
  `instrumentation.ts` + server/edge configs, fail-safe when `SENTRY_DSN` is
  unset (same no-op convention as `lib/ai/gemini.ts`'s `isAiEnabled()`),
  surfaced through `lib/apiRoute.ts`'s shared error handler so every route's
  unhandled errors get captured without per-route wiring. **No real Sentry
  project/DSN exists yet — fully wired but inert until a human creates one**
  (see the human-action list). Expo client-side monitoring still not
  installed — was blocked by the `npx expo install` breakage (see below,
  now fixed) but not itself built this session.
- **`npx expo install` (any new `lifeos-frontend` dependency) is now FIXED**
  (as of 2026-09-22, twelfth session) — root cause was an unpinned transitive
  `react-dom` peer dependency resolving ahead of this project's pinned
  `react` version; fixed with a 3-line `overrides` pin in `package.json`,
  verified via before/after module counts (no more of the silent
  build-time-package-drop risk the old `--legacy-peer-deps` workaround had).
  This was blocking `expo-splash-screen`, `expo-dev-client`, a Sentry client
  SDK, and the RevenueCat SDK — none of those four are built yet, only the
  gate preventing them from being added is now clear.
- **Backups**: Supabase's point-in-time recovery likely covers this; confirm it's
  enabled rather than porting the old 20-backup rotation logic.

---

## 9. Suggested sequencing

This is a multi-week project now, not a multi-night one — the React Native rewrite
and the AI-schema-authoring onboarding are each substantial on their own. Realistic
pacing:

- **Night 1 (tonight):** Phase 0 — lock the tracker envelope + validation schema
  design (the JSON Schema/Zod rules for AI-authored `fields`), stand up the
  Supabase project and tables with RLS, migrate your own data in.
- **Night 2–3:** Phase 1 (Supabase Auth wired in) + start of Phase 2's structured
  extraction endpoint (chat → validated proposal), tested via a plain API call
  before any RN UI exists.
- **Night 4–6:** Phase 4 — scaffold the Expo app, build the today-view + tracker
  components against the real Supabase backend.
- **Night 7+:** onboarding chat UI, daily check-in/nudge, weekly review port,
  then Phase 5 packaging once there's something worth submitting.

**The single highest-leverage thing to lock in tonight:** the tracker envelope and
its validation rules (Phase 0, section above). Every other phase — the RN UI, the
AI onboarding, the accountability nudges — is written against whatever shape you
pick here, and it's the piece most expensive to change once real AI-generated user
data exists on top of it.
