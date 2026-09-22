import { apiFetch } from './api';

/**
 * Types mirror lifeos-backend's actual response shapes exactly (see
 * src/app/api/trackers/route.ts and src/lib/validation/trackers.ts there) —
 * kept in one place so a backend field rename is a compile error here, not a
 * silent runtime mismatch. `TrackerKind` in particular must stay in sync
 * with the DB CHECK constraint on `trackers.kind` (migration 003) and the
 * Zod enum in lib/validation/trackers.ts.
 */
export type TrackerKind = 'checkbox' | 'numeric' | 'counter' | 'timed' | 'scale' | 'log';

export type MissCategory = 'tired' | 'too_busy' | 'no_motivation' | 'no_plan' | 'sick' | 'forgot' | 'other';

export const MISS_CATEGORIES: MissCategory[] = ['tired', 'too_busy', 'no_motivation', 'no_plan', 'sick', 'forgot', 'other'];

export interface TrackerField {
  key: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'date';
  label: string;
  options?: string[];
}

export interface Tracker {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  kind: TrackerKind;
  unit: string | null;
  target: number | null;
  cadence: { kind: 'daily' | 'weekly' | 'custom'; days?: number[] };
  fields: TrackerField[];
  plan_id: string | null;
  created_by: 'user' | 'ai_onboarding' | 'ai_review';
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrackerEntry {
  id: string;
  tracker_id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  value: number | null;
  data: Record<string, string | number | boolean | null>;
  note: string | null;
  missed: boolean;
  miss_category: MissCategory | null;
  miss_note: string | null;
  is_log_entry: boolean;
  created_at: string;
  updated_at: string;
}

export function listTrackers(): Promise<{ trackers: Tracker[] }> {
  return apiFetch('/api/trackers');
}

export function listEntries(params: { from?: string; to?: string } = {}): Promise<{ entries: TrackerEntry[] }> {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const query = qs.toString();
  return apiFetch(`/api/tracker-entries${query ? `?${query}` : ''}`);
}

export interface LogEntryInput {
  tracker_id: string;
  entry_date?: string;
  value?: number | null;
  data?: Record<string, string | number | boolean | null>;
  note?: string;
  missed?: boolean;
  miss_category?: MissCategory;
  miss_note?: string;
}

export function createEntry(input: LogEntryInput): Promise<{ entry: TrackerEntry }> {
  return apiFetch('/api/tracker-entries', { method: 'POST', body: JSON.stringify(input) });
}

/** Today's date as YYYY-MM-DD in the device's local timezone (not UTC — matches what a user means by "today"). */
export function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
