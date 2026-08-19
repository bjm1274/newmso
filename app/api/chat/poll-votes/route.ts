/**
 * /api/chat/poll-votes
 *
 * POST — 투표 집계를 서버에서 만들어 돌려준다.
 *   body: { pollIds: string[] }
 *   resp: { ok: true, polls: { [pollId]: { counts, myVote, voters } } }
 *
 * 왜 라우트가 필요한가:
 *
 * 지금까지 클라이언트가 `poll_votes` 에서 (poll_id, option_index, user_id) 를
 * **전부 받아** 개수를 세었다. 정책도 select: 'AUTHENTICATED' 라 로그인한 사람이면
 * 누구나 "누가 무엇에 투표했는지" 를 응답에서 그대로 볼 수 있었다 — 화면에
 * 이름을 안 그릴 뿐 데이터는 공개였다. 그 위에 익명 체크박스만 얹으면 라벨만
 * 바뀌는 눈속임이 된다.
 *
 * 집계를 서버로 옮기고, 익명 투표는 **user_id 를 아예 응답에 넣지 않는다.**
 * 기명 투표만 투표자 이름을 함께 내려 화면에서 공개한다.
 *
 * 보안:
 *  - user_id 는 세션에서만 취득한다(본문 신뢰 안 함).
 *  - 방 멤버가 아닌 투표는 결과에서 제외한다(polls.room_id 기준, 한 번에 확인).
 *  - 익명 여부는 질문에 심긴 [[POLL_META]] 를 서버가 직접 해석해 판정한다.
 *    클라이언트가 보낸 플래그를 믿지 않는다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { getD1Binding } from '@/lib/db';
import { canAccessChatRoom, parseMembersField } from '@/lib/chat-room-membership';
import { extractPollMetaFromQuestion } from '@/app/main/기능부품/메신저유틸';

export const dynamic = 'force-dynamic';

/** 한 요청에서 집계할 수 있는 투표 수 */
const MAX_POLLS = 100;

type PollResult = {
  /** 선택지 index → 표 수 */
  counts: Record<number, number>;
  /** 내가 고른 선택지 (없으면 null) */
  myVote: number | null;
  /** 익명 투표인지 */
  anonymous: boolean;
  /** 기명 투표일 때만: 선택지 index → 투표자 이름 목록. 익명이면 항상 빈 객체. */
  voters: Record<number, string[]>;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await readSessionFromRequest(req);
  const userId = String(session?.user?.id ?? session?.user?.user_id ?? '').trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = ((await req.json()) as Record<string, unknown>) ?? {};
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const pollIds = Array.isArray(body.pollIds)
    ? Array.from(new Set(body.pollIds.map((v) => String(v ?? '').trim()).filter(Boolean))).slice(0, MAX_POLLS)
    : [];
  if (pollIds.length === 0) {
    return NextResponse.json({ ok: true, polls: {} });
  }

  const d1 = await getD1Binding();
  if (!d1) {
    return NextResponse.json({ ok: false, error: 'D1 binding not available' }, { status: 500 });
  }

  try {
    const ph = pollIds.map(() => '?').join(', ');

    // 투표 + 방 멤버십을 한 번에. (polls.room_id → chat_rooms)
    const pollRows = await d1
      .prepare(
        `SELECT p.id, p.question, p.room_id, r.type AS room_type, r.members AS room_members` +
          ` FROM polls p LEFT JOIN chat_rooms r ON r.id = p.room_id WHERE p.id IN (${ph})`,
      )
      .bind(...pollIds)
      .all<{ id: string; question: string; room_id: string; room_type: string | null; room_members: unknown }>();

    const allowed = new Map<string, { anonymous: boolean }>();
    for (const row of pollRows.results ?? []) {
      const membership = { type: row.room_type, members: parseMembersField(row.room_members) };
      if (!canAccessChatRoom(membership, userId)) continue;
      allowed.set(String(row.id), {
        // 익명 여부는 서버가 질문에서 직접 읽는다 — 클라이언트 주장은 믿지 않는다.
        anonymous: extractPollMetaFromQuestion(row.question).anonymous });
    }
    if (allowed.size === 0) {
      return NextResponse.json({ ok: true, polls: {} });
    }

    const allowedIds = [...allowed.keys()];
    const vph = allowedIds.map(() => '?').join(', ');

    // 기명 투표는 이름을 함께 붙여야 하므로 staff_members 를 조인한다.
    const voteRows = await d1
      .prepare(
        `SELECT v.poll_id, v.option_index, v.user_id, s.name AS user_name` +
          ` FROM poll_votes v LEFT JOIN staff_members s ON s.id = v.user_id` +
          ` WHERE v.poll_id IN (${vph})`,
      )
      .bind(...allowedIds)
      .all<{ poll_id: string; option_index: number; user_id: string | null; user_name: string | null }>();

    const polls: Record<string, PollResult> = {};
    for (const id of allowedIds) {
      polls[id] = { counts: {}, myVote: null, anonymous: allowed.get(id)!.anonymous, voters: {} };
    }

    for (const row of voteRows.results ?? []) {
      const pollId = String(row.poll_id ?? '');
      const result = polls[pollId];
      if (!result) continue;
      const optionIndex = Number(row.option_index);
      if (!Number.isFinite(optionIndex)) continue;

      result.counts[optionIndex] = (result.counts[optionIndex] ?? 0) + 1;

      const voterId = String(row.user_id ?? '');
      // 내 표는 익명이어도 알려준다 — 내가 뭘 골랐는지는 나만 아는 정보다.
      if (voterId && voterId === userId) result.myVote = optionIndex;

      // 남의 신원은 기명 투표에서만 내보낸다.
      if (!result.anonymous && voterId) {
        (result.voters[optionIndex] ??= []).push(String(row.user_name ?? '').trim() || '알 수 없음');
      }
    }

    return NextResponse.json({ ok: true, polls });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('[chat/poll-votes]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
