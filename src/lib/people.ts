import { daysBetween, fromIso } from './dates';
import { AppState, Person } from './types';

export const WARN_DAYS = 7;
export const STALE_DAYS = 14;

export function bumpStage(draft: AppState, id: string, todayKey: string): void {
  const p = draft.people.find((x) => x.id === id);
  if (p) {
    p.stage = Math.min(4, p.stage + 1) as Person['stage'];
    p.last = todayKey;
  }
}

/** Symmetric down-arrow — a misjudged stage and a cooling contact both just read as a lower stage. */
export function dropStage(draft: AppState, id: string): void {
  const p = draft.people.find((x) => x.id === id);
  if (p) p.stage = Math.max(1, p.stage - 1) as Person['stage'];
}

export function markContacted(draft: AppState, id: string, todayKey: string): void {
  const p = draft.people.find((x) => x.id === id);
  if (p) p.last = todayKey;
}

export interface StaleEntry {
  person: Person;
  days: number;
  tier: 'warn' | 'stale';
}

/** People whose last contact is at least WARN_DAYS old, worst first. */
export function staleList(people: Person[], today: Date): StaleEntry[] {
  return people
    .map((person) => ({ person, days: person.last ? daysBetween(fromIso(person.last), today) : Infinity }))
    .filter((x) => x.days >= WARN_DAYS)
    .sort((a, b) => b.days - a.days)
    .map((x) => ({ ...x, tier: (x.days >= STALE_DAYS ? 'stale' : 'warn') as 'warn' | 'stale' }));
}
