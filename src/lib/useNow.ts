'use client';

import { useSyncExternalStore } from 'react';

/**
 * A clock that ticks once a minute, shared by every subscriber.
 *
 * Built on useSyncExternalStore rather than setState-in-an-effect so that the
 * server snapshot is stable (no hydration mismatch) and React 19's lint rule
 * against cascading renders is satisfied.
 */

let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  current = Date.now();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    // Align the first tick to the next minute boundary so the schedule's "Now"
    // marker and the day rollover land on time rather than up to 59s late.
    const delay = 60_000 - (Date.now() % 60_000);
    timer = setTimeout(() => {
      tick();
      timer = setInterval(tick, 60_000);
    }, delay) as unknown as ReturnType<typeof setInterval>;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      clearTimeout(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return current;
}

/** Server render has no clock; pin it so hydration matches. */
function getServerSnapshot(): number {
  return 0;
}

/**
 * Milliseconds, updated each minute. Returns 0 during SSR and the first client
 * render — callers should treat 0 as "clock not ready yet".
 */
export function useNowMs(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The ticking clock as a Date, or null until it's ready on the client. */
export function useNow(): Date | null {
  const ms = useNowMs();
  return ms === 0 ? null : new Date(ms);
}
