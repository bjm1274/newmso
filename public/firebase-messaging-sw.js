// Legacy Firebase messaging SW removed. Active SW is /sw.js.
// cleanupLegacyMessagingServiceWorkers (알림시스템.tsx) unregisters this URL.
// Self-unregister if still installed — no Firebase, no push handlers.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => self.clients.claim())
  );
});
