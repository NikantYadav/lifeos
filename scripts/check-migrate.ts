import assert from 'node:assert/strict';
import { migrateState, CURRENT_SEED_VERSION } from '../src/lib/migrate';
import { SEED_CHECKS, SEED_PLANS, SEED_SCHEDULE, SEED_TASKS, NEW_MORNING_NOTE, OLD_MORNING_NOTE, SEED_WEEK_GOALS, SEED_COUNTS, SEED_HABITS } from '../src/lib/data';
import { parseState } from '../src/lib/validate';
import { EMPTY_STATE, AppState } from '../src/lib/types';

// v10-shaped: seed content minus the v11 additions.
const v10: AppState = structuredClone({ ...EMPTY_STATE, seedVersion: 10, startDate: '2026-09-15' });
v10.plans = structuredClone(SEED_PLANS).filter((p) => p.id !== 'presence');
for (const p of v10.plans) if (p.how) p.how = p.how.filter((h) => !/Voice, pace, fillers|One standout item|Rare, specific compliments/.test(h));
v10.schedule = structuredClone(SEED_SCHEDULE);
for (const d of [1, 2, 3, 4, 5]) for (const r of v10.schedule[d][1]) if (r[0] === '08:35') r[2] = OLD_MORNING_NOTE;
v10.checks = SEED_CHECKS.filter((c) => c[0] !== 'preout').map((c) => [c[0], c[1], c[2]]);
v10.counts = structuredClone(SEED_COUNTS);
v10.weekGoals = { ...SEED_WEEK_GOALS };
v10.habits = SEED_HABITS.map((h, i) => ({ ...h, id: 'h' + i, createdAt: 1 }));
v10.tasks = SEED_TASKS.filter((t) => !/signature story|standout piece|solo trip/.test(t.title)).map((t, i) => ({ ...t, id: 't' + i, createdAt: 1, status: 'pending' as const }));
const edited = structuredClone(v10);
edited.schedule[2][1].find((r) => r[0] === '08:35')![2] = 'my own note';

const m = migrateState(v10);
assert.equal(m.seedVersion, CURRENT_SEED_VERSION);
const presence = m.plans.find((p) => p.id === 'presence')!;
assert.ok(presence && presence.milestones!.length === 3 && presence.how!.length === 9);
assert.ok(m.plans.find((p) => p.id === 'speak')!.how!.some((h) => h.includes('Voice, pace')));
assert.ok(m.plans.find((p) => p.id === 'style')!.how!.some((h) => h.includes('standout item')));
assert.ok(m.plans.find((p) => p.id === 'social')!.how!.some((h) => h.includes('compliments')));
assert.deepEqual(m.checks.find((c) => c[0] === 'gym')![3], [1, 2, 3, 4, 5]);
assert.deepEqual(m.checks.find((c) => c[0] === 'startup')![3], [2, 4, 6]);
assert.deepEqual(m.checks.find((c) => c[0] === 'out')![3], [1, 5, 6]);
assert.equal(m.checks.find((c) => c[0] === 'protein')!.length, 3);
assert.deepEqual(m.checks.find((c) => c[0] === 'preout')![3], [5, 6]);
assert.equal(m.tasks.length, v10.tasks.length + 3);
for (const t of m.tasks) assert.ok(t.triggerWeek > 5 || t.status, t.title);
for (const t of m.tasks.slice(-3)) assert.ok(t.triggerWeek > 5);
assert.equal(m.schedule[1][1].find((r) => r[0] === '08:35')![2], NEW_MORNING_NOTE);
assert.ok(m.schedule[5][1].find((r) => r[1].startsWith('Shower, best'))![2].includes('pre-out'));
assert.ok(m.schedule[6][1].find((r) => r[1].startsWith('Photo drill'))![2].includes('pre-out'));
assert.equal(m.schedule[5][1].find((r) => r[0] === '20:00')![3], 1); // flags preserved

// idempotent: re-run at older version on migrated output changes nothing
const again = migrateState({ ...m, seedVersion: 10 });
assert.deepEqual({ ...again, seedVersion: 0 }, { ...m, seedVersion: 0 });
assert.equal(migrateState(m), m);

// user edit preserved
const me = migrateState(edited);
assert.equal(me.schedule[2][1].find((r) => r[0] === '08:35')![2], 'my own note');
assert.equal(me.schedule[1][1].find((r) => r[0] === '08:35')![2], NEW_MORNING_NOTE);

// fresh install
const fresh = migrateState({ ...EMPTY_STATE });
assert.equal(fresh.plans.filter((p) => p.id === 'presence').length, 1);
assert.equal(fresh.checks.filter((c) => c[0] === 'preout').length, 1);
assert.equal(fresh.tasks.filter((t) => t.title === 'Plan a short solo trip').length, 1);
assert.equal(fresh.plans.find((p) => p.id === 'speak')!.how!.filter((h) => h.includes('Voice, pace')).length, 1);

// parseState
const p = parseState({ checks: [['a', 'A', 's', [3, 1, 1, 9, -1, 2.5, 'x', 0]], ['b', 'B', 's', []], ['c', 'C', 's', 'nope'], ['d', 'D', 's', [7]], ['e', 'E']] });
assert.deepEqual(p.checks, [['a', 'A', 's', [0, 1, 3]], ['b', 'B', 's'], ['c', 'C', 's'], ['d', 'D', 's'], ['e', 'E', '']]);
console.log('all ok');
