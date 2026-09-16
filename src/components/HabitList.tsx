'use client';

import { dueHabits } from '@/lib/habits';
import { AppState } from '@/lib/types';

export default function HabitList({
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
  const due = dueHabits(state.habits, today);
  if (due.length === 0) return null;

  const markDone = (id: string) => {
    update((draft) => {
      const h = draft.habits.find((x) => x.id === id);
      if (h) h.lastDone = todayKey;
      // Free lifetime/streak visibility via the existing counter mechanism.
      const d = draft.days[todayKey] ?? { c: {}, n: {} };
      const key = `habit:${id}`;
      d.n = { ...d.n, [key]: (d.n[key] || 0) + 1 };
      draft.days[todayKey] = d;
    });
  };

  return (
    <div className="prompt-list">
      <h2>Due</h2>
      {due.map((h) => (
        <div className="prompt-row" key={h.id}>
          <div className="prompt-body">
            <div className="prompt-title">{h.title}</div>
          </div>
          <div className="prompt-actions">
            <button className="primary" onClick={() => markDone(h.id)}>Mark done</button>
          </div>
        </div>
      ))}
    </div>
  );
}
