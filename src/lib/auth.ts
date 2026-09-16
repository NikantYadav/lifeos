/**
 * Single-user credential check and cookie-token scheme.
 *
 * AUTH_SECRET must be a value distinct from LIFEOS_PASSWORD: it's the HMAC
 * signing key, and a key must never equal something it's used to authenticate
 * — otherwise a leaked cookie token starts leaking structure about the
 * password it was derived from.
 */

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Buffer.from(sig).toString('base64url');
}

/** Constant-time compare over equal-length HMAC digests. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The cookie value a successful login sets, and every request is checked against. */
export async function expectedCookieToken(): Promise<string | null> {
  const email = process.env.LIFEOS_EMAIL;
  const secret = process.env.AUTH_SECRET;
  if (!email || !secret) return null;
  return hmac(`lifeos-auth:v1:${email}`, secret);
}

export async function isValidCookieToken(token: string | undefined): Promise<boolean> {
  const expected = await expectedCookieToken();
  if (!expected || !token) return false;
  return timingSafeEqual(token, expected);
}

/**
 * Compares submitted credentials against the configured pair via HMAC
 * digests rather than raw strings, so neither side of the compare is a
 * variable-length plaintext value (avoids early-exit length/content timing
 * leaks on the raw compare).
 */
export async function verifyCredentials(email: string, password: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  const expectedEmail = process.env.LIFEOS_EMAIL;
  const expectedPassword = process.env.LIFEOS_PASSWORD;
  if (!secret || !expectedEmail || !expectedPassword) return false;

  const [gotEmail, wantEmail, gotPw, wantPw] = await Promise.all([
    hmac(email, secret + ':email'),
    hmac(expectedEmail, secret + ':email'),
    hmac(password, secret + ':pw'),
    hmac(expectedPassword, secret + ':pw'),
  ]);
  return timingSafeEqual(gotEmail, wantEmail) && timingSafeEqual(gotPw, wantPw);
}
