import { NextRequest, NextResponse } from 'next/server';
import { isValidCookieToken } from '@/lib/auth';

/**
 * Single-user gate, cookie-only. Credential checking and cookie issuance live
 * in /api/login (a POST body can't be handled cleanly from inside a matcher-
 * gated proxy function) — this just decides pass-through vs redirect/401.
 */

const COOKIE = 'lifeos_auth';

export async function proxy(req: NextRequest) {
  if (!process.env.LIFEOS_EMAIL || !process.env.AUTH_SECRET) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  if (await isValidCookieToken(token)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  // sw.js and the manifest/icons must be reachable unauthenticated: the
  // browser fetches them (and may re-register the worker) outside of any
  // page's cookie-bearing navigation, and a redirect-to-/login response in
  // place of the worker script would break install/push for everyone.
  // api/push/cron is excluded here because it's bearer-secret gated instead
  // (see that route) — a scheduler has no browser session to carry the
  // lifeos_auth cookie this middleware otherwise requires.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|apple-icon\\.png|login|api/login|api/push/cron|sw\\.js|manifest\\.webmanifest|icon.*\\.(?:svg|png)|badge.*\\.png).*)',
  ],
};
