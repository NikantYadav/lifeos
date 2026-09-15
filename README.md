# Life OS

A six-month personal operating plan and daily tracker — schedule, plans, weekly scorecard,
social funnel, approach log, side quests, body/weight tracking, and phase overview.

Migrated from a single static `lifeos.html` file into a Next.js (App Router) app.

## Stack

- Next.js 16 (App Router, TypeScript)
- Plain CSS (ported 1:1 from the original design, no Tailwind)
- Vercel KV (Upstash Redis) for persistence — one JSON blob holding all app state
  (days, people, approaches, weights, quests), read/written through `/api/state`

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

## Persistence: Vercel KV (Upstash Redis)

All state (checkboxes, counters, people, approach log, quests, weight entries) is stored
as a single JSON document in Redis under the key `lifeos:v1`, via `/api/state` (`GET`/`PUT`).

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

There is a single shared state document — this app has no auth/multi-user support, it's
built for one person's personal dashboard.

## Deploying to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. [Import the project into Vercel](https://vercel.com/new).
3. Attach a Vercel KV (Upstash Redis) database as described above **before** the first
   deploy, or add it afterward and redeploy — the app will 500 on `/api/state` until the
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars are present.
4. Deploy. No other configuration is required.

## Project structure

- `src/lib/data.ts` — all static content (weekly timetable, plans, phases, quest ideas, etc.)
- `src/lib/types.ts` — shared TypeScript types for the persisted app state
- `src/lib/dates.ts` — date/week-index helpers
- `src/lib/redis.ts` — Redis client
- `src/lib/useAppState.ts` — client hook: loads state on mount, debounce-saves on change
- `src/app/api/state/route.ts` — `GET`/`PUT` route handler backing the hook above
- `src/components/` — one component per tab, plus shared `Hero`/`Nav`/`SchedList`
