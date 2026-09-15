import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error(
    'Missing Redis credentials. Add the Vercel KV (Upstash Redis) integration to this project, ' +
      'or set KV_REST_API_URL / KV_REST_API_TOKEN in your environment.'
  );
}

export const redis = new Redis({ url, token });

export const STATE_KEY = 'lifeos:v1';
