import { NextRequest, NextResponse } from 'next/server';
import { expectedCookieToken, verifyCredentials } from '@/lib/auth';
import { checkRateLimit, clientIp, resetRateLimit } from '@/lib/rateLimit';

const COOKIE = 'lifeos_auth';

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const { allowed } = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.redirect(new URL('/login?locked=1', req.url), { status: 303 });
  }

  const form = await req.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');

  const ok = await verifyCredentials(email, password);
  if (!ok) {
    return NextResponse.redirect(new URL('/login?error=1', req.url), { status: 303 });
  }

  await resetRateLimit(ip);

  const token = await expectedCookieToken();
  const res = NextResponse.redirect(new URL('/', req.url), { status: 303 });
  if (token) {
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}
