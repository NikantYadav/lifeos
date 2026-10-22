import assert from 'node:assert/strict';
import { sanitizeDiffs, parseCadence } from '../src/lib/diffs';
import { buildChatContext, buildSystemPrompt, trimMessages, CHAT_RESPONSE_SCHEMA } from '../src/lib/chat';
import { SEED_CHECKS, SEED_PLANS, SEED_SCHEDULE, SEED_WEEK_GOALS } from '../src/lib/data';
import { EMPTY_STATE, AppState } from '../src/lib/types';

const state: AppState = structuredClone({ ...EMPTY_STATE });
state.plans = structuredClone(SEED_PLANS);
state.schedule = structuredClone(SEED_SCHEDULE);
state.checks = structuredClone(SEED_CHECKS);
state.weekGoals = { ...SEED_WEEK_GOALS };
state.tasks = [{ id: 't1', title: 'x', detail: '', triggerWeek: 0, status: 'pending', createdAt: 1 }];
state.habits = [{ id: 'h1', title: 'y', cadence: { kind: 'everyNDays', n: 2 }, createdAt: 1 }];
state.approaches = [{ id: 'a1', date: '2026-10-21', where: 'cafe', opener: 'hi', out: 'good', lesson: 'SECRETLESSON' }];
state.weights = [1, 2, 3, 4, 5, 6].map((i) => ({ id: 'w' + i, date: `2026-10-0${i}`, kg: 80 + i }));
state.people = [{ id: 'p', name: 'Sam', where: 'gym', stage: 2, last: '2026-10-01' }];

const ids = { taskIds: new Set(['t1']), habitIds: new Set(['h1']) };
const chat = { ...ids, state };
const planId = state.plans[0].id;
const rows = state.schedule[3][1];
const n = rows.length;
const row = ['17:00', 'Gym', 'lift', 1, planId, null];
const run = (d: object, opts = chat) => sanitizeDiffs([d], opts);

// scheduleRow update: before overwritten from real state
let r = run({ kind: 'scheduleRow', op: 'update', dayOfWeek: 3, index: 0, row, before: ['FAKE'], after: 'x', reason: 'r' });
assert.equal(r.length, 1);
assert.deepEqual(r[0].before, [rows[0][0], rows[0][1], rows[0][2], rows[0][3] ? 1 : 0, rows[0][4] ?? null, rows[0][5] ?? null]);
assert.deepEqual(r[0].row, ['17:00', 'Gym', 'lift', 1, planId, null]);
assert.deepEqual(r[0].after, r[0].row);

// object-form row accepted, unknown planId nulled, week validated
r = run({ kind: 'scheduleRow', op: 'add', dayOfWeek: 3, index: n, row: { time: '23:30', title: 'T', planId: 'nope', week: 'B' }, reason: '' });
assert.equal(r.length, 1);
assert.deepEqual(r[0].row, ['23:30', 'T', '', 0, null, 'B']);
assert.equal(r[0].before, null);

// add bounds
assert.equal(run({ kind: 'scheduleRow', op: 'add', dayOfWeek: 3, index: 0, row, reason: '' }).length, 1);
assert.equal(run({ kind: 'scheduleRow', op: 'add', dayOfWeek: 3, index: n + 1, row, reason: '' }).length, 0);
assert.equal(run({ kind: 'scheduleRow', op: 'add', dayOfWeek: 3, index: -1, row, reason: '' }).length, 0);
// update/remove bounds
assert.equal(run({ kind: 'scheduleRow', op: 'update', dayOfWeek: 3, index: n, row, reason: '' }).length, 0);
assert.equal(run({ kind: 'scheduleRow', op: 'remove', dayOfWeek: 3, index: n, reason: '' }).length, 0);
// remove
r = run({ kind: 'scheduleRow', op: 'remove', dayOfWeek: 3, index: 1, before: 'junk', reason: 'x' });
assert.equal(r.length, 1);
assert.equal(r[0].after, null);
assert.equal(r[0].row, undefined);
assert.equal((r[0].before as string[])[1], rows[1][1]);
// bad inputs
for (const bad of [
  { time: '25:00', title: 'T' }, { time: '9:00', title: 'T' }, { time: '12:60', title: 'T' },
  { time: '12:00', title: '  ' }, { time: '12:00', title: 'T', week: 'C' }, 'str', null,
]) assert.equal(run({ kind: 'scheduleRow', op: 'add', dayOfWeek: 3, index: 0, row: bad, reason: '' }).length, 0, JSON.stringify(bad));
assert.equal(run({ kind: 'scheduleRow', op: 'add', dayOfWeek: 7, index: 0, row, reason: '' }).length, 0);
assert.equal(run({ kind: 'scheduleRow', op: 'add', dayOfWeek: 1.5, index: 0, row, reason: '' }).length, 0);
assert.equal(run({ kind: 'scheduleRow', op: 'add', dayOfWeek: 3, index: 0, reason: '' }).length, 0);
assert.equal(run({ kind: 'scheduleRow', op: 'bogus', dayOfWeek: 3, index: 0, row, reason: '' }).length, 0);
const noDay = structuredClone(state); delete noDay.schedule[3];
assert.equal(run({ kind: 'scheduleRow', op: 'add', dayOfWeek: 3, index: 0, row, reason: '' }, { ...ids, state: noDay }).length, 0);
// no-op update dropped
assert.equal(run({ kind: 'scheduleRow', op: 'update', dayOfWeek: 3, index: 0, row: [...rows[0]], reason: '' }).length, 0);
// review mode rejects scheduleRow
assert.equal(run({ kind: 'scheduleRow', op: 'remove', dayOfWeek: 3, index: 0, reason: '' }, ids as never).length, 0);

// cadence
assert.deepEqual(parseCadence({ kind: 'everyNDays', n: 3 }), { kind: 'everyNDays', n: 3 });
assert.deepEqual(parseCadence({ kind: 'everyNWeeks', n: 2 }), { kind: 'everyNWeeks', n: 2 });
assert.deepEqual(parseCadence({ kind: 'weeklyOnDays', days: [5, 1, 1] }), { kind: 'weeklyOnDays', days: [1, 5] });
for (const bad of [{ kind: 'everyNDays', n: 0 }, { kind: 'everyNDays', n: 1.5 }, { kind: 'weeklyOnDays', days: [] }, { kind: 'weeklyOnDays', days: [7] }, { kind: 'x' }, null, 'a'])
  assert.equal(parseCadence(bad), undefined);
r = run({ kind: 'habit', op: 'add', title: 'Walk', cadence: { kind: 'weeklyOnDays', days: [1, 2] }, reason: '' });
assert.deepEqual(r[0].cadence, { kind: 'weeklyOnDays', days: [1, 2] });
r = run({ kind: 'habit', op: 'add', title: 'Walk', cadence: { kind: 'everyNDays', n: -2 }, reason: '' });
assert.equal(r.length, 1); assert.equal(r[0].cadence, undefined);
r = sanitizeDiffs([{ kind: 'habit', op: 'add', title: 'Walk', cadence: { kind: 'everyNDays', n: 2 }, reason: '' }], ids);
assert.equal(r[0].cadence, undefined); // review ignores cadence

// bad/ask rejected in both modes
for (const field of ['bad', 'ask']) {
  assert.equal(run({ kind: 'plan', planId, field, before: 'a', after: 'b', reason: '' }).length, 0);
  assert.equal(sanitizeDiffs([{ kind: 'plan', planId, field, reason: '' }], ids).length, 0);
}
assert.equal(run({ kind: 'plan', planId, field: 'aim', before: 'a', after: 'b', reason: 'r' }).length, 1);

// review behaviour unchanged
r = sanitizeDiffs([
  { kind: 'task', op: 'drop', existingId: 't1', before: 'x', reason: 'r' },
  { kind: 'task', op: 'drop', existingId: 'ghost', reason: 'r' },
  { kind: 'task', op: 'retime', existingId: 't1', reason: 'r' },
  { kind: 'task', op: 'retime', existingId: 't1', triggerWeek: 2.6, reason: 'r' },
  { kind: 'habit', op: 'add', title: ' ', reason: 'r' },
  { kind: 'habit', op: 'drop', existingId: 'h1', reason: 'r' },
  { kind: 'weekGoals', key: 'approaches', before: '3', after: '4', reason: 'r' },
  { kind: 'schedule', dayOfWeek: 1, before: 'a', after: 'b', reason: 'r' },
  { kind: 'nope', reason: 'r' }, 'str', null,
], ids);
assert.deepEqual(r.map((d) => d.kind + ':' + (d.op ?? '')), ['task:drop', 'task:retime', 'habit:drop', 'weekGoals:', 'schedule:']);
assert.equal(r[1].triggerWeek, 3);
assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(r[3]))).sort(), ['after', 'before', 'key', 'kind', 'reason']);
assert.deepEqual(sanitizeDiffs('x', ids), []);

// context
const ctx = buildChatContext(state, new Date('2026-10-22T20:00:00Z')); // 01:30 Fri 23 Oct IST
assert.equal(ctx.now.date, '2026-10-23');
assert.equal(ctx.now.weekday, 'Friday');
assert.equal(ctx.now.time, '01:30');
assert.ok(ctx.schedule.find((d) => d.dayOfWeek === 3)!.rows.every((x, i) => x.index === i));
assert.deepEqual(ctx.people, [{ id: 'p', name: 'Sam', where: 'gym', stage: 2, last: '2026-10-01' }]);
const prompt = buildSystemPrompt(state, new Date());
for (const p of state.plans) {
  if (p.bad) assert.ok(!prompt.includes(p.bad), 'bad leaked');
  for (const a of p.ask ?? []) assert.ok(!prompt.includes(a), 'ask leaked');
}
assert.ok(!prompt.includes('SECRETLESSON'));
assert.ok(JSON.stringify(CHAT_RESPONSE_SCHEMA).includes('scheduleRow'));

// ---------- v2 kinds ----------
const NOW = new Date('2026-10-22T06:00:00Z'); // 11:30 Thu 22 Oct IST
const chatN = { ...ids, state, now: NOW };
const runN = (d: object) => sanitizeDiffs([d], chatN);
const sch = state.schedule;
const keyBlockKey = Object.values(sch).flatMap(([, rs]) => rs).find((x) => x[3] && x[4])![4]!;

// plan milestones: structured list -> after, sorted; before from real state; both modes
const ms = [{ week: 6, description: 'B' }, { week: 2, description: 'A' }];
for (const o of [chat, { ...ids, plans: state.plans }] as const) {
  r = run({ kind: 'plan', planId, field: 'milestones', milestones: ms, before: 'junk', after: 'junk', reason: 'r' }, o as never);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].after, [[2, 'A'], [6, 'B']]);
  assert.deepEqual(r[0].before, (state.plans[0].milestones ?? []).map(([w, d]) => [w, d]));
}
assert.deepEqual(run({ kind: 'plan', planId, field: 'milestones', after: [[3, 'x']], reason: '' })[0].after, [[3, 'x']]);
for (const bad of [
  undefined, 'a string', [{ week: -1, description: 'x' }], [{ week: 31, description: 'x' }], [{ week: 1.5, description: 'x' }],
  [{ week: 1, description: '' }], [{ week: 1, description: 'x'.repeat(201) }], [{ week: 1, description: 'a' }, { week: 1, description: 'b' }],
  Array.from({ length: 21 }, (_, i) => ({ week: i, description: 'x' })),
]) assert.equal(run({ kind: 'plan', planId, field: 'milestones', milestones: bad, reason: '' }).length, 0, JSON.stringify(bad));
assert.equal(run({ kind: 'plan', planId: 'nope', field: 'milestones', milestones: ms, reason: '' }).length, 0);
assert.equal(sanitizeDiffs([{ kind: 'plan', planId, field: 'milestones', milestones: ms, reason: '' }], ids).length, 0); // review w/o plans
assert.equal(run({ kind: 'plan', planId, field: 'milestones', milestones: Array.from({ length: 20 }, (_, i) => ({ week: i, description: 'x' })), reason: '' }).length, 1);

// habit retime
r = run({ kind: 'habit', op: 'retime', existingId: 'h1', cadence: { kind: 'everyNWeeks', n: 2 }, before: 'x', reason: '' });
assert.equal(r.length, 1);
assert.deepEqual(r[0].before, { kind: 'everyNDays', n: 2 });
assert.deepEqual(r[0].after, { kind: 'everyNWeeks', n: 2 });
assert.deepEqual(r[0].cadence, { kind: 'everyNWeeks', n: 2 });
for (const bad of [{ existingId: 'ghost', cadence: { kind: 'everyNDays', n: 1 } }, { existingId: 'h1' }, { existingId: 'h1', cadence: { kind: 'everyNDays', n: 0 } }])
  assert.equal(run({ kind: 'habit', op: 'retime', ...bad, reason: '' }).length, 0);

// newPlan
const np = { id: 'running', name: 'Running', aim: 'Sub-25 5K', when: ['AM', ' '], how: ['run'], warn: 'w', milestones: [{ week: 4, description: 'm' }], bad: 'BAD', ask: ['ASK'] };
r = run({ kind: 'newPlan', plan: np, before: 'x', after: 'y', reason: 'r' });
assert.equal(r.length, 1);
assert.equal(r[0].before, null);
assert.deepEqual(r[0].after, r[0].plan);
assert.deepEqual(r[0].plan, { id: 'running', name: 'Running', aim: 'Sub-25 5K', when: ['AM'], how: ['run'], warn: 'w', milestones: [[4, 'm']] });
assert.ok(!JSON.stringify(r).includes('BAD') && !JSON.stringify(r).includes('ASK'));
for (const bad of [{ id: 'X' }, { id: 'a' }, { id: planId }, { name: ' ' }, { aim: '' }, { milestones: [{ week: 99, description: 'x' }] }])
  assert.equal(run({ kind: 'newPlan', plan: { ...np, ...bad }, reason: '' }).length, 0, JSON.stringify(bad));
assert.equal(run({ kind: 'newPlan', reason: '' }).length, 0);
assert.equal(sanitizeDiffs([{ kind: 'newPlan', plan: np, reason: '' }], ids).length, 0); // review rejects
assert.equal(sanitizeDiffs([{ kind: 'newPlan', plan: np, reason: '' }, { kind: 'newPlan', plan: np, reason: '' }], chatN).length, 1); // dup id in batch

// check
const ck = state.checks[0];
r = run({ kind: 'check', op: 'add', key: 'stretch', label: 'Stretch', sub: '10 min', days: [5, 1, 1], before: 'x', reason: '' });
assert.deepEqual(r[0].after, ['stretch', 'Stretch', '10 min', [1, 5]]);
assert.equal(r[0].before, null);
r = run({ kind: 'check', op: 'add', key: 'stretch', label: 'Stretch', reason: '' });
assert.deepEqual(r[0].after, ['stretch', 'Stretch', '']);
assert.equal(r[0].days, null);
r = run({ kind: 'check', op: 'update', key: ck[0], days: [0, 6], reason: '' });
assert.deepEqual(r[0].before, ck);
assert.deepEqual(r[0].after, [ck[0], ck[1], ck[2], [0, 6]]);
r = run({ kind: 'check', op: 'update', key: ck[0], label: 'New label', days: null, reason: '' });
assert.deepEqual(r[0].after, [ck[0], 'New label', ck[2]]);
r = run({ kind: 'check', op: 'update', key: ck[0], label: 'New label', reason: '' }); // days untouched
assert.deepEqual(r[0].after, ck[3] ? [ck[0], 'New label', ck[2], ck[3]] : [ck[0], 'New label', ck[2]]);
r = run({ kind: 'check', op: 'remove', key: ck[0], reason: '' });
assert.deepEqual(r[0].before, ck); assert.equal(r[0].after, null);
for (const bad of [
  { op: 'add', key: ck[0], label: 'x' }, { op: 'add', key: 'Bad Key', label: 'x' }, { op: 'add', key: 'a', label: 'x' },
  { op: 'add', key: 'okk' }, { op: 'add', key: 'okk', label: ' ' }, { op: 'add', key: 'okk', label: 'x', days: [7] },
  { op: 'add', key: 'okk', label: 'x', days: [1.5] }, { op: 'add', key: 'okk', label: 'x', days: 'mon' },
  { op: 'update', key: 'ghost', label: 'x' }, { op: 'update', key: ck[0], label: '' }, { op: 'update', key: ck[0], label: ck[1], sub: ck[2], days: ck[3] ?? null },
  { op: 'remove', key: 'ghost' }, { op: 'bogus', key: ck[0] },
]) assert.equal(run({ kind: 'check', ...bad, reason: '' }).length, 0, JSON.stringify(bad));
assert.equal(sanitizeDiffs([{ kind: 'check', op: 'remove', key: ck[0], reason: '' }], ids).length, 0);

// log: check
state.days['2026-10-21'] = { c: { [ck[0]]: true }, n: {} };
r = runN({ kind: 'log', target: 'check', date: '2026-10-21', key: ck[0], done: false, before: 'x', reason: '' });
assert.equal(r[0].before, true); assert.equal(r[0].after, false); assert.equal(r[0].done, false);
r = runN({ kind: 'log', target: 'check', date: '2026-10-22', key: ck[0], done: true, reason: '' });
assert.equal(r[0].before, false);
assert.equal(runN({ kind: 'log', target: 'check', date: '2026-10-22', key: keyBlockKey, done: true, reason: '' }).length, 1);
for (const bad of [{ key: 'ghost', done: true }, { key: ck[0] }, { key: ck[0], done: 'yes' }, { done: true }])
  assert.equal(runN({ kind: 'log', target: 'check', date: '2026-10-22', ...bad, reason: '' }).length, 0, JSON.stringify(bad));
// dates: window today-14..today
for (const [dt, ok] of [['2026-10-22', 1], ['2026-10-08', 1], ['2026-10-07', 0], ['2026-10-23', 0], ['2026-02-30', 0], ['22-10-2026', 0], [undefined, 0]] as const)
  assert.equal(runN({ kind: 'log', target: 'check', date: dt, key: ck[0], done: true, reason: '' }).length, ok, String(dt));
// log: weight
r = runN({ kind: 'log', target: 'weight', date: '2026-10-22', kg: 80.4, reason: '' });
assert.equal(r[0].before, null); assert.equal(r[0].after, 80.4);
state.weights.push({ id: 'wx', date: '2026-10-21', kg: 81 });
assert.equal(runN({ kind: 'log', target: 'weight', date: '2026-10-21', kg: 80.4, reason: '' })[0].before, 81);
for (const kg of [29.9, 250.1, undefined, 'a']) assert.equal(runN({ kind: 'log', target: 'weight', date: '2026-10-22', kg, reason: '' }).length, 0, String(kg));
assert.equal(runN({ kind: 'log', target: 'weight', date: '2026-10-22', kg: 30, reason: '' }).length, 1);
// log: person
r = runN({ kind: 'log', target: 'person', date: '2026-10-22', person: { name: ' Priya ', where: 'badminton', stage: 1 }, reason: '' });
assert.deepEqual(r[0].person, { name: 'Priya', where: 'badminton', stage: 1 }); assert.equal(r[0].before, null);
r = runN({ kind: 'log', target: 'person', date: '2026-10-22', person: { id: 'p', name: 'Sam', stage: 3, last: '2026-10-22' }, reason: '' });
assert.deepEqual(r[0].before, state.people[0]); assert.deepEqual(r[0].after, { id: 'p', name: 'Sam', stage: 3, last: '2026-10-22' });
assert.equal(runN({ kind: 'log', target: 'person', date: '2026-10-22', person: { id: 'p', name: '' , stage: 3 }, reason: '' })[0].person!.name, 'Sam');
for (const person of [{ id: 'ghost', name: 'x' }, { name: '' }, { name: 'x', stage: 5 }, { name: 'x', stage: 0 }, { name: 'x', stage: 2.5 }, { name: 'x', last: 'yesterday' }, 'str', null, undefined])
  assert.equal(runN({ kind: 'log', target: 'person', date: '2026-10-22', person, reason: '' }).length, 0, JSON.stringify(person));
// log: approach
r = runN({ kind: 'log', target: 'approach', date: '2026-10-22', approach: { where: 'Third Wave', opener: 'hey', out: 'ig', lesson: 'l' }, reason: '' });
assert.equal(r[0].before, null); assert.deepEqual(r[0].after, { where: 'Third Wave', opener: 'hey', out: 'ig', lesson: 'l' });
for (const approach of [{ where: 'x', out: 'great' }, { where: 'x' }, 'str', null])
  assert.equal(runN({ kind: 'log', target: 'approach', date: '2026-10-22', approach, reason: '' }).length, 0, JSON.stringify(approach));
assert.equal(runN({ kind: 'log', target: 'bogus', date: '2026-10-22', reason: '' }).length, 0);
assert.equal(sanitizeDiffs([{ kind: 'log', target: 'weight', date: '2026-10-22', kg: 80, reason: '' }], ids).length, 0); // review rejects

// milestoneCheck
state.plans[0].milestones = [[3, 'Three things'], [6, 'Six things']];
r = run({ kind: 'milestoneCheck', planId, week: 3, status: 'partial', note: ' meh ', description: 'FAKE', reason: '' });
assert.equal(r[0].description, 'Three things'); assert.equal(r[0].before, null); assert.equal(r[0].note, 'meh');
state.milestoneChecks = [{ id: 'm1', planId, week: 3, description: 'Three things', status: 'missed', checkedAt: '2026-10-01' }];
assert.equal((run({ kind: 'milestoneCheck', planId, week: 3, status: 'hit', reason: '' })[0].before as { id: string }).id, 'm1');
for (const bad of [{ week: 4, status: 'hit' }, { planId: 'ghost', week: 3, status: 'hit' }, { week: 3, status: 'great' }, { week: 3 }, { week: 3.5, status: 'hit' }])
  assert.equal(run({ kind: 'milestoneCheck', planId, ...bad, reason: '' }).length, 0, JSON.stringify(bad));
assert.equal(sanitizeDiffs([{ kind: 'milestoneCheck', planId, week: 3, status: 'hit', reason: '' }], ids).length, 0);

// mixed batch: invalid diffs dropped individually
assert.equal(sanitizeDiffs([{ kind: 'check', op: 'remove', key: 'ghost', reason: '' }, { kind: 'check', op: 'remove', key: ck[0], reason: '' }, 5], chatN).length, 1);

// v2 context
const ctx2 = buildChatContext(state, NOW);
assert.deepEqual(ctx2.approachesLast14DaysByOutcome, { good: 1 });
assert.equal(ctx2.recentWeights.length, 5);
assert.ok(!('counts' in ctx2));
assert.equal(ctx2.last14Days['2026-10-21'].checks[ck[0]], true);
assert.deepEqual(ctx2.plans[0].milestones, [{ week: 3, description: 'Three things' }, { week: 6, description: 'Six things' }]);
assert.equal(ctx2.milestoneCheckIns.length, 1);
assert.ok(buildSystemPrompt(state, NOW).includes('current week index is ' + ctx2.now.weekIndex));
for (const k of ['newPlan', 'check', 'log', 'milestoneCheck', 'milestones', 'person', 'approach']) assert.ok(JSON.stringify(CHAT_RESPONSE_SCHEMA).includes(k), k);
assert.ok(!JSON.stringify(CHAT_RESPONSE_SCHEMA).includes('"bad"'));

// trimming
const many = Array.from({ length: 40 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: 'm' + i }));
many.push({ role: 'user', text: 'last' });
const t = trimMessages(many);
assert.ok(t.length <= 30 && t[0].role === 'user' && t[t.length - 1].text.endsWith('last'));

console.log('check-chat: ok');

// counters are gone: 'count' diffs and log target 'count' are dropped.
assert.equal(sanitizeDiffs([{ kind: 'count', op: 'add', key: 'pushups', label: 'P', reason: '' }], chatN).length, 0);
assert.equal(sanitizeDiffs([{ kind: 'log', target: 'count', date: '2026-10-22', key: 'x', value: 1, reason: '' }], chatN).length, 0);
console.log('check-chat counters: ok');
