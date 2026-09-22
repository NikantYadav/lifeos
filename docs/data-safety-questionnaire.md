<!-- DRAFT: needs legal review before production use -->

# Play Console Data Safety Questionnaire — Answer Sheet

_Prepared: 2026-09-22, against LifeOS's actual implemented state as of this
date. This is a transcription aid for the real Google Play Console "Data
safety" form, structured to mirror that form's own sections. Verify every
answer against the live app again immediately before actually submitting —
this snapshot will go stale as soon as billing, account deletion, or crash
reporting are built (see the "Known gaps that block accurate submission"
section at the end)._

<!-- TBD: re-verify this entire document against the live app immediately
     before Play Console submission — do not transcribe from a stale copy. -->

---

## Section A — Data collection and security (top-level questions)

| Question (as Play Console asks it) | Answer | Basis |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | Email (account data), user-generated content (goals/trackers/chat) — see Section B. |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | HTTPS/TLS to Supabase and to the Gemini API in production. (Local dev only, `EXPO_PUBLIC_API_BASE_URL` may point at plain HTTP `10.0.2.2`/LAN IP — this is a dev-only detail, not the production answer, and must not be conflated with it.) |
| Do you provide a way for users to request that their data be deleted? | **No, not yet — currently manual/email-only, not in-app or self-service web-form.** | See Section D. **This is very likely a submission blocker**, not a soft gap — see "Known gaps" below. |
| Is your app's data collection and sharing described accurately in the app's Data safety section? (developer attestation) | **Answer honestly based on this document once billing/deletion/crash-reporting reach the state described here — do not submit this attestation against a stale snapshot.** | — |

---

## Section B — Data types collected

Mirrors the Play Console "Data types" flow: for each category/type, whether
it's collected, whether it's shared (in Play's specific sense — see note
below), and why.

> **Note on "shared" vs "collected."** Play Console defines *sharing* as
> transferring data to a third party, but explicitly **excludes** transfers
> to a service provider that processes data on the developer's behalf under
> the developer's instructions and doesn't use it for the service provider's
> own purposes. Supabase fits that exclusion cleanly (infrastructure
> processor, no independent use of your data). **Google's Gemini API is
> confirmed on the free tier** (see `privacy-policy.md` Section 3.2), where
> Google may use submitted content to improve its own products — Gemini is
> therefore **not** "just a processor" for Play's purposes, and the correct
> answer for chat/user content rows below is **"shared,"** not merely
> "collected." This is now a settled fact for this draft, not a pending
> confirmation.

| Data category | Data type | Collected? | Shared with 3rd party? | Processing purpose | Optional or required | Notes |
|---|---|---|---|---|---|---|
| Personal info | Email address | Yes | No (processed by Supabase as infrastructure provider only) | Account creation, authentication | Required | Stored in Supabase Auth. |
| Personal info | Name | Yes (display name) | No | App functionality (personalization) | Optional | `profiles.display_name`, user-settable. |
| Personal info | User IDs | Yes | No | Account management | Required | Supabase Auth user id (UUID), internal. |
| App activity | App interactions / in-app search history (goals, plans, schedule) | Yes | No (Supabase); **conditionally yes (Gemini)** when AI features process this content — see note above | App functionality; AI-generated suggestions | Required for core features | `plans`, `schedule_blocks`, `tasks`, `habits` tables. |
| App activity | Other user-generated content (tracker entries, free-text notes, miss reasons) | Yes | No (Supabase); **conditionally yes (Gemini)** for AI check-in/onboarding processing — see note above | App functionality (habit tracking); AI-generated check-ins/reviews | Required for core features | `tracker_entries.note`, `.miss_note`, `.miss_category`. |
| App activity | Other user-generated content (onboarding chat transcript) | Yes | **Yes — sent to Google's Gemini API** to generate the conversation and structured proposal; also retained in our own database (not ephemeral) | AI-driven onboarding | Optional (chat has a "skip" escape hatch; blank-slate setup available without it) | `onboarding_sessions.transcript`. See privacy-policy.md Section 2.4/3.2. |
| App activity | AI-generated narratives/suggestions about the user | Yes (generated, not user-submitted, but stored and about the user) | No further sharing beyond the Gemini call that produced it | AI check-ins / (future) weekly review | Required for that feature; feature itself is not optional to disable independently today | `reviews.narrative`, `.pattern`, `.proposed_diffs`. |
| Financial info | Purchase history / payment info | **No** | No | — | — | No billing integration exists. See "Known gaps" below — do not answer "yes" here until RevenueCat/Play Billing is actually wired up. |
| App info and performance | Crash logs | **No** | No | — | — | No crash-reporting SDK (e.g. Sentry) integrated in app or backend as of this draft. |
| App info and performance | Diagnostics / performance data | **No** | No | — | — | Same as above. |
| Device or other IDs | Device ID | **No** | No | — | — | No analytics/ad SDK collects this. |
| Location | Any location data | **No** | No | — | — | Not collected. |
| Photos/videos/audio/files | Any | **No** | No | — | — | Not collected; no camera/mic/gallery access requested. |
| Contacts | Contacts | **No** | No | — | — | Not collected. |
| Health and fitness | Health info | **No (see caveat)** | — | — | — | LifeOS does not collect clinical/medical data. Tracker content set up by a user (e.g. sleep, exercise, mood trackers) is user-defined habit data stored as generic `tracker_entries`, not modeled or declared by us as "Health info" in Play's specific sense. <!-- TBD: if Play's reviewers interpret AI-authored trackers about sleep/exercise/mood as falling under the "Health and fitness" category regardless of how it's stored, this answer needs revisiting — flagging for explicit review, not deciding unilaterally here. --> |

---

## Section C — Data usage and handling (per-type detail Play asks for)

For each type marked "Collected: Yes" above, Play's form additionally asks:

| Question | Answer applies to | Answer |
|---|---|---|
| Is this data collected, shared, or both? | Email, name, user ID, plans/schedule content, tracker content | Collected. Processed by Supabase as an infrastructure provider (not "shared" under Play's definition). |
| Is this data collected, shared, or both? | Onboarding chat transcript, check-in-relevant tracker summaries sent to Gemini | **Shared** (pending the tier confirmation noted above) — transmitted to Google's Gemini API, which may process it beyond pure infrastructure hosting depending on API tier. |
| Is this data processed ephemerally? | Onboarding chat transcript | **No** — persisted in `onboarding_sessions.transcript` in our database, not only transiently sent to Gemini and discarded. |
| Is this data processed ephemerally? | Tracker entries / plans / schedule sent to Gemini for a check-in | Effectively no for the underlying source data (it's the same persisted `tracker_entries` used elsewhere in the app); the AI's own *output* (narrative/diffs) is also persisted in `reviews`, not ephemeral. |
| Is data collection required or optional (can the user opt out and still use the app)? | Email | Required — cannot create an account without it. |
| Is data collection required or optional? | Onboarding chat transcript | Optional — the onboarding flow has a "skip" path that avoids the AI chat entirely. |
| Is data collection required or optional? | Tracker entries / miss reasons | Required for the app's core function (tracking), but individual fields (free-text note, miss note) are optional per entry. |
| Why is the data collected (Play's fixed purpose list: App functionality / Analytics / Developer communications / Advertising or marketing / Fraud prevention/security/compliance / Personalization / Account management)? | Email | Account management, App functionality |
| Why is the data collected? | Plans/trackers/chat content | App functionality, Personalization (AI-generated suggestions) |
| Why is the data collected? | Any of the above | **Not** Analytics, **not** Advertising or marketing — no such use exists. |

---

## Section D — Account and data deletion

Play Console requires, for any app that supports account creation, that the
developer state (a) whether users can request deletion of their account and
associated data, and (b) provide **both** an in-app deletion path **and** a
publicly accessible web URL for deletion requests, referenced from the Play
Store listing.

| Requirement | Current state | Answer to give in Play Console today |
|---|---|---|
| In-app account deletion | **Implemented** (as of 2026-09-22): `POST /api/account/delete` in `lifeos-backend` (entitlement-exempt, requires `{confirm: true}`, FK-cascade-delete confirmed via direct `pg_constraint` query across all 11 `user_id`-bearing tables) plus a "Delete account" button with a native confirm dialog in `lifeos-frontend`'s Settings screen. Live-verified end to end (real signup, real data, real delete, zero rows confirmed after). | Yes |
| Web URL for deletion requests | **Page exists, not yet hosted.** A static `docs/account-deletion.html` page satisfies the content requirement but is not yet deployed at a stable public URL — still needed before Play Console submission. | Not yet — pending hosting |
| Manual deletion available on request | Superseded by the in-app path above; still available as a fallback via direct Supabase admin action if needed. | N/A |

**Updated flag**: the in-app half of this requirement is done. The remaining
blocker is narrower than before — get `docs/account-deletion.html` hosted at
a stable public URL and linked from the Play Store listing before
submission.

---

## Section E — Data export

Not a distinct required question on the standard Data Safety form (export is
more of a GDPR/CCPA data-portability obligation than a Play-specific one),
but included here since it's the same class of gap as deletion:

| Requirement | Current state |
|---|---|
| Self-service data export (in-app or web) | **Implemented** (as of 2026-09-22): `GET /api/account/export` in `lifeos-backend` (entitlement-exempt, returns every row the authenticated user owns across all 11 tables, paginated per table to avoid PostgREST row-cap truncation) plus an "Export my data" button in `lifeos-frontend`'s Settings screen (shares the JSON via React Native's `Share` API). Live-verified end to end, including a real IDOR disjointness check between two users. |
| Manual export on request | Superseded by the in-app path above; still available as a fallback if needed. |

---

## Known gaps that block accurate submission (do not paper over these)

1. **Account deletion is built** (Section D), but its public web deletion-
   request URL is not yet hosted anywhere — that's the remaining blocker,
   narrower than before.
2. **Gemini API tier is confirmed: still Google AI Studio's free tier** (as
   of 2026-09-22). This means the correct answer throughout Section B/C is
   "shared," not "processor, not shared" — the privacy policy has been
   updated to state this plainly rather than leaving it as a TBD.
3. **A RevenueCat webhook now exists** (`POST /api/webhooks/revenuecat`,
   built 2026-09-22) but no real RevenueCat account/billing flow is live yet
   — the Financial info row in Section B should stay "No" until an actual
   purchase flow ships and money changes hands, even though the webhook
   plumbing is now in place.
4. **Crash reporting is unbuilt** — if Sentry (or similar) is added before
   submission, the "App info and performance" row needs to flip to "Yes" and
   describe what's collected (typically device/OS/app-version + crash
   stack, not user content).
5. **Supabase region is unconfirmed** in this draft (see privacy-policy.md
   Section 3.1) — doesn't change the Data Safety form directly, but is worth
   resolving before submission since Play's form does ask about data
   storage location in some flows.

This document should be regenerated/re-checked against the app's real state
at the time of actual Play Console submission, not transcribed as-is if any
of the above have changed since 2026-09-22.
