'use client';

import { useState } from 'react';
import { STAGES } from '@/lib/data';
import { daysBetween, fromIso } from '@/lib/dates';
import { bumpStage as bumpStageMut, dropStage as dropStageMut, markContacted as markContactedMut, STALE_DAYS } from '@/lib/people';
import { AppState, newId, Person } from '@/lib/types';

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
      draft.people.push({ id: newId(), name: n, where: where.trim(), stage, last: todayKey });
    });
    setName('');
    setWhere('');
  };

  const bumpStage = (id: string) => update((draft) => bumpStageMut(draft, id, todayKey));
  const dropStage = (id: string) => update((draft) => dropStageMut(draft, id));
  const markContacted = (id: string) => update((draft) => markContactedMut(draft, id, todayKey));

  const remove = (id: string) => {
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
                const days = p.last ? daysBetween(fromIso(p.last), today) : null;
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.where || '—'}</td>
                    <td>
                      <span className={'stage ' + STAGES[p.stage][1]}>{STAGES[p.stage][0]}</span>
                      {p.stage > 1 && (
                        <button className="x" title="Move down the funnel" aria-label={`Move ${p.name} down the funnel`} onClick={() => dropStage(p.id)}>↓</button>
                      )}
                      {p.stage < 4 && (
                        <button className="x" title="Move up the funnel" aria-label={`Move ${p.name} up the funnel`} onClick={() => bumpStage(p.id)}>↑</button>
                      )}
                    </td>
                    <td>
                      {days === null ? (
                        '—'
                      ) : days >= STALE_DAYS ? (
                        <span className="stale">{days} days — reach out</span>
                      ) : (
                        `${days} days`
                      )}
                      <button className="x" title="Contacted today" aria-label={`Mark ${p.name} contacted today`} onClick={() => markContacted(p.id)}>•</button>
                    </td>
                    <td>
                      <button className="x" aria-label={`Remove ${p.name}`} onClick={() => remove(p.id)}>×</button>
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
