/**
 * Golden-fixture generator for the LifeOS Kotlin port (lifeos-launcher, :data:lifeos).
 *
 * Runs the REAL TS functions over fixture states x a date/time matrix and writes
 * `{inputs, outputs}` JSON files (parallel arrays) into the launcher repo's test resources.
 *
 * Run from the web repo root:
 *   npx -y tsx --tsconfig tsconfig.json scripts/parity/golden/generate.ts
 *
 * Dates are built from explicit local components, so the machine timezone does not matter
 * (day keys are local calendar days).
 */
import fs from 'node:fs';
import path from 'node:path';
import { currentSchedIndex, currentWeekIndex, daysBetween, fromIso, iso, mondayOf, rowsForWeek, TOTAL_WEEKS, weekDates, weekLetter } from '../../../src/lib/dates';
import { weekScore, weekTotals } from '../../../src/lib/score';
import { bestStreak, currentStreak, lifetimeCount } from '../../../src/lib/streaks';
import { dueHabits, isDue } from '../../../src/lib/habits';
import { isOverdue, resolvedTasks, visibleTasks, weeksOverdue } from '../../../src/lib/tasks';
import { staleList } from '../../../src/lib/people';
import { renderBold } from '../../../src/lib/markup';
import { END, DAYNAMES } from '../../../src/lib/data';
import { AppState, DayEntry, Habit, Plan, SchedRow } from '../../../src/lib/types';

const LAUNCHER = '/home/nikant/Desktop/lifeos-launcher/data/lifeos/src/test/resources';
const OUT = path.join(LAUNCHER, 'golden');
fs.mkdirSync(OUT, { recursive: true });

const seed: AppState = JSON.parse(fs.readFileSync(path.join(LAUNCHER, 'seed_state.json'), 'utf8'));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------- deterministic RNG ----------
let rngState = 12345;
function rnd(): number {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
}

// ---------- date helpers ----------
function parseAt(s: string): Date {
  // 'YYYY-MM-DDTHH:MM' -> local Date from explicit components
  const [d, t] = s.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(y, m - 1, dd, h, mi);
}

/** The date/time matrix. */
const AT: string[] = [
  '2026-09-13T10:00', // Sunday, before the plan start
  '2026-09-14T00:10', // Monday, past-midnight
  '2026-09-15T08:00', // plan start date (Tuesday)
  '2026-09-20T23:59', // Sunday 23:59
  '2026-09-21T00:00', // Monday, week B begins
  '2026-09-27T12:00', // Sunday, week B
  '2026-10-08T00:10', // Thursday, past midnight
  '2026-10-12T07:30', // Monday week C(A)
  '2026-12-31T12:00',
  '2027-03-01T12:00', // END
  '2027-03-08T09:00', // after week 24
  '2026-03-29T02:30', // DST in Europe, irrelevant in IST, before start
  '2028-02-29T18:45', // leap day
];

// ---------- fixture states ----------
function makeDays(from: string, to: string, p: number): Record<string, DayEntry> {
  const days: Record<string, DayEntry> = {};
  for (let d = fromIso(from); iso(d) <= to; d.setDate(d.getDate() + 1)) {
    if (rnd() > p) continue;
    const c: Record<string, boolean> = {};
    for (const k of ['gym', 'out', 'protein', 'startup', 'read', 'skin']) {
      const r = rnd();
      if (r < 0.55) c[k] = true;
      else if (r < 0.65) c[k] = false;
    }
    const n: Record<string, number> = {};
    if (rnd() < 0.7) n.convos = Math.floor(rnd() * 7);
    if (rnd() < 0.6) n.hours = Math.floor(rnd() * 19) / 2;
    if (rnd() < 0.4) n.pages = Math.floor(rnd() * 12) * 10;
    if (rnd() < 0.4) n.approaches = Math.floor(rnd() * 5);
    if (rnd() < 0.3) n.followups = Math.floor(rnd() * 3);
    if (rnd() < 0.3) n.ig = Math.floor(rnd() * 3);
    if (rnd() < 0.2) n.invites = Math.floor(rnd() * 2);
    days[iso(d)] = { c, n };
  }
  return days;
}

function setRun(days: Record<string, DayEntry>, key: string, from: string, to: string) {
  for (let d = fromIso(from); iso(d) <= to; d.setDate(d.getDate() + 1)) {
    const k = iso(d);
    days[k] = days[k] ?? { c: {}, n: {} };
    days[k].c[key] = true;
  }
}

const busy: AppState = clone(seed);
busy.startDate = '2026-09-14';
busy.days = makeDays('2026-09-01', '2026-12-31', 0.85);
setRun(busy.days, 'gym', '2026-09-20', '2026-09-30'); // long run
setRun(busy.days, 'out', '2026-10-06', '2026-10-08'); // streak ending on a matrix day
setRun(busy.days, 'protein', '2026-09-14', '2026-09-27');
busy.days['2026-10-08'].c.out = true;
busy.days['2026-10-02'] = { c: { gym: false }, n: { 'habit:abc': 2, approaches: 0 } };
busy.days['2026-10-03'] = { c: { approaches: true }, n: { approaches: 0 } }; // n==0 falls through to c
busy.people = [
  { id: 'p1', name: 'Fresh', where: 'gym', stage: 2, last: '2026-10-07' },
  { id: 'p2', name: 'Warn', where: 'cafe', stage: 1, last: '2026-10-01' },
  { id: 'p3', name: 'Stale', where: '', stage: 3, last: '2026-09-10' },
  { id: 'p4', name: 'Never', where: 'run club', stage: 1, last: '' },
  { id: 'p5', name: 'Boundary7', where: 'x', stage: 4, last: '2026-10-01' },
  { id: 'p6', name: 'Boundary14', where: 'x', stage: 2, last: '2026-09-24' },
  { id: 'p7', name: 'Future', where: 'x', stage: 2, last: '2026-12-31' },
  { id: 'p8', name: 'Tie', where: 'y', stage: 2, last: '2026-09-10' },
] as AppState['people'];
busy.tasks = [
  { id: 't1', title: 'pending wk0', detail: 'd', planId: 'skin', triggerWeek: 0, status: 'pending', createdAt: 300 },
  { id: 't2', title: 'pending wk3', detail: '', triggerWeek: 3, status: 'pending', createdAt: 100 },
  { id: 't3', title: 'pending wk0 older', detail: '', triggerWeek: 0, status: 'pending', createdAt: 100 },
  { id: 't4', title: 'done', detail: '', triggerWeek: 1, status: 'done', createdAt: 5, doneAt: '2026-10-02' },
  { id: 't5', title: 'dropped', detail: '', triggerWeek: 2, status: 'dropped', createdAt: 6, droppedAt: '2026-10-05', droppedReason: 'nah' },
  { id: 't6', title: 'dropped2', detail: '', triggerWeek: 2, status: 'dropped', createdAt: 7, droppedAt: '2026-10-02' },
  { id: 't7', title: 'pending wk10', detail: '', triggerWeek: 10, status: 'pending', createdAt: 1 },
  { id: 't8', title: 'pending wk3 same created', detail: '', triggerWeek: 3, status: 'pending', createdAt: 100 },
] as AppState['tasks'];
busy.habits = [
  { id: 'h1', title: 'never done', cadence: { kind: 'everyNDays', n: 2 }, createdAt: 1 },
  { id: 'h2', title: 'every 3 days', cadence: { kind: 'everyNDays', n: 3 }, lastDone: '2026-10-05', createdAt: 1 },
  { id: 'h3', title: 'weekly Mon+Thu', cadence: { kind: 'weeklyOnDays', days: [1, 4] }, lastDone: '2026-10-01', createdAt: 1 },
  { id: 'h4', title: 'weekly Sunday', cadence: { kind: 'weeklyOnDays', days: [0] }, lastDone: '2026-09-27', createdAt: 1 },
  { id: 'h5', title: 'every 2 weeks', cadence: { kind: 'everyNWeeks', n: 2 }, lastDone: '2026-09-24', createdAt: 1 },
  { id: 'h6', title: 'done today', cadence: { kind: 'everyNDays', n: 1 }, lastDone: '2026-10-08', createdAt: 1 },
] as AppState['habits'];
busy.skips = [{ id: 's1', date: '2026-10-07', checkKey: 'gym', reason: 'tired', createdAt: 1 }] as AppState['skips'];
busy.milestoneChecks = [
  { id: 'm1', planId: 'social', week: 6, description: 'x', status: 'hit', checkedAt: '2026-10-30' },
  { id: 'm2', planId: 'gym', week: 4, description: 'x', status: 'partial', checkedAt: '2026-10-30' },
  { id: 'm3', planId: 'nope', week: 2, description: 'x', status: 'missed', checkedAt: '2026-10-30' },
] as AppState['milestoneChecks'];
busy.weights = [
  { id: 'w1', date: '2026-10-07', kg: 80 }, { id: 'w2', date: '2026-10-20', kg: 79.5 },
] as AppState['weights'];
busy.approaches = [{ id: 'a1', date: '2026-10-08', where: 'x', opener: 'y', out: 'good', lesson: '' }] as AppState['approaches'];
busy.reviews = [{ id: 'r1', weekIndex: 3, generatedAt: 1, narrative: '', pattern: '', proposedDiffs: [], diffDecisions: {} }] as AppState['reviews'];

// minimal: hand-made schedule with wrap rows, week tags, equal times, missing days
const minimal: AppState = {
  days: { '2026-09-16': { c: { gym: true }, n: { pages: 40 } }, '2026-09-17': { c: { gym: true, out: true }, n: { hours: 2.5, convos: 3 } } },
  people: [], approaches: [], weights: [], startDate: '2026-09-16',
  plans: [
    { id: 'gym', name: 'Gym', aim: '', milestones: [[0, 'start'], [1, 'next'], [30, 'far']] },
    { id: 'x', name: 'X', aim: '' },
  ] as Plan[],
  schedule: {
    0: ['Sunday wrap', [
      ['22:00', 'Late', 'n', 1, 'gym'],
      ['02:00', 'After midnight', ''],
      ['08:00', 'Morning A', '', 0, null, 'A'],
      ['08:00', 'Morning B', '', 1, 'x', 'B'],
      ['12:00', 'Noon', ''],
      ['12:00', 'Noon dup', '', 1, 'gone'],
      ['20:00', 'Out', 'late', 1, 'gym'],
    ]],
    1: ['Monday', [['07:00', 'Wake', ''], ['09:00', 'Gym', '', 1, 'gym'], ['23:30', 'Wind down', '', true as unknown as number]]],
    4: ['Thursday empty', []],
    5: ['Friday wrap-last', [['08:00', 'a', ''], ['20:00', 'Out', '', 1, 'out'], ['02:00', 'tail', '']]],
  } as unknown as AppState['schedule'],
  weekGoals: { pages: 200, hours: 7, convos: 5, gym: 5, out: 4, protein: 6, followups: 1 },
  checks: [['gym', 'Gym', 'sub'], ['extra', 'Extra', ''], ['protein', 'P', 'p sub'], ['x', 'X check', '']],
  counts: [['pages', 'Pages'], ['hours', 'Hours'], ['convos', 'Convos']],
  seedVersion: 1, tasks: [], habits: [], skips: [], milestoneChecks: [], reviews: [], rev: 0, updatedAt: 0,
} as unknown as AppState;

// sunday start + counts that overlap CHECK_GOALS (double counting)
const sunStart: AppState = clone(seed);
sunStart.startDate = '2026-09-20';
sunStart.counts = [...sunStart.counts, ['out', 'Out count'], ['gym', 'Gym count']];
sunStart.days = makeDays('2026-09-10', '2026-11-30', 0.8);
setRun(sunStart.days, 'out', '2026-09-28', '2026-10-08');
sunStart.days['2026-09-29'].n.out = 2;
sunStart.days['2026-09-30'].n.gym = 1;
sunStart.people = [
  { id: 'q1', name: 'A', where: '', stage: 1, last: '2026-10-08' },
  { id: 'q2', name: 'B', where: 'z', stage: 1, last: '2026-09-30' },
  { id: 'q3', name: 'C', where: 'z', stage: 1, last: '' },
] as AppState['people'];
sunStart.milestoneChecks = [];

const STATES: Record<string, AppState> = { seed, busy, minimal, sunStart };
const VARIANTS: Record<string, AppState> = { busy, minimal, sunStart };
write('states', VARIANTS);

function write(name: string, data: unknown) {
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(data) + '\n');
}
const file = (name: string, inputs: unknown[], outputs: unknown[]) => write(name, { inputs, outputs });

// ---------- dates.json ----------
{
  const inputs: unknown[] = [];
  const outputs: unknown[] = [];
  const starts = ['2026-09-15', '2026-09-16', '2026-09-20', '2026-09-14'];
  for (const at of AT) {
    for (const startDate of starts) {
      const d = parseAt(at);
      const wi = currentWeekIndex(d, startDate);
      inputs.push({ fn: 'dateInfo', at, startDate });
      outputs.push({
        iso: iso(d), jsDay: d.getDay(), dayOfMonth: d.getDate(), monday: iso(mondayOf(d)),
        weekIndex: wi, letter: weekLetter(wi), weekDates: weekDates(wi, startDate),
        daysToEnd: daysBetween(d, END),
      });
    }
  }
  for (const startDate of starts) {
    for (let wi = 0; wi <= TOTAL_WEEKS + 1; wi++) {
      inputs.push({ fn: 'weekDates', wi, startDate });
      outputs.push({ weekDates: weekDates(wi, startDate), letter: weekLetter(wi) });
    }
  }
  for (const [a, b] of [['2026-09-15', '2026-09-15'], ['2026-09-15', '2027-03-01'], ['2027-03-01', '2026-09-15'], ['2026-02-27', '2026-03-02'], ['2028-02-28', '2028-03-01'], ['2026-12-31', '2027-01-01']]) {
    inputs.push({ fn: 'daysBetween', a, b });
    outputs.push({ days: daysBetween(fromIso(a), fromIso(b)) });
  }
  // schedule rows: rowsForWeek + currentSchedIndex
  const times = ['00:00', '00:10', '01:59', '02:00', '07:00', '08:29', '08:30', '09:00', '12:00', '12:01', '20:00', '22:00', '23:30', '23:59'];
  for (const [sname, st] of Object.entries(STATES)) {
    for (const dow of ['0', '1', '2', '3', '4', '5', '6']) {
      const entry = (st.schedule as unknown as Record<string, [string, SchedRow[]]>)[dow];
      for (const week of ['A', 'B'] as const) {
        const rows = rowsForWeek(entry?.[1] ?? [], week);
        for (const time of times) {
          const now = parseAt('2026-10-08T' + time);
          inputs.push({ fn: 'sched', state: sname, dow, week, time });
          outputs.push({ rows: rows.map((r) => r[0] + '|' + r[1]), index: currentSchedIndex(rows, now) });
        }
      }
    }
  }
  file('dates', inputs, outputs);
}

// ---------- score.json ----------
{
  const inputs: unknown[] = [], outputs: unknown[] = [];
  for (const [sname, st] of Object.entries(STATES)) {
    for (let wi = 0; wi <= TOTAL_WEEKS; wi++) {
      inputs.push({ state: sname, wi });
      outputs.push({ totals: weekTotals(st, wi), score: weekScore(st, wi) });
    }
  }
  file('score', inputs, outputs);
}

// ---------- streaks.json ----------
{
  const inputs: unknown[] = [], outputs: unknown[] = [];
  const keys = ['gym', 'out', 'protein', 'approaches', 'startup', 'habit:abc', 'nothing'];
  for (const [sname, st] of Object.entries(STATES)) {
    for (const key of keys) {
      for (const at of AT) {
        inputs.push({ state: sname, key, at });
        outputs.push({ lifetime: lifetimeCount(st, key), current: currentStreak(st, key, parseAt(at)), best: bestStreak(st, key) });
      }
    }
  }
  file('streaks', inputs, outputs);
}

// ---------- habits.json ----------
{
  const inputs: unknown[] = [], outputs: unknown[] = [];
  for (const [sname, st] of Object.entries(STATES)) {
    for (const at of AT) {
      const d = parseAt(at);
      inputs.push({ fn: 'state', state: sname, at });
      outputs.push({ due: dueHabits(st.habits, d).map((h) => h.id), each: st.habits.map((h) => isDue(h, d)) });
    }
  }
  const cadences: Habit['cadence'][] = [
    { kind: 'everyNDays', n: 1 }, { kind: 'everyNDays', n: 3 },
    { kind: 'weeklyOnDays', days: [0, 3] }, { kind: 'weeklyOnDays', days: [1] }, { kind: 'weeklyOnDays', days: [] },
    { kind: 'everyNWeeks', n: 2 }, { kind: 'everyNWeeks', n: 1 },
  ];
  const lastDones = [undefined, '2026-09-20', '2026-10-04', '2026-10-07', '2026-10-08', '2026-10-12'];
  for (const cadence of cadences) {
    for (const lastDone of lastDones) {
      for (const at of AT) {
        const habit = { id: 'z', title: 'z', cadence, lastDone, createdAt: 0 } as Habit;
        inputs.push({ fn: 'single', cadence, lastDone: lastDone ?? null, at });
        outputs.push({ due: isDue(habit, parseAt(at)) });
      }
    }
  }
  file('habits', inputs, outputs);
}

// ---------- tasks.json ----------
{
  const inputs: unknown[] = [], outputs: unknown[] = [];
  for (const [sname, st] of Object.entries(STATES)) {
    for (let wk = 0; wk <= TOTAL_WEEKS; wk++) {
      inputs.push({ state: sname, curWeek: wk });
      outputs.push({
        visible: visibleTasks(st.tasks, wk).map((t) => t.id),
        resolved: resolvedTasks(st.tasks).map((t) => t.id),
        overdue: st.tasks.map((t) => isOverdue(t, wk)),
        weeksOverdue: st.tasks.map((t) => weeksOverdue(t, wk)),
      });
    }
  }
  file('tasks', inputs, outputs);
}

// ---------- people.json ----------
{
  const inputs: unknown[] = [], outputs: unknown[] = [];
  for (const [sname, st] of Object.entries(STATES)) {
    for (const at of AT) {
      inputs.push({ state: sname, at });
      outputs.push({
        stale: staleList(st.people, parseAt(at)).map((e) => ({ id: e.person.id, days: Number.isFinite(e.days) ? e.days : null, tier: e.tier })),
      });
    }
  }
  file('people', inputs, outputs);
}

// ---------- markup.json ----------
{
  const strings: string[] = [];
  const collect = (v: unknown) => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  collect(seed.plans);
  strings.push(
    'plain', '', '<b>bold</b>', 'a <b>b</b> c <b>d</b>', '<b></b>', '<b>unclosed',
    'x <a href="https://example.com/p?q=1">link</a> y', '<a href="http://insecure">no</a>',
    '<a href="https://a.b"><b>nested</b></a>', '<b>multi\nline</b> tail', '<b>a</b><b>b</b>',
    '<B>upper</B>', '<a href="https://x">one</a> and <a href="https://y">two</a>', 'tail </b> stray',
    '<b>with <a href="https://z">link</a> inside</b>',
  );
  const inputs: unknown[] = strings.map((text) => ({ text }));
  const outputs = strings.map((text) => {
    const node = renderBold(text) as { props: { children?: unknown } };
    const kids = ([] as unknown[]).concat(node.props.children ?? []) as unknown[];
    return {
      spans: kids.map((k) => {
        if (typeof k === 'string') return { text: k, bold: false, href: null };
        const el = k as { type: string; props: { children: string; href?: string } };
        return el.type === 'b'
          ? { text: el.props.children, bold: true, href: null }
          : { text: el.props.children, bold: false, href: el.props.href };
      }),
    };
  });
  file('markup', inputs, outputs);
}

// ---------- today.json ----------
// Faithful copy of buildActivities from src/components/panels/TodayPanel.tsx:100-116 (not exported).
interface Activity { key: string; label: string; sub?: string; planId?: string }
function buildActivities(rows: SchedRow[], checks: AppState['checks'], plans: Plan[]): Activity[] {
  const planIds = new Set(plans.map((p) => p.id));
  const fromSchedule: Activity[] = [];
  const seen = new Set<string>();
  for (const [, title, note, isKeyBlock, planId] of rows) {
    if (!isKeyBlock || !planId || seen.has(planId)) continue;
    seen.add(planId);
    fromSchedule.push({ key: planId, label: title, sub: note || undefined, planId: planIds.has(planId) ? planId : undefined });
  }
  const fromChecks: Activity[] = checks
    .filter(([k]) => !seen.has(k))
    .map(([k, lbl, sub]) => ({ key: k, label: lbl, sub: sub || undefined, planId: planIds.has(k) ? k : undefined }));
  return [...fromSchedule, ...fromChecks];
}
{
  const inputs: unknown[] = [], outputs: unknown[] = [];
  for (const [sname, st] of Object.entries(STATES)) {
    for (const at of AT) {
      const now = parseAt(at);
      const todayKey = iso(now);
      const day = st.days[todayKey] ?? { c: {}, n: {} };
      const curWeek = currentWeekIndex(now, st.startDate);
      const entry = (st.schedule as unknown as Record<number, [string, SchedRow[]]>)[now.getDay()];
      const week = weekLetter(curWeek);
      const rows = rowsForWeek(entry?.[1] ?? [], week);
      const activities = buildActivities(rows, st.checks, st.plans);
      const ordered = [...activities].sort((a, b) => Number(!!day.c[a.key]) - Number(!!day.c[b.key]));
      inputs.push({ fn: 'today', state: sname, at });
      outputs.push({
        dayKey: todayKey, dayOfWeek: now.getDay(), curWeek, weekLetter: week, label: entry?.[0] ?? '',
        rows: rows.map((r) => r[0] + '|' + r[1]), nowIndex: currentSchedIndex(rows, now),
        activities: ordered.map((a) => ({ key: a.key, label: a.label, sub: a.sub ?? null, planId: a.planId ?? null, done: !!day.c[a.key] })),
        doneCount: activities.filter((a) => day.c[a.key]).length, total: activities.length,
      });
    }
  }
  // counters: TodayPanel.tsx:140-141 (bump) and 192-194 (step / display)
  for (const key of ['pages', 'hours', 'convos', 'approaches']) {
    for (const cur of [0, 1, 2.5, 7.3, 0.05, 199.95, 10]) {
      for (const delta of [-10, -1, -0.5, 0.5, 1, 10]) {
        const step = key === 'pages' ? 10 : key === 'hours' ? 0.5 : 1;
        const next = Math.max(0, Math.round((cur + delta) * 10) / 10);
        inputs.push({ fn: 'counter', key, cur, delta });
        outputs.push({ step, next, shown: key === 'hours' ? next.toFixed(1) : String(next) });
      }
    }
  }
  file('today', inputs, outputs);
}

// ---------- hero.json ----------
{
  const inputs: unknown[] = [], outputs: unknown[] = [];
  for (const [sname, st] of Object.entries(STATES)) {
    for (const at of AT) {
      const today = parseAt(at);
      const curWeek = currentWeekIndex(today, st.startDate);
      // Hero.tsx:48, 63, 107-110
      const daysLeft = Math.max(0, daysBetween(today, END));
      const pct = Math.round(((curWeek + 1) / TOTAL_WEEKS) * 100);
      const bars = Array.from({ length: TOTAL_WEEKS }, (_, i) => (i <= curWeek ? Math.round(weekScore(st, i) * 100) : 0));
      // Hero.tsx:18-36 restartPlan, applied to a clone; report what it removed / set.
      const draft = clone(st);
      const stale = new Set(weekDates(curWeek, draft.startDate));
      stale.forEach((k) => { delete draft.days[k]; });
      draft.weights = draft.weights.filter((w) => !stale.has(w.date));
      draft.approaches = draft.approaches.filter((a) => !stale.has(a.date));
      draft.skips = draft.skips.filter((s) => !stale.has(s.date));
      draft.reviews = draft.reviews.filter((r) => r.weekIndex !== curWeek);
      draft.milestoneChecks = draft.milestoneChecks.filter((m) => m.week !== curWeek);
      draft.startDate = iso(mondayOf(today));
      const removed = <T extends { id: string }>(before: T[], after: T[]) => before.filter((b) => !after.some((a) => a.id === b.id)).map((b) => b.id);
      inputs.push({ state: sname, at });
      outputs.push({
        daysLeft, weekNumber: curWeek + 1, totalWeeks: TOTAL_WEEKS, pct, bars,
        restart: {
          staleDates: [...stale], weightIds: removed(st.weights, draft.weights), approachIds: removed(st.approaches, draft.approaches),
          skipIds: removed(st.skips, draft.skips), reviewIds: removed(st.reviews, draft.reviews),
          milestoneCheckIds: removed(st.milestoneChecks, draft.milestoneChecks), newStartDate: draft.startDate,
        },
      });
    }
  }
  file('hero', inputs, outputs);
}

// ---------- week.json (WeekPanel.tsx) ----------
{
  const CORE_ROWS: [string, string][] = [['out', 'Evenings out'], ['hours', 'Startup hours'], ['followups', 'Follow-ups']];
  const OTHER_ROWS: [string, string][] = [['gym', 'Gym sessions'], ['convos', 'Conversations'], ['approaches', 'Approaches'], ['ig', 'Instagram exchanges'], ['invites', 'Invites sent'], ['protein', 'Protein days'], ['pages', 'Pages read']];
  const LIFETIME_ROWS: [string, string][] = [['gym', 'gym sessions'], ['approaches', 'strangers approached'], ['out', 'evenings out']];
  const grid = (rows: [string, string][], totals: Record<string, number>, goals: Record<string, number>) =>
    rows.flatMap(([k, lbl]) => {
      const goal = goals[k];
      if (!goal) return [];
      const v = totals[k] || 0;
      return [{ key: k, label: lbl, value: v, valueText: k === 'hours' ? v.toFixed(1) : String(v), goal, goalText: String(goal), hit: v >= goal }];
    });
  const inputs: unknown[] = [], outputs: unknown[] = [];
  for (const [sname, st] of Object.entries(STATES)) {
    for (const at of AT) {
      const now = parseAt(at);
      const todayKey = iso(now);
      const curWeek = currentWeekIndex(now, st.startDate);
      const t = weekTotals(st, curWeek);
      const dates = weekDates(curWeek, st.startDate);
      const today = fromIso(todayKey);
      inputs.push({ state: sname, at });
      outputs.push({
        core: grid(CORE_ROWS, t, st.weekGoals), other: grid(OTHER_ROWS, t, st.weekGoals),
        lifetime: LIFETIME_ROWS.map(([k, lbl]) => ({ key: k, label: lbl, count: lifetimeCount(st, k), current: currentStreak(st, k, today), best: bestStreak(st, k) })),
        days: dates.map((k) => {
          const dt = fromIso(k);
          const d = st.days[k];
          const done = d ? st.checks.filter(([ck]) => d.c[ck]).length : 0;
          return { dayKey: k, label: `${DAYNAMES[dt.getDay()].slice(0, 3)} ${dt.getDate()}`, ticked: done, total: st.checks.length, isToday: k === todayKey, summary: done ? `${done} of ${st.checks.length} ticked` : 'nothing logged' };
        }),
      });
    }
  }
  file('week', inputs, outputs);
}

// ---------- milestones.json (MilestonePrompt.tsx:12-22, not exported) ----------
{
  const dueMilestones = (state: AppState, today: Date) => {
    const curWeek = currentWeekIndex(today, state.startDate);
    const out: { plan: Plan; week: number; description: string }[] = [];
    for (const plan of state.plans) {
      for (const [week, description] of plan.milestones ?? []) {
        if (week > curWeek) continue;
        const already = state.milestoneChecks.some((m) => m.planId === plan.id && m.week === week);
        if (!already) out.push({ plan, week, description });
      }
    }
    return out;
  };
  const inputs: unknown[] = [], outputs: unknown[] = [];
  for (const [sname, st] of Object.entries(STATES)) {
    for (const at of AT) {
      inputs.push({ state: sname, at });
      outputs.push({ due: dueMilestones(st, parseAt(at)).map((m) => ({ planId: m.plan.id, planName: m.plan.name, week: m.week, description: m.description, title: `${m.plan.name} — week ${m.week + 1}` })) });
    }
  }
  file('milestones', inputs, outputs);
}

// ---------- clock.json (useNow.ts:27-30 alignment) ----------
{
  const inputs: unknown[] = [], outputs: unknown[] = [];
  for (const ms of [0, 1, 59999, 60000, 60001, 1791470843794, 1791470820000, 1791470879999]) {
    inputs.push({ nowMs: ms });
    outputs.push({ delay: 60_000 - (ms % 60_000) });
  }
  file('clock', inputs, outputs);
}

console.log('golden written to', OUT);
