import { AppState, HabitCadence, ProposedDiff } from './types';

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

/**
 * Hard backstop, independent of the prompt instructions and the response
 * schema: drops any diff naming a fixed field ('bad'/'ask') even if the model
 * ignored both. `taskIds`/`habitIds` let a drop/retime diff be dropped
 * outright if it names an id the model hallucinated.
 */
export function sanitizeDiffs(diffs: unknown, opts: SanitizeOptions): ProposedDiff[] {
  if (!Array.isArray(diffs)) return [];
  const { taskIds, habitIds, state } = opts;
  const out: ProposedDiff[] = [];
  for (const d of diffs) {
    if (typeof d !== 'object' || d === null) continue;
    const obj = d as Record<string, unknown>;
    if (obj.kind === 'plan' && typeof obj.field === 'string' && !DIFF_FIELDS.has(obj.field)) continue;
    if (obj.kind === 'scheduleRow' && state) {
      const sr = sanitizeScheduleRow(obj, state);
      if (sr) out.push(sr);
      continue;
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
