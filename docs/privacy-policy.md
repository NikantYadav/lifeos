<!-- DRAFT: needs legal review before production use -->

# LifeOS Privacy Policy

_Last updated: [date this is published] — DRAFT, not yet published._

This policy describes what data the LifeOS app ("LifeOS", "we", "us") collects
from you, why, where it's stored, who else can see it, and what control you
have over it. It is written to reflect what the app actually does as of this
draft, not a generic template — see the inline `<!-- TBD -->` notes for the
handful of business decisions (legal entity, contact address, jurisdiction,
retention period) that still need to be made before this can be published.

LifeOS is a personal habit- and goal-tracking app. Its core feature is an
AI-driven onboarding conversation and ongoing AI-generated check-ins that read
your goals and daily tracking data to suggest adjustments. Because of that,
this policy pays particular attention to what gets sent to our AI provider,
Google (Gemini API), and what doesn't.

<!-- TBD: developer/company legal name — this document uses
     [LifeOS developer legal name] as a placeholder throughout -->
<!-- Contact email resolved 2026-09-22: nikantyadav16@gmail.com, used
     consistently throughout. -->
<!-- TBD: governing jurisdiction for data-protection compliance framing
     (e.g. whether GDPR, CCPA, or another regime applies) — this document
     uses [jurisdiction] as a placeholder throughout -->

---

## 1. Who we are

LifeOS is developed and operated by [LifeOS developer legal name], a solo/
independent developer (not yet a registered company at the time of this
draft — <!-- TBD: confirm business/legal structure before publishing -->).
Contact: nikantyadav16@gmail.com.

---

## 2. What data we collect

### 2.1 Account data

- **Email address** — used to create and authenticate your account. Provided
  when you sign up.
- **Password** — never stored by us in plain text or in any form we can read;
  authentication is handled entirely by our backend provider, Supabase Auth,
  which stores a salted hash. Supabase Auth also automatically logs sign-in
  metadata (e.g. timestamp, IP address, user agent) as part of its standard
  authentication audit trail — we do not build features on top of this data
  today, but it exists as part of the auth provider's own logging.
- **Display name and timezone** — optional profile fields you can set.

### 2.2 Goals, plans, and schedule

- **Plans** — the goals you (or the AI, on your behalf and with your review)
  define: a name, an "aim" description, and structured fields describing
  when/where/how you intend to work on it, quotas, and milestones.
- **Schedule blocks** — the timetable entries (day, time, title, notes)
  associated with your plans.
- **Tasks and habits** — discrete to-dos and recurring habits linked to your
  plans, including notes on tasks you drop and why.

### 2.3 Daily tracking data ("trackers")

- **Trackers** — the habit/behavior trackers you use day to day (e.g. a
  numeric "study hours" tracker, a checkbox "workout done" tracker, or a
  free-form log with fields the AI defined during onboarding). Each tracker
  has a name, description, target, and — for free-form "log" trackers — a
  field schema that may itself have been authored by the AI based on your
  stated goals.
- **Tracker entries** — your daily logged values against each tracker,
  including:
  - the numeric or free-text value you logged;
  - free-text notes you attach to an entry;
  - whether a target was **missed**, plus, when it was: a **structured miss
    category** (e.g. "tired," "too busy," "no motivation," "forgot," "sick,"
    "other") and an **optional free-text miss reason** you can add.

This daily behavior data — including your miss reasons — is the input the
AI check-in and (future) weekly review features read in order to generate
suggestions. See Section 3.

### 2.4 AI onboarding and check-in conversations

- **Onboarding chat transcript** — when you go through AI-driven onboarding,
  your full conversation (every message you send and every reply the AI
  gives) is stored in our database, associated with your account, so you can
  resume onboarding and so we can debug and improve the feature. This is
  **not** ephemeral — it is retained in our database, not only transmitted
  to the AI provider in the moment.
- **AI-generated proposals** — the structured plan/tracker/habit proposal the
  AI produces from your conversation, before and after you review, edit, or
  reject any part of it.
- **AI check-in narratives** — for the daily check-in feature (and, once
  built, the weekly review), we store the AI-generated narrative text and
  suggested adjustments ("diffs") it produces by reading your recent tracker
  entries and miss reasons, along with whatever you decided to accept, edit,
  or reject.

### 2.5 Subscription/billing data

LifeOS currently offers a **7-day free trial** with no payment collection of
any kind. As of this draft:

- We store a trial start/end date and a status field (`trialing`, `active`,
  `past_due`, `canceled`, `expired`) per account.
- **No payment processor, billing SDK, or in-app purchase flow is integrated
  yet.** There is a disabled "Upgrade" placeholder in the app; tapping it
  does nothing. After a trial expires, the app currently has no way to pay
  and access is simply cut off.
- The database has fields reserved for a future payment provider (Google
  Play Billing or RevenueCat) and a future subscription ID, but these are
  **not populated by any live integration today.**

This section will need a real update once billing is built — see Section 10.

### 2.6 What we do NOT collect

- No location data.
- No contacts, camera roll, microphone, or other device-sensor access.
- No advertising identifiers, and no ad-tracking SDKs.
- No analytics/telemetry SDK is currently integrated (see Section 6 on
  crash/error reporting — none exists yet either).
- No payment card or bank details are collected by us directly (see 2.5).
- No biometric data.
- No government ID or precise health/medical records — while your tracker
  data may relate to habits like sleep, exercise, or mood, LifeOS is not a
  medical device and does not collect clinical health information.

---

## 3. How we use your data, and who we share it with

### 3.1 Supabase (database, authentication) — service provider

All account, goal, tracking, and conversation data described in Section 2 is
stored in a **Supabase** project (Postgres database + Supabase Auth). Supabase
acts as our infrastructure/data-processing provider — it hosts the database
on our behalf and does not use your data for its own purposes.

- Data region: <!-- TBD: confirm and state the Supabase project's hosting
  region here (e.g. "us-east-1") — not established at the time of this
  draft; no tool available in this session could confirm it. -->
- Every table enforces row-level security scoped to your own account, and all
  reads/writes go through our backend API, which independently verifies your
  identity on every request.

### 3.2 Google Gemini API — AI processing

When you use AI-driven onboarding, the daily check-in, or (once built) the
weekly review, the relevant text — your chat messages, and/or a summary of
your recent tracker entries and miss reasons — is sent to **Google's Gemini
API** to generate a conversational reply or a structured suggestion.

<!-- Confirmed 2026-09-22: the Gemini API key this app uses is on Google AI
     Studio's free tier, not a paid/Cloud-billed tier. The paragraph below
     states this as fact, not a TBD. -->

**The API key this app uses is on Google AI Studio's free tier.** Under
Google's standard terms for that tier, content sent to the Gemini API **may
be reviewed by Google (including human reviewers) and used to improve
Google's products and services.** This is different from Google Cloud's paid
Gemini API tier, which carries a commitment that customer content is not
used to train Google's models. Your onboarding chat messages and check-in
data sent to Gemini should be assumed to be reviewable and usable by Google
in this way, in addition to being used to generate your response, until this
app moves to a paid/Cloud-billed tier.

We do not send your raw email or password to Gemini. We do send goal/tracker
text you've written and, where relevant, your free-text notes and miss
reasons, since the AI features are built specifically to reason over that
content.

### 3.3 Other third parties

- **Google Play Billing / RevenueCat** — not yet integrated (see 2.5). Once
  subscription billing is built, this section will be updated to describe
  what billing data is shared with whichever provider we use, and this
  policy will not be represented as final until that update happens.
- We do not sell your data. We do not share your data with data brokers or
  advertisers. We do not share your data with any third party for that
  third party's own marketing purposes.

---

## 4. Data security

- All network traffic between the app and our backend, and between our
  backend and Supabase/Google, uses HTTPS/TLS in production.
- Access to the database is scoped per-user via row-level security policies,
  enforced independently of (not instead of) our backend's own per-request
  identity checks.
- No crash-reporting or analytics SDK is currently integrated in either the
  mobile app or the backend (see Section 6) — this means we currently have
  limited automated visibility into app errors affecting a given user, which
  is a gap we intend to close, not a deliberate privacy choice.

No method of storage or transmission is 100% secure, and we cannot guarantee
absolute security.

---

## 5. Your rights and choices

- **Account deletion**: You can delete your account and all associated data
  yourself, in-app, from Settings — this permanently deletes your account and
  cascades to delete every row associated with it. If you'd rather not use
  the in-app flow, contact us at nikantyadav16@gmail.com and we will do so
  manually.
- **Data export/access**: You can export a copy of all the data we hold about
  you yourself, in-app, from Settings. If you'd rather not use the in-app
  flow, contact us at nikantyadav16@gmail.com and we will provide it
  manually.
- **Correction**: you can edit or delete most of your own data (trackers,
  entries, plans, tasks, habits) directly in the app today, since these
  already have edit/delete affordances in the underlying API.
- **Withdrawing from AI features**: the onboarding chat has a "skip" option
  that lets you set up the app without an AI conversation. There is
  currently no separate opt-out that keeps you using the app while
  disabling the daily check-in specifically — this is a gap, not a
  deliberate design, and is noted here rather than glossed over.

---

## 6. Crash reporting and analytics

**No crash-reporting or analytics tool (e.g. Sentry) is integrated as of this
draft**, in either the mobile app or the backend. The project roadmap calls
for adding one before public launch. When that happens, this policy will be
updated to name the provider and describe what it collects (typically: device
type, OS version, app version, and the technical details of a crash — not
your goal/tracker content) before that version ships.

---

## 7. Children's privacy

LifeOS is not directed at children, and we do not knowingly collect data from
anyone under the age of 13 (or the relevant minimum age in your jurisdiction,
<!-- TBD: confirm applicable minimum age given [jurisdiction] -->). If you
believe a child has provided us with personal data, contact us at [contact
email] and we will delete it.

---

## 8. Data retention

<!-- TBD: real retention-period decision needed. As of this draft, no
     automatic deletion/retention-expiry job exists anywhere in the
     codebase — data (including onboarding transcripts and AI check-in
     narratives) is retained indefinitely until an account is manually
     deleted per Section 5. This should be replaced with an actual policy
     (e.g. "N months after account deletion" or "chat transcripts retained
     for N days") before publishing. -->

---

## 9. International data transfers

Because our infrastructure providers (Supabase, Google) may process or store
data outside of your own country, your data may be transferred
internationally. <!-- TBD: specific transfer-mechanism language (e.g.
Standard Contractual Clauses) depends on [jurisdiction] and is not filled in
here. -->

---

## 10. Changes we expect to make to this policy soon

This is a first draft written against the app's actual state as of this
writing, not aspirational. We expect to update it — not silently, per
Section 11 — when any of the following actually ship:

- A real subscription/billing integration (Section 2.5, 3.3) — a webhook
  receiver now exists server-side, but no live purchase flow or account is
  connected to it yet.
- Crash reporting/analytics (Section 6).
- A move to a paid/Cloud-billed Gemini tier with a no-training commitment,
  if that decision is made (Section 3.2 currently states plainly that the
  free tier is in use today).
- A stated data retention period (Section 8).

---

## 11. Changes to this policy

If we make a material change to this policy, we will update the "Last
updated" date at the top and, where practical, notify you in-app. Continued
use of LifeOS after a change means you accept the updated policy.

---

## 12. Contact

Questions about this policy, or requests regarding your data (including
deletion or export requests, per Section 5): nikantyadav16@gmail.com.
