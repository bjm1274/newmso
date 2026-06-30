'use client';

/**
 * useKoreanImeGuard — 한글 IME 조합 상태 가드 훅
 *
 * 한글 입력기는 자모 조합 중 부분 음절(예: 'ㄱ', '가', '간')을 onChange로 흘려보낸다.
 * 이 상태에서 즉시 정규식 검증·자동 포맷팅·외부 상태 동기화를 수행하면
 * 사용자의 조합이 깨지거나 IME 커서가 튀는 문제가 발생한다.
 *
 * 이 훅은 composition 이벤트로 조합 상태를 추적하고, `isComposing()`로
 * 호출 측에서 즉시 검증/포맷팅을 건너뛸 수 있도록 한다.
 *
 * 사용 예:
 * ```tsx
 * const { isComposing, handlers } = useKoreanImeGuard();
 *
 * <input
 *   {...handlers}
 *   onChange={(e) => {
 *     setValue(e.target.value);
 *     if (isComposing()) return;            // 조합 중에는 검증 스킵
 *     validatePhone(e.target.value);        // 조합 종료 후에만 검증
 *   }}
 * />
 * ```
 *
 * JM: 단일 책임 — IME 조합 상태 추적만 담당
 * JM2: ref 기반(리렌더 0회), useState 사용하지 않음
 * JM3: 이벤트 핸들러 내부 throw 없음, 사용처에서 정상 흐름으로 처리
 * JM4: any 금지, 핸들러 타입 명시
 */

import { useMemo, useRef } from 'react';
import type { CompositionEventHandler } from 'react';

export interface KoreanImeGuardHandlers {
  onCompositionStart: CompositionEventHandler<HTMLElement>;
  onCompositionEnd: CompositionEventHandler<HTMLElement>;
}

export interface KoreanImeGuard {
  /** 현재 IME 조합이 진행 중인지 동기적으로 확인 */
  isComposing: () => boolean;
  /** input/textarea에 spread 가능한 composition 이벤트 핸들러 */
  handlers: KoreanImeGuardHandlers;
}

export function useKoreanImeGuard(): KoreanImeGuard {
  const isComposingRef = useRef(false);

  // handlers는 mount 동안 안정적인 참조여야 한다 (input의 불필요 리렌더 방지)
  const guard = useMemo<KoreanImeGuard>(
    () => ({
      isComposing: () => isComposingRef.current,
      handlers: {
        onCompositionStart: () => {
          isComposingRef.current = true;
        },
        onCompositionEnd: () => {
          isComposingRef.current = false;
        } } }),
    [],
  );

  return guard;
}

export default useKoreanImeGuard;
