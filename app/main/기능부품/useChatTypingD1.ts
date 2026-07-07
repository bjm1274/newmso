'use client';

/**
 * useChatTypingD1
 *
 * D1 실시간 WebSocket 기반 typing 표시 훅.
 * - 입력 중: emitTyping(true) → sendTypingSignal(true)
 * - 입력 중단: emitTyping(false) → sendTypingSignal(false)
 * - 방이 활성(selectedRoomId 존재)인 동안 window 'realtime-typing' 이벤트 구독 수신
 * - 자신의 userId 는 서버에서 자동 제외
 */

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { sendTypingSignal } from '@/lib/polling-bus';

const EMIT_DEBOUNCE_MS = 3000;
const TYPING_CLEAR_MS = 1800;

type UseChatTypingD1Params = {
  selectedRoomId: string | null;
  effectiveChatUserId: string | null | undefined;
  userName: string | null | undefined;
  setTypingUsers: Dispatch<SetStateAction<Record<string, string>>>;
  typingClearRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
};

export function useChatTypingD1({
  selectedRoomId,
  effectiveChatUserId,
  userName,
  setTypingUsers,
  typingClearRef }: UseChatTypingD1Params) {
  const lastEmitAtRef = useRef<number>(0);
  const lastEmittedTypingRef = useRef<boolean>(false);
  const isMountedRef = useRef(true);
  const selectedRoomIdRef = useRef(selectedRoomId);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── 외부에서 호출하는 emit 함수 ─────────────────────────────────────────

  const emitTyping = useCallback(
    (isTyping: boolean): void => {
      const roomId = selectedRoomIdRef.current;
      if (!roomId || !effectiveChatUserId) return;

      if (!isTyping) {
        // 즉시 중단 전송 (상태 변화가 있을 때만)
        if (lastEmittedTypingRef.current) {
          lastEmittedTypingRef.current = false;
          lastEmitAtRef.current = 0;
          sendTypingSignal(roomId, false);
        }
        return;
      }

      // typing=true: EMIT_DEBOUNCE_MS 안에 중복 전송 억제
      const now = Date.now();
      if (now - lastEmitAtRef.current < EMIT_DEBOUNCE_MS) return;

      lastEmitAtRef.current = now;
      lastEmittedTypingRef.current = true;
      sendTypingSignal(roomId, true, userName ?? '알수없음');
    },
    [effectiveChatUserId, userName],
  );

  // ── handleComposerChange에서 사용하는 typing 트리거 ─────────────────────
  // useChatComposerState의 emitTypingState와 동일한 인터페이스 유지

  const handleTypingInput = useCallback(
    (value: string): void => {
      const roomId = selectedRoomIdRef.current;
      if (!roomId) return;

      if (typingClearRef.current) {
        clearTimeout(typingClearRef.current);
        typingClearRef.current = null;
      }

      if (value.trim()) {
        emitTyping(true);
        typingClearRef.current = setTimeout(() => {
          typingClearRef.current = null;
          emitTyping(false);
        }, TYPING_CLEAR_MS);
      } else {
        emitTyping(false);
      }
    },
    [emitTyping, typingClearRef],
  );

  // ── 실시간 WebSocket 타이핑 수신 (5초 폴링 제거) ────────────────────────

  useEffect(() => {
    if (!selectedRoomId) {
      setTypingUsers({});
      return;
    }

    const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

    const handleRealtimeTyping = (event: Event) => {
      if (!isMountedRef.current) return;
      const detail = (event as CustomEvent).detail;
      if (!detail || String(detail.roomId) !== String(selectedRoomId)) return;

      const { userId, userName: targetName, typing } = detail;

      setTypingUsers((prev) => {
        const next = { ...prev };
        if (typing) {
          next[userId] = targetName;
          
          // 이미 클리어 타이머가 돌아가는 경우 리셋
          if (timeouts.has(userId)) {
            clearTimeout(timeouts.get(userId)!);
          }
          
          // 타이핑 신호가 오고 5초 동안 추가 신호가 없으면 자동 클린업
          const timer = setTimeout(() => {
            setTypingUsers((current) => {
              const copy = { ...current };
              delete copy[userId];
              return copy;
            });
            timeouts.delete(userId);
          }, 5000);
          
          timeouts.set(userId, timer);
        } else {
          delete next[userId];
          if (timeouts.has(userId)) {
            clearTimeout(timeouts.get(userId)!);
            timeouts.delete(userId);
          }
        }
        return next;
      });
    };

    window.addEventListener('realtime-typing', handleRealtimeTyping);

    return () => {
      window.removeEventListener('realtime-typing', handleRealtimeTyping);
      timeouts.forEach((timer) => clearTimeout(timer));
      timeouts.clear();
      setTypingUsers({});
      // 방 떠날 때 typing 상태 서버에서도 제거
      if (lastEmittedTypingRef.current && selectedRoomId) {
        lastEmittedTypingRef.current = false;
        sendTypingSignal(selectedRoomId, false);
      }
    };
  }, [selectedRoomId, setTypingUsers]);

  return { emitTyping, handleTypingInput };
}
