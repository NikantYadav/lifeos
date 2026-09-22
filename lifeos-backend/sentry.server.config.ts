import * as Sentry from '@sentry/nextjs';

// Same "unset env var = disabled" convention as lib/ai/gemini.ts's
// isAiEnabled() / lib/monitoring.ts's isSentryEnabled(): skip init() entirely
// rather than calling it with dsn: undefined, so there's no ambiguity about
// whether the SDK is quietly active with no destination. SENTRY_DSN is blank
// in .env.local.example until a human creates a real Sentry project.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    // Keep this false until a real DSN exists and we've deliberately
    // decided we want verbose SDK logs; noisy by default otherwise.
    debug: false,
  });
}
