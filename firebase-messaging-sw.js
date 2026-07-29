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

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || 'Nova solicitação de compra';
  const options = {
    body: data.body || 'Uma nova solicitação foi registrada.',
    icon: './135927287_448584936583178_5622652680214904709_n.jpg',
    badge: './135927287_448584936583178_5622652680214904709_n.jpg',
    tag: data.requestId ? `requisicao-${data.requestId}` : 'nova-requisicao',
    renotify: true,
    data: {
      url: data.url || './notificacoes.html',
      requestId: data.requestId || ''
    }
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './notificacoes.html', self.registration.scope).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
    })
  );
});
