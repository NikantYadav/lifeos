import { useEffect, useRef, useState } from 'react';
import { END } from '@/lib/data';
import { daysBetween, iso, mondayOf, weekDates, TOTAL_WEEKS } from '@/lib/dates';
import { weekScore } from '@/lib/score';
import { AppState } from '@/lib/types';

/**
 * Wipes every log dated inside the (old) current plan week, so a restart
 * genuinely zeroes the week rather than just excluding it from scoring —
 * per the user's call: a trial week's numbers should be removed, not kept
 * around unscored. Plan content, tasks, habits and history from other weeks
 * are untouched; only day-scoped logs falling in that one week are dropped.
 */
function restartPlan(draft: AppState, today: Date, oldCurWeek: number) {
  const staleDates = new Set(weekDates(oldCurWeek, draft.startDate));

  staleDates.forEach((key) => {
    delete draft.days[key];
  });
  draft.weights = draft.weights.filter((w) => !staleDates.has(w.date));
  draft.approaches = draft.approaches.filter((a) => !staleDates.has(a.date));
  draft.skips = draft.skips.filter((s) => !staleDates.has(s.date));
  draft.reviews = draft.reviews.filter((r) => r.weekIndex !== oldCurWeek);
  draft.milestoneChecks = draft.milestoneChecks.filter((m) => m.week !== oldCurWeek);

  draft.startDate = iso(mondayOf(today));
}

export default function Hero({
  state,
  update,
  today,
  curWeek,
  ready,
}: {
  state: AppState;
  update: (fn: (draft: AppState) => void) => void;
  today: Date;
  curWeek: number;
  ready: boolean;
}) {
  const daysLeft = Math.max(0, daysBetween(today, END));
  const nowRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const restart = () => {
    update((draft) => restartPlan(draft, today, curWeek));
    setConfirming(false);
  };

  useEffect(() => {
    if (expanded) nowRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [curWeek, expanded]);

  const pct = Math.round(((curWeek + 1) / TOTAL_WEEKS) * 100);

  return (
    <header className="hero">
      <div className="hero-top">
        <div className="wk">
          Week {ready ? curWeek + 1 : '—'}
          <small> of {TOTAL_WEEKS}</small>
        </div>
        <div className="hero-meta">
          <b>{ready ? `${daysLeft} days` : ' '}</b>until 1 March 2027
        </div>
        <button
          type="button"
          className="hero-restart"
          onClick={() => setConfirming(true)}
          disabled={!ready}
          title="Start the plan over from today, treating this as day one"
        >
          Restart plan
        </button>
      </div>

      {confirming && (
        <div className="hero-restart-confirm" role="alertdialog" aria-label="Confirm restart">
          <p>
            Restart the plan from today? This week&apos;s logged numbers (workouts, evenings out,
            protein days, everything else logged this week) will be <b>deleted</b>, not just
            excluded &mdash; today becomes the first day of week 1 again, with fresh goals.
          </p>
          <p className="hero-restart-note">This can&apos;t be undone.</p>
          <div className="hero-restart-actions">
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="danger" onClick={restart}>
              Restart
            </button>
          </div>
        </div>
      )}

      <button
        className="hero-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="hero-toggle-track">
          <span className="hero-toggle-fill" style={{ width: (ready ? pct : 0) + '%' }} />
        </span>
        <span className="hero-toggle-label">
          {expanded ? 'Hide' : 'Show'} {TOTAL_WEEKS}-week chart
          <svg className={'chev' + (expanded ? ' up' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {expanded && (
        <>
          <div className="bars-scroll-wrap">
            <div className="bars-scroll">
              <div className="bars">
                {Array.from({ length: TOTAL_WEEKS }, (_, i) => {
                  const cls = 'bar' + (i === curWeek ? ' now' : '') + (i < curWeek ? ' past' : '');
                  const height = i <= curWeek ? Math.round(weekScore(state, i) * 100) : 0;
                  return (
                    <div className={cls} key={i} title={'Week ' + (i + 1)} ref={i === curWeek ? nowRef : undefined}>
                      <span style={{ height: height + '%' }} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="nav-fade" aria-hidden="true" />
          </div>
          <div className="bars-key">One cell per week. Height is how much of that week&apos;s scorecard you hit.</div>
        </>
      )}
    </header>
  );
}
