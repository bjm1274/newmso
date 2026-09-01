/**
 * 알림 푸시 공용 헬퍼.
 *
 * `notification-push-dispatch.ts`(인앱 알림 즉시 발송)와
 * `notification-repush.ts`(미열람 중요 알림 재발송)가 공유하는
 * 순수 유틸을 한 곳에 모아 중복을 제거한다.
 *
 * 주의: 두 모듈의 도메인 차이(적격성 필터, 방해금지, 메타 패치 등)는
 * 각 모듈에 그대로 남기고, 여기에는 부작용 없는 공통 변환·선택 로직만 둔다.
 * (DB 무효화/삭제 헬퍼는 D1 binding을 받아 동작하도록 일반화한다.)
 */
import {
  getD1Drizzle,
  push_subscriptions as pushSubscriptionsTable,
  inArray,
  eq } from '@/lib/db';
import type { D1Database } from '@/lib/db/types';

/**
 * 임의 객체를 FCM data 페이로드(문자열 맵)로 변환.
 * null/undefined 값은 제외하고, 비문자열은 JSON.stringify 한다.
 */
export function toStringRecord(
  value: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!value) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || entry === undefined) continue;
    out[key] = typeof entry === 'string' ? entry : JSON.stringify(entry);
  }
  return out;
}

/**
 * unknown 값을 안전한 metadata 레코드(평면 객체)로 정규화한다.
 * 배열/원시값/ null 은 빈 객체로 떨어뜨리고, 객체는 얕은 복사한다.
 */
export function toMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

type SubscriptionLike = {
  fcm_token?: string | null;
  created_at?: string | null;
};

/**
 * @deprecated 멀티 디바이스 미지원 — collectUniqueFcmTokens 사용.
 * 같은 사용자의 잔재 fcm_token이 여러 개일 때 최신 1개만 반환(레거시 호환).
 */
export function selectLatestFcmToken(
  subscriptions: SubscriptionLike[],
): string | null {
  const tokens = collectUniqueFcmTokens(subscriptions);
  return tokens[0] ?? null;
}

/**
 * 사용자 구독 목록에서 고유 FCM 토큰 전부 수집 (기기 여러 대 지원).
 * created_at 최신 순으로 정렬해 첫 토큰이 최신이 되도록 한다(레거시 selectLatest 호환).
 */
export function collectUniqueFcmTokens(
  subscriptions: SubscriptionLike[],
): string[] {
  const byToken = new Map<string, number>();
  for (const subscription of subscriptions) {
    const token = String(subscription.fcm_token || '').trim();
    if (!token) continue;
    const parsed = subscription.created_at ? Date.parse(String(subscription.created_at)) : 0;
    const createdAt = Number.isFinite(parsed) ? parsed : 0;
    const prev = byToken.get(token);
    if (prev === undefined || createdAt > prev) {
      byToken.set(token, createdAt);
    }
  }
  return Array.from(byToken.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token);
}

type EndpointSubscriptionLike = {
  endpoint?: string | null;
  p256dh?: string | null;
  auth?: string | null;
  fcm_token?: string | null;
};

/**
 * 유효한(https + p256dh/auth 보유) WebPush 구독을 endpoint 기준으로 dedupe.
 * 같은 사용자의 잔재 구독이 같은 endpoint로 여러 개여도 1건만 남긴다.
 *
 * 기본(excludeFcmRows=true): 같은 행에 fcm_token 이 있으면 스킵.
 *  → 동일 기기 FCM+WebPush 이중 발송 방지, PC 전용 WebPush 구독은 유지.
 */
export function dedupeWebPushSubscriptions<T extends EndpointSubscriptionLike>(
  subscriptions: T[],
  options?: { excludeFcmRows?: boolean },
): T[] {
  const excludeFcmRows = options?.excludeFcmRows !== false;
  const unique = new Map<string, T>();
  for (const subscription of subscriptions) {
    if (excludeFcmRows && String(subscription.fcm_token || '').trim()) continue;
    const endpoint = String(subscription.endpoint || '').trim();
    if (!endpoint || !/^https?:\/\//i.test(endpoint)) continue;
    if (!subscription.p256dh || !subscription.auth) continue;
    if (!unique.has(endpoint)) unique.set(endpoint, subscription);
  }
  return Array.from(unique.values());
}

/**
 * 만료(NOT_FOUND/INVALID 등)로 판명된 FCM 토큰을 push_subscriptions에서 null 처리.
 * 토큰별 개별 UPDATE로, 실패는 격리해 로그만 남긴다.
 */
export async function invalidateExpiredFcmTokens(
  d1: D1Database,
  tokens: string[],
): Promise<void> {
  if (tokens.length === 0) return;
  const db = getD1Drizzle(d1);
  for (const token of tokens) {
    try {
      await db
        .update(pushSubscriptionsTable)
        .set({ fcm_token: null })
        .where(eq(pushSubscriptionsTable.fcm_token, token));
    } catch (err) {
      console.error('[notification-shared] FCM token invalidate failed:', err);
    }
  }
}

/**
 * 만료(404/410) WebPush 구독 행을 id 기준으로 삭제한다.
 */
export async function deleteExpiredWebPushSubscriptions(
  d1: D1Database,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const db = getD1Drizzle(d1);
  try {
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, ids));
  } catch (err) {
    console.error('[notification-shared] WebPush subscription delete failed:', err);
  }
}
