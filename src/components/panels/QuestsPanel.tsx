'use client';

import { useState } from 'react';
import { QUEST_IDEAS } from '@/lib/data';
import { AppState } from '@/lib/types';

export default function QuestsPanel({
  state,
  update,
  todayKey,
}: {
  state: AppState;
  update: (fn: (draft: AppState) => void) => void;
  todayKey: string;
}) {
  const [what, setWhat] = useState('');
  const [who, setWho] = useState('');

  const add = () => {
    const w = what.trim();
    if (!w) return;
    update((draft) => {
      draft.quests.push({ id: Date.now(), date: todayKey, what: w, who: who.trim() });
      const d = draft.days[todayKey] ?? { c: {}, n: {} };
      d.c = { ...d.c, sidequest: true };
      draft.days[todayKey] = d;
    });
    setWhat('');
    setWho('');
  };

  const remove = (id: number) => {
    update((draft) => {
      draft.quests = draft.quests.filter((q) => q.id !== id);
    });
  };

  const list = [...state.quests].reverse();

  return (
    <section className="panel">
      <h2>One side quest a week</h2>
      <p className="note">
        Something out of the ordinary. Not the gym, not the café, not badminton. It is what makes six months feel
        like six months instead of a blur.
      </p>
      <div className="box pad">
        <div className="form">
          <div>
            <label className="lbl" htmlFor="qWhat">What you did</label>
            <input id="qWhat" placeholder="Nandi Hills sunrise" value={what} onChange={(e) => setWhat(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="qWho">Who came</label>
            <input id="qWho" placeholder="Solo / 3 from badminton" value={who} onChange={(e) => setWho(e.target.value)} />
          </div>
          <div>
            <button className="btn" onClick={add}>Log it</button>
          </div>
        </div>
      </div>

      <h2>Done</h2>
      <div className="box">
        {list.length === 0 ? (
          <div className="empty">None yet. Pick one for this Saturday and book it tonight.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>What</th><th>Who came</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((q) => (
                <tr key={q.id}>
                  <td>{q.date.slice(5)}</td>
                  <td>{q.what}</td>
                  <td>{q.who || 'solo'}</td>
                  <td><button className="x" onClick={() => remove(q.id)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Ideas — Bangalore</h2>
      <div className="box pad" dangerouslySetInnerHTML={{ __html: QUEST_IDEAS }} />
    </section>
  );
}
