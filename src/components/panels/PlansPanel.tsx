'use client';

import { useState } from 'react';
import { PLANS } from '@/lib/data';

function HtmlList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
      ))}
    </ul>
  );
}

export default function PlansPanel() {
  const [curPlan, setCurPlan] = useState(PLANS[0].id);
  const plan = PLANS.find((p) => p.id === curPlan)!;

  return (
    <section className="panel">
      <label className="plan-select">
        <span className="lbl">Plan</span>
        <select value={curPlan} onChange={(e) => setCurPlan(e.target.value)}>
          {PLANS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>

      <div className="pills-wrap pills-desktop">
        <div className="pills">
          {PLANS.map((p) => (
            <button
              key={p.id}
              aria-pressed={p.id === curPlan}
              onClick={() => setCurPlan(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="nav-fade" aria-hidden="true" />
      </div>
      <div className="box">
        <div className="plan-head">
          <b>{plan.name}</b>
          <p>{plan.aim}</p>
        </div>

        {plan.when && (
          <div className="field">
            <div className="k">When</div>
            <div className="v"><HtmlList items={plan.when} /></div>
          </div>
        )}
        {plan.where && (
          <div className="field">
            <div className="k">Where</div>
            <div className="v"><HtmlList items={plan.where} /></div>
          </div>
        )}
        {plan.how && (
          <div className="field">
            <div className="k">How</div>
            <div className="v"><HtmlList items={plan.how} /></div>
          </div>
        )}
        {plan.quota && (
          <div className="field">
            <div className="k">Weekly quota</div>
            <div className="v"><HtmlList items={plan.quota} /></div>
          </div>
        )}
        {plan.good && (
          <div className="field">
            <div className="k">Rule</div>
            <div className="v"><div className="gobox">{plan.good}</div></div>
          </div>
        )}
        {plan.bad && (
          <div className="field">
            <div className="k">Never</div>
            <div className="v"><div className="warnbox">{plan.bad}</div></div>
          </div>
        )}
        {plan.warn && (
          <div className="field">
            <div className="k">Watch out</div>
            <div className="v"><div className="warnbox">{plan.warn}</div></div>
          </div>
        )}
        {plan.ask && (
          <div className="field">
            <div className="k">Ask the doctor</div>
            <div className="v"><HtmlList items={plan.ask} /></div>
          </div>
        )}
        {plan.milestones && (
          <div className="field">
            <div className="k">Checkpoints</div>
            <div className="v">
              <ul>
                {plan.milestones.map(([wk, txt], i) => (
                  <li key={i}>
                    <b>Week {wk}</b> — {txt}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
