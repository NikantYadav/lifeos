import { iso } from './dates';
import { AppState } from './types';

/**
 * Fully derived from state.days — no stored running totals. Storing a
 * redundant total risks drift if history is ever edited or a bad day
 * deleted; a full scan is at most a few hundred days for this app's horizon.
 */

/** Sum of a counter across every logged day, or count of days a check was ticked. */
export function lifetimeCount(state: AppState, key: string): number {
  let total = 0;
  for (const day of Object.values(state.days)) {
    if (day.n?.[key]) total += day.n[key];
    else if (day.c?.[key]) total += 1;
  }
  return total;
}

/** Consecutive days back from `today` (inclusive) where check `key` was ticked. */
export function currentStreak(state: AppState, key: string, today: Date): number {
  let streak = 0;
  const d = new Date(today);
  for (;;) {
    const day = state.days[iso(d)];
    if (!day?.c?.[key]) break;
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Longest run of consecutive ticked days for check `key`, across all history. */
export function bestStreak(state: AppState, key: string): number {
  const dates = Object.keys(state.days)
    .filter((k) => state.days[k]?.c?.[key])
    .sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of dates) {
    const d = new Date(k);
    if (prev) {
      const gap = Math.round((d.getTime() - prev.getTime()) / 864e5);
      run = gap === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
