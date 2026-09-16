import { Plan } from './types';

/** Deterministic O(1) join — schedule rows carry an explicit planId, no keyword matching. */
export function findPlanContext(planId: string | undefined, plans: Plan[]): Plan | undefined {
  if (!planId) return undefined;
  return plans.find((p) => p.id === planId);
}
