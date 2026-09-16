'use client';

import { useState } from 'react';
import { OUTCOMES } from '@/lib/data';
import { AppState, ApproachOutcome, newId } from '@/lib/types';

export default function RepsPanel({
  state,
  update,
  todayKey,
}: {
  state: AppState;
  update: (fn: (draft: AppState) => void) => void;
  todayKey: string;
}) {
  const [where, setWhere] = useState('');
  const [opener, setOpener] = useState('');
  const [out, setOut] = useState<ApproachOutcome>('bailed');
  const [lesson, setLesson] = useState('');

  const add = () => {
    const wh = where.trim();
    const op = opener.trim();
    if (!wh && !op) return;
    update((draft) => {
      draft.approaches.push({ id: newId(), date: todayKey, where: wh, opener: op, out, lesson: lesson.trim() });
      const d = draft.days[todayKey] ?? { c: {}, n: {} };
      d.n = { ...d.n, approaches: (d.n.approaches || 0) + 1 };
      draft.days[todayKey] = d;
    });
    setWhere('');
    setOpener('');
    setLesson('');
  };

  const remove = (id: string) => {
    update((draft) => {
      draft.approaches = draft.approaches.filter((a) => a.id !== id);
    });
  };

  const list = [...state.approaches].reverse();

  return (
    <section className="panel">
      <h2>Log an approach</h2>
      <p className="note">One line each. Reps without a debrief are just repeated exposure.</p>
      <div className="box pad">
        <div className="form">
          <div>
            <label className="lbl" htmlFor="aWhere">Where</label>
            <input id="aWhere" placeholder="Third Wave, Marathahalli" value={where} onChange={(e) => setWhere(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="aOpener">Opener</label>
            <input id="aOpener" placeholder="Asked what she was reading" value={opener} onChange={(e) => setOpener(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="aOut">Outcome</label>
            <select id="aOut" value={out} onChange={(e) => setOut(e.target.value as ApproachOutcome)}>
              <option value="bailed">Chickened out</option>
              <option value="short">Short, under a minute</option>
              <option value="good">Real conversation</option>
              <option value="ig">Got Instagram</option>
              <option value="closed">Not interested — I left cleanly</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <label className="lbl" htmlFor="aLesson">Change next time</label>
          <textarea id="aLesson" placeholder="Say why I came over sooner." value={lesson} onChange={(e) => setLesson(e.target.value)} />
        </div>
        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={add}>Log it</button>
        </div>
      </div>

      <h2>History</h2>
      <div className="box">
        {list.length === 0 ? (
          <div className="empty">Nothing logged. Level 0 starts today: 3 conversations with anyone.</div>
        ) : (
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Where</th><th>Opener</th><th>Outcome</th><th>Change next time</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>{a.date.slice(5)}</td>
                  <td>{a.where || '—'}</td>
                  <td>{a.opener || '—'}</td>
                  <td><span className={'stage ' + OUTCOMES[a.out][1]}>{OUTCOMES[a.out][0]}</span></td>
                  <td>{a.lesson || '—'}</td>
                  <td><button className="x" aria-label="Remove entry" onClick={() => remove(a.id)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </section>
  );
}
