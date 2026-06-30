'use client';

/**
 * useChatTypingD1
 *
 * D1 polling 기반 typing 표시 훅.
 * - 입력 중: emitTyping(true) → POST /api/chat/typing (디바운스 3초)
 * - 입력 중단: emitTyping(false) → DELETE /api/chat/typing
 * - 방이 활성(selectedRoomId 존재)인 동안 5초마다 GET /api/chat/typing?room_id= 폴링
 * - 자신의 userId 는 서버에서 자동 제외
 */

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

const POLL_INTERVAL_MS = 5000;
const EMIT_DEBOUNCE_MS = 3000;
const TYPING_CLEAR_MS = 1800;

// 서버 응답 타입 (runtime 검증용)
type TypingUser = {
  user_id: string;
  user_name: string;
};

function isTypingUserArray(value: unknown): value is TypingUser[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).user_id === 'string' &&
        typeof (item as Record<string, unknown>).user_name === 'string',
    )
  );
}

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
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // ── typing 상태 서버 전송 ────────────────────────────────────────────────

  const sendTypingSet = useCallback(
    async (roomId: string, name: string): Promise<void> => {
      try {
        await fetch('/api/chat/typing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_id: roomId, user_name: name }) });
      } catch {
        // 네트워크 오류는 무시 — typing 표시는 비필수 기능
      }
    },
    [],
  );

  const sendTypingClear = useCallback(async (roomId: string): Promise<void> => {
    try {
      await fetch('/api/chat/typing', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId }) });
    } catch {
      // 무시
    }
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
          void sendTypingClear(roomId);
        }
        return;
      }

      // typing=true: EMIT_DEBOUNCE_MS 안에 중복 전송 억제
      const now = Date.now();
      if (now - lastEmitAtRef.current < EMIT_DEBOUNCE_MS) return;

      lastEmitAtRef.current = now;
      lastEmittedTypingRef.current = true;
      void sendTypingSet(roomId, userName ?? '알수없음');
    },
    [effectiveChatUserId, sendTypingClear, sendTypingSet, userName],
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

  // ── 폴링: 방이 활성인 동안 5초마다 GET ──────────────────────────────────

  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (!selectedRoomId) {
      setTypingUsers({});
      return;
    }

    const poll = async (): Promise<void> => {
      if (!isMountedRef.current) return;
      try {
        const res = await fetch(
          `/api/chat/typing?room_id=${encodeURIComponent(selectedRoomId)}`,
          { cache: 'no-store' },
        );
        if (!res.ok || !isMountedRef.current) return;

        const data: unknown = await res.json();
        if (
          typeof data !== 'object' ||
          data === null ||
          !isTypingUserArray((data as Record<string, unknown>).users)
        ) {
          return;
        }

        const users = (data as { users: TypingUser[] }).users;
        if (!isMountedRef.current) return;

        setTypingUsers((prev) => {
          const next: Record<string, string> = {};
          users.forEach((u) => {
            next[u.user_id] = u.user_name;
          });
          // 얕은 비교로 불필요한 리렌더 방지
          const prevKeys = Object.keys(prev);
          const nextKeys = Object.keys(next);
          if (prevKeys.length !== nextKeys.length) return next;
          for (const k of nextKeys) {
            if (prev[k] !== next[k]) return next;
          }
          return prev;
        });
      } catch {
        // 폴링 오류 무시
      }
    };

    // 즉시 한 번 실행 후 인터벌 등록
    void poll();
    pollIntervalRef.current = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setTypingUsers({});
      // 방 떠날 때 typing 상태 서버에서도 제거
      if (lastEmittedTypingRef.current && selectedRoomId) {
        lastEmittedTypingRef.current = false;
        void sendTypingClear(selectedRoomId);
      }
    };
  }, [selectedRoomId, sendTypingClear, setTypingUsers]);

  return { emitTyping, handleTypingInput };
}
