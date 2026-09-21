import webpush, { PushSubscription as WebPushSubscription } from 'web-push';

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:example@example.com';

/** Mirrors null-when-unconfigured pattern in redis.ts: a missing key pair
 * should degrade to a clear error from the push routes, not crash on import. */
export const pushConfigured = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (pushConfigured) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
}

export const PUSH_SUB_KEY = 'lifeos:v1:push-subscription';

export type StoredPushSubscription = WebPushSubscription;

export interface PushPayload {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

export { webpush };
