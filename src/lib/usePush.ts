'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

export type PushState =
  | 'unsupported'
  | 'unconfigured'
  | 'denied'
  | 'not-subscribed'
  | 'subscribed'
  | 'busy';

/** Base64url (VAPID key format) -> the Uint8Array applicationServerKey expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

const vapidKey =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY : undefined;

// A tiny external store (same shape as useNow.ts) so the SW-registration
// lookup result reaches React via subscribe/getSnapshot rather than a
// setState call sitting directly in an effect body.
let current: PushState = 'unsupported';
const listeners = new Set<() => void>();

function setState(next: PushState) {
  current = next;
  listeners.forEach((l) => l());
}

function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PushState {
  return current;
}

/** No push state exists before hydration; pin it so hydration matches. */
function getServerSnapshot(): PushState {
  return 'unsupported';
}

async function computeInitialState(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    setState('unsupported');
    return;
  }
  if (!vapidKey) {
    setState('unconfigured');
    return;
  }
  if (Notification.permission === 'denied') {
    setState('denied');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const sub = await registration.pushManager.getSubscription();
    setState(sub ? 'subscribed' : 'not-subscribed');
  } catch {
    setState('unsupported');
  }
}

let started = false;

/**
 * Registers the service worker (unconditionally — that also gets the app
 * offline app-shell caching, independent of push) and manages the push
 * subscription lifecycle against /api/push/subscribe.
 */
export function usePush() {
  const state = useSyncExternalStore(subscribeStore, getSnapshot, getServerSnapshot);
  const startedRef = useRef(started);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    started = true;
    void computeInitialState();
  }, []);

  const subscribe = useCallback(async () => {
    if (!vapidKey) return;
    setState('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'not-subscribed');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error('save failed');

      setState('subscribed');
    } catch {
      setState('not-subscribed');
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState('busy');
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      await sub?.unsubscribe();
      await fetch('/api/push/subscribe', { method: 'DELETE' });
    } finally {
      setState('not-subscribed');
    }
  }, []);

  return { state, subscribe, unsubscribe };
}
