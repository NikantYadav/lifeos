import 'server-only';
import * as Sentry from '@sentry/nextjs';

/**
 * Single choke point for error reporting, same convention as
 * `lib/ai/gemini.ts`'s `isAiEnabled()`: an unset `SENTRY_DSN` (which it will
 * be until a human creates a real Sentry project — see .env.local.example)
 * is a clean "monitoring disabled" state, never a crash and never log noise.
 * Callers never touch the `@sentry/nextjs` SDK directly, so this is also the
 * one place that would need to change if the provider ever changed.
 *
 * `sentry.server.config.ts`/`sentry.edge.config.ts` independently guard
 * their own `Sentry.init()` calls on the same env var (skipping init
 * entirely, not calling it with `dsn: undefined`) — this module's
 * `isSentryEnabled()` mirrors that check so call sites like `apiRoute.ts`
 * can short-circuit before doing any work, and `captureError` double-guards
 * in case it's ever called from somewhere that didn't check first.
 */

export function isSentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

/**
 * Reports an error to Sentry if configured; otherwise a no-op. Never throws
 * — a Sentry SDK failure (network, misconfiguration, whatever) must never
 * turn into a request failure for a real user, so this wraps its own call in
 * try/catch and swallows any error from the reporting path itself.
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!isSentryEnabled()) return;

  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // Reporting failed; nothing to do but not let it affect the request.
  }
}
