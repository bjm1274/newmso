'use client';

/**
 * haptics — 모바일 햅틱 피드백 유틸
 *
 * Vibration API(navigator.vibrate)를 thin wrapper로 제공한다.
 * - 미지원 브라우저(iOS Safari 전체, 일부 데스크톱)는 무음 fallback.
 * - prefers-reduced-motion: reduce 사용자는 진동 발생시키지 않음.
 * - SSR 안전 (typeof window === 'undefined' 가드).
 *
 * 사용 예:
 * ```ts
 * import { haptics } from '@/app/lib/haptics';
 *
 * <button onClick={() => { haptics.light(); save(); }} />
 * ```
 *
 * 적용 지점 가이드 (docs/mobile/MSO_Mobile_Advanced.md §4-3)
 * - light:     일반 탭, 풀-투-리프레시 트리거
 * - medium:    롱프레스 발생, 스와이프 임계 도달
 * - heavy:     중요한 상태 전환
 * - success:   저장/완료 성공
 * - error/warning: 위험 액션 확인, 오류 표시
 * - selection: 선택 토글 (체크박스, 라디오)
 *
 * JM:  단일 책임 — 진동 트리거만 담당, 100줄 이하
 * JM3: try/catch + optional chaining 으로 미지원 브라우저 graceful fallback
 * JM4: HapticImpact 타입 export, any 사용 안 함
 * JM6: prefers-reduced-motion 사용자 진동 차단
 */

export type HapticImpact = 'light' | 'medium' | 'heavy';
export type HapticNotification = 'success' | 'warning' | 'error';

/** 진동을 실행해도 되는지 판단 (SSR + reduced-motion + 미지원 가드) */
function canVibrate(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
  } catch {
    // matchMedia 미지원 환경: 진동은 허용
  }
  return true;
}

/** 내부: 패턴 진동 실행 (실패해도 throw 하지 않음) */
function pulse(pattern: number | number[]): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // 사파리 등에서 vibrate 가 존재해도 throw 할 수 있음 — 무시
  }
}

export const haptics = {
  /** 가벼운 탭 — 일반 버튼, 풀-투-리프레시 트리거 */
  light: (): void => pulse(10),
  /** 중간 임팩트 — 롱프레스 발생, 스와이프 임계 도달 */
  medium: (): void => pulse(20),
  /** 무거운 임팩트 — 중요한 상태 전환 */
  heavy: (): void => pulse(40),
  /** 성공 패턴 — 저장/완료 */
  success: (): void => pulse([10, 50, 10]),
  /** 경고 패턴 — 위험 액션 확인 */
  warning: (): void => pulse([10, 50, 10, 50]),
  /** 에러 패턴 — 검증 실패, 차단 */
  error: (): void => pulse([20, 30, 20, 30, 20]),
  /** 선택 토글 — 체크박스, 라디오 */
  selection: (): void => pulse(5),
  /** 임팩트 강도 통합 호출 */
  impact: (level: HapticImpact = 'light'): void => {
    if (level === 'heavy') return pulse(40);
    if (level === 'medium') return pulse(20);
    return pulse(10);
  },
  /** 알림 강도 통합 호출 */
  notify: (type: HapticNotification): void => {
    if (type === 'success') return pulse([10, 50, 10]);
    if (type === 'warning') return pulse([10, 50, 10, 50]);
    return pulse([20, 30, 20, 30, 20]);
  } } as const;

export default haptics;
