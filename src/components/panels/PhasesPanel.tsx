import { PHASES } from '@/lib/data';

export default function PhasesPanel({ curWeek }: { curWeek: number }) {
  return (
    <section className="panel">
      <div>
        {PHASES.map(([a, b, title, items], i) => {
          const live = curWeek >= a && curWeek <= b;
          const parts = title.split('· ');
          const heading = parts[1] || title;
          return (
            <div className={'phase' + (live ? ' live' : '')} key={i}>
              <div className="wks">{live ? 'Now' : `Weeks ${a + 1}–${b + 1}`}</div>
              <b>{heading}</b>
              <ul>
                {items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
