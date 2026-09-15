'use client';

import { useState } from 'react';
import { STAGES } from '@/lib/data';
import { AppState, Person } from '@/lib/types';

export default function PeoplePanel({
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
  const [name, setName] = useState('');
  const [where, setWhere] = useState('');
  const [stage, setStage] = useState<Person['stage']>(1);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    update((draft) => {
      draft.people.push({ id: Date.now(), name: n, where: where.trim(), stage, last: todayKey });
    });
    setName('');
    setWhere('');
  };

  const bumpStage = (id: number) => {
    update((draft) => {
      const p = draft.people.find((x) => x.id === id);
      if (p) {
        p.stage = Math.min(4, p.stage + 1) as Person['stage'];
        p.last = todayKey;
      }
    });
  };

  const markContacted = (id: number) => {
    update((draft) => {
      const p = draft.people.find((x) => x.id === id);
      if (p) p.last = todayKey;
    });
  };

  const remove = (id: number) => {
    update((draft) => {
      draft.people = draft.people.filter((x) => x.id !== id);
    });
  };

  const sorted = [...state.people].sort((a, b) => b.stage - a.stage);

  return (
    <section className="panel">
      <h2>Social funnel</h2>
      <p className="note">
        Anyone untouched for 14 days turns red. Send them something with a thing in it — a photo you took, the city
        guide, a booking link.
      </p>
      <div className="box pad">
        <div className="form">
          <div>
            <label className="lbl" htmlFor="pName">Name</label>
            <input id="pName" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="pWhere">Met at</label>
            <input id="pWhere" placeholder="Tuesday badminton" value={where} onChange={(e) => setWhere(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="pStage">Stage</label>
            <select id="pStage" value={stage} onChange={(e) => setStage(Number(e.target.value) as Person['stage'])}>
              <option value={1}>Acquaintance</option>
              <option value={2}>Textable</option>
              <option value={3}>Met 1:1</option>
              <option value={4}>In my group</option>
            </select>
          </div>
          <div>
            <button className="btn" onClick={add}>Add</button>
          </div>
        </div>
      </div>
      <div className="box" style={{ marginTop: 12 }}>
        {sorted.length === 0 ? (
          <div className="empty">Nobody yet. After Tuesday&apos;s badminton, put the first name in.</div>
        ) : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>Name</th><th>Met at</th><th>Stage</th><th>Last contact</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const days = Math.floor((today.getTime() - new Date(p.last + 'T00:00:00').getTime()) / 864e5);
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.where || '—'}</td>
                    <td>
                      <span className={'stage ' + STAGES[p.stage][1]}>{STAGES[p.stage][0]}</span>
                      <button className="x" title="Move down the funnel" onClick={() => bumpStage(p.id)}>↑</button>
                    </td>
                    <td>
                      {days >= 14 ? <span className="stale">{days} days — reach out</span> : `${days} days`}
                      <button className="x" title="Contacted today" onClick={() => markContacted(p.id)}>•</button>
                    </td>
                    <td>
                      <button className="x" onClick={() => remove(p.id)}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
    </section>
  );
}
