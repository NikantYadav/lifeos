'use client';

import { useState } from 'react';
import { AppState, DiffDecision, newId, ProposedDiff } from '@/lib/types';

interface GeneratedReview {
  narrative: string;
  pattern: string;
  proposedDiffs: ProposedDiff[];
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (Array.isArray(v)) return v.join(' · ');
  return String(v);
}

function diffLabel(d: ProposedDiff): string {
  if (d.kind === 'plan') return `${d.planId ?? 'plan'} · ${d.field ?? ''}`;
  if (d.kind === 'schedule') return `Schedule · day ${d.dayOfWeek}`;
  return `Weekly goal · ${d.key}`;
}

function applyDiff(draft: AppState, diff: ProposedDiff, value: unknown): void {
  if (diff.kind === 'plan' && diff.planId && diff.field) {
    const plan = draft.plans.find((p) => p.id === diff.planId);
    // Fixed fields are excluded from ProposedDiff['field'] at the type level;
    // this is the same guarantee enforced again at the API boundary.
    if (plan) (plan as unknown as Record<string, unknown>)[diff.field] = value;
  } else if (diff.kind === 'schedule' && diff.dayOfWeek !== undefined) {
    const entry = draft.schedule[diff.dayOfWeek];
    if (entry && typeof value === 'string') entry[0] = value;
  } else if (diff.kind === 'weekGoals' && diff.key) {
    const n = Number(value);
    if (Number.isFinite(n)) draft.weekGoals[diff.key] = n;
  }
}

export default function SundayReview({
  state,
  update,
  curWeek,
}: {
  state: AppState;
  update: (fn: (draft: AppState) => void) => void;
  curWeek: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<GeneratedReview | null>(null);
  const [decisions, setDecisions] = useState<Record<number, DiffDecision>>({});
  const [editValues, setEditValues] = useState<Record<number, string>>({});
  const [applied, setApplied] = useState(false);

  const alreadyGenerated = state.reviews.some((r) => r.weekIndex === curWeek);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/review', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Request failed');
      }
      const data = (await res.json()) as GeneratedReview;
      setReview(data);
      setDecisions({});
      setEditValues({});
      setApplied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate review.');
    } finally {
      setLoading(false);
    }
  };

  const decide = (i: number, decision: DiffDecision) => {
    setDecisions((prev) => ({ ...prev, [i]: decision }));
  };

  const applyAccepted = () => {
    if (!review) return;
    update((draft) => {
      const finalDecisions: Record<string, DiffDecision> = {};
      const finalEdited: Record<string, unknown> = {};

      review.proposedDiffs.forEach((diff, i) => {
        const decision = decisions[i];
        if (!decision || decision === 'rejected') {
          finalDecisions[i] = decision ?? 'rejected';
          return;
        }
        const value = decision === 'edited' ? editValues[i] ?? diff.after : diff.after;
        applyDiff(draft, diff, value);
        finalDecisions[i] = decision;
        if (decision === 'edited') finalEdited[i] = value;
      });

      draft.reviews.push({
        id: newId(),
        weekIndex: curWeek,
        generatedAt: Date.now(),
        narrative: review.narrative,
        pattern: review.pattern,
        proposedDiffs: review.proposedDiffs,
        diffDecisions: finalDecisions,
        editedValues: Object.keys(finalEdited).length ? finalEdited : undefined,
      });
      // Rotate-on-write, mirroring BACKUP_DEPTH — parseState also caps this
      // server-side, this just keeps the in-memory draft consistent with it.
      if (draft.reviews.length > 12) draft.reviews = draft.reviews.slice(-12);
    });
    setApplied(true);
  };

  return (
    <div className="review-card">
      <h3>Sunday review</h3>
      {!review && (
        <>
          <p className="narrative">
            {alreadyGenerated
              ? 'Already generated this week. You can run it again for an updated read.'
              : 'Reads the last few weeks and proposes concrete changes to your plan — nothing is written until you accept.'}
          </p>
          <button className="btn" onClick={generate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate this week’s review'}
          </button>
          {error && <p className="login-error">{error}</p>}
        </>
      )}

      {review && (
        <>
          <p className="narrative">{review.narrative}</p>
          <p className="pattern">{review.pattern}</p>

          {review.proposedDiffs.length === 0 && <p className="note">No changes proposed this week.</p>}

          {review.proposedDiffs.map((diff, i) => {
            const decision = decisions[i];
            return (
              <div className={'diff-card' + (decision ? ` decided ${decision}` : '')} key={i}>
                <div className="diff-reason">{diffLabel(diff)} — {diff.reason}</div>
                <div className="diff-values">
                  <div className="diff-before">{formatValue(diff.before)}</div>
                  <div className="diff-after">{formatValue(diff.after)}</div>
                </div>
                {decision === 'edited' && (
                  <textarea
                    value={editValues[i] ?? formatValue(diff.after)}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, [i]: e.target.value }))}
                  />
                )}
                <div className="diff-actions">
                  <button onClick={() => decide(i, 'accepted')}>Accept</button>
                  <button onClick={() => decide(i, 'edited')}>Edit</button>
                  <button onClick={() => decide(i, 'rejected')}>Reject</button>
                </div>
              </div>
            );
          })}

          {review.proposedDiffs.length > 0 && !applied && (
            <button className="btn" style={{ marginTop: 12 }} onClick={applyAccepted}>
              Apply accepted changes
            </button>
          )}
          {applied && <p className="note" style={{ marginTop: 10 }}>Applied. Changes are saved.</p>}
        </>
      )}
    </div>
  );
}
