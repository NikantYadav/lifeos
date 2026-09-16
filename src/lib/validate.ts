import {
  AppState,
  Approach,
  ApproachOutcome,
  DayEntry,
  EMPTY_STATE,
  Habit,
  HabitCadence,
  MilestoneCheckIn,
  MilestoneStatus,
  Person,
  Plan,
  ProposedDiff,
  SchedRow,
  SkipRecord,
  SkipReason,
  SundayReview,
  Task,
  TaskStatus,
  WeekSchedule,
  WeightEntry,
  newId,
} from './types';

/**
 * Structural validation for state crossing the network.
 *
 * Coerces rather than rejects wherever a sane reading exists, because the only
 * copy of the user's data is the blob being parsed — dropping a malformed row
 * is recoverable, refusing the whole document is not. Ids were `Date.now()`
 * numbers in v1, so numeric ids are migrated to strings instead of discarded.
 */

const OUTCOMES: ApproachOutcome[] = ['bailed', 'short', 'good', 'ig', 'closed'];
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function id(v: unknown): string {
  if (typeof v === 'string' && v) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return newId();
}

function finite(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function dateKey(v: unknown): string | null {
  const s = str(v);
  return DATE_KEY.test(s) ? s : null;
}

function oneOf<T extends string>(v: unknown, set: readonly T[], fallback: T): T {
  const s = str(v);
  return (set as readonly string[]).includes(s) ? (s as T) : fallback;
}

function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string');
  return out.length ? out : undefined;
}

function day(v: unknown): DayEntry | null {
  if (!isObj(v)) return null;
  const c: Record<string, boolean> = {};
  const n: Record<string, number> = {};

  if (isObj(v.c)) {
    for (const [k, val] of Object.entries(v.c)) if (val === true) c[k] = true;
  }
  if (isObj(v.n)) {
    for (const [k, val] of Object.entries(v.n)) {
      const num = finite(val);
      if (num !== null && num !== 0) n[k] = num;
    }
  }
  if (Object.keys(c).length === 0 && Object.keys(n).length === 0) return null;
  return { c, n };
}

function person(v: unknown): Person | null {
  if (!isObj(v)) return null;
  const name = str(v.name).trim();
  if (!name) return null;
  const stage = finite(v.stage) ?? 1;
  const clamped = Math.min(4, Math.max(1, Math.round(stage))) as Person['stage'];
  return {
    id: id(v.id),
    name,
    where: str(v.where),
    stage: clamped,
    last: dateKey(v.last) ?? '',
  };
}

function approach(v: unknown): Approach | null {
  if (!isObj(v)) return null;
  const date = dateKey(v.date);
  if (!date) return null;
  const out = str(v.out) as ApproachOutcome;
  return {
    id: id(v.id),
    date,
    where: str(v.where),
    opener: str(v.opener),
    out: OUTCOMES.includes(out) ? out : 'bailed',
    lesson: str(v.lesson),
  };
}

function weight(v: unknown): WeightEntry | null {
  if (!isObj(v)) return null;
  const date = dateKey(v.date);
  const kg = finite(v.kg);
  if (!date || kg === null || kg <= 0 || kg > 500) return null;
  return { id: id(v.id), date, kg };
}

function schedRow(v: unknown): SchedRow | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const time = str(v[0]);
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const keyBlock = finite(v[3]);
  const planId = typeof v[4] === 'string' ? v[4] : undefined;
  return [time, str(v[1]), str(v[2]), keyBlock ? 1 : undefined, planId];
}

function weekSchedule(v: unknown): WeekSchedule | null {
  if (!isObj(v)) return null;
  const out: WeekSchedule = {};
  for (const [k, val] of Object.entries(v)) {
    const day = finite(k);
    if (day === null || day < 0 || day > 6) continue;
    // WeekSchedule values are a 2-tuple [label, rows], i.e. a plain array after
    // JSON.parse — not a record, so this needs Array.isArray, not isObj.
    if (!Array.isArray(val) || val.length !== 2 || typeof val[0] !== 'string' || !Array.isArray(val[1])) continue;
    const rows = val[1].map(schedRow).filter((r): r is SchedRow => r !== null);
    if (rows.length) out[Math.round(day)] = [val[0], rows];
  }
  return Object.keys(out).length ? out : null;
}

function numberRecord(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, val] of Object.entries(v)) {
    const n = finite(val);
    if (n !== null) out[k] = n;
  }
  return out;
}

function stringTriple(v: unknown): [string, string, string] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const key = str(v[0]).trim();
  if (!key) return null;
  return [key, str(v[1]), str(v[2])];
}

function stringPair(v: unknown): [string, string] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const key = str(v[0]).trim();
  if (!key) return null;
  return [key, str(v[1])];
}

function milestoneList(v: unknown): [number, string][] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: [number, string][] = [];
  for (const m of v) {
    if (Array.isArray(m) && m.length === 2 && typeof m[1] === 'string') {
      const wk = finite(m[0]);
      if (wk !== null) out.push([Math.round(wk), m[1]]);
    }
  }
  return out.length ? out : undefined;
}

function plan(v: unknown): Plan | null {
  if (!isObj(v)) return null;
  const id = str(v.id).trim();
  const name = str(v.name).trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    aim: str(v.aim),
    when: strArray(v.when),
    where: strArray(v.where),
    how: strArray(v.how),
    quota: strArray(v.quota),
    good: typeof v.good === 'string' ? v.good : undefined,
    bad: typeof v.bad === 'string' ? v.bad : undefined,
    warn: typeof v.warn === 'string' ? v.warn : undefined,
    ask: strArray(v.ask),
    milestones: milestoneList(v.milestones),
  };
}

const TASK_STATUSES: TaskStatus[] = ['pending', 'done', 'dropped'];

function task(v: unknown): Task | null {
  if (!isObj(v)) return null;
  const title = str(v.title).trim();
  if (!title) return null;
  const triggerWeek = finite(v.triggerWeek) ?? 0;
  return {
    id: id(v.id),
    title,
    detail: str(v.detail),
    planId: typeof v.planId === 'string' ? v.planId : undefined,
    triggerWeek: Math.max(0, Math.round(triggerWeek)),
    status: oneOf<TaskStatus>(v.status, TASK_STATUSES, 'pending'),
    createdAt: finite(v.createdAt) ?? Date.now(),
    doneAt: dateKey(v.doneAt) ?? undefined,
    droppedAt: dateKey(v.droppedAt) ?? undefined,
    droppedReason: typeof v.droppedReason === 'string' ? v.droppedReason : undefined,
  };
}

function habitCadence(v: unknown): HabitCadence | null {
  if (!isObj(v)) return null;
  if (v.kind === 'everyNDays' || v.kind === 'everyNWeeks') {
    const n = finite(v.n);
    if (n === null || n <= 0) return null;
    return { kind: v.kind, n: Math.round(n) };
  }
  if (v.kind === 'weeklyOnDays') {
    if (!Array.isArray(v.days)) return null;
    const days = v.days
      .map((d) => finite(d))
      .filter((d): d is number => d !== null && d >= 0 && d <= 6)
      .map((d) => Math.round(d));
    if (!days.length) return null;
    return { kind: 'weeklyOnDays', days };
  }
  return null;
}

function habit(v: unknown): Habit | null {
  if (!isObj(v)) return null;
  const title = str(v.title).trim();
  const cadence = habitCadence(v.cadence);
  if (!title || !cadence) return null;
  return {
    id: id(v.id),
    title,
    planId: typeof v.planId === 'string' ? v.planId : undefined,
    cadence,
    lastDone: dateKey(v.lastDone) ?? undefined,
    createdAt: finite(v.createdAt) ?? Date.now(),
  };
}

const SKIP_REASONS: SkipReason[] = ['tired', 'work', 'no_want', 'no_plan', 'sick', 'better'];

function skipRecord(v: unknown): SkipRecord | null {
  if (!isObj(v)) return null;
  const date = dateKey(v.date);
  const checkKey = str(v.checkKey).trim();
  if (!date || !checkKey) return null;
  return {
    id: id(v.id),
    date,
    checkKey,
    reason: oneOf<SkipReason>(v.reason, SKIP_REASONS, 'no_plan'),
    note: typeof v.note === 'string' ? v.note : undefined,
    createdAt: finite(v.createdAt) ?? Date.now(),
  };
}

const MILESTONE_STATUSES: MilestoneStatus[] = ['hit', 'partial', 'missed'];

function milestoneCheckIn(v: unknown): MilestoneCheckIn | null {
  if (!isObj(v)) return null;
  const planId = str(v.planId).trim();
  const checkedAt = dateKey(v.checkedAt);
  const week = finite(v.week);
  if (!planId || !checkedAt || week === null) return null;
  return {
    id: id(v.id),
    planId,
    week: Math.round(week),
    description: str(v.description),
    status: oneOf<MilestoneStatus>(v.status, MILESTONE_STATUSES, 'missed'),
    note: typeof v.note === 'string' ? v.note : undefined,
    checkedAt,
  };
}

const DIFF_KINDS = ['plan', 'schedule', 'weekGoals'] as const;
// 'bad' and 'ask' are deliberately absent — a diff naming either is dropped,
// independent of the type-level exclusion in ProposedDiff['field'].
const DIFF_FIELDS = ['aim', 'when', 'where', 'how', 'quota', 'warn', 'milestones'] as const;

function proposedDiff(v: unknown): ProposedDiff | null {
  if (!isObj(v)) return null;
  const kind = str(v.kind);
  if (!(DIFF_KINDS as readonly string[]).includes(kind)) return null;
  const field = typeof v.field === 'string' ? v.field : undefined;
  if (field && !(DIFF_FIELDS as readonly string[]).includes(field)) return null;
  const dayOfWeek = finite(v.dayOfWeek);
  return {
    kind: kind as ProposedDiff['kind'],
    planId: typeof v.planId === 'string' ? v.planId : undefined,
    field: field as ProposedDiff['field'],
    dayOfWeek: dayOfWeek !== null ? Math.round(dayOfWeek) : undefined,
    key: typeof v.key === 'string' ? v.key : undefined,
    before: v.before,
    after: v.after,
    reason: str(v.reason),
  };
}

const DIFF_DECISIONS = ['accepted', 'edited', 'rejected'] as const;

function diffDecisions(v: unknown): Record<string, 'accepted' | 'edited' | 'rejected'> {
  const out: Record<string, 'accepted' | 'edited' | 'rejected'> = {};
  if (!isObj(v)) return out;
  for (const [k, val] of Object.entries(v)) {
    const s = str(val);
    if ((DIFF_DECISIONS as readonly string[]).includes(s)) out[k] = s as (typeof DIFF_DECISIONS)[number];
  }
  return out;
}

function sundayReview(v: unknown): SundayReview | null {
  if (!isObj(v)) return null;
  const id_ = id(v.id);
  const weekIndex = finite(v.weekIndex);
  if (weekIndex === null) return null;
  const proposedDiffs = collect(v.proposedDiffs, proposedDiff)
    // Second enforcement layer beyond the type/schema: strip any diff that
    // still names a fixed field, even on data already sitting in storage.
    .filter((d) => !(d.kind === 'plan' && (d.field === ('bad' as never) || d.field === ('ask' as never))));
  return {
    id: id_,
    weekIndex: Math.round(weekIndex),
    generatedAt: finite(v.generatedAt) ?? Date.now(),
    narrative: str(v.narrative),
    pattern: str(v.pattern),
    proposedDiffs,
    diffDecisions: diffDecisions(v.diffDecisions),
    editedValues: isObj(v.editedValues) ? { ...v.editedValues } : undefined,
  };
}

/** Most recent N kept, rotate-on-write, mirroring BACKUP_DEPTH in redis.ts. */
export const MAX_REVIEWS = 12;

function collect<T>(v: unknown, f: (item: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const item of v) {
    const parsed = f(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Coerce unknown input into a well-formed AppState. Never throws. */
export function parseState(input: unknown): AppState {
  if (!isObj(input)) return { ...EMPTY_STATE };

  const days: Record<string, DayEntry> = {};
  if (isObj(input.days)) {
    for (const [key, value] of Object.entries(input.days)) {
      if (!DATE_KEY.test(key)) continue;
      const entry = day(value);
      if (entry) days[key] = entry;
    }
  }

  const baseline = finite(input.baselineKg);
  const rev = finite(input.rev);
  const updatedAt = finite(input.updatedAt);
  const seedVersion = finite(input.seedVersion);

  const reviews = collect(input.reviews, sundayReview).slice(-MAX_REVIEWS);

  return {
    days,
    people: collect(input.people, person),
    approaches: collect(input.approaches, approach),
    weights: collect(input.weights, weight).sort((a, b) =>
      a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1
    ),
    ...(baseline !== null && baseline > 0 ? { baselineKg: baseline } : {}),

    plans: collect(input.plans, plan),
    schedule: weekSchedule(input.schedule) ?? {},
    weekGoals: numberRecord(input.weekGoals),
    checks: collect(input.checks, stringTriple),
    counts: collect(input.counts, stringPair),
    seedVersion: seedVersion !== null && seedVersion >= 0 ? Math.floor(seedVersion) : 0,

    tasks: collect(input.tasks, task),
    habits: collect(input.habits, habit),
    skips: collect(input.skips, skipRecord),
    milestoneChecks: collect(input.milestoneChecks, milestoneCheckIn),
    reviews,

    rev: rev !== null && rev >= 0 ? Math.floor(rev) : 0,
    updatedAt: updatedAt !== null && updatedAt >= 0 ? Math.floor(updatedAt) : 0,
  };
}

/** Rough guard against a runaway payload filling the store. */
export const MAX_BODY_BYTES = 1_000_000;
