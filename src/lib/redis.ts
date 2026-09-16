import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Null when credentials are absent, rather than throwing at module load:
 * a missing .env.local should degrade to a clear 503 from /api/state, not
 * crash the route on import and take local dev down with it.
 */
export const redis = url && token ? new Redis({ url, token }) : null;

export const STATE_KEY = 'lifeos:v1';

/** Rotating backups of the previous few writes, newest first. */
export const BACKUP_KEY = 'lifeos:v1:backups';
export const BACKUP_DEPTH = 20;
