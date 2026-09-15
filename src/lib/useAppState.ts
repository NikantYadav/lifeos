'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, EMPTY_STATE } from './types';

export function useAppState() {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/state');
        if (res.ok) {
          const data = (await res.json()) as AppState;
          setState({ ...EMPTY_STATE, ...data });
        }
      } catch {
        // stay on empty state; edits will still attempt to save
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(latest.current),
        });
        setSavedFlash(true);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setSavedFlash(false), 1200);
      } catch {
        // best-effort; next edit will retry the save
      }
    }, 400);
  }, []);

  const update = useCallback((updater: (draft: AppState) => void) => {
    setState((prev) => {
      const next: AppState = {
        days: { ...prev.days },
        people: [...prev.people],
        approaches: [...prev.approaches],
        weights: [...prev.weights],
        quests: [...prev.quests],
      };
      updater(next);
      return next;
    });
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (!loaded) return;
    if (first.current) {
      first.current = false;
      return;
    }
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loaded]);

  return { state, update, loaded, savedFlash };
}
