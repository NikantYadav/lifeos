export type DayCounts = Record<string, number>;
export type DayChecks = Record<string, boolean>;

export interface DayEntry {
  c: DayChecks;
  n: DayCounts;
}

export interface Person {
  id: number;
  name: string;
  where: string;
  stage: 1 | 2 | 3 | 4;
  last: string;
}

export type ApproachOutcome = 'bailed' | 'short' | 'good' | 'ig' | 'closed';

export interface Approach {
  id: number;
  date: string;
  where: string;
  opener: string;
  out: ApproachOutcome;
  lesson: string;
}

export interface WeightEntry {
  id: number;
  date: string;
  kg: number;
}

export interface AppState {
  days: Record<string, DayEntry>;
  people: Person[];
  approaches: Approach[];
  weights: WeightEntry[];
}

export const EMPTY_STATE: AppState = {
  days: {},
  people: [],
  approaches: [],
  weights: [],
};
