'use client';

import { useEffect } from 'react';

export default function PwaBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.isSecureContext) return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    const registerServiceWorker = async () => {
      try {
        const registration =
          (await navigator.serviceWorker.getRegistration('/')) ??
          (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));

        if (!cancelled) {
          void registration.update().catch(() => {});
        }
      } catch (error) {
        console.warn('PWA 서비스워커 등록 실패:', error);
      }
    };

    if (document.readyState === 'complete') {
      void registerServiceWorker();
      return () => {
        cancelled = true;
      };
    }

    const handleLoad = () => {
      void registerServiceWorker();
    };

    window.addEventListener('load', handleLoad, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', handleLoad);
    };
  }, []);

  return null;
}
