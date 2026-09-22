import * as Sentry from '@sentry/nextjs';

// See sentry.server.config.ts — same guard, same reasoning. This backend has
// no edge routes today, but Next.js's instrumentation.ts convention loads
// this file for the edge runtime regardless, so it needs the same no-op
// safety when SENTRY_DSN is unset.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    debug: false,
  });
}
