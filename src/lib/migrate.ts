import {
  SEED_CHECKS,
  SEED_COUNTS,
  SEED_HABITS,
  SEED_PLANS,
  SEED_SCHEDULE,
  SEED_TASKS,
  SEED_WEEK_GOALS,
} from './data';
import { AppState, newId } from './types';

/** Bump when the seed shape in data.ts changes, to re-run migration once more. */
export const CURRENT_SEED_VERSION = 1;

/**
 * Copies data.ts seed defaults into state fields that are still empty, then
 * marks the state as migrated. Never touches days/people/approaches/weights.
 * Idempotent: a state already at CURRENT_SEED_VERSION passes through untouched
 * (returns the same reference), so callers can cheaply check `migrated !== input`.
 */
export function migrateState(state: AppState): AppState {
  if (state.seedVersion >= CURRENT_SEED_VERSION) return state;

  return {
    ...state,
    plans: state.plans.length ? state.plans : structuredClone(SEED_PLANS),
    schedule: Object.keys(state.schedule).length ? state.schedule : structuredClone(SEED_SCHEDULE),
    weekGoals: Object.keys(state.weekGoals).length ? state.weekGoals : { ...SEED_WEEK_GOALS },
    checks: state.checks.length ? state.checks : structuredClone(SEED_CHECKS),
    counts: state.counts.length ? state.counts : structuredClone(SEED_COUNTS),
    tasks: state.tasks.length
      ? state.tasks
      : SEED_TASKS.map((t) => ({ ...t, id: newId(), createdAt: Date.now(), status: 'pending' as const })),
    habits: state.habits.length
      ? state.habits
      : SEED_HABITS.map((h) => ({ ...h, id: newId(), createdAt: Date.now() })),
    seedVersion: CURRENT_SEED_VERSION,
  };
}
