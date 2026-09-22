import { apiFetch } from './api';
import type { TrackerField, TrackerKind } from './trackers';

/**
 * Types mirror lifeos-backend's onboarding routes exactly (see
 * lifeos-backend/src/lib/validation/onboarding.ts and
 * src/app/api/onboarding/{route,propose/route,commit/route,skip/route}.ts) —
 * same convention as lib/trackers.ts. Two shapes worth calling out because
 * they're easy to get wrong from memory:
 *
 *  - Plans carry `ref` (a proposal-local string the AI invents to name a
 *    plan within one proposal); every other resource carries `plan_ref`
 *    pointing at one of those `ref`s, never a real `plan_id` — the backend
 *    resolves this at commit time. There is no `plan_id` anywhere in this
 *    file.
 *  - `cadence` reuses the same union both `trackers` and `habits` use
 *    server-side: `{kind:'daily'}` | `{kind:'weekly'}` |
 *    `{kind:'custom', days:number[]}`.
 */

export type Cadence = { kind: 'daily' } | { kind: 'weekly' } | { kind: 'custom'; days: number[] };

export interface ProposedMilestone {
  week: number;
  description: string;
}

export interface ProposedPlan {
  ref: string;
  name: string;
  aim?: string;
  when?: string[];
  where?: string[];
  how?: string[];
  quota?: string[];
  good?: string;
  bad?: string;
  warn?: string;
  ask?: string[];
  milestones?: ProposedMilestone[];
}

export interface ProposedScheduleBlock {
  day_of_week: number; // 0-6
  start_time: string; // HH:MM or HH:MM:SS
  end_time?: string;
  title: string;
  note?: string;
  is_key_block?: boolean;
  plan_ref?: string;
}

export interface ProposedTracker {
  name: string;
  description?: string;
  kind: TrackerKind;
  unit?: string;
  target?: number;
  cadence?: Cadence;
  fields?: TrackerField[];
  plan_ref?: string;
}

export interface ProposedTask {
  title: string;
  detail?: string;
  trigger_week?: number;
  plan_ref?: string;
}

export interface ProposedHabit {
  title: string;
  cadence?: Cadence;
  plan_ref?: string;
}

/**
 * The exact body `POST /api/onboarding/commit` accepts and `.strict()`
 * validates — only these six keys, nothing from the surrounding session row
 * (id/applied/timestamps/etc. are rejected by the backend's `.strict()`).
 */
export interface OnboardingProposal {
  summary: string;
  plans: ProposedPlan[];
  schedule_blocks?: ProposedScheduleBlock[];
  trackers?: ProposedTracker[];
  tasks?: ProposedTask[];
  habits?: ProposedHabit[];
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

// Mirrors lifeos-backend/src/lib/validation/onboarding.ts's `MAX_MESSAGE_CHARS`
// — the backend rejects a longer message with a 400 before it ever reaches
// the model, so the input should cap at the same length rather than let the
// user type past a limit that only bites on send.
export const MAX_MESSAGE_CHARS = 2000;

export interface OnboardingSession {
  id: string;
  user_id: string;
  transcript: ChatTurn[];
  proposed_plan: OnboardingProposal | null;
  applied: boolean;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommitResult {
  plans: { ref: string; id: string }[];
  schedule_blocks: number;
  trackers: number;
  tasks: number;
  habits: number;
  errors: string[];
}

export function getOnboardingSession(): Promise<{ session: OnboardingSession }> {
  return apiFetch('/api/onboarding');
}

export function sendOnboardingMessage(message: string): Promise<{ session: OnboardingSession }> {
  return apiFetch('/api/onboarding', { method: 'POST', body: JSON.stringify({ message }) });
}

export function proposeOnboardingPlan(): Promise<{ session: OnboardingSession }> {
  return apiFetch('/api/onboarding/propose', { method: 'POST' });
}

export function commitOnboardingPlan(proposal: OnboardingProposal): Promise<{ result: CommitResult }> {
  return apiFetch('/api/onboarding/commit', { method: 'POST', body: JSON.stringify(proposal) });
}

export function skipOnboarding(): Promise<{ onboarding_status: string }> {
  return apiFetch('/api/onboarding/skip', { method: 'POST' });
}

/**
 * Drops a plan and everything that pointed at it via `plan_ref` — required
 * before submitting a proposal with a rejected plan, since
 * `onboardingProposalSchema`'s `.superRefine` on the backend rejects any
 * `plan_ref` that doesn't resolve to a plan in the same proposal (a 400 on
 * the whole commit, not just the missing plan). Never mutates its input.
 */
export function removePlanFromProposal(proposal: OnboardingProposal, ref: string): OnboardingProposal {
  return {
    ...proposal,
    plans: proposal.plans.filter((p) => p.ref !== ref),
    schedule_blocks: proposal.schedule_blocks?.filter((b) => b.plan_ref !== ref),
    trackers: proposal.trackers?.filter((t) => t.plan_ref !== ref),
    tasks: proposal.tasks?.filter((t) => t.plan_ref !== ref),
    habits: proposal.habits?.filter((h) => h.plan_ref !== ref),
  };
}
