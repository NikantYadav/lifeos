import { SchedRow } from '@/lib/data';

export default function SchedList({ rows, noKey }: { rows: SchedRow[]; noKey?: boolean }) {
  return (
    <ul className="sched">
      {rows.map(([t, txt, note, k], i) => (
        <li key={i} className={k && !noKey ? 'key' : undefined}>
          <span className="t">{t}</span>
          <span className="d">
            {txt}
            {note ? <em className="n">{note}</em> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
