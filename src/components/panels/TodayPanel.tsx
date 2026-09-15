import { CHECKS, COUNTS, WEEK } from '@/lib/data';
import { AppState, DayEntry } from '@/lib/types';
import SchedList from '../SchedList';

function getDay(state: AppState, key: string): DayEntry {
  return state.days[key] ?? { c: {}, n: {} };
}

export default function TodayPanel({
  state,
  update,
  todayKey,
  dayOfWeek,
}: {
  state: AppState;
  update: (fn: (draft: AppState) => void) => void;
  todayKey: string;
  dayOfWeek: number;
}) {
  const day = getDay(state, todayKey);
  const [label, rows] = WEEK[dayOfWeek];

  const toggleCheck = (k: string) => {
    update((draft) => {
      const d = draft.days[todayKey] ?? { c: {}, n: {} };
      d.c = { ...d.c, [k]: !d.c[k] };
      draft.days[todayKey] = d;
    });
  };

  const bumpCount = (k: string, delta: number) => {
    update((draft) => {
      const d = draft.days[todayKey] ?? { c: {}, n: {} };
      const cur = d.n[k] || 0;
      d.n = { ...d.n, [k]: Math.max(0, Math.round((cur + delta) * 10) / 10) };
      draft.days[todayKey] = d;
    });
  };

  return (
    <section className="panel">
      <h2>{label}</h2>
      <div className="box">
        <SchedList rows={rows} />
      </div>

      <h2>Tick off</h2>
      <div className="checks">
        {CHECKS.map(([k, lbl, sub]) => (
          <button
            key={k}
            className={'chk' + (day.c[k] ? ' on' : '')}
            onClick={() => toggleCheck(k)}
          >
            <i />
            <span>
              {lbl}
              {sub ? <em>{sub}</em> : null}
            </span>
          </button>
        ))}
      </div>

      <h2>Count</h2>
      <div className="counters">
        {COUNTS.map(([k, lbl]) => {
          const v = day.n[k] || 0;
          const step = k === 'pages' ? 10 : k === 'hours' ? 0.5 : 1;
          return (
            <div className="ctr" key={k}>
              <div className="lbl">{lbl}</div>
              <div className="row">
                <div className="val">{k === 'hours' ? v.toFixed(1) : String(v)}</div>
                <div className="btns">
                  <button onClick={() => bumpCount(k, -step)}>−</button>
                  <button onClick={() => bumpCount(k, step)}>+</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
