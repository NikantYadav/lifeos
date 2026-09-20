'use client';

import { useState } from 'react';
import { currentSchedIndex } from '@/lib/dates';
import { AppState, DayEntry, SchedRow } from '@/lib/types';
import HabitList from '../HabitList';
import MilestonePrompt from '../MilestonePrompt';
import SchedList from '../SchedList';
import SkipReasonPrompt from '../SkipReasonPrompt';
import StalePeoplePrompt from '../StalePeoplePrompt';
import SundayReview from '../SundayReview';
import TaskList from '../TaskList';

function getDay(state: AppState, key: string): DayEntry {
  return state.days[key] ?? { c: {}, n: {} };
}

/**
 * One compact, single-line activity row: checkbox + title, with the
 * skip-reason picker tucked behind a small "why?" trigger instead of always
 * showing its own line, so a long list of daily activities stays scannable
 * on a phone without excess scrolling.
 */
function ActivityRow({
  checkKey,
  label,
  done,
  onToggle,
  state,
  update,
  todayKey,
}: {
  checkKey: string;
  label: string;
  done: boolean;
  onToggle: () => void;
  state: AppState;
  update: (fn: (draft: AppState) => void) => void;
  todayKey: string;
}) {
  const [showSkip, setShowSkip] = useState(false);
  const skipped = state.skips.find((s) => s.date === todayKey && s.checkKey === checkKey);

  return (
    <div className="chk-compact">
      <button
        className={'chk-compact-btn' + (done ? ' on' : '')}
        onClick={onToggle}
        aria-pressed={done}
      >
        <i />
        <span>{label}</span>
      </button>
      {!done && !skipped && !showSkip && (
        <button className="chk-compact-why" onClick={() => setShowSkip(true)} aria-label={`Why skip ${label}?`}>
          why?
        </button>
      )}
      {!done && (showSkip || skipped) && (
        <div className="chk-compact-skip">
          <SkipReasonPrompt state={state} update={update} date={todayKey} checkKey={checkKey} />
        </div>
      )}
    </div>
  );
}

/** One activity-list row: a check key plus the label/sub text to show. */
interface Activity {
  key: string;
  label: string;
  sub?: string;
}

/**
 * Today's activity list: every key-block schedule row for this day of week,
 * in schedule order, plus any `state.checks` entries whose key isn't already
 * covered by one of those rows (protein, skin, etc. have no schedule row on
 * every day, so they'd otherwise never surface as a toggle).
 */
function buildActivities(rows: SchedRow[], checks: AppState['checks']): Activity[] {
  const fromSchedule: Activity[] = [];
  const seen = new Set<string>();

  for (const [, title, note, isKeyBlock, planId] of rows) {
    if (!isKeyBlock || !planId || seen.has(planId)) continue;
    seen.add(planId);
    fromSchedule.push({ key: planId, label: title, sub: note || undefined });
  }

  const fromChecks: Activity[] = checks
    .filter(([k]) => !seen.has(k))
    .map(([k, lbl, sub]) => ({ key: k, label: lbl, sub: sub || undefined }));

  return [...fromSchedule, ...fromChecks];
}

export default function TodayPanel({
  state,
  update,
  todayKey,
  dayOfWeek,
  now,
  curWeek,
}: {
  state: AppState;
  update: (fn: (draft: AppState) => void) => void;
  todayKey: string;
  dayOfWeek: number;
  now: Date | null;
  curWeek: number;
}) {
  const day = getDay(state, todayKey);
  const entry = state.schedule[dayOfWeek];
  const rows = entry?.[1] ?? [];
  const label = entry?.[0] ?? '';
  const nowIndex = now ? currentSchedIndex(rows, now) : undefined;

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

  const activities = buildActivities(rows, state.checks);
  const doneCount = activities.filter((a) => day.c[a.key]).length;
  // Not-done first, done sunk to the bottom — stable within each group so
  // the list doesn't reshuffle beyond moving a just-ticked item down.
  const ordered = [...activities].sort(
    (a, b) => Number(!!day.c[a.key]) - Number(!!day.c[b.key])
  );

  return (
    <section className="panel">
      <div className="today-head">
        <h2 style={{ margin: 0 }}>Today&apos;s activities</h2>
        <span className="today-count">{doneCount} / {activities.length}</span>
      </div>
      <div className="chk-compact-list">
        {ordered.map(({ key, label: lbl }) => (
          <ActivityRow
            key={key}
            checkKey={key}
            label={lbl}
            done={!!day.c[key]}
            onToggle={() => toggleCheck(key)}
            state={state}
            update={update}
            todayKey={todayKey}
          />
        ))}
      </div>

      {dayOfWeek === 0 && <SundayReview state={state} update={update} curWeek={curWeek} />}

      <StalePeoplePrompt state={state} update={update} todayKey={todayKey} today={now ?? new Date(0)} />
      <TaskList state={state} update={update} todayKey={todayKey} curWeek={curWeek} />
      <HabitList state={state} update={update} todayKey={todayKey} today={now ?? new Date(0)} />
      <MilestonePrompt state={state} update={update} todayKey={todayKey} today={now ?? new Date(0)} />

      <h2>Count</h2>
      <div className="counters">
        {state.counts.map(([k, lbl]) => {
          const v = day.n[k] || 0;
          const step = k === 'pages' ? 10 : k === 'hours' ? 0.5 : 1;
          const shown = k === 'hours' ? v.toFixed(1) : String(v);
          return (
            <div className="ctr" key={k}>
              <div className="lbl" id={`ctr-${k}`}>{lbl}</div>
              <div className="row">
                <div className="val">{shown}</div>
                <div className="btns">
                  <button onClick={() => bumpCount(k, -step)} aria-label={`Decrease ${lbl}`}>−</button>
                  <button onClick={() => bumpCount(k, step)} aria-label={`Increase ${lbl}`}>+</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <details className="day-details">
        <summary>Show full day — {label}</summary>

        <div className="box" style={{ marginTop: 8 }}>
          <SchedList rows={rows} nowIndex={nowIndex} />
        </div>
      </details>
    </section>
  );
}
