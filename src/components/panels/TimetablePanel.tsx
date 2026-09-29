'use client';

import { useState } from 'react';
import { currentSchedIndex, rowsForWeek, weekLetter } from '@/lib/dates';
import { AltWeek, WeekSchedule } from '@/lib/types';
import SchedList from '../SchedList';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function TimetablePanel({
  schedule,
  dayOfWeek,
  now,
  curWeek,
}: {
  schedule: WeekSchedule;
  dayOfWeek: number;
  now: Date | null;
  curWeek: number;
}) {
  const [openDay, setOpenDay] = useState(dayOfWeek);
  const thisWeek = weekLetter(curWeek);
  const [week, setWeek] = useState<AltWeek>(thisWeek);
  const viewingThisWeek = week === thisWeek;

  return (
    <section className="panel">
      <h2>The whole week</h2>
      <p className="note">Every block has a place. If a block has no place, it will not happen. Some slots alternate between week A and week B.</p>
      <div className="week-toggle" role="tablist" aria-label="Alternating week">
        {(['A', 'B'] as const).map((w) => (
          <button key={w} role="tab" aria-selected={week === w} onClick={() => setWeek(w)}>
            Week {w}{w === thisWeek ? ' · this week' : ''}
          </button>
        ))}
      </div>
      <div className="accordion">
        {ORDER.filter((d) => schedule[d]).map((d) => {
          const [label, allRows] = schedule[d];
          const rows = rowsForWeek(allRows, week);
          const open = openDay === d;
          return (
            <div className={'acc-item' + (open ? ' open' : '')} key={d}>
              <button className="acc-head" onClick={() => setOpenDay(open ? -1 : d)} aria-expanded={open}>
                <span>{label}</span>
                <svg className={'chev' + (open ? ' up' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {open && (
                <div className="box acc-body">
                  <SchedList
                    rows={rows}
                    noKey={d !== dayOfWeek || !viewingThisWeek}
                    nowIndex={d === dayOfWeek && viewingThisWeek && now ? currentSchedIndex(rows, now) : undefined}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
