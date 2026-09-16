'use client';

import { useState } from 'react';
import { resolvedTasks, visibleTasks, weeksOverdue } from '@/lib/tasks';
import { AppState, Task } from '@/lib/types';

export default function TaskList({
  state,
  update,
  todayKey,
  curWeek,
}: {
  state: AppState;
  update: (fn: (draft: AppState) => void) => void;
  todayKey: string;
  curWeek: number;
}) {
  const [dropping, setDropping] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const visible = visibleTasks(state.tasks, curWeek);
  const resolved = resolvedTasks(state.tasks);

  const markDone = (id: string) => {
    update((draft) => {
      const t = draft.tasks.find((x) => x.id === id);
      if (t) {
        t.status = 'done';
        t.doneAt = todayKey;
      }
    });
  };

  const confirmDrop = (id: string) => {
    update((draft) => {
      const t = draft.tasks.find((x) => x.id === id);
      if (t) {
        t.status = 'dropped';
        t.droppedAt = todayKey;
        t.droppedReason = reason.trim() || undefined;
      }
    });
    setDropping(null);
    setReason('');
  };

  if (visible.length === 0 && resolved.length === 0) return null;

  return (
    <div className="prompt-list">
      {visible.length > 0 && <h2>Tasks</h2>}
      {visible.map((t: Task) => {
        const overdue = weeksOverdue(t, curWeek) > 0;
        return (
          <div className={'prompt-row' + (overdue ? ' overdue' : '')} key={t.id}>
            <div className="prompt-body">
              <div className="prompt-title">{t.title}</div>
              {t.detail && <div className="prompt-sub">{t.detail}</div>}
              {overdue && <div className="prompt-sub">{weeksOverdue(t, curWeek)} week(s) overdue</div>}
              {dropping === t.id && (
                <input
                  autoFocus
                  placeholder="Why drop it? (optional)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmDrop(t.id)}
                  style={{ marginTop: 6 }}
                />
              )}
            </div>
            <div className="prompt-actions">
              {dropping === t.id ? (
                <button className="primary" onClick={() => confirmDrop(t.id)}>Confirm</button>
              ) : (
                <>
                  <button className="primary" onClick={() => markDone(t.id)}>Done</button>
                  <button className="danger" onClick={() => setDropping(t.id)}>Drop</button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {resolved.length > 0 && (
        <details className="history-disclosure">
          <summary>{resolved.length} done or dropped</summary>
          <div className="prompt-list" style={{ marginTop: 8 }}>
            {resolved.map((t) => (
              <div className="prompt-row" key={t.id} style={{ opacity: 0.65 }}>
                <div className="prompt-body">
                  <div className="prompt-title">{t.title}</div>
                  <div className="prompt-sub">
                    {t.status === 'done' ? `Done ${t.doneAt}` : `Dropped ${t.droppedAt}${t.droppedReason ? ` — ${t.droppedReason}` : ''}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
