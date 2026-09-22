import * as Sentry from '@sentry/nextjs';

// Next.js instrumentation entry point (stable since v15, see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
// register() runs once per server instance before it accepts requests;
// onRequestError is Next's own hook for uncaught errors during rendering/
// route handling. Both sentry.server.config.ts and sentry.edge.config.ts
// independently no-op when SENTRY_DSN is unset (see those files), so this
// file needs no env check of its own — it's safe to always register.
//
// Note: most API-route errors in this codebase are already caught inside
// lib/apiRoute.ts's withApi wrapper (which logs and returns a clean 500
// before the error would ever reach Next's own error handling), so
// onRequestError alone would miss them. withApi's catch block also calls
// lib/monitoring.ts's captureError directly — see that file — so this
// instrumentation hook is a second net for errors that occur outside
// withApi (e.g. framework-level failures, or a route that isn't wrapped),
// not the primary capture path.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
