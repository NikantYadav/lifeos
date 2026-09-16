import { SchedRow } from '@/lib/types';

export default function SchedList({ rows, noKey, nowIndex }: { rows: SchedRow[]; noKey?: boolean; nowIndex?: number }) {
  return (
    <ul className="sched">
      {rows.map(([t, txt, note, k], i) => {
        const isNow = i === nowIndex;
        const cls = [k && !noKey ? 'key' : '', isNow ? 'now' : ''].filter(Boolean).join(' ');
        return (
          <li key={i} className={cls || undefined}>
            <span className="t">{t}</span>
            <span className="d">
              {txt}
              {note ? <em className="n">{note}</em> : null}
            </span>
            {isNow && <span className="now-tag">Now</span>}
          </li>
        );
      })}
    </ul>
  );
}
