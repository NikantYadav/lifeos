'use client';

import { minutesUntilNext } from '@/lib/dates';
import { findPlanContext } from '@/lib/planLookup';
import { DayEntry, Plan, SchedRow } from '@/lib/types';

function fmtMinutes(m: number): string {
  if (m < 60) return `${m} min left`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m left` : `${h}h left`;
}

export default function NowCard({
  rows,
  nowIndex,
  plans,
  day,
  onToggleCheck,
}: {
  rows: SchedRow[];
  nowIndex: number | undefined;
  plans: Plan[];
  day: DayEntry;
  onToggleCheck: (checkKey: string) => void;
}) {
  if (nowIndex === undefined || nowIndex < 0) {
    return <div className="now-empty">Nothing scheduled right now.</div>;
  }

  const [, title, note, keyBlock, planId] = rows[nowIndex];
  const left = minutesUntilNext(rows, nowIndex, new Date());
  const plan = findPlanContext(planId, plans);
  const contextLine = plan?.how?.[0] ?? plan?.aim;

  // The check that "closes out" a key block shares its schedule row's planId
  // by convention — CHECKS keys line up with plan ids for the ones that matter.
  const checkKey = keyBlock && planId ? planId : undefined;
  const isChecked = checkKey ? !!day.c[checkKey] : false;

  return (
    <div className="now-card">
      <div className="tag">Right now</div>
      <div className="title">{title}</div>
      {note && <p className="note">{note}</p>}
      {left !== null && <div className="meta">{fmtMinutes(left)}</div>}
      {contextLine && <div className="context">{contextLine}</div>}
      {checkKey && (
        <button
          className={'chk close-chk' + (isChecked ? ' on' : '')}
          onClick={() => onToggleCheck(checkKey)}
          aria-pressed={isChecked}
        >
          <i />
          <span>Mark done</span>
        </button>
      )}
    </div>
  );
}
