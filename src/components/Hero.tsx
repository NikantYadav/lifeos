import { useEffect, useRef, useState } from 'react';
import { END } from '@/lib/data';
import { daysBetween, TOTAL_WEEKS } from '@/lib/dates';
import { weekScore } from '@/lib/score';
import { AppState } from '@/lib/types';

export default function Hero({
  state,
  today,
  curWeek,
  ready,
}: {
  state: AppState;
  today: Date;
  curWeek: number;
  ready: boolean;
}) {
  const daysLeft = Math.max(0, daysBetween(today, END));
  const nowRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

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
      </div>

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
