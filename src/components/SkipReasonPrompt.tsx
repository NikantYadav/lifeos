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
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const existing = state.skips.find((s) => s.date === date && s.checkKey === checkKey);

  const save = (reason: SkipReason, note?: string) => {
    update((draft) => {
      const found = draft.skips.find((s) => s.date === date && s.checkKey === checkKey);
      if (found) {
        found.reason = reason;
        found.note = note;
      } else {
        draft.skips.push({
          id: newId(),
          date,
          checkKey,
          reason,
          note,
          createdAt: Date.now(),
        });
      }
    });
    setOpen(false);
    setCustomOpen(false);
    setCustomText('');
  };

  const setReason = (reason: SkipReason) => save(reason);

  const submitCustom = () => {
    const trimmed = customText.trim();
    if (!trimmed) return;
    save('custom', trimmed);
  };

  if (existing) {
    const label =
      existing.reason === 'custom' && existing.note
        ? existing.note
        : REASONS.find(([r]) => r === existing.reason)?.[1];
    return <span className="prompt-sub">Skipped: {label}</span>;
  }

  if (!open) {
    return (
      <button className="x" onClick={() => setOpen(true)}>
        why?
      </button>
    );
  }

  if (customOpen) {
    return (
      <div className="reason-picker reason-custom">
        <input
          autoFocus
          type="text"
          value={customText}
          placeholder="Type a reason…"
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitCustom();
            if (e.key === 'Escape') setCustomOpen(false);
          }}
        />
        <button onClick={submitCustom}>Save</button>
      </div>
    );
  }

  return (
    <div className="reason-picker">
      {REASONS.map(([r, lbl]) => (
        <button key={r} onClick={() => setReason(r)}>{lbl}</button>
      ))}
      <button onClick={() => setCustomOpen(true)}>Other…</button>
    </div>
  );
}
