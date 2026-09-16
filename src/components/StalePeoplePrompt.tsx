'use client';

import { dropStage, markContacted, staleList } from '@/lib/people';
import { AppState } from '@/lib/types';

export default function StalePeoplePrompt({
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
  const stale = staleList(state.people, today);
  if (stale.length === 0) return null;

  return (
    <div className="prompt-list">
      <h2>Going quiet</h2>
      {stale.map(({ person, days, tier }) => (
        <div className={'prompt-row' + (tier === 'stale' ? ' overdue' : '')} key={person.id}>
          <div className="prompt-body">
            <div className="prompt-title">{person.name}{person.where ? ` — ${person.where}` : ''}</div>
            <div className="prompt-sub">{days} days quiet</div>
          </div>
          <div className="prompt-actions">
            <button className="primary" onClick={() => update((d) => markContacted(d, person.id, todayKey))}>
              Contacted
            </button>
            <button onClick={() => update((d) => dropStage(d, person.id))}>↓ Fading</button>
          </div>
        </div>
      ))}
    </div>
  );
}
