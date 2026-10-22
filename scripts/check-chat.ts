import assert from 'node:assert/strict';
import { sanitizeDiffs, parseCadence } from '../src/lib/diffs';
import { buildChatContext, buildSystemPrompt, trimMessages, CHAT_RESPONSE_SCHEMA } from '../src/lib/chat';
import { SEED_CHECKS, SEED_PLANS, SEED_SCHEDULE, SEED_COUNTS, SEED_WEEK_GOALS } from '../src/lib/data';
import { EMPTY_STATE, AppState } from '../src/lib/types';

const state: AppState = structuredClone({ ...EMPTY_STATE });
state.plans = structuredClone(SEED_PLANS);
state.schedule = structuredClone(SEED_SCHEDULE);
state.checks = structuredClone(SEED_CHECKS);
state.counts = structuredClone(SEED_COUNTS);
state.weekGoals = { ...SEED_WEEK_GOALS };
state.tasks = [{ id: 't1', title: 'x', detail: '', triggerWeek: 0, status: 'pending', createdAt: 1 }];
state.habits = [{ id: 'h1', title: 'y', cadence: { kind: 'everyNDays', n: 2 }, createdAt: 1 }];
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
assert.deepEqual(ctx.people, [{ name: 'Sam', stage: 2 }]);
const prompt = buildSystemPrompt(state, new Date());
for (const p of state.plans) {
  if (p.bad) assert.ok(!prompt.includes(p.bad), 'bad leaked');
  for (const a of p.ask ?? []) assert.ok(!prompt.includes(a), 'ask leaked');
}
assert.ok(!prompt.includes('lesson'));
assert.ok(JSON.stringify(CHAT_RESPONSE_SCHEMA).includes('scheduleRow'));

// trimming
const many = Array.from({ length: 40 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: 'm' + i }));
many.push({ role: 'user', text: 'last' });
const t = trimMessages(many);
assert.ok(t.length <= 30 && t[0].role === 'user' && t[t.length - 1].text.endsWith('last'));

console.log('check-chat: ok');
