'use client';

/**
 * 답글이 가리키는 **원문 메시지만** 따로 가져온다.
 *
 * 예전에는 원문이 현재 로드된 타임라인에 없으면 "클릭해서 이동" 만 보여주고,
 * 누르면 과거 이력을 통째로 불러왔다. 대가가 컸다 —
 *   - 옛 메시지 수십 건을 받아오느라 느리고,
 *   - 그 직후 방 요약이 로드된 창 기준으로 다시 계산돼 채팅방 목록이 흔들렸다.
 * 사용자가 원한 것은 "이 답글이 무슨 말에 달린 건지" 한 줄 확인뿐이다.
 *
 * 그래서 필요한 id 만 골라 한 번에 조회하고 결과를 캐시한다. 같은 원문을 가리키는
 * 답글이 여러 개여도 조회는 한 번이다. 없는(삭제된) 원문은 null 로 기억해 다시
 * 조회하지 않는다.
 */

import { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db-client';
import { logger } from '@/lib/logger';
import type { ChatMessage } from '@/types';

/** 한 번에 조회할 최대 원문 수 — D1 바인딩 파라미터 한도(100)를 넘지 않게 둔다. */
const MAX_LOOKUP_PER_BATCH = 50;

/** id 별 재조회 상한. 넘으면 그때 null 로 확정해 무한 재시도를 막는다. */
const MAX_RETRY_PER_ID = 3;

const LOOKUP_COLUMNS = 'id, room_id, sender_id, sender_name, content, file_name, file_url, file_kind, created_at, is_deleted';

export function useReplyParentMessages(
  replyTargetIds: string[],
  loadedIds: Set<string>,
): Record<string, ChatMessage | null> {
  const [fetched, setFetched] = useState<Record<string, ChatMessage | null>>({});
  // 이미 조회를 시도한 id — 결과가 없어도 다시 부르지 않는다.
  const attemptedRef = useRef<Set<string>>(new Set());
  // id 별 실패 횟수. 상한을 넘으면 그때 null 로 확정해 '찾을 수 없음' 으로 굳힌다.
  const failureCountRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const missing = replyTargetIds
      .map((id) => String(id || '').trim())
      .filter((id) => id && !loadedIds.has(id) && !attemptedRef.current.has(id));
    if (missing.length === 0) return;

    const batch = Array.from(new Set(missing)).slice(0, MAX_LOOKUP_PER_BATCH);
    batch.forEach((id) => attemptedRef.current.add(id));

    /**
     * 조회 실패·취소한 id 를 다시 시도 대상으로 되돌린다.
     *
     * 예전에는 요청 전에 attemptedRef 에 넣어 두고 실패해도 빼지 않아서,
     * 네트워크가 한 번 흔들리면 그 원문들은 **다시는 조회되지 않았다.**
     * 미리보기가 '원문 메시지를 불러오는 중…' 으로 영구히 멈췄다(9차 FB-04).
     *
     * 무한 재시도를 막기 위해 id 별 상한을 두고, 상한을 넘으면 null 로 확정한다.
     */
    const releaseForRetry = () => {
      const exhausted: string[] = [];
      for (const id of batch) {
        const count = (failureCountRef.current.get(id) ?? 0) + 1;
        failureCountRef.current.set(id, count);
        if (count >= MAX_RETRY_PER_ID) exhausted.push(id);
        else attemptedRef.current.delete(id);
      }
      if (exhausted.length > 0) {
        setFetched((prev) => {
          const next = { ...prev };
          for (const id of exhausted) next[id] = null;
          return next;
        });
      }
    };

    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await db
          .from('messages')
          .select(LOOKUP_COLUMNS)
          .in('id', batch);
        if (cancelled) {
          releaseForRetry();
          return;
        }
        if (error) {
          logger.warn('답글 원문 조회 실패:', error);
          releaseForRetry();
          return;
        }
        const rows = (data ?? []) as ChatMessage[];
        const byId = new Map(rows.map((row) => [String(row.id || ''), row]));
        setFetched((prev) => {
          const next = { ...prev };
          for (const id of batch) next[id] = byId.get(id) ?? null;
          return next;
        });
      } catch (err) {
        if (!cancelled) logger.warn('답글 원문 조회 중 오류:', err);
        releaseForRetry();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [replyTargetIds, loadedIds]);

  return fetched;
}
