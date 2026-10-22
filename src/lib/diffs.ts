import { zonedNow } from './chat';
import { AppState, ApproachOutcome, HabitCadence, LogPerson, MilestoneStatus, NewPlanFields, Plan, ProposedDiff } from './types';

const REVIEW_KINDS = new Set(['plan', 'schedule', 'weekGoals', 'task', 'habit']);
const DIFF_FIELDS = new Set(['aim', 'when', 'where', 'how', 'quota', 'warn', 'milestones']);
const DIFF_OPS = new Set(['add', 'drop', 'retime']);
const ROW_OPS = new Set(['add', 'update', 'remove']);

export interface SanitizeOptions {
  taskIds: Set<string>;
  habitIds: Set<string>;
  /**
   * Chat mode: when present, scheduleRow diffs and habit cadence are allowed,
   * validated against this state. Absent (review) keeps the original behaviour.
   */
  state?: AppState;
  /** Review mode has no `state`; it passes the plans so milestone diffs can be validated. */
  plans?: Plan[];
  /** Clock for log-date validation; defaults to the real time. */
  now?: Date;
}

const SLUG_RE = /^[a-z0-9-]{2,32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOMES = new Set(['bailed', 'short', 'good', 'ig', 'closed']);
const STATUSES = new Set(['hit', 'partial', 'missed']);
const LOG_TARGETS = new Set(['check', 'person', 'weight', 'approach']);

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const reasonOf = (o: Record<string, unknown>) => (typeof o.reason === 'string' ? o.reason : '');
const clean = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : undefined;

function dayNumber(date: string): number | null {
  if (!DATE_RE.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t / 864e5;
}

/**
 * Full replacement milestone list: accepts [{week, description}] or [[week, desc]] tuples.
 * Weeks are 0-based ints 0..30 (no duplicates), descriptions 1..200 chars, at most 20 entries.
 */
export function parseMilestones(raw: unknown): [number, string][] | null {
  if (!Array.isArray(raw) || raw.length > 20) return null;
  const out: [number, string][] = [];
  for (const m of raw) {
    let week: unknown, desc: unknown;
    if (Array.isArray(m)) [week, desc] = m;
    else if (typeof m === 'object' && m !== null) {
      week = (m as Record<string, unknown>).week;
      desc = (m as Record<string, unknown>).description;
    } else return null;
    if (!isInt(week) || week < 0 || week > 30) return null;
    const text = clean(desc, 200);
    if (!text) return null;
    out.push([week, text]);
  }
  if (new Set(out.map((m) => m[0])).size !== out.length) return null;
  return out.sort((a, b) => a[0] - b[0]);
}

type RowTuple = NonNullable<ProposedDiff['row']>;

const TIME_RE = /^\d{2}:\d{2}$/;

function validTime(t: unknown): t is string {
  if (typeof t !== 'string' || !TIME_RE.test(t)) return false;
  const h = Number(t.slice(0, 2)), m = Number(t.slice(3));
  return h <= 23 && m <= 59;
}

/** A stored row as the contract's 6-tuple: isKeyBlock 0|1, planId/week null when absent. */
export function normalizeRow(r: readonly unknown[]): RowTuple {
  return [
    String(r[0] ?? ''),
    String(r[1] ?? ''),
    String(r[2] ?? ''),
    r[3] ? 1 : 0,
    typeof r[4] === 'string' && r[4] ? r[4] : null,
    r[5] === 'A' || r[5] === 'B' ? r[5] : null,
  ];
}

/** Accepts the model's row as a tuple or as {time,title,note,isKeyBlock,planId,week}. */
function parseRow(raw: unknown, planIds: Set<string>): RowTuple | null {
  let a: unknown[];
  if (Array.isArray(raw)) a = raw;
  else if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    a = [o.time, o.title, o.note, o.isKeyBlock, o.planId, o.week];
  } else return null;
  if (!validTime(a[0])) return null;
  if (typeof a[1] !== 'string' || !a[1].trim()) return null;
  const week = a[5];
  if (week != null && week !== '' && week !== 'A' && week !== 'B') return null;
  const planId = typeof a[4] === 'string' && planIds.has(a[4]) ? a[4] : null;
  return [
    a[0],
    a[1].trim(),
    typeof a[2] === 'string' ? a[2] : '',
    a[3] === 1 || a[3] === true ? 1 : 0,
    planId,
    week === 'A' || week === 'B' ? week : null,
  ];
}

export function parseCadence(v: unknown): HabitCadence | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (o.kind === 'everyNDays' || o.kind === 'everyNWeeks') {
    return typeof o.n === 'number' && Number.isInteger(o.n) && o.n >= 1 && o.n <= 365
      ? { kind: o.kind, n: o.n }
      : undefined;
  }
  if (o.kind === 'weeklyOnDays') {
    if (!Array.isArray(o.days) || !o.days.length) return undefined;
    if (!o.days.every((d) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6)) return undefined;
    return { kind: 'weeklyOnDays', days: [...new Set(o.days as number[])].sort((x, y) => x - y) };
  }
  return undefined;
}

function sanitizeScheduleRow(obj: Record<string, unknown>, state: AppState): ProposedDiff | null {
  if (typeof obj.op !== 'string' || !ROW_OPS.has(obj.op)) return null;
  const op = obj.op as 'add' | 'update' | 'remove';
  const day = obj.dayOfWeek;
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) return null;
  const entry = state.schedule[day];
  if (!entry) return null;
  const rows = entry[1];
  const idx = obj.index;
  if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0) return null;
  if (op === 'add' ? idx > rows.length : idx >= rows.length) return null;

  let row: RowTuple | null = null;
  if (op !== 'remove') {
    row = parseRow(obj.row, new Set(state.plans.map((p) => p.id)));
    if (!row) return null;
  }
  // Never trust the model's `before`: the real row is what the client checks for staleness.
  const before = op === 'add' ? null : normalizeRow(rows[idx]);
  if (op === 'update' && row && JSON.stringify(row) === JSON.stringify(before)) return null;

  return {
    kind: 'scheduleRow',
    op,
    dayOfWeek: day,
    index: idx,
    row: row ?? undefined,
    before,
    after: op === 'remove' ? null : row,
    reason: typeof obj.reason === 'string' ? obj.reason : '',
  };
}

function parseDays(v: unknown): number[] | null | undefined {
  // undefined = invalid; null = daily
  if (v === null) return null;
  if (!Array.isArray(v)) return undefined;
  if (!v.every((d) => isInt(d) && d >= 0 && d <= 6)) return undefined;
  if (v.length === 0) return null;
  return [...new Set(v as number[])].sort((a, b) => a - b);
}

const strList = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const l = v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim());
  return l.length ? l : undefined;
};

function sanitizePlanMilestones(obj: Record<string, unknown>, plans: Plan[] | undefined): ProposedDiff | null {
  const plan = plans?.find((p) => p.id === obj.planId);
  if (!plan) return null;
  const list = parseMilestones(obj.milestones !== undefined ? obj.milestones : obj.after);
  if (!list) return null;
  return {
    kind: 'plan',
    planId: plan.id,
    field: 'milestones',
    before: (plan.milestones ?? []).map(([w, d]) => [w, d]),
    after: list,
    reason: reasonOf(obj),
  };
}

function sanitizeNewPlan(obj: Record<string, unknown>, state: AppState, taken: Set<string>): ProposedDiff | null {
  const raw = obj.plan;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || !SLUG_RE.test(p.id)) return null;
  if (state.plans.some((x) => x.id === p.id) || taken.has(p.id)) return null;
  const name = clean(p.name, 100), aim = clean(p.aim, 500);
  if (!name || !aim) return null;
  const plan: NewPlanFields = { id: p.id, name, aim };
  for (const f of ['when', 'where', 'how', 'quota'] as const) {
    const l = strList(p[f]);
    if (l) plan[f] = l;
  }
  const warn = clean(p.warn, 500);
  if (warn) plan.warn = warn;
  if (p.milestones != null) {
    const ms = parseMilestones(p.milestones);
    if (!ms) return null;
    if (ms.length) plan.milestones = ms;
  }
  taken.add(plan.id);
  // bad/ask are never copied: plan is rebuilt field by field above.
  return { kind: 'newPlan', plan, before: null, after: plan, reason: reasonOf(obj) };
}

function sanitizeCheck(obj: Record<string, unknown>, state: AppState, taken: Set<string>): ProposedDiff | null {
  if (obj.op !== 'add' && obj.op !== 'update' && obj.op !== 'remove') return null;
  const op = obj.op;
  if (typeof obj.key !== 'string') return null;
  const key = obj.key;
  const cur = state.checks.find((c) => c[0] === key);
  const reason = reasonOf(obj);
  if (op === 'remove') {
    if (!cur) return null;
    return { kind: 'check', op, key, before: cur, after: null, reason };
  }
  let days: number[] | null | undefined;
  const hasDays = 'days' in obj && obj.days !== undefined;
  if (hasDays) {
    days = parseDays(obj.days);
    if (days === undefined) return null;
  }
  if (op === 'add') {
    if (!SLUG_RE.test(key) || cur || taken.has(key)) return null;
    const label = clean(obj.label, 100);
    if (!label) return null;
    const sub = typeof obj.sub === 'string' ? obj.sub.trim().slice(0, 100) : '';
    taken.add(key);
    const tuple = days ? [key, label, sub, days] : [key, label, sub];
    return { kind: 'check', op, key, label, sub, days: days ?? null, before: null, after: tuple, reason };
  }
  if (!cur) return null;
  let label = cur[1];
  if (obj.label !== undefined) {
    const l = clean(obj.label, 100);
    if (!l) return null;
    label = l;
  }
  const sub = typeof obj.sub === 'string' ? obj.sub.trim().slice(0, 100) : cur[2];
  const nextDays = hasDays ? days ?? undefined : cur[3];
  const tuple = nextDays && nextDays.length ? [key, label, sub, nextDays] : [key, label, sub];
  if (JSON.stringify(tuple) === JSON.stringify(cur)) return null;
  return { kind: 'check', op, key, label, sub, days: nextDays && nextDays.length ? nextDays : null, before: cur, after: tuple, reason };
}

function sanitizeLog(obj: Record<string, unknown>, state: AppState, now: Date): ProposedDiff | null {
  if (typeof obj.target !== 'string' || !LOG_TARGETS.has(obj.target)) return null;
  const target = obj.target as NonNullable<ProposedDiff['target']>;
  if (typeof obj.date !== 'string') return null;
  const dn = dayNumber(obj.date);
  const today = dayNumber(zonedNow(now).date);
  if (dn === null || today === null || dn > today || dn < today - 14) return null;
  const date = obj.date;
  const base = { kind: 'log' as const, target, date, reason: reasonOf(obj) };

  if (target === 'check') {
    if (typeof obj.key !== 'string' || typeof obj.done !== 'boolean') return null;
    const keys = new Set(state.checks.map((c) => c[0]));
    for (const rows of Object.values(state.schedule)) for (const r of rows[1]) if (r[3] && r[4]) keys.add(r[4]);
    if (!keys.has(obj.key)) return null;
    return { ...base, key: obj.key, done: obj.done, before: state.days[date]?.c[obj.key] === true, after: obj.done };
  }
  if (target === 'weight') {
    if (!isNum(obj.kg) || obj.kg < 30 || obj.kg > 250) return null;
    const existing = state.weights.find((w) => w.date === date);
    return { ...base, kg: obj.kg, before: existing ? existing.kg : null, after: obj.kg };
  }
  if (target === 'approach') {
    const a = obj.approach;
    if (typeof a !== 'object' || a === null) return null;
    const o = a as Record<string, unknown>;
    if (typeof o.out !== 'string' || !OUTCOMES.has(o.out)) return null;
    const approach = {
      where: typeof o.where === 'string' ? o.where.trim().slice(0, 100) : '',
      opener: typeof o.opener === 'string' ? o.opener.trim().slice(0, 300) : '',
      out: o.out as ApproachOutcome,
      lesson: typeof o.lesson === 'string' ? o.lesson.trim().slice(0, 500) : '',
    };
    return { ...base, approach, before: null, after: approach };
  }
  // person
  const p = obj.person;
  if (typeof p !== 'object' || p === null) return null;
  const o = p as Record<string, unknown>;
  const existing = typeof o.id === 'string' && o.id ? state.people.find((x) => x.id === o.id) : undefined;
  if (typeof o.id === 'string' && o.id && !existing) return null;
  if (o.id !== undefined && o.id !== null && typeof o.id !== 'string') return null;
  let name = clean(o.name, 100);
  if (!name && existing && (o.name === undefined || o.name === null || o.name === '')) name = existing.name;
  if (!name) return null;
  const person: LogPerson = { name };
  if (existing) person.id = existing.id;
  if (o.where !== undefined && o.where !== null) {
    if (typeof o.where !== 'string') return null;
    person.where = o.where.trim().slice(0, 100);
  }
  if (o.stage !== undefined && o.stage !== null) {
    if (!isInt(o.stage) || o.stage < 1 || o.stage > 4) return null;
    person.stage = o.stage as LogPerson['stage'];
  }
  if (o.last !== undefined && o.last !== null && o.last !== '') {
    if (typeof o.last !== 'string' || dayNumber(o.last) === null) return null;
    person.last = o.last;
  }
  return { ...base, person, before: existing ? { ...existing } : null, after: person };
}

function sanitizeMilestoneCheck(obj: Record<string, unknown>, state: AppState): ProposedDiff | null {
  const plan = state.plans.find((p) => p.id === obj.planId);
  if (!plan || !isInt(obj.week)) return null;
  const ms = (plan.milestones ?? []).find(([w]) => w === obj.week);
  if (!ms) return null;
  if (typeof obj.status !== 'string' || !STATUSES.has(obj.status)) return null;
  const status = obj.status as MilestoneStatus;
  const note = typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim().slice(0, 500) : undefined;
  const existing = state.milestoneChecks.find((m) => m.planId === plan.id && m.week === obj.week);
  return {
    kind: 'milestoneCheck',
    planId: plan.id,
    week: obj.week,
    status,
    ...(note ? { note } : {}),
    description: ms[1],
    before: existing ? { ...existing } : null,
    after: { planId: plan.id, week: obj.week, description: ms[1], status, ...(note ? { note } : {}) },
    reason: reasonOf(obj),
  };
}

function sanitizeHabitRetime(obj: Record<string, unknown>, state: AppState): ProposedDiff | null {
  const h = state.habits.find((x) => x.id === obj.existingId);
  const cadence = parseCadence(obj.cadence);
  if (!h || !cadence) return null;
  return { kind: 'habit', op: 'retime', existingId: h.id, cadence, before: h.cadence, after: cadence, reason: reasonOf(obj) };
}

/**
 * Hard backstop, independent of the prompt instructions and the response
 * schema: drops any diff naming a fixed field ('bad'/'ask') even if the model
 * ignored both. `taskIds`/`habitIds` let a drop/retime diff be dropped
 * outright if it names an id the model hallucinated. Invalid diffs are dropped
 * individually; the rest survive. Chat mode (opts.state) allows every kind;
 * review mode keeps the original set plus structured milestones.
 */
export function sanitizeDiffs(diffs: unknown, opts: SanitizeOptions): ProposedDiff[] {
  if (!Array.isArray(diffs)) return [];
  const { taskIds, habitIds, state } = opts;
  const plans = state?.plans ?? opts.plans;
  const now = opts.now ?? new Date();
  const takenPlans = new Set<string>(), takenChecks = new Set<string>();
  const out: ProposedDiff[] = [];
  const push = (d: ProposedDiff | null) => {
    if (d) out.push(d);
  };
  for (const d of diffs) {
    if (typeof d !== 'object' || d === null) continue;
    const obj = d as Record<string, unknown>;
    if (obj.kind === 'plan' && typeof obj.field === 'string' && !DIFF_FIELDS.has(obj.field)) continue;
    if (obj.kind === 'plan' && obj.field === 'milestones') {
      push(sanitizePlanMilestones(obj, plans));
      continue;
    }
    if (state) {
      let handled = true;
      if (obj.kind === 'scheduleRow') push(sanitizeScheduleRow(obj, state));
      else if (obj.kind === 'newPlan') push(sanitizeNewPlan(obj, state, takenPlans));
      else if (obj.kind === 'check') push(sanitizeCheck(obj, state, takenChecks));
      else if (obj.kind === 'log') push(sanitizeLog(obj, state, now));
      else if (obj.kind === 'milestoneCheck') push(sanitizeMilestoneCheck(obj, state));
      else if (obj.kind === 'habit' && obj.op === 'retime') push(sanitizeHabitRetime(obj, state));
      else handled = false;
      if (handled) continue;
    }
    if (typeof obj.kind !== 'string' || !REVIEW_KINDS.has(obj.kind)) continue;
    if (obj.kind === 'task' || obj.kind === 'habit') {
      if (typeof obj.op !== 'string' || !DIFF_OPS.has(obj.op)) continue;
      if (obj.op === 'add' && (typeof obj.title !== 'string' || !obj.title.trim())) continue;
      if (obj.op === 'retime' && typeof obj.triggerWeek !== 'number') continue;
      if (obj.op !== 'add') {
        const ids = obj.kind === 'task' ? taskIds : habitIds;
        if (typeof obj.existingId !== 'string' || !ids.has(obj.existingId)) continue;
      }
    }
    const diff: ProposedDiff = {
      kind: obj.kind as ProposedDiff['kind'],
      planId: typeof obj.planId === 'string' ? obj.planId : undefined,
      field: typeof obj.field === 'string' ? (obj.field as ProposedDiff['field']) : undefined,
      dayOfWeek: typeof obj.dayOfWeek === 'number' ? obj.dayOfWeek : undefined,
      key: typeof obj.key === 'string' ? obj.key : undefined,
      op: typeof obj.op === 'string' ? (obj.op as ProposedDiff['op']) : undefined,
      existingId: typeof obj.existingId === 'string' ? obj.existingId : undefined,
      title: typeof obj.title === 'string' ? obj.title : undefined,
      detail: typeof obj.detail === 'string' ? obj.detail : undefined,
      triggerWeek: typeof obj.triggerWeek === 'number' ? Math.round(obj.triggerWeek) : undefined,
      before: obj.before,
      after: obj.after,
      reason: typeof obj.reason === 'string' ? obj.reason : '',
    };
    if (state && obj.kind === 'habit' && obj.op === 'add') {
      const cadence = parseCadence(obj.cadence);
      if (cadence) diff.cadence = cadence;
    }
    out.push(diff);
  }
  return out;
}
