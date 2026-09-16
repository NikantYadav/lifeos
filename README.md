# Life OS

A six-month personal operating plan and daily tracker — schedule, plans, weekly scorecard,
social funnel, approach log, body/weight tracking, and phase overview.

Migrated from a single static `lifeos.html` file into a Next.js (App Router) app.

## Stack

- Next.js 16 (App Router, TypeScript)
- Plain CSS (ported 1:1 from the original design, no Tailwind), with a dark theme
- Vercel KV (Upstash Redis) for persistence — one JSON blob holding all app state
  (days, people, approaches, weights), read/written through `/api/state`

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up Redis credentials (see below), either in `.env.local` or by running
   `vercel env pull .env.local` once the project is linked and KV is attached.

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

Without Redis credentials the app still renders; `/api/state` returns a 503 and
edits are kept in memory only.

## Access control

The state blob holds an approach log, named contacts and weight history, so a
public deployment should not be world-readable.

Set `LIFEOS_PASSWORD` and every route — including `/api/state` — is gated by
`src/proxy.ts`. Visit `https://your-app/?pw=YOUR_PASSWORD` once; the password is
exchanged for a year-long `httpOnly` cookie and stripped from the URL. Requests
to `/api/*` without the cookie get a 401 instead of the login page.

Leave the variable unset (the local default) and the app is open, as before.

## Persistence: Vercel KV (Upstash Redis)

All state (checkboxes, counters, people, approach log, weight entries) is stored
as a single JSON document in Redis under the key `lifeos:v1`, via `/api/state`
(`GET`/`PUT`).

Writes are guarded in three ways:

- **Validation.** Incoming JSON is coerced into a known shape (`src/lib/validate.ts`)
  before it is stored, so a malformed request cannot replace the document with
  garbage. Unparseable rows are dropped rather than failing the whole write.
- **Conflict detection.** Every save carries a `rev`. A `PUT` built on a stale
  read gets a `409` plus the current state, which the client adopts instead of
  overwriting — so two open tabs no longer clobber each other.
- **Backups.** The previous 20 documents are kept in the `lifeos:v1:backups`
  list, so a bad write is recoverable.

To wire this up:

1. In the [Vercel dashboard](https://vercel.com/dashboard), open this project → **Storage**
   → **Create Database** → **Upstash** → **Redis** (this is what's labeled "Vercel KV").
2. Connect it to this project. Vercel automatically injects `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` into your Production/Preview/Development environments.
3. For local dev, pull those into `.env.local`:

   ```bash
   vercel env pull .env.local
   ```

   Or copy `.env.local.example` to `.env.local` and fill in the values from the
   Upstash console.

There is a single shared state document — this app is built for one person's
personal dashboard, gated by one password rather than real multi-user auth.

## Dates

Day keys are **local** calendar dates (`YYYY-MM-DD`), never `toISOString()`,
which would roll the key back a day east of UTC and split anything logged
after midnight across two days. All date handling goes through `src/lib/dates.ts`.

Plan weeks are Monday-aligned and counted from the Monday of the week containing
`START`, so `currentWeekIndex` and `weekDates` always agree about where a week
begins. The clock ticks once a minute (`src/lib/useNow.ts`), so an app left open
overnight rolls over to the new day on its own.

## Deploying to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. [Import the project into Vercel](https://vercel.com/new).
3. Attach a Vercel KV (Upstash Redis) database as described above **before** the first
   deploy, or add it afterward and redeploy — `/api/state` returns 503 until the
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars are present.
4. Set `LIFEOS_PASSWORD` in the project's environment variables.
5. Deploy. No other configuration is required.

## Project structure

- `src/lib/data.ts` — all static content (weekly timetable, plans, phases, etc.)
- `src/lib/types.ts` — shared types for the persisted app state, plus `newId()`
- `src/lib/dates.ts` — local-date and week-index helpers
- `src/lib/score.ts` — weekly totals and scorecard percentage (shared by the
  hero chart and the Scorecard tab, so the two cannot drift)
- `src/lib/validate.ts` — structural validation/coercion for state over the wire
- `src/lib/markup.ts` — renders the `<b>`-only markup in the plan copy
- `src/lib/redis.ts` — Redis client (null when unconfigured)
- `src/lib/useAppState.ts` — client hook: loads, debounce-saves, refetches on
  focus, and resolves write conflicts
- `src/lib/useNow.ts` — shared once-a-minute clock
- `src/proxy.ts` — password gate
- `src/app/api/state/route.ts` — `GET`/`PUT` route handler backing the hook above
- `src/components/` — one component per tab, plus shared `Hero`/`Nav`/`SchedList`
