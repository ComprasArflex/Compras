self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const fcmMessage = notificationData.FCM_MSG || {};
  const fcmOptions = fcmMessage.fcmOptions || {};
  const targetUrl = notificationData.url || fcmOptions.link || 'https://comprasarflex.github.io/Compras/notificacoes.html';

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
