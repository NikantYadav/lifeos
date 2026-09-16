export type DayCounts = Record<string, number>;
export type DayChecks = Record<string, boolean>;

export interface DayEntry {
  c: DayChecks;
  n: DayCounts;
}

export interface Person {
  id: string;
  name: string;
  where: string;
  stage: 1 | 2 | 3 | 4;
  last: string;
}

export type ApproachOutcome = 'bailed' | 'short' | 'good' | 'ig' | 'closed';

export interface Approach {
  id: string;
  date: string;
  where: string;
  opener: string;
  out: ApproachOutcome;
  lesson: string;
}

export interface WeightEntry {
  id: string;
  date: string;
  kg: number;
}

/** [time "HH:MM", title, note, isKeyBlock?, planId?] */
export type SchedRow = [time: string, title: string, note: string, isKeyBlock?: number, planId?: string];

/** Keyed by JS Date.getDay(), 0 = Sunday. */
export type WeekSchedule = Record<number, [label: string, rows: SchedRow[]]>;

export type WeekGoals = Record<string, number>;

export interface Plan {
  id: string;
  name: string;
  aim: string;
  when?: string[];
  where?: string[];
  how?: string[];
  quota?: string[];
  good?: string;
  /** Fixed text — never a target of an AI-proposed diff. */
  bad?: string;
  warn?: string;
  /** Fixed text — never a target of an AI-proposed diff. */
  ask?: string[];
  milestones?: [week: number, description: string][];
}

export type TaskStatus = 'pending' | 'done' | 'dropped';

export interface Task {
  id: string;
  title: string;
  detail: string;
  planId?: string;
  /** 0-based week index, same convention as currentWeekIndex(). */
  triggerWeek: number;
  status: TaskStatus;
  createdAt: number;
  doneAt?: string;
  droppedAt?: string;
  droppedReason?: string;
}

export type HabitCadence =
  | { kind: 'everyNDays'; n: number }
  | { kind: 'weeklyOnDays'; days: number[] }
  | { kind: 'everyNWeeks'; n: number };

export interface Habit {
  id: string;
  title: string;
  planId?: string;
  cadence: HabitCadence;
  lastDone?: string;
  createdAt: number;
}

export type SkipReason = 'tired' | 'work' | 'no_want' | 'no_plan' | 'sick' | 'better';

export interface SkipRecord {
  id: string;
  date: string;
  checkKey: string;
  reason: SkipReason;
  note?: string;
  createdAt: number;
}

export type MilestoneStatus = 'hit' | 'partial' | 'missed';

export interface MilestoneCheckIn {
  id: string;
  planId: string;
  week: number;
  /** Snapshot of the milestone text at check-in time, so later plan edits don't rewrite history. */
  description: string;
  status: MilestoneStatus;
  note?: string;
  checkedAt: string;
}

/**
 * A single proposed change from a Sunday review. `field` deliberately excludes
 * 'bad' | 'ask' at the type level — those plan fields are fixed text and can
 * never be an AI-review mutation target.
 *
 * 'task' and 'habit' diffs let the review add, drop, or retime queue items —
 * still gated behind the same accept/edit/reject flow as everything else;
 * nothing here writes to AppState until the user applies it.
 */
export interface ProposedDiff {
  kind: 'plan' | 'schedule' | 'weekGoals' | 'task' | 'habit';
  planId?: string;
  field?: 'aim' | 'when' | 'where' | 'how' | 'quota' | 'warn' | 'milestones';
  dayOfWeek?: number;
  key?: string;

  /** task/habit diffs only. 'add' has no existingId; 'drop'/'retime' require one. */
  op?: 'add' | 'drop' | 'retime';
  existingId?: string;
  title?: string;
  detail?: string;
  triggerWeek?: number;

  before: unknown;
  after: unknown;
  reason: string;
}

export type DiffDecision = 'accepted' | 'edited' | 'rejected';

export interface SundayReview {
  id: string;
  weekIndex: number;
  generatedAt: number;
  narrative: string;
  pattern: string;
  proposedDiffs: ProposedDiff[];
  diffDecisions: Record<string, DiffDecision>;
  editedValues?: Record<string, unknown>;
}

export interface AppState {
  days: Record<string, DayEntry>;
  people: Person[];
  approaches: Approach[];
  weights: WeightEntry[];
  /** Baseline weigh-in, so deleting a row never rewrites the Change column. */
  baselineKg?: number;

  /** Editable plan content — seeded from data.ts once, then user/AI-editable. */
  plans: Plan[];
  schedule: WeekSchedule;
  weekGoals: WeekGoals;
  checks: [key: string, label: string, sub: string][];
  counts: [key: string, label: string][];
  /** Drives the one-time data.ts -> state seed migration. */
  seedVersion: number;

  tasks: Task[];
  habits: Habit[];
  skips: SkipRecord[];
  milestoneChecks: MilestoneCheckIn[];
  /** Capped at the most recent 12 (rotate-on-write, like BACKUP_DEPTH). */
  reviews: SundayReview[];

  /** Bumped on every successful save; used to detect concurrent writers. */
  rev: number;
  /** ms epoch of the last successful save. */
  updatedAt: number;
}

export const EMPTY_STATE: AppState = {
  days: {},
  people: [],
  approaches: [],
  weights: [],
  plans: [],
  schedule: {},
  weekGoals: {},
  checks: [],
  counts: [],
  seedVersion: 0,
  tasks: [],
  habits: [],
  skips: [],
  milestoneChecks: [],
  reviews: [],
  rev: 0,
  updatedAt: 0,
};

/** Stable unique id, with a fallback for non-secure contexts. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
