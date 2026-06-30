'use client';

/**
 * 모바일 메시지 반응(이모지) 유틸.
 *  - fetchReactionsForMessages: message_reactions 일괄 조회 → ChatMessage.reactions 형태로 머지.
 *  - toggleMobileReaction: 동일 user×emoji 토글 (있으면 delete, 없으면 insert).
 *  - PC `메신저액션훅.toggleReaction` (app/main/기능부품/메신저액션훅.ts:72~101)와
 *    `메신저메시지조회훅`의 reactions 집계 패턴을 단순화하여 재구성한다.
 *
 * 제약: JM(단일 책임 + < 500줄), JM3(try/catch + 호출측에서 toast),
 *      JM4(any 금지), JM5(외부 입력 검증은 db 제약/RLS 위임).
 */

import { db } from '@/lib/db-client';
import { pokeChannel } from '@/lib/realtime-bus';
import type { ChatMessage } from '@/types';

export type ReactionsByMessage = Record<string, Record<string, string[]>>;

/** 자주 쓰는 5개 — 메시지 옆 미니 picker용. */
export const MOBILE_QUICK_REACTIONS: readonly string[] = [
  '👍',
  '🙏',
  '❤️',
  '😂',
  '🎉',
] as const;

type ReactionRow = {
  message_id?: string | null;
  emoji?: string | null;
  user_id?: string | null;
};

/**
 * 주어진 messageId 배열에 대해 reactions 조회 → emoji별 userId[] 맵 생성.
 * 빈 배열을 넘기면 빈 객체 반환(쿼리 X).
 */
export async function fetchReactionsForMessages(
  messageIds: string[],
): Promise<ReactionsByMessage> {
  if (!messageIds.length) return {};
  try {
    const { data, error } = await db
      .from('message_reactions')
      .select('message_id, emoji, user_id')
      .in('message_id', messageIds);
    if (error || !Array.isArray(data)) return {};
    const map: ReactionsByMessage = {};
    (data as ReactionRow[]).forEach((row) => {
      const mid = String(row.message_id || '').trim();
      const emoji = String(row.emoji || '').trim();
      const uid = String(row.user_id || '').trim();
      if (!mid || !emoji) return;
      if (!map[mid]) map[mid] = {};
      if (!map[mid][emoji]) map[mid][emoji] = [];
      if (uid && !map[mid][emoji].includes(uid)) {
        map[mid][emoji].push(uid);
      }
    });
    return map;
  } catch {
    return {};
  }
}

/**
 * ChatMessage 배열에 reactions 맵을 머지해 새 배열을 반환한다.
 * - reactions가 비어 있으면 null 유지(스토리지 절약).
 */
export function mergeReactionsIntoMessages(
  messages: ChatMessage[],
  reactionMap: ReactionsByMessage,
): ChatMessage[] {
  if (!messages.length) return messages;
  return messages.map((m) => {
    const mid = String(m.id || '');
    const reactions = reactionMap[mid];
    if (!reactions || Object.keys(reactions).length === 0) {
      if (!m.reactions) return m;
      return { ...m, reactions: null };
    }
    return { ...m, reactions };
  });
}

export type ToggleReactionInput = {
  messageId: string;
  userId: string;
  emoji: string;
  roomId: string;
};

export type ToggleReactionResult =
  | { ok: true; action: 'added' | 'removed' }
  | { ok: false; error: string };

/**
 * (messageId, userId, emoji) 동일 행이 이미 있으면 delete, 없으면 insert.
 * Race-condition은 무시(서버 unique index가 잡아준다고 가정. PC 동일 패턴).
 */
export async function toggleMobileReaction(
  input: ToggleReactionInput,
): Promise<ToggleReactionResult> {
  if (!input.messageId || !input.userId || !input.emoji) {
    return { ok: false, error: '반응 정보가 올바르지 않습니다.' };
  }

  try {
    const existing = await db
      .from('message_reactions')
      .select('id')
      .eq('message_id', input.messageId)
      .eq('user_id', input.userId)
      .eq('emoji', input.emoji)
      .maybeSingle();

    if (existing?.data) {
      const { error } = await db
        .from('message_reactions')
        .delete()
        .eq('message_id', input.messageId)
        .eq('user_id', input.userId)
        .eq('emoji', input.emoji);
      if (error) {
        const msg = (error as { message?: string }).message || '반응 제거 실패';
        return { ok: false, error: msg };
      }
      if (input.roomId) pokeChannel(`mobile-chat-room-${input.roomId}`);
      return { ok: true, action: 'removed' };
    }

    const { error } = await db
      .from('message_reactions')
      .insert([
        {
          message_id: input.messageId,
          user_id: input.userId,
          emoji: input.emoji },
      ]);
    if (error) {
      const msg = (error as { message?: string }).message || '반응 추가 실패';
      return { ok: false, error: msg };
    }
    if (input.roomId) pokeChannel(`mobile-chat-room-${input.roomId}`);
    return { ok: true, action: 'added' };
  } catch (err) {
    const message = err instanceof Error ? err.message : '반응 처리 실패';
    return { ok: false, error: message };
  }
}
