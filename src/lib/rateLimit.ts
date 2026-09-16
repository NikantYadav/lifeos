import { redis } from './redis';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Redis-backed so limits hold across serverless instances, unlike an
 * in-memory counter which resets per cold-start and doesn't share state.
 * Fails open (allowed: true) when Redis isn't configured, matching the rest
 * of the app's degrade-without-Redis behavior.
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  if (!redis) return { allowed: true };

  const key = `lifeos:loginattempts:${identifier}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW_SECONDS);

  if (count > MAX_ATTEMPTS) {
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS };
  }
  return { allowed: true };
}

export async function resetRateLimit(identifier: string): Promise<void> {
  if (!redis) return;
  await redis.del(`lifeos:loginattempts:${identifier}`);
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
