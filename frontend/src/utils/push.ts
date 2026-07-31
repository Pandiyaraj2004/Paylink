import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import toast from 'react-hot-toast';
import { firebaseApp, firebaseConfig } from '@/config/firebase';
import { registerFcmToken } from '@/api/notifications';

/**
 * FCM web push (Phase 13, master-doc.md Section 27). Backs the "Enable push
 * notifications" toggle in NotificationsTab.tsx.
 *
 * `VITE_FIREBASE_VAPID_KEY` (Firebase Console > Project Settings > Cloud
 * Messaging > Web configuration > "Generate key pair") identifies this web
 * app to FCM's push service when requesting a device token — see
 * `.env.example` for where this is documented.
 */
export function isPushConfigured(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_VAPID_KEY);
}

/**
 * Registers `public/firebase-messaging-sw.js`, passing the (non-secret) web
 * app config through the registration URL's query string — a service
 * worker can't read `import.meta.env` directly, see that file's own header
 * comment for the full reasoning.
 */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey ?? '',
    authDomain: firebaseConfig.authDomain ?? '',
    projectId: firebaseConfig.projectId ?? '',
    storageBucket: firebaseConfig.storageBucket ?? '',
    messagingSenderId: firebaseConfig.messagingSenderId ?? '',
    appId: firebaseConfig.appId ?? '',
  });
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`);
}

let foregroundHandlerAttached = false;

/**
 * Requests Notification permission, registers the service worker, fetches
 * an FCM token, and POSTs it to the backend
 * (POST /api/users/me/fcm-token). Returns false (never throws) for any
 * unsupported-environment or permission-denied case — this is an
 * additive, best-effort feature, not something that should ever break the
 * Settings page it lives on.
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return false;
  if (!isPushConfigured()) return false;
  if (!(await isSupported())) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await registerServiceWorker();
  const messaging = getMessaging(firebaseApp);

  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return false;

  await registerFcmToken(token);

  if (!foregroundHandlerAttached) {
    foregroundHandlerAttached = true;
    onMessage(messaging, (payload) => {
      toast(payload.notification?.body || 'You have a new notification.');
    });
  }

  return true;
}
