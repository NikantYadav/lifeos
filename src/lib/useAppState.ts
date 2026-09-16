'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, EMPTY_STATE } from './types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_DEBOUNCE_MS = 400;
const SAVED_FLASH_MS = 1400;

/** Structural clone that leaves the draft safe to mutate in place. */
function draftOf(prev: AppState): AppState {
  return {
    ...prev,
    days: Object.fromEntries(
      Object.entries(prev.days).map(([k, v]) => [k, { c: { ...v.c }, n: { ...v.n } }])
    ),
    people: prev.people.map((p) => ({ ...p })),
    approaches: prev.approaches.map((a) => ({ ...a })),
    weights: prev.weights.map((w) => ({ ...w })),

    plans: prev.plans.map((p) => ({ ...p })),
    schedule: Object.fromEntries(
      Object.entries(prev.schedule).map(([k, [label, rows]]) => [k, [label, rows.map((r) => [...r] as typeof r)]])
    ),
    weekGoals: { ...prev.weekGoals },
    checks: prev.checks.map((c) => [...c] as typeof c),
    counts: prev.counts.map((c) => [...c] as typeof c),

    tasks: prev.tasks.map((t) => ({ ...t })),
    habits: prev.habits.map((h) => ({ ...h, cadence: { ...h.cadence } })),
    skips: prev.skips.map((s) => ({ ...s })),
    milestoneChecks: prev.milestoneChecks.map((m) => ({ ...m })),
    reviews: prev.reviews.map((r) => ({
      ...r,
      proposedDiffs: r.proposedDiffs.map((d) => ({ ...d })),
      diffDecisions: { ...r.diffDecisions },
      editedValues: r.editedValues ? { ...r.editedValues } : undefined,
    })),
  };
}

export function useAppState() {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const latest = useRef(state);
  const dirty = useRef(false);
  /** Set by the sync effect below; called by event handlers to queue a save. */
  const scheduleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  /**
   * The whole load/save loop lives in one effect: it owns the timers and the
   * in-flight flag, talks to an external system (the API), and is the only
   * place refs are touched, which is what React 19's rules ask for.
   */
  useEffect(() => {
    let cancelled = false;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let flashTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const adopt = (incoming: AppState) => {
      // Only adopt the server's copy when it is genuinely newer, so a refetch
      // never discards edits the user just made locally.
      setState((prev) => (incoming.rev >= prev.rev ? { ...EMPTY_STATE, ...incoming } : prev));
    };

    const load = async () => {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        adopt((await res.json()) as AppState);
      } catch {
        // Offline: keep whatever is on screen; edits still queue for saving.
      }
    };

    const flush = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      dirty.current = false;
      setStatus('saving');

      try {
        const res = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(latest.current),
        });
        if (cancelled) return;

        if (res.status === 409) {
          // Another device wrote first. Take its state as the base rather than
          // overwriting it, then let the next edit save on top.
          const { state: remote } = (await res.json()) as { state: AppState };
          setState({ ...EMPTY_STATE, ...remote });
          setStatus('error');
        } else if (res.ok) {
          const { rev, updatedAt } = (await res.json()) as { rev: number; updatedAt: number };
          setState((prev) => ({ ...prev, rev, updatedAt }));
          setStatus('saved');
          if (flashTimer) clearTimeout(flashTimer);
          flashTimer = setTimeout(() => setStatus('idle'), SAVED_FLASH_MS);
        } else {
          setStatus('error');
        }
      } catch {
        dirty.current = true;
        if (!cancelled) setStatus('error');
      } finally {
        inFlight = false;
        if (dirty.current && !cancelled) schedule();
      }
    };

    const schedule = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    };

    scheduleRef.current = schedule;

    void load().then(() => {
      if (!cancelled) setLoaded(true);
    });

    // Pick up writes made on another device when returning to the tab.
    const refetch = () => {
      if (!dirty.current && !inFlight) void load();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    // Last-ditch attempt to persist pending edits when the tab goes away.
    const onHide = () => {
      if (!dirty.current) return;
      const body = new Blob([JSON.stringify(latest.current)], { type: 'application/json' });
      navigator.sendBeacon?.('/api/state', body);
    };

    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onHide);

    return () => {
      cancelled = true;
      scheduleRef.current = null;
      if (saveTimer) clearTimeout(saveTimer);
      if (flashTimer) clearTimeout(flashTimer);
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  const update = useCallback((updater: (draft: AppState) => void) => {
    setState((prev) => {
      const next = draftOf(prev);
      updater(next);
      return next;
    });
    dirty.current = true;
    scheduleRef.current?.();
  }, []);

  return { state, update, loaded, status };
}
