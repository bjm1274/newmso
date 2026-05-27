'use client';

/**
 * 별표훅 — 게시판 즐겨찾기(별표) 서버 영구화.
 * 서버 테이블 `board_post_stars(post_id, user_id, created_at)` 우선,
 * 거부/누락 시 LS(`mso-mobile-board-star/{userId}`) 폴백.
 * JM: 단일 책임 (별표 토글·로드만), ~180줄 이내
 * JM3: try/catch + 실패 롤백 + toast (단, 무알림 fallback 옵션 boolean)
 * JM4: any 금지, 명시 타입
 * JM5: user_id는 항상 자기 자신만 — 다른 사용자 행은 select할 일 없음
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

// ─────────────────────────────────────────────
// LS 폴백
// ─────────────────────────────────────────────

const TABLE_NAME = 'board_post_stars';

function storageKey(userId: string | null): string {
  return `mso-mobile-board-star/${userId ?? 'anon'}`;
}

function readLocal(userId: string | null): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.map((v) => String(v)));
    return new Set();
  } catch {
    return new Set();
  }
}

function writeLocal(userId: string | null, set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────
// 테이블 결손/권한 오류 판별 — 폴백 트리거
// ─────────────────────────────────────────────

function isMissingOrDeniedError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === '42P01') return true; // table does not exist
  if (e.code === '42501') return true; // permission denied
  if (e.code === 'PGRST116') return true; // PostgREST not found
  const msg = String(e.message ?? '').toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('relation') ||
    msg.includes('permission denied')
  );
}

// ─────────────────────────────────────────────
// 사용자별 별표 Set 로드
// ─────────────────────────────────────────────

export async function loadStarSet(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('post_id')
      .eq('user_id', userId);
    if (error) {
      if (isMissingOrDeniedError(error)) return readLocal(userId);
      throw error;
    }
    const set = new Set<string>(
      (Array.isArray(data) ? data : [])
        .map((row) => String((row as { post_id?: unknown }).post_id ?? '').trim())
        .filter(Boolean),
    );
    // 로컬과 합치기 (오프라인 토글 보존)
    const local = readLocal(userId);
    local.forEach((id) => set.add(id));
    // 서버 응답을 LS에 캐시
    writeLocal(userId, set);
    return set;
  } catch {
    return readLocal(userId);
  }
}

// ─────────────────────────────────────────────
// 토글 — 낙관적 → 실패 시 호출자에게 롤백 신호
// ─────────────────────────────────────────────

export type ToggleStarResult = {
  /** 토글 후 상태 (true=별표 추가됨) */
  starred: boolean;
  /** 서버 반영 성공 여부 — false면 LS만 변경 */
  persisted: boolean;
};

export async function toggleStarServer(
  userId: string | null,
  postId: string,
): Promise<ToggleStarResult> {
  const localSet = readLocal(userId);
  const wasStarred = localSet.has(postId);
  const nextStarred = !wasStarred;

  // LS 먼저 업데이트 (낙관적)
  if (nextStarred) localSet.add(postId);
  else localSet.delete(postId);
  writeLocal(userId, localSet);

  if (!userId) {
    return { starred: nextStarred, persisted: false };
  }

  try {
    if (nextStarred) {
      const { error } = await supabase
        .from(TABLE_NAME)
        .insert([{ post_id: postId, user_id: userId }]);
      if (error) {
        // 이미 unique row 충돌이면 already-on으로 간주
        const code = (error as { code?: string }).code;
        if (code === '23505') {
          return { starred: true, persisted: true };
        }
        if (isMissingOrDeniedError(error)) {
          return { starred: nextStarred, persisted: false };
        }
        throw error;
      }
    } else {
      const { error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
      if (error) {
        if (isMissingOrDeniedError(error)) {
          return { starred: nextStarred, persisted: false };
        }
        throw error;
      }
    }
    return { starred: nextStarred, persisted: true };
  } catch (err) {
    // 서버 거부 — LS 롤백
    if (nextStarred) localSet.delete(postId);
    else localSet.add(postId);
    writeLocal(userId, localSet);
    toast(`즐겨찾기 처리 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    return { starred: wasStarred, persisted: false };
  }
}

// ─────────────────────────────────────────────
// 훅 형태 (선택적 — 부모에서 직접 loadStarSet 호출해도 됨)
// ─────────────────────────────────────────────

export function useStarSet(userId: string | null): {
  starSet: Set<string>;
  reload: () => Promise<void>;
} {
  const [starSet, setStarSet] = useState<Set<string>>(() => readLocal(userId));

  const reload = useCallback(async () => {
    const next = await loadStarSet(userId);
    setStarSet(next);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { starSet, reload };
}
