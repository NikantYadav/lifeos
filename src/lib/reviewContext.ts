import { currentWeekIndex } from './dates';
import { staleList } from './people';
import { weekScore, weekTotals } from './score';
import { AppState, Plan } from './types';

/** Plan content with the two fixed fields stripped before it ever reaches a prompt. */
export type SafePlan = Omit<Plan, 'bad' | 'ask'>;

export interface ReviewContext {
  weekIndex: number;
  weeksOfHistory: { weekIndex: number; totals: Record<string, number>; goals: Record<string, number>; score: number }[];
  skipReasons: { date: string; checkKey: string; reason: string; note?: string }[];
  staleContacts: { name: string; where: string; daysSinceContact: number; stage: number }[];
  approachLessons: { date: string; outcome: string; lesson: string }[];
  /** All pending tasks (not just overdue), with ids — a diff naming an existingId must reference one of these. */
  pendingTasks: { id: string; title: string; detail: string; planId?: string; triggerWeek: number; weeksOverdue: number }[];
  /** All habits, with ids — a diff naming an existingId must reference one of these. */
  habits: { id: string; title: string; planId?: string; cadence: unknown; lastDone?: string }[];
  upcomingMilestones: { planId: string; week: number; description: string }[];
  recentMilestoneChecks: { planId: string; week: number; status: string; note?: string }[];
  plans: SafePlan[];
}

function stripFixedFields(plan: Plan): SafePlan {
  const rest: Plan = { ...plan };
  delete rest.bad;
  delete rest.ask;
  return rest;
}

/** Pure, read-only assembly of everything the Sunday review prompt needs. */
export function buildReviewContext(state: AppState, now: Date): ReviewContext {
  const weekIdx = currentWeekIndex(now);

  const weeksOfHistory = [3, 2, 1, 0]
    .map((back) => weekIdx - back)
    .filter((wi) => wi >= 0)
    .map((wi) => ({
      weekIndex: wi,
      totals: weekTotals(state, wi),
      goals: state.weekGoals,
      score: weekScore(state, wi),
    }));

  const skipReasons = state.skips.slice(-40).map((s) => ({
    date: s.date,
    checkKey: s.checkKey,
    reason: s.reason,
    note: s.note,
  }));

  const staleContacts = staleList(state.people, now).map(({ person, days }) => ({
    name: person.name,
    where: person.where,
    daysSinceContact: days,
    stage: person.stage,
  }));

  const approachLessons = state.approaches
    .filter((a) => a.lesson.trim())
    .slice(-20)
    .map((a) => ({ date: a.date, outcome: a.out, lesson: a.lesson }));

  const pendingTasks = state.tasks
    .filter((t) => t.status === 'pending')
    .map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.detail,
      planId: t.planId,
      triggerWeek: t.triggerWeek,
      weeksOverdue: Math.max(0, weekIdx - t.triggerWeek),
    }));

  const habits = state.habits.map((h) => ({
    id: h.id,
    title: h.title,
    planId: h.planId,
    cadence: h.cadence,
    lastDone: h.lastDone,
  }));

  const upcomingMilestones = state.plans.flatMap((p) =>
    (p.milestones ?? [])
      .filter(([w]) => w >= weekIdx && w <= weekIdx + 2)
      .map(([week, description]) => ({ planId: p.id, week, description }))
  );

  const recentMilestoneChecks = state.milestoneChecks.slice(-10).map((m) => ({
    planId: m.planId,
    week: m.week,
    status: m.status,
    note: m.note,
  }));

  return {
    weekIndex: weekIdx,
    weeksOfHistory,
    skipReasons,
    staleContacts,
    approachLessons,
    pendingTasks,
    habits,
    upcomingMilestones,
    recentMilestoneChecks,
    plans: state.plans.map(stripFixedFields),
  };
}
