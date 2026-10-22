import {
  NEW_FRI_OUT_NOTE,
  NEW_MORNING_NOTE,
  NEW_SAT_DRILL_NOTE,
  NEW_TASKS_V11,
  OLD_FRI_OUT_NOTE,
  OLD_MORNING_NOTE,
  OLD_SAT_DRILL_NOTE,
  PREOUT_CHECK,
  PRESENCE_PLAN,
  SEED_CHECKS,
  SEED_HABITS,
  SEED_PLANS,
  SEED_SCHEDULE,
  SEED_TASKS,
  SEED_WEEK_GOALS,
  SOCIAL_HOW_V11,
  SPEAK_HOW_V11,
  START,
  STYLE_HOW_V11,
} from './data';
import { AppState, newId } from './types';
import { iso } from './dates';

/** Bump when the seed shape in data.ts changes, to re-run migration once more. */
export const CURRENT_SEED_VERSION = 13;

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

/** Plans whose `when` describes the timetable, re-synced on the seedVersion -> 10 step. */
const SCHEDULE_WHEN_PLAN_IDS = ['social', 'approach', 'places', 'dating', 'gym', 'startup', 'speak', 'dj', 'russian', 'read', 'style', 'sexual-health'];

/**
 * [check key, old seed sub-label] pairs rewritten on the seedVersion -> 10
 * step, only if still untouched. Includes the labels seedVersions 7–9
 * shipped, since this step supersedes them.
 */
const OLD_CHECK_SUBS_V10: [string, string][] = [
  ['out', 'Mon, Tue, Thu, Fri, Sat'], ['out', 'Mon, Tue, Fri, Sat, Sun'],
  ['russian', ''],
  ['startup', 'Before 11am'], ['startup', 'Wed evening, Sat'],
];

/** Weekday-limited checks on the seedVersion -> 11 step (JS getDay, 0 = Sunday). */
const CHECK_DAYS_V11: Record<string, number[]> = {
  gym: [1, 2, 3, 4, 5],
  startup: [2, 4, 6],
  out: [1, 5, 6],
  russian: [1, 2, 3, 4, 5],
};

/** [weekday, time, title, old note, new note]: rewritten on seedVersion -> 11 only if the note is still the old seed text. */
const SCHEDULE_NOTES_V11: [number, string, string, string, string][] = [
  ...[1, 2, 3, 4, 5].map((d): [number, string, string, string, string] => [d, '08:35', 'Shower, breakfast', OLD_MORNING_NOTE, NEW_MORNING_NOTE]),
  [5, '18:30', 'Shower, best outfit of the week', OLD_FRI_OUT_NOTE, NEW_FRI_OUT_NOTE],
  [6, '18:45', 'Photo drill — 10 min', OLD_SAT_DRILL_NOTE, NEW_SAT_DRILL_NOTE],
];

/** Plan id -> `how` line appended on seedVersion -> 11 if not already present. */
const HOW_ADDITIONS_V11: Record<string, string> = { speak: SPEAK_HOW_V11, style: STYLE_HOW_V11, social: SOCIAL_HOW_V11 };

/** Goals from earlier seeds, replaced only if the user never changed them. */
const OLD_HOURS_GOALS = new Set([13, 10, 5]);
const OLD_OUT_GOALS = new Set([5]);

/** Startup `how` line that stopped being true once mornings became wake-and-go. */
const REMOVED_STARTUP_HOW = 'Nothing gets scheduled before 11am. That is the wall.';

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
    startDate: state.startDate || iso(START),
    plans: state.plans.length ? state.plans : structuredClone(SEED_PLANS),
    schedule: Object.keys(state.schedule).length ? state.schedule : structuredClone(SEED_SCHEDULE),
    weekGoals: Object.keys(state.weekGoals).length ? state.weekGoals : { ...SEED_WEEK_GOALS },
    checks: state.checks.length ? state.checks : structuredClone(SEED_CHECKS),
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

  /**
   * The "fill only if empty" seeding above only ever reaches a state whose
   * plans/schedule were still empty. Anyone already past first load has a
   * schedule/plans list from the *original* seed baked into their saved
   * state, and this app's authored content (gym split, nightly blocks, plan
   * copy) has since changed — those users would otherwise never see it.
   *
   * The schedule is a content rewrite, not user-entered data (the app has no
   * schedule editor), so it's replaced outright. Plans ARE occasionally
   * user/AI-edited in place via the Sunday review diff flow, so those are
   * merged by id instead — existing plan objects are left exactly as they
   * are (preserving any applied review edits), and only plan ids missing
   * from the user's list (e.g. the new 'sexual-health' plan) are added.
   */
  if (state.seedVersion < 4) {
    seeded.schedule = structuredClone(SEED_SCHEDULE);
    const existingPlanIds = new Set(seeded.plans.map((p) => p.id));
    const newPlans = SEED_PLANS.filter((p) => !existingPlanIds.has(p.id));
    if (newPlans.length) seeded.plans = [...seeded.plans, ...structuredClone(newPlans)];
  }

  /**
   * Photo drill moved from a habit (Mon/Thu cadence) to a real schedule row
   * (PHOTO_DRILL_ROW, 22:55 Mon/Thu) so it stops double-booking Today as both
   * a "Due" prompt and a timetable checkbox, and "Self-timer set" was
   * reworded to actually say what it is. Schedule is rewritten outright, same
   * as the seedVersion 4 step, since it's authored content with no editor.
   * The habit list keeps any habit the user has since renamed/added — only
   * the exact old title is dropped or replaced.
   */
  if (state.seedVersion < 6) {
    seeded.schedule = structuredClone(SEED_SCHEDULE);
    seeded.habits = seeded.habits
      .filter((h) => h.title !== 'Photo drill — 10 min')
      .map((h) =>
        h.title === 'Self-timer set — 30 shots'
          ? { ...h, title: 'Self-timer photos — 30 solo shots on a timer, practicing poses' }
          : h
      );
  }

  /**
   * Office every weekday (out the door 09:00, home ~17:15), 8 hours of
   * sleep, and a lighter week: one effortful thing per evening, badminton
   * and run club dropped, and some slots alternating week A/B in pairs.
   * Neck/posture/kegels are a home stack before bed, not the gym or bus.
   * Supersedes seedVersions 7–9, earlier cuts of this same week. Schedule is replaced outright as in the
   * steps above. Each touched plan's `when` (and the gym's `where`, which
   * described the old Tue/Wed off-peak trip) is replaced from the seed since
   * it only ever restates the timetable — `how`/`aim`/milestones, where
   * review edits land, are left alone — except the one startup `how` line
   * the new mornings made false. Startup drops 13.5 -> 7 hours a week and
   * nights out 5 -> 4, so those goals follow, but only if still an old
   * seed value.
   */
  if (state.seedVersion < 10) {
    seeded.schedule = structuredClone(SEED_SCHEDULE);
    const seedById = new Map(SEED_PLANS.map((p) => [p.id, p]));
    seeded.plans = seeded.plans.map((p) => {
      const seed = seedById.get(p.id);
      if (!seed || !SCHEDULE_WHEN_PLAN_IDS.includes(p.id)) return p;
      const next = { ...p, when: structuredClone(seed.when) };
      if (p.id === 'gym') next.where = structuredClone(seed.where);
      if (p.id === 'startup' && p.how) next.how = p.how.filter((h) => h !== REMOVED_STARTUP_HOW);
      return next;
    });
    const seedChecks = new Map(SEED_CHECKS.map((c) => [c[0], c]));
    seeded.checks = seeded.checks.map((c) =>
      OLD_CHECK_SUBS_V10.some(([k, sub]) => c[0] === k && c[2] === sub) ? [c[0], c[1], seedChecks.get(c[0])![2]] : c
    );
    const goals = { ...seeded.weekGoals };
    if (OLD_HOURS_GOALS.has(goals.hours)) goals.hours = SEED_WEEK_GOALS.hours;
    if (OLD_OUT_GOALS.has(goals.out)) goals.out = SEED_WEEK_GOALS.out;
    seeded.weekGoals = goals;
  }

  /**
   * Presence and voice, plus weekday-limited checks. Everything is additive:
   * the plan is added only if no plan has that id, `how` lines only if absent,
   * tasks only if no task shares the title, checks' `days` only where unset,
   * and schedule notes only where the stored text still equals the old seed.
   */
  if (state.seedVersion < 13) {
    // Counters were removed: drop their logged numbers from every day. Only habit completion
    // counts ("habit:<id>") live in days[].n now.
    seeded.days = Object.fromEntries(
      Object.entries(seeded.days).map(([k, d]) => [
        k,
        { ...d, n: Object.fromEntries(Object.entries(d.n ?? {}).filter(([nk]) => nk.startsWith('habit:'))) },
      ])
    );
  }

  if (state.seedVersion < 12) {
    // Counters were removed. Weekly goals now only exist for checks (gym, out, protein); goals
    // that belonged to counters are dropped. Past per-day numbers in days[].n are left alone.
    seeded.weekGoals = Object.fromEntries(
      Object.entries(seeded.weekGoals).filter(([k]) => seeded.checks.some((c) => c[0] === k))
    );
  }

  if (state.seedVersion < 11) {
    if (!seeded.plans.some((p) => p.id === PRESENCE_PLAN.id)) {
      seeded.plans = [...seeded.plans, structuredClone(PRESENCE_PLAN)];
    }
    seeded.plans = seeded.plans.map((p) => {
      const line = HOW_ADDITIONS_V11[p.id];
      if (!line || p.how?.includes(line)) return p;
      return { ...p, how: [...(p.how ?? []), line] };
    });

    const existingTitles = new Set(seeded.tasks.map((t) => t.title));
    const newTasks = NEW_TASKS_V11.filter((t) => !existingTitles.has(t.title)).map((t) => ({
      ...t,
      id: newId(),
      createdAt: Date.now(),
      status: 'pending' as const,
    }));
    if (newTasks.length) seeded.tasks = [...seeded.tasks, ...newTasks];

    seeded.checks = seeded.checks.map((c) =>
      c[3] === undefined && CHECK_DAYS_V11[c[0]] ? [c[0], c[1], c[2], [...CHECK_DAYS_V11[c[0]]]] : c
    );
    if (!seeded.checks.some((c) => c[0] === PREOUT_CHECK[0])) {
      seeded.checks = [...seeded.checks, structuredClone(PREOUT_CHECK)];
    }

    const schedule = { ...seeded.schedule };
    for (const [dow, time, title, oldNote, newNote] of SCHEDULE_NOTES_V11) {
      const entry = schedule[dow];
      if (!entry) continue;
      schedule[dow] = [
        entry[0],
        entry[1].map((r) => (r[0] === time && r[1] === title && r[2] === oldNote ? ([r[0], r[1], newNote, ...r.slice(3)] as typeof r) : r)),
      ];
    }
    seeded.schedule = schedule;
  }

  return seeded;
}
