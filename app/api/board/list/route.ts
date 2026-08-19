/**
 * /api/board/list
 *
 * POST — 모바일 게시판 목록/달력용 게시글 조회.
 *   body: { mode: 'list', limit?, cursor? }        → 최신순 페이지
 *   body: { mode: 'calendar', month: 'YYYY-MM' }   → 그 달의 일정 글
 *   resp: { ok: true, posts, nextCursor }
 *
 * 왜 라우트가 필요한가:
 *
 * 1) 첫 진입에 617건(620KB)을 통째로 받고 있었다. 목록은 카드를 30개만 그리는데도
 *    전건을 내려받는다. 페이지로 끊으면 89KB 로 떨어진다.
 *
 * 2) 그런데 클라이언트 D1 게이트웨이로는 끊을 수가 없다. 일정 글 147건은
 *    schedule_date 컬럼이 비어 있고 날짜가 본문의 [[SCHEDULE_META]] 안에만 있다.
 *    SQL 에서 schedule_date 로 거르면 이 147건이 달력에서 통째로 사라진다.
 *    META 해석(normalizeBoardPost)을 **먼저** 하고 걸러야 하는데, 그 순서는
 *    서버에서만 가능하다.
 *
 * 3) 덤으로 META 블록(본문 176KB 중 131KB)이 응답에서 빠진다. 어차피
 *    normalizeBoardPost 가 클라이언트에서 떼어 버리던 값이다.
 *
 * 보안: board_posts 의 select 정책은 PUBLIC 이지만 로그인은 요구한다
 * (기존 클라이언트 경로도 세션 쿠키로 /api/d1/query 를 거쳤다).
 * 보드 타입별 열람 권한은 화면단 canAccessBoard 가 계속 담당한다 — 이 라우트는
 * 전송량을 줄이는 것이지 권한 모델을 바꾸지 않는다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { getD1Binding } from '@/lib/db';
import { normalizeBoardPost } from '@/app/main/기능부품/게시판-view-utils';
import {
  BOARD_POST_REQUIRED_SELECT_COLUMNS,
  BOARD_POST_OPTIONAL_COLUMNS,
} from '@/app/main/기능부품/게시판공통';
import type { BoardPost } from '@/types';

export const dynamic = 'force-dynamic';

/** 목록 조회에 쓰는 board_type 전체 (레거시 별칭 포함) */
const LIST_BOARD_TYPES = [
  '공지사항', '자유게시판', '경조사',
  '수술일정', '수술',
  'MRI일정', 'MRI일정표', 'mri',
  '업무가이드',
];

const SCHEDULE_BOARD_TYPES = new Set(['수술일정', '수술', 'MRI일정', 'MRI일정표', 'mri']);

/** 목록·달력이 읽지 않는 컬럼은 애초에 조회하지 않는다. */
const UNUSED_COLUMNS = new Set(['board_id', 'updated_at', 'company_id', 'tags', 'poll', 'poll_votes']);

const SELECT_COLUMNS = [
  ...BOARD_POST_REQUIRED_SELECT_COLUMNS,
  ...BOARD_POST_OPTIONAL_COLUMNS,
].filter((c) => !UNUSED_COLUMNS.has(c));

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

function clampLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

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

  const d1 = await getD1Binding();
  if (!d1) {
    return NextResponse.json({ ok: false, error: 'D1 binding not available' }, { status: 500 });
  }

  const mode = String(body.mode ?? 'list');
  const cols = SELECT_COLUMNS.join(', ');
  const typePlaceholders = LIST_BOARD_TYPES.map(() => '?').join(', ');

  try {
    if (mode === 'calendar') {
      const month = String(body.month ?? '').trim();
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json({ ok: false, error: 'month must be YYYY-MM' }, { status: 400 });
      }

      // 일정 글은 전부 읽어 정규화한 뒤 **해석된 날짜**로 거른다.
      // (SQL 의 schedule_date 로 먼저 거르면 META 안에만 날짜가 있는 147건이 사라진다.)
      const scheduleTypes = [...SCHEDULE_BOARD_TYPES];
      const rows = await d1
        .prepare(
          `SELECT ${cols} FROM board_posts WHERE board_type IN (${scheduleTypes.map(() => '?').join(', ')})`,
        )
        .bind(...scheduleTypes)
        .all<Record<string, unknown>>();

      const posts = (rows.results ?? [])
        .map((row) => normalizeBoardPost(row as Partial<BoardPost>))
        .filter((post) => String(post.schedule_date ?? '').startsWith(month));

      return NextResponse.json({ ok: true, posts, nextCursor: null });
    }

    // mode === 'list'
    const limit = clampLimit(body.limit);
    const cursor = typeof body.cursor === 'string' && body.cursor.trim() ? body.cursor.trim() : null;

    // created_at DESC 페이징. 커서는 마지막 행의 created_at.
    const where = cursor
      ? `board_type IN (${typePlaceholders}) AND created_at < ?`
      : `board_type IN (${typePlaceholders})`;
    const binds = cursor ? [...LIST_BOARD_TYPES, cursor] : [...LIST_BOARD_TYPES];

    const rows = await d1
      .prepare(`SELECT ${cols} FROM board_posts WHERE ${where} ORDER BY created_at DESC LIMIT ?`)
      .bind(...binds, limit + 1)
      .all<Record<string, unknown>>();

    const raw = rows.results ?? [];
    const hasMore = raw.length > limit;
    const page = hasMore ? raw.slice(0, limit) : raw;
    const posts = page.map((row) => normalizeBoardPost(row as Partial<BoardPost>));
    const nextCursor = hasMore ? String(page[page.length - 1]?.created_at ?? '') || null : null;

    return NextResponse.json({ ok: true, posts, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('[board/list]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
