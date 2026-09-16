'use client';

import { useState } from 'react';
import { currentSchedIndex } from '@/lib/dates';
import { WeekSchedule } from '@/lib/types';
import SchedList from '../SchedList';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function TimetablePanel({
  schedule,
  dayOfWeek,
  now,
}: {
  schedule: WeekSchedule;
  dayOfWeek: number;
  now: Date | null;
}) {
  const [openDay, setOpenDay] = useState(dayOfWeek);

  return (
    <section className="panel">
      <h2>The whole week</h2>
      <p className="note">Every block has a place. If a block has no place, it will not happen.</p>
      <div className="accordion">
        {ORDER.filter((d) => schedule[d]).map((d) => {
          const [label, rows] = schedule[d];
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
                    noKey={d !== dayOfWeek}
                    nowIndex={d === dayOfWeek && now ? currentSchedIndex(rows, now) : undefined}
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
