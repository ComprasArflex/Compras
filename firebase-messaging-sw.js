const APP_CACHE = 'compras-app-v3';
const APP_SHELL = [
  './',
  './requisicao-v2.html',
  './notificacoes.html',
  './foreground-notifications.js',
  './135927287_448584936583178_5622652680214904709_n.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== APP_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function injectForegroundNotifications(html) {
  if (html.includes('foreground-notifications.js')) return html;
  return html.replace(
    '</body>',
    '<script type="module" src="./foreground-notifications.js"></script></body>'
  );
}

async function responseForRequest(request) {
  const url = new URL(request.url);
  const isAuthenticatedPage = url.pathname.endsWith('/requisicao-v2.html');

  try {
    const networkResponse = await fetch(request);

    if (isAuthenticatedPage && networkResponse.ok) {
      const html = injectForegroundNotifications(await networkResponse.text());
      const transformed = new Response(html, {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers: networkResponse.headers
      });
      const cache = await caches.open(APP_CACHE);
      cache.put(request, transformed.clone());
      return transformed;
    }

    const cache = await caches.open(APP_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match('./requisicao-v2.html');
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(responseForRequest(event.request));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const fcmMessage = notificationData.FCM_MSG || {};
  const fcmOptions = fcmMessage.fcmOptions || {};
  const targetUrl = notificationData.url
    || fcmOptions.link
    || 'https://comprasarflex.github.io/Compras/requisicao-v2.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client && client.url.startsWith('https://comprasarflex.github.io/Compras/')) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
    })
  );
});

importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDhCsyprLYGe7PrBre9PR7liJOJ6QFF7wk',
  authDomain: 'requisicao-de-compras.firebaseapp.com',
  projectId: 'requisicao-de-compras',
  storageBucket: 'requisicao-de-compras.firebasestorage.app',
  messagingSenderId: '741013348079',
  appId: '1:741013348079:web:3f377a205d44138b91451a'
});

firebase.messaging();
