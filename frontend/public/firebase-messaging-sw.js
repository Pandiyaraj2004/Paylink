// Firebase Cloud Messaging background service worker (Phase 13, master-doc.md
// Section 27 push). Served statically from Vite's `public/` convention at
// `/firebase-messaging-sw.js` (no build step touches this file).
//
// A service worker can't read Vite's `import.meta.env` (that's a bundler-time
// substitution only for modules that actually go through the bundler), so
// this file can't import the same `firebaseConfig` object
// `src/config/firebase.ts` uses. Firebase's own documented workaround —
// used here instead of hardcoding the project's config values into this
// committed file — is to pass the config through the service worker
// registration URL's query string (see `src/services/push.ts`'s
// `navigator.serviceWorker.register(...)` call) and read it back from
// `location.search` below.
//
// Uses the `-compat` CDN builds via `importScripts` (the standard Firebase
// approach for this exact file) rather than the ES module SDK
// `src/config/firebase.ts` otherwise uses — service workers don't reliably
// support bare ES module imports across browsers without extra bundler
// configuration this project doesn't have.
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

const messaging = firebase.messaging();

// Fires only while the app is NOT in the foreground (foreground messages are
// handled by onMessage() in src/services/push.ts instead, surfaced as a
// react-hot-toast, matching this frontend's existing toast pattern).
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'PayLink';
  const body = payload.notification?.body || 'You have a new notification.';
  self.registration.showNotification(title, { body });
});
