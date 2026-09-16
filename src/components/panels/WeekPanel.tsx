import { CHECKS, COUNTS, DAYNAMES, WEEK_GOALS } from '@/lib/data';
import { weekDates } from '@/lib/dates';
import { AppState } from '@/lib/types';

const WEEK_ROWS: [string, string, number][] = [
  ['out', 'Evenings out', 5],
  ['hours', 'Startup hours', 13],
  ['followups', 'Follow-ups', 1],
  ['gym', 'Gym sessions', 5],
  ['convos', 'Conversations', 5],
  ['approaches', 'Approaches', 3],
  ['ig', 'Instagram exchanges', 2],
  ['invites', 'Invites sent', 1],
  ['protein', 'Protein days', 6],
  ['pages', 'Pages read', 200],
];

function weekTotals(state: AppState, wi: number) {
  const t: Record<string, number> = {};
  Object.keys(WEEK_GOALS).forEach((k) => (t[k] = 0));
  weekDates(wi).forEach((k) => {
    const d = state.days[k];
    if (!d) return;
    COUNTS.forEach(([ck]) => (t[ck] = (t[ck] || 0) + ((d.n && d.n[ck]) || 0)));
    if (d.c) {
      if (d.c.gym) t.gym++;
      if (d.c.out) t.out++;
      if (d.c.protein) t.protein++;
    }
  });
  return t;
}

export default function WeekPanel({ state, curWeek, todayKey }: { state: AppState; curWeek: number; todayKey: string }) {
  const t = weekTotals(state, curWeek);
  const dates = weekDates(curWeek);

  return (
    <section className="panel">
      <h2>This week</h2>
      <p className="note">Three of these predict the rest: evenings out, startup hours, follow-up messages.</p>
      <div className="counters">
        {WEEK_ROWS.map(([k, lbl, g]) => {
          const v = t[k] || 0;
          return (
            <div className={'ctr' + (v >= g ? ' hit' : '')} key={k}>
              <div className="lbl">{lbl}</div>
              <div className="row">
                <div className="val">{k === 'hours' ? v.toFixed(1) : String(v)}</div>
                <div className="goal">/ {g}</div>
              </div>
            </div>
          );
        })}
      </div>

      <h2>Days logged</h2>
      <div className="box">
        <ul className="sched">
          {dates.map((k) => {
            const dt = new Date(k + 'T00:00:00');
            const d = state.days[k];
            const done = d ? CHECKS.filter(([ck]) => d.c[ck]).length : 0;
            return (
              <li key={k} className={k === todayKey ? 'key' : undefined}>
                <span className="t">{DAYNAMES[dt.getDay()].slice(0, 3)} {dt.getDate()}</span>
                <span className="d">{done ? `${done} of ${CHECKS.length} ticked` : 'nothing logged'}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
