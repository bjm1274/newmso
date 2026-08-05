'use client';
/**
 * 클라이언트 로그아웃 공통 로직
 *
 * - 브라우저 ServiceWorker 푸시 구독 해제
 * - 서버 push_subscriptions 삭제
 * - 세션 쿠키 삭제 (DELETE /api/auth/session)
 * - localStorage 정리
 *
 * 푸시 해제 실패는 로그아웃 자체를 막지 않는다.
 */

import { logger } from '@/lib/logger';
import { STORAGE_KEYS } from '@/lib/storage-keys';

// ── 내부 헬퍼 ─────────────────────────────────────────────────

async function getActivePushEndpoint(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.pushManager) return null;
    const sub = await registration.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

async function unsubscribeBrowserPush(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.pushManager) return;
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
    }
  } catch (err) {
    logger.warn('[client-logout] 브라우저 푸시 구독 해제 실패:', err);
  }
}

async function deleteServerPushSubscription(endpoint: string): Promise<void> {
  try {
    await fetch('/api/notifications/push-subscription', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }) });
  } catch (err) {
    logger.warn('[client-logout] 서버 푸시 구독 삭제 실패:', err);
  }
}

async function deleteFcmToken(): Promise<void> {
  try {
    const fcmVapidKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY?.trim();
    if (!fcmVapidKey) return;

    const { getApps } = await import('firebase/app');
    const apps = getApps();
    if (apps.length === 0) return;

    const { getMessaging, deleteToken } = await import('firebase/messaging');
    const messaging = getMessaging(apps[0]);
    await deleteToken(messaging);
  } catch (err) {
    logger.warn('[client-logout] FCM 토큰 삭제 실패:', err);
  }
}

// ── 공개 함수 ─────────────────────────────────────────────────

/**
 * 푸시 구독 해제만 수행 (세션 삭제·페이지 이동 없음).
 * clearClientSession / handleLogout 공통으로 호출.
 * 모든 에러를 catch해서 호출자 흐름을 막지 않는다.
 */
export async function unsubscribePushOnLogout(): Promise<void> {
  try {
    const endpoint = await getActivePushEndpoint();
    await Promise.allSettled([
      unsubscribeBrowserPush(),
      endpoint ? deleteServerPushSubscription(endpoint) : Promise.resolve(),
      deleteFcmToken(),
    ]);
  } catch (err) {
    logger.warn('[client-logout] 푸시 구독 해제 중 예외:', err);
  }
}

/**
 * 완전한 클라이언트 로그아웃:
 * - 푸시 구독 해제
 * - 세션 쿠키 DELETE
 * - localStorage 정리
 * - Supabase realtime 세션 해제
 *
 * 완료 후 `window.location.replace('/')`는 호출자 책임.
 */
export async function performClientLogout(): Promise<void> {
  // 1. 푸시 구독 해제 (실패해도 계속)
  await unsubscribePushOnLogout();

  // 2. 세션 쿠키 삭제
  try {
    await fetch('/api/auth/session', { method: 'DELETE' });
  } catch {
    // ignore
  }

  // 3. localStorage 정리
  try {
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.LOGIN_AT);
    // 수술상담 기록은 환자명·차트번호·진단·수술계획을 담은 환자정보다.
    // 지금은 sessionStorage 에만 두지만, 예전 localStorage 사본이 남아 있는
    // 단말이 있으므로 로그아웃 때도 함께 지운다. 공용 단말에서 다음 사용자가
    // 앱 인증 없이 이전 환자 기록을 읽는 일이 없어야 한다.
    localStorage.removeItem(STORAGE_KEYS.CONSULTATION_RECORDS_LEGACY);
    sessionStorage.removeItem(STORAGE_KEYS.CONSULTATION_RECORDS_SESSION);
  } catch {
    // ignore
  }
}
