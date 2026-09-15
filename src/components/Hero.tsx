import { END, WEEK_GOALS, COUNTS } from '@/lib/data';
import { weekDates } from '@/lib/dates';
import { AppState } from '@/lib/types';

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
      if (d.c.sidequest) t.sidequest++;
    }
  });
  return t;
}

export function weekScore(state: AppState, wi: number) {
  const t = weekTotals(state, wi);
  let s = 0;
  let n = 0;
  for (const k in WEEK_GOALS) {
    n++;
    s += Math.min(1, (t[k] || 0) / WEEK_GOALS[k]);
  }
  return s / n;
}

export default function Hero({ state, today, curWeek }: { state: AppState; today: Date; curWeek: number }) {
  const daysLeft = Math.max(0, Math.ceil((END.getTime() - today.getTime()) / 864e5));
  return (
    <header className="hero">
      <div className="hero-top">
        <div className="wk">
          Week {curWeek + 1}
          <small> of 24</small>
        </div>
        <div className="hero-meta">
          <b>{daysLeft} days</b>until 1 March 2027
        </div>
      </div>
      <div className="bars">
        {Array.from({ length: 24 }, (_, i) => {
          const cls = 'bar' + (i === curWeek ? ' now' : '') + (i < curWeek ? ' past' : '');
          const height = i <= curWeek ? Math.round(weekScore(state, i) * 100) : 0;
          return (
            <div className={cls} key={i} title={'Week ' + (i + 1)}>
              <span style={{ height: height + '%' }} />
            </div>
          );
        })}
      </div>
      <div className="bars-key">One cell per week. Height is how much of that week&apos;s scorecard you hit.</div>
    </header>
  );
}
