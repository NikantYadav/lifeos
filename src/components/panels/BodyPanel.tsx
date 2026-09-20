'use client';

import { useState } from 'react';
import { DAILY_GYM_ADDONS, DAYNAMES, SPLIT } from '@/lib/data';
import { AppState, newId } from '@/lib/types';

export default function BodyPanel({
  state,
  update,
  todayKey,
  today,
}: {
  state: AppState;
  update: (fn: (draft: AppState) => void) => void;
  todayKey: string;
  today: Date;
}) {
  const [kg, setKg] = useState('');
  const todayAbbrev = DAYNAMES[today.getDay()].slice(0, 3);

  const add = () => {
    const v = parseFloat(kg);
    if (!Number.isFinite(v) || v <= 0 || v > 500) return;
    update((draft) => {
      draft.weights.push({ id: newId(), date: todayKey, kg: v });
      draft.weights.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
      // Pin the baseline on the first ever weigh-in so the Change column stays
      // anchored even if that row is later deleted.
      if (draft.baselineKg === undefined) draft.baselineKg = v;
    });
    setKg('');
  };

  const remove = (id: string) => {
    update((draft) => {
      draft.weights = draft.weights.filter((w) => w.id !== id);
    });
  };

  const weights = state.weights;
  const baseline = state.baselineKg ?? weights[0]?.kg;
  const list = [...weights].reverse();

  return (
    <section className="panel">
      <h2>The split — 5 days, Monday to Friday</h2>
      <div className="box">
        <ul className="sched">
          {SPLIT.map(([d, f, work]) => (
            <li key={d} className={todayAbbrev === d ? 'key' : undefined}>
              <span className="t">{d}</span>
              <span className="d">
                {f}
                <em className="n">{work}</em>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="note" style={{ margin: '10px 0 0' }}>
        Every session, on top of the day&apos;s split: {DAILY_GYM_ADDONS}. Right-shoulder band
        rehab work goes before the lift, as a warm-up — see the Gym plan for detail.
      </p>

      <h2>Weight</h2>
      <div className="box pad">
        <div className="form">
          <div>
            <label className="lbl" htmlFor="wKg">Weight (kg)</label>
            <input
              id="wKg"
              type="number"
              step="0.1"
              inputMode="decimal"
              placeholder="80.0"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
              }}
            />
          </div>
          <div>
            <button className="btn" onClick={add}>Record</button>
          </div>
        </div>
        <p className="note" style={{ margin: '12px 0 0' }}>
          80 kg now, about 86 kg by March. Weigh once a week, same morning.
        </p>
      </div>

      <div className="box" style={{ marginTop: 12 }}>
        {weights.length === 0 ? (
          <div className="empty">No weigh-ins. Record today&apos;s as your baseline.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Weight</th><th>Change</th><th></th></tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const d = baseline === undefined ? 0 : r.kg - baseline;
                  return (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>{r.kg.toFixed(1)} kg</td>
                      <td>{(d >= 0 ? '+' : '') + d.toFixed(1)} kg</td>
                      <td><button className="x" aria-label={`Remove weigh-in from ${r.date}`} onClick={() => remove(r.id)}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
