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
export const CURRENT_SEED_VERSION = 3;

/**
 * Titles removed from SEED_TASKS/SEED_HABITS after some deployments had
 * already been seeded with them. A plain "fill if empty" migration can't
 * retroactively remove rows from a non-empty list, so this runs once, scoped
 * to these exact still-pending/untouched titles, on the seedVersion 1 -> 2
 * step below — narrow enough that it can never remove something the user
 * added themselves under a different title.
 */
const REMOVED_TASK_TITLES = new Set(['Pick your café', 'Start the Bangalore guide']);
const REMOVED_HABIT_TITLES = new Set(['Barber']);

/** Same idea as REMOVED_TASK_TITLES above, for the seedVersion 2 -> 3 step. */
const REMOVED_TASK_TITLES_V3 = new Set(['Book four Tuesday Playo slots']);

/**
 * Copies data.ts seed defaults into state fields that are still empty, then
 * marks the state as migrated. Never touches days/people/approaches/weights.
 * Idempotent: a state already at CURRENT_SEED_VERSION passes through untouched
 * (returns the same reference), so callers can cheaply check `migrated !== input`.
 */
export function migrateState(state: AppState): AppState {
  if (state.seedVersion >= CURRENT_SEED_VERSION) return state;

  const seeded: AppState = {
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

  if (state.seedVersion < 2) {
    seeded.tasks = seeded.tasks.filter(
      (t) => !(t.status === 'pending' && REMOVED_TASK_TITLES.has(t.title))
    );
    seeded.habits = seeded.habits.filter((h) => !REMOVED_HABIT_TITLES.has(h.title));
  }

  if (state.seedVersion < 3) {
    seeded.tasks = seeded.tasks.filter(
      (t) => !(t.status === 'pending' && REMOVED_TASK_TITLES_V3.has(t.title))
    );
  }

  return seeded;
}
