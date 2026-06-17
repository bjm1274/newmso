'use client';

/**
 * 모바일 채팅 — 메시지/방/투표 변경 액션 모음.
 *
 * PC 자산을 정확히 미러링한다:
 *  - editMobileMessage      ← 메신저상태훅.saveEditedMessage (messages.update {content, edited_at})
 *  - renameMobileRoom       ← 메신저방관리훅.handleSaveRoomName (patchChatRoom {name})
 *  - addMobileRoomMembers   ← 메신저방관리훅.handleSubmitAddMembers (patchChatRoom {members} + 시스템 메시지)
 *  - removeMobileRoomMember ← 메신저방관리훅.removeRoomMember (동일)
 *  - createMobilePoll       ← 메신저입력워크플로훅.handleCreatePoll (polls insert)
 *  - voteMobilePoll         ← 메신저입력워크플로훅.handleVote (poll_votes upsert onConflict 'poll_id,user_id')
 *  - fetchRoomPolls         ← 메신저방데이터훅 poll fetch (polls + poll_votes 집계)
 *
 * 시스템 메시지/방 멤버 변경은 PC와 동일하게 `messages` 테이블 + patchChatRoom 을 사용한다.
 * (모바일 채팅방.tsx 기존 forward/delete가 사용하던 'chat_messages'는 앱 전체에서 그 곳에만
 *  존재하는 비표준 이름이라 미러링 대상에서 제외 — 본 모듈은 표준 'messages'만 쓴다.)
 *
 * 제약: JM(단일 책임 + 500줄 이내), JM3(try/catch + 호출측 toast), JM4(any 금지).
 */

import { supabase } from '@/lib/supabase';
import { pokeChannel } from '@/lib/realtime-bus';
import { insertChatMessageWithFallback } from '@/lib/chat-message-write';
import { patchChatRoom } from '@/lib/chat-rooms-client';
import { buildPollQuestionContent, type PollMeta } from '@/app/main/기능부품/메신저유틸';
import type { ChatMessage } from '@/types';

export type ActionResult = { ok: true } | { ok: false; error: string };

function errMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

// ─────────────────────────────────────────────
// 메시지 수정 — PC 메신저상태훅.saveEditedMessage 미러
//   supabase.from('messages').update({ content, edited_at }).eq('id', …)
// ─────────────────────────────────────────────

export async function editMobileMessage(input: {
  messageId: string;
  content: string;
  roomId?: string | null;
}): Promise<ActionResult> {
  const next = input.content.trim();
  if (!next) return { ok: false, error: '메시지 내용을 입력해 주세요.' };
  if (!input.messageId) return { ok: false, error: '메시지 정보가 올바르지 않습니다.' };
  try {
    const editedAt = new Date().toISOString();
    const { error } = await supabase
      .from('messages')
      .update({ content: next, edited_at: editedAt })
      .eq('id', input.messageId);
    if (error) return { ok: false, error: errMessage(error, '메시지 수정 실패') };
    if (input.roomId) pokeChannel(`mobile-chat-room-${input.roomId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, '메시지 수정 실패') };
  }
}

// ─────────────────────────────────────────────
// 방 이름 수정 — PC 메신저방관리훅.handleSaveRoomName 미러
//   patchChatRoom(roomId, { name })
// ─────────────────────────────────────────────

export async function renameMobileRoom(input: {
  roomId: string;
  name: string;
}): Promise<ActionResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: '채팅방 이름을 입력해 주세요.' };
  try {
    const result = await patchChatRoom(String(input.roomId), { name });
    if (!result.ok) return { ok: false, error: result.error || '채팅방 이름 저장에 실패했습니다.' };
    pokeChannel('mobile-chat-rooms-list');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, '채팅방 이름 저장에 실패했습니다.') };
  }
}

// ─────────────────────────────────────────────
// 멤버 추가/제외 — PC 메신저방관리훅 미러
//   patchChatRoom(roomId, { members }) + messages insert(시스템 안내)
// ─────────────────────────────────────────────

async function insertRoomSystemMessage(
  roomId: string,
  senderId: string | null,
  content: string,
): Promise<void> {
  const { data } = await insertChatMessageWithFallback<Pick<ChatMessage, 'id' | 'room_id'>>(
    supabase,
    {
      room_id: roomId,
      sender_id: senderId,
      content,
      file_url: null,
      file_name: null,
      file_size_bytes: null,
      file_kind: null,
      reply_to_id: null,
      album_id: null,
      album_index: null,
      album_total: null,
    },
    'id, room_id',
  );
  if (data?.room_id) pokeChannel(`mobile-chat-room-${roomId}`);
}

export async function addMobileRoomMembers(input: {
  roomId: string;
  currentMembers: string[];
  addIds: string[];
  inviterId: string | null;
  inviterName: string;
  addedNames: string[];
}): Promise<ActionResult> {
  if (input.addIds.length === 0) return { ok: false, error: '추가할 참여자를 선택해 주세요.' };
  try {
    const setIds = new Set(input.currentMembers.map((id) => String(id)));
    input.addIds.forEach((id) => setIds.add(String(id)));
    const newMembers = Array.from(setIds);

    const result = await patchChatRoom(String(input.roomId), { members: newMembers });
    if (!result.ok) return { ok: false, error: result.error || '참여자 추가에 실패했습니다.' };

    const invitedNames = input.addedNames.filter(Boolean).join(', ') || '새 참여자';
    await insertRoomSystemMessage(
      String(input.roomId),
      input.inviterId,
      `[초대] ${input.inviterName || '알 수 없음'}님이 ${invitedNames}님을 초대했습니다.`,
    );
    pokeChannel('mobile-chat-rooms-list');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, '참여자 추가에 실패했습니다.') };
  }
}

export async function removeMobileRoomMember(input: {
  roomId: string;
  currentMembers: string[];
  removeId: string;
  removerId: string | null;
  removerName: string;
  removedName: string;
}): Promise<ActionResult> {
  try {
    const newMembers = input.currentMembers
      .map((id) => String(id))
      .filter((id) => id !== String(input.removeId));

    const result = await patchChatRoom(String(input.roomId), { members: newMembers });
    if (!result.ok) return { ok: false, error: result.error || '참여자 제외에 실패했습니다.' };

    await insertRoomSystemMessage(
      String(input.roomId),
      input.removerId,
      `[내보내기] ${input.removerName || '알 수 없음'}님이 ${input.removedName || '선택한 참여자'}님을 채팅방에서 제외했습니다.`,
    );
    pokeChannel('mobile-chat-rooms-list');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, '참여자 제외에 실패했습니다.') };
  }
}

// ─────────────────────────────────────────────
// 투표 — PC 메신저입력워크플로훅 미러
//   polls.insert({ room_id, creator_id, question(=buildPollQuestionContent), options })
//   poll_votes.upsert({ poll_id, user_id, option_index }, onConflict 'poll_id,user_id')
// ─────────────────────────────────────────────

export type MobilePoll = {
  id: string;
  room_id: string;
  creator_id: string;
  question: string;
  options: string[];
  created_at: string | null;
};

const POLL_SELECT = 'id, room_id, creator_id, question, options, created_at';

function normalizePollOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      // ignore
    }
  }
  return [];
}

export async function createMobilePoll(input: {
  roomId: string;
  creatorId: string;
  question: string;
  options: string[];
  deadlineAt?: string;
}): Promise<ActionResult> {
  const question = input.question.trim();
  if (!question) return { ok: false, error: '투표 질문을 입력해 주세요.' };
  const options = input.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) return { ok: false, error: '선택지는 2개 이상 입력해 주세요.' };
  try {
    const meta: PollMeta = {};
    if (input.deadlineAt && input.deadlineAt.trim()) meta.deadlineAt = input.deadlineAt.trim();
    const { error } = await supabase.from('polls').insert([
      {
        room_id: input.roomId,
        creator_id: input.creatorId,
        question: buildPollQuestionContent(question, meta),
        options,
      },
    ]);
    if (error) return { ok: false, error: errMessage(error, '투표 생성에 실패했습니다.') };
    pokeChannel(`mobile-chat-room-${input.roomId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, '투표 생성에 실패했습니다.') };
  }
}

export async function voteMobilePoll(input: {
  pollId: string;
  userId: string;
  optionIndex: number;
  roomId?: string | null;
}): Promise<ActionResult> {
  if (!input.pollId || !input.userId) return { ok: false, error: '투표 정보가 올바르지 않습니다.' };
  try {
    const { error } = await supabase.from('poll_votes').upsert(
      {
        poll_id: input.pollId,
        user_id: input.userId,
        option_index: input.optionIndex,
      },
      { onConflict: 'poll_id,user_id' },
    );
    if (error) return { ok: false, error: errMessage(error, '투표에 실패했습니다.') };
    if (input.roomId) pokeChannel(`mobile-chat-room-${input.roomId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, '투표에 실패했습니다.') };
  }
}

export type RoomPollsResult = {
  polls: MobilePoll[];
  /** pollId → (optionIndex → 표수) */
  voteCounts: Record<string, Record<number, number>>;
  /** pollId → 내가 선택한 optionIndex (없으면 undefined) */
  myVotes: Record<string, number>;
};

export async function fetchRoomPolls(
  roomId: string,
  userId: string | null,
): Promise<RoomPollsResult> {
  const empty: RoomPollsResult = { polls: [], voteCounts: {}, myVotes: {} };
  if (!roomId) return empty;
  try {
    const { data, error } = await supabase
      .from('polls')
      .select(POLL_SELECT)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    if (error || !Array.isArray(data)) return empty;

    const polls: MobilePoll[] = (data as Record<string, unknown>[]).map((row) => ({
      id: String(row.id || ''),
      room_id: String(row.room_id || ''),
      creator_id: String(row.creator_id || ''),
      question: String(row.question || ''),
      options: normalizePollOptions(row.options),
      created_at: (row.created_at as string | null | undefined) ?? null,
    }));

    const pollIds = polls.map((p) => p.id).filter(Boolean);
    if (pollIds.length === 0) return { polls, voteCounts: {}, myVotes: {} };

    const { data: votes } = await supabase
      .from('poll_votes')
      .select('poll_id, option_index, user_id')
      .in('poll_id', pollIds);

    const voteCounts: Record<string, Record<number, number>> = {};
    const myVotes: Record<string, number> = {};
    (Array.isArray(votes) ? (votes as Record<string, unknown>[]) : []).forEach((row) => {
      const pollId = String(row.poll_id || '');
      const optionIndex = Number(row.option_index);
      if (!pollId || !Number.isFinite(optionIndex)) return;
      if (!voteCounts[pollId]) voteCounts[pollId] = {};
      voteCounts[pollId][optionIndex] = (voteCounts[pollId][optionIndex] || 0) + 1;
      if (userId && String(row.user_id || '') === String(userId)) {
        myVotes[pollId] = optionIndex;
      }
    });

    return { polls, voteCounts, myVotes };
  } catch {
    return empty;
  }
}
