'use client';

/**
 * 상세훅 — 조회수 RPC + 댓글 realtime 보조 훅.
 *  - 상세 진입 시 조회수 +1 (post당 1회, ref guard)
 *  - subscribeRealtime로 board_post_comments / board_post_likes polling
 * JM: 단일 책임 (조회수 · realtime), ~120줄
 * JM2: cleanup (ref + unsubscribe), 동일 postId 재진입 시 중복 fetch 회피
 * JM3: try/catch + 실패 무시 (조회수는 통계라 사용자에게 알리지 않음)
 */

import { useEffect, useRef } from 'react';
import { subscribeRealtime } from '@/lib/realtime-bus';

const ENDPOINT = '/api/d1/rpc/increment-post-views';

/**
 * 조회수 +1 — D1 라우트 fetch.
 * 같은 postId 재진입에는 무동작 (ref guard).
 * onIncremented는 ref로 stable하게 캡처해 매 렌더 effect 재실행을 막는다 (JM2).
 */
export function useIncrementPostView(
  postId: string | null,
  onIncremented?: () => void,
): void {
  const viewedRef = useRef<string | null>(null);
  const callbackRef = useRef(onIncremented);
  useEffect(() => {
    callbackRef.current = onIncremented;
  }, [onIncremented]);

  useEffect(() => {
    if (!postId) {
      viewedRef.current = null;
      return;
    }
    if (viewedRef.current === postId) return;
    viewedRef.current = postId;

    void (async () => {
      try {
        await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_post_id: postId }) }).catch(() => null);
        callbackRef.current?.();
      } catch {
        // 조회수 실패는 무시 (통계 목적)
      }
    })();
  }, [postId]);
}

/**
 * 상세 화면에서 댓글 / 좋아요 변경 감지 — polling 기반 realtime-bus.
 * postId가 null이면 구독 X.
 */
export function useBoardDetailRealtime(
  postId: string | null,
  onChange: () => void,
): void {
  const callbackRef = useRef(onChange);
  useEffect(() => {
    callbackRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!postId) return;
    const unsub = subscribeRealtime(
      `mobile-board-detail-${postId}`,
      [
        { table: 'board_post_comments', event: '*' },
        { table: 'board_post_likes', event: '*' },
      ],
      () => {
        callbackRef.current();
      },
      { pollIntervalMs: 8000 },
    );
    return () => {
      unsub();
    };
  }, [postId]);
}
