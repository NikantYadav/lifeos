'use client';

import { currentWeekIndex } from '@/lib/dates';
import { AppState, newId, Plan } from '@/lib/types';

interface DueMilestone {
  plan: Plan;
  week: number;
  description: string;
}

function dueMilestones(state: AppState, today: Date): DueMilestone[] {
  const curWeek = currentWeekIndex(today, state.startDate);
  const out: DueMilestone[] = [];
  for (const plan of state.plans) {
    for (const [week, description] of plan.milestones ?? []) {
      if (week > curWeek) continue;
      const already = state.milestoneChecks.some((m) => m.planId === plan.id && m.week === week);
      if (!already) out.push({ plan, week, description });
    }
  }
  return out;
}

export default function MilestonePrompt({
  state,
  update,
  todayKey,
  today,
}: {
  state: AppState;
  update: (fn: (draft: AppState) => void) => void;
  todayKey: string;
  today: Date;
}) {
  const due = dueMilestones(state, today);
  if (due.length === 0) return null;

  const record = (m: DueMilestone, status: 'hit' | 'partial' | 'missed') => {
    update((draft) => {
      draft.milestoneChecks.push({
        id: newId(),
        planId: m.plan.id,
        week: m.week,
        description: m.description,
        status,
        checkedAt: todayKey,
      });
    });
  };

  return (
    <div className="prompt-list">
      <h2>Milestone check-in</h2>
      {due.map((m) => (
        <div className="prompt-row" key={`${m.plan.id}-${m.week}`}>
          <div className="prompt-body">
            <div className="prompt-title">{m.plan.name} — week {m.week + 1}</div>
            <div className="prompt-sub">{m.description}</div>
          </div>
          <div className="prompt-actions">
            <button className="primary" onClick={() => record(m, 'hit')}>Hit</button>
            <button onClick={() => record(m, 'partial')}>Partial</button>
            <button className="danger" onClick={() => record(m, 'missed')}>Missed</button>
          </div>
        </div>
      ))}
    </div>
  );
}
