'use client';

import { useState } from 'react';
import { AppState, newId, SkipReason } from '@/lib/types';

const REASONS: [SkipReason, string][] = [
  ['tired', 'Tired'],
  ['work', 'Work ran over'],
  ['no_want', "Didn't want to"],
  ['no_plan', 'No plan'],
  ['sick', 'Sick'],
  ['better', 'Chose something better'],
];

export default function SkipReasonPrompt({
  state,
  update,
  date,
  checkKey,
}: {
  state: AppState;
  update: (fn: (draft: AppState) => void) => void;
  date: string;
  checkKey: string;
}) {
  const [open, setOpen] = useState(false);
  const existing = state.skips.find((s) => s.date === date && s.checkKey === checkKey);

  const setReason = (reason: SkipReason) => {
    update((draft) => {
      const found = draft.skips.find((s) => s.date === date && s.checkKey === checkKey);
      if (found) {
        found.reason = reason;
      } else {
        draft.skips.push({
          id: newId(),
          date,
          checkKey,
          reason,
          createdAt: Date.now(),
        });
      }
    });
    setOpen(false);
  };

  if (existing) {
    return <span className="prompt-sub">Skipped: {REASONS.find(([r]) => r === existing.reason)?.[1]}</span>;
  }

  if (!open) {
    return (
      <button className="x" onClick={() => setOpen(true)}>
        why?
      </button>
    );
  }

  return (
    <div className="reason-picker">
      {REASONS.map(([r, lbl]) => (
        <button key={r} onClick={() => setReason(r)}>{lbl}</button>
      ))}
    </div>
  );
}
