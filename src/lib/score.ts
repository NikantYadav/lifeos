import { weekDates } from './dates';
import { AppState } from './types';

/**
 * Checks that count as one unit per day they're ticked, rather than being
 * summed from a counter. Keys must exist in state.weekGoals. This is a
 * structural fact about which check keys are day-counted vs summed, not user
 * data, so it stays a code constant rather than moving into state.
 */
const CHECK_GOALS = ['gym', 'out', 'protein'] as const;

/** Per-goal totals for plan week `wi`, keyed as in state.weekGoals. */
export function weekTotals(state: AppState, wi: number): Record<string, number> {
  const totals: Record<string, number> = {};
  Object.keys(state.weekGoals).forEach((k) => (totals[k] = 0));

  weekDates(wi).forEach((key) => {
    const day = state.days[key];
    if (!day) return;
    state.counts.forEach(([ck]) => (totals[ck] = (totals[ck] ?? 0) + (day.n?.[ck] ?? 0)));
    CHECK_GOALS.forEach((ck) => {
      if (day.c?.[ck]) totals[ck] = (totals[ck] ?? 0) + 1;
    });
  });

  return totals;
}

/** How much of week `wi`'s scorecard was hit, 0–1, each goal capped at 100%. */
export function weekScore(state: AppState, wi: number): number {
  const totals = weekTotals(state, wi);
  const keys = Object.keys(state.weekGoals);
  if (keys.length === 0) return 0;
  const sum = keys.reduce(
    (acc, k) => acc + Math.min(1, (totals[k] ?? 0) / state.weekGoals[k]),
    0
  );
  return sum / keys.length;
}
