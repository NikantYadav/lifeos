'use client';

import { useState } from 'react';
import { renderBold } from '@/lib/markup';
import { Plan } from '@/lib/types';

function BoldList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{renderBold(item)}</li>
      ))}
    </ul>
  );
}

export default function PlansPanel({
  plans,
  openPlanId,
  onOpenPlanIdHandled,
}: {
  plans: Plan[];
  /** Set from outside (e.g. an activity link on Today) to jump straight to a plan. */
  openPlanId?: string | null;
  onOpenPlanIdHandled?: () => void;
}) {
  const [curPlan, setCurPlan] = useState<string | null>(null);

  // An external jump request (e.g. an activity link on Today) takes over the
  // panel's own selection. Adjusted during render, per React's guidance for
  // state that must sync to a changing prop, rather than in an effect — that
  // would render once with the stale selection, then again with the jump
  // applied. The parent clears `openPlanId` back to null right after this
  // runs, so the `curPlan !== openPlanId` check is what stops it looping.
  if (openPlanId && curPlan !== openPlanId) {
    setCurPlan(openPlanId);
    onOpenPlanIdHandled?.();
  }

  const plan = plans.find((p) => p.id === curPlan) ?? null;

  if (!plan) {
    return (
      <section className="panel">
        <h2>All plans</h2>
        <div className="box plan-list">
          {plans.map((p) => (
            <button key={p.id} className="plan-row" onClick={() => setCurPlan(p.id)}>
              <span className="plan-row-text">
                <b>{p.name}</b>
                <span className="plan-row-aim">{p.aim}</span>
              </span>
              <svg className="chev right" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <button className="plan-back" onClick={() => setCurPlan(null)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        All plans
      </button>

      <div className="box">
        <div className="plan-head">
          <b>{plan.name}</b>
          <p>{plan.aim}</p>
        </div>

        {plan.when && (
          <div className="field">
            <div className="k">When</div>
            <div className="v"><BoldList items={plan.when} /></div>
          </div>
        )}
        {plan.where && (
          <div className="field">
            <div className="k">Where</div>
            <div className="v"><BoldList items={plan.where} /></div>
          </div>
        )}
        {plan.how && (
          <div className="field">
            <div className="k">How</div>
            <div className="v"><BoldList items={plan.how} /></div>
          </div>
        )}
        {plan.quota && (
          <div className="field">
            <div className="k">Weekly quota</div>
            <div className="v"><BoldList items={plan.quota} /></div>
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
            <div className="v"><BoldList items={plan.ask} /></div>
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
