import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError, ZodSchema } from 'zod';
import { requireUser, type AuthedUser } from './auth';
import { requireEntitlement } from './entitlement';
import { captureError } from './monitoring';

/**
 * Structural gate for every data route: auth + entitlement are opt-OUT, not
 * opt-in. A route handler written with `withApi` cannot forget
 * `requireUser`/`requireEntitlement` the way a hand-rolled route could —
 * there is no code path that reaches the handler without both having passed
 * (unless `entitlement: false` is explicitly set, for read-only endpoints
 * like /api/me that must work even mid-paywall so the client can render the
 * paywall itself).
 *
 * Also enforces a hard request-body size cap here, once, so no individual
 * route has to remember to guard against a multi-MB payload of free text
 * before it ever reaches JSON.parse/Zod.
 */
const MAX_BODY_BYTES = 64 * 1024; // 64KB — generous for any tracker/entry payload, nowhere near enough to be a cost/DoS lever.

export interface ApiContext<P = undefined> {
  user: AuthedUser;
  params: P;
}

// `RouteParams` matches Next.js 16's route handler second argument, whose
// `params` is a Promise (async dynamic APIs) — e.g. `{ params:
// Promise<{ id: string }> }` for `app/api/trackers/[id]/route.ts`. Routes
// with no dynamic segments pass no second generic and get `params: undefined`.
type RouteParams<P> = P extends undefined ? [] : [{ params: Promise<P> }];

type Handler<P> = (req: NextRequest, ctx: ApiContext<P>) => Promise<NextResponse>;

export function withApi<P = undefined>(
  handler: Handler<P>,
  opts: { entitlement?: boolean } = {}
): (req: NextRequest, ...routeArgs: RouteParams<P>) => Promise<NextResponse> {
  const requireEntitlementCheck = opts.entitlement ?? true;

  return async (req: NextRequest, ...routeArgs: RouteParams<P>) => {
    const user = await requireUser(req);
    if (user instanceof NextResponse) return user;

    if (requireEntitlementCheck) {
      const denied = await requireEntitlement(user.id);
      if (denied) return denied;
    }

    const params = (routeArgs[0] ? await routeArgs[0].params : undefined) as P;

    try {
      return await handler(req, { user, params });
    } catch (err) {
      // Never let a raw thrown error (e.g. a Postgres error with constraint
      // names / schema shape in `.message`) reach the client. Route handlers
      // that want a specific status should return a NextResponse directly
      // instead of throwing; this is the last-resort catch-all.
      console.error('unhandled_api_error', err);
      captureError(err, { route: req.nextUrl.pathname });
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }
  };
}

/** Parses and validates a JSON request body against a Zod schema, with a size cap applied first. */
export async function parseBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse }> {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return { error: NextResponse.json({ error: 'payload_too_large' }, { status: 413 }) };
  }

  let json: unknown;
  try {
    json = raw.length ? JSON.parse(raw) : {};
  } catch {
    return { error: NextResponse.json({ error: 'invalid_json' }, { status: 400 }) };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      error: NextResponse.json(
        { error: 'validation_failed', issues: formatZodIssues(result.error) },
        { status: 400 }
      ),
    };
  }

  return { data: result.data };
}

function formatZodIssues(err: ZodError) {
  // Field paths + messages only — never leak raw values back (a rejected
  // field might contain something the client shouldn't see echoed, and it's
  // needless surface area).
  return err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** Maps a Supabase/Postgres error to a safe, generic response — never forwards `error.message` verbatim. */
export function dbError(context: string, err: { code?: string; message?: string } | null): NextResponse {
  console.error(`db_error:${context}`, err);

  // Postgres unique-violation / check-constraint codes get a slightly more
  // specific (but still generic) response; everything else is a flat 500.
  if (err?.code === '23505') {
    return NextResponse.json({ error: 'conflict' }, { status: 409 });
  }
  if (err?.code === '23514' || err?.code === '23503') {
    return NextResponse.json({ error: 'invalid_reference_or_value' }, { status: 400 });
  }

  // Only the true fallthrough (an unrecognized Postgres error code) is worth
  // reporting — 23505/23514/23503 above are routine, expected application
  // flow (a conflict or a bad reference), not something broke.
  captureError(new Error(`db_error:${context}`), { context, code: err?.code });
  return NextResponse.json({ error: 'internal_error' }, { status: 500 });
}
