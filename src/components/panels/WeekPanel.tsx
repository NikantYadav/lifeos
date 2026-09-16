import { DAYNAMES } from '@/lib/data';
import { fromIso, weekDates } from '@/lib/dates';
import { weekTotals } from '@/lib/score';
import { bestStreak, currentStreak, lifetimeCount } from '@/lib/streaks';
import { AppState } from '@/lib/types';

/** The three that predict the rest, per the existing plan copy. Shown first, bigger. */
const CORE_ROWS: [string, string][] = [
  ['out', 'Evenings out'],
  ['hours', 'Startup hours'],
  ['followups', 'Follow-ups'],
];

const OTHER_ROWS: [string, string][] = [
  ['gym', 'Gym sessions'],
  ['convos', 'Conversations'],
  ['approaches', 'Approaches'],
  ['ig', 'Instagram exchanges'],
  ['invites', 'Invites sent'],
  ['protein', 'Protein days'],
  ['pages', 'Pages read'],
];

/** Lifetime totals worth surfacing as fuel — key, label, streak-worthy? */
const LIFETIME_ROWS: [string, string][] = [
  ['gym', 'gym sessions'],
  ['approaches', 'strangers approached'],
  ['out', 'evenings out'],
];

function ScoreGrid({ rows, totals, goals }: { rows: [string, string][]; totals: Record<string, number>; goals: Record<string, number> }) {
  return (
    <div className="counters">
      {rows.map(([k, lbl]) => {
        const goal = goals[k];
        if (!goal) return null;
        const v = totals[k] || 0;
        return (
          <div className={'ctr' + (v >= goal ? ' hit' : '')} key={k}>
            <div className="lbl">{lbl}</div>
            <div className="row">
              <div className="val">{k === 'hours' ? v.toFixed(1) : String(v)}</div>
              <div className="goal">/ {goal}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function WeekPanel({ state, curWeek, todayKey }: { state: AppState; curWeek: number; todayKey: string }) {
  const t = weekTotals(state, curWeek);
  const dates = weekDates(curWeek);
  const today = fromIso(todayKey);

  return (
    <section className="panel">
      <h2>Core — this predicts the rest</h2>
      <p className="note">Evenings out, startup hours, follow-up messages. 200 pages read can&apos;t hide a dead social week.</p>
      <ScoreGrid rows={CORE_ROWS} totals={t} goals={state.weekGoals} />

      <h2>Everything else this week</h2>
      <ScoreGrid rows={OTHER_ROWS} totals={t} goals={state.weekGoals} />

      <h2>Lifetime</h2>
      <div className="box">
        <ul className="sched">
          {LIFETIME_ROWS.map(([k, lbl]) => (
            <li key={k}>
              <span className="d">
                <b>{lifetimeCount(state, k)}</b> {lbl}
                <em className="n">Current streak {currentStreak(state, k, today)} days · best {bestStreak(state, k)} days</em>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <h2>Days logged</h2>
      <div className="box">
        <ul className="sched">
          {dates.map((k) => {
            const dt = fromIso(k);
            const d = state.days[k];
            const done = d ? state.checks.filter(([ck]) => d.c[ck]).length : 0;
            return (
              <li key={k} className={k === todayKey ? 'key' : undefined}>
                <span className="t">{DAYNAMES[dt.getDay()].slice(0, 3)} {dt.getDate()}</span>
                <span className="d">{done ? `${done} of ${state.checks.length} ticked` : 'nothing logged'}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
