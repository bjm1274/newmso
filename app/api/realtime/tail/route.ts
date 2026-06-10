// ============================================================
// app/api/realtime/tail/route.ts
// 클라이언트 polling용 "변경 신호" endpoint.
//
// 동작:
//   1) 쿼리: ?tables=table1,table2,...
//   2) 각 테이블의 max(created_at)을 D1(dual-write 적용분) 또는 Supabase
//      (그 외)에서 조회해 응답
//   3) 클라이언트가 직전 호출 결과와 비교해 변경 감지 시 callback 호출
//
// 권한: 로그인 사용자만
// 한도: 한 요청에 최대 10개 테이블
//
// Phase 5-A — Supabase Realtime 채널을 polling으로 대체하는 인프라.
// Phase 6   — d1 모드: D1 drizzle로 테이블별 max(created_at) 조회
// ============================================================
import { NextResponse } from 'next/server';
import { readSessionFromRequest, type SessionUser } from '@/lib/server-session';
import { getD1Binding } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_TABLES_PER_REQUEST = 10;

// 허용 테이블 — 임의 테이블 노출 방지 (whitelist).
// 실제 polling으로 사용되는 테이블만 명시.
const ALLOWED_TABLES = new Set<string>([
  'messages',
  'chat_rooms',
  // 채팅 활성 방 폴링용 — 읽음 표시·반응·북마크·핀·투표 갱신
  'room_read_cursors',
  'message_reactions',
  'message_bookmarks',
  'pinned_messages',
  'polls',
  'poll_votes',
  'notifications',
  'board_posts',
  'board_post_comments',
  'board_post_reads',
  'approvals',
  'attendance',
  'attendances',
  'leave_requests',
  'todos',
  'todo_reminder_logs',
  'staff_members',
  'op_patient_checks',
  'op_check_templates',
  'inventory',
  'inventory_logs',
  'staff_evaluations',
  'corporate_card_transactions',
  'company_holidays',
  'document_repository',
  'handover_notes',
  'payroll_records',
  'audit_logs',
  'work_shifts',
  'shift_assignments',
  'staff_shift_assignments',
  'backup_restore_runs',
]);

// 변경 감지에 사용할 timestamp 컬럼명 — 대부분 created_at, 일부 예외.
// 예: room_read_cursors는 INSERT가 아닌 UPSERT(읽음 위치 갱신)라 last_read_at 사용.
const TABLE_TIMESTAMP_COLUMN: Record<string, string> = {
  room_read_cursors: 'last_read_at',
  pinned_messages: 'pinned_at',
  chat_rooms: 'last_message_at',
};


function userId(user: SessionUser | null | undefined): string | null {
  if (!user) return null;
  const candidate = (user.id ?? user.user_id ?? '') as string;
  const trimmed = String(candidate).trim();
  return trimmed || null;
}

// D1에서 테이블의 최신 변경 timestamp 조회 — allowedTables whitelist 내에서만 호출됨.
// 컬럼명은 TABLE_TIMESTAMP_COLUMN 매핑에서 우선 결정, 없으면 created_at.
async function fetchMaxCreatedAtD1(
  d1: NonNullable<Awaited<ReturnType<typeof getD1Binding>>>,
  tableName: string,
): Promise<string | null> {
  const column = TABLE_TIMESTAMP_COLUMN[tableName] ?? 'created_at';
  try {
    const result = await d1
      .prepare(`SELECT "${column}" AS ts FROM "${tableName}" ORDER BY "${column}" DESC LIMIT 1`)
      .first<{ ts: string | null }>();
    return result?.ts ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!userId(session?.user)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const tablesParam = url.searchParams.get('tables') ?? '';
    const requested = tablesParam
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, MAX_TABLES_PER_REQUEST);

    const tables = requested.filter((t) => ALLOWED_TABLES.has(t));
    if (tables.length === 0) {
      return NextResponse.json({ ok: true, tail: {} });
    }

    const tail: Record<string, string | null> = {};

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[realtime/tail] D1 binding not available');
    await Promise.all(
      tables.map(async (t) => {
        tail[t] = await fetchMaxCreatedAtD1(d1, t);
      }),
    );

    return NextResponse.json({ ok: true, tail });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
