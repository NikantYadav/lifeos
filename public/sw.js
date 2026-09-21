/**
 * Life OS service worker.
 *
 * Scope is deliberately narrow: a small app-shell cache so the icon/manifest
 * and a cold start have something to render offline, plus push notification
 * handling. It never caches /api/* — state comes from a single Redis blob
 * with its own rev-based conflict resolution (see useAppState.ts), and a
 * stale cached read would fight that, not help it.
 */

const CACHE_VERSION = 'lifeos-shell-v1';
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for navigations (so a login/auth redirect is never served
// stale from cache), falling back to the cached shell only when offline.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/').then((res) => res ?? Response.error()))
    );
    return;
  }

  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request))
    );
  }
});

// --- Push notifications ---

self.addEventListener('push', (event) => {
  let payload = { title: 'Life OS', body: 'You have a new update.' };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload = { ...payload, body: event.data.text() };
    }
  }

  const { title, ...options } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: options.body,
      icon: options.icon || '/icon-192.png',
      badge: options.badge || '/badge-96.png',
      tag: options.tag || 'lifeos',
      data: { url: options.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
