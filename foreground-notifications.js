import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getMessaging, onMessage, isSupported } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDhCsyprLYGe7PrBre9PR7liJOJ6QFF7wk',
  authDomain: 'requisicao-de-compras.firebaseapp.com',
  projectId: 'requisicao-de-compras',
  storageBucket: 'requisicao-de-compras.firebasestorage.app',
  messagingSenderId: '741013348079',
  appId: '1:741013348079:web:3f377a205d44138b91451a'
};

const ICON_URL = 'https://comprasarflex.github.io/Compras/135927287_448584936583178_5622652680214904709_n.jpg';
const DEFAULT_URL = 'https://comprasarflex.github.io/Compras/requisicao-v2.html';

async function showSystemNotification(payload) {
  if (Notification.permission !== 'granted') return;

  const registration = await navigator.serviceWorker.ready;
  const title = payload.notification?.title || payload.data?.title || 'Nova solicitação de compra';
  const body = payload.notification?.body || payload.data?.body || 'Uma nova solicitação foi registrada.';
  const requestId = payload.data?.requestId || payload.data?.idRequisicao || '';

  await registration.showNotification(title, {
    body,
    icon: ICON_URL,
    badge: ICON_URL,
    tag: requestId ? `requisicao-${requestId}` : `requisicao-${Date.now()}`,
    renotify: true,
    data: {
      url: payload.data?.url || DEFAULT_URL,
      requestId
    }
  });
}

async function initializeForegroundMessaging() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
  if (!(await isSupported())) return;

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const messaging = getMessaging(app);

  onMessage(messaging, (payload) => {
    showSystemNotification(payload).catch((error) => {
      console.error('Falha ao exibir notificação em primeiro plano:', error);
    });
  });
}

initializeForegroundMessaging().catch((error) => {
  console.error('Falha ao iniciar notificações em primeiro plano:', error);
});
