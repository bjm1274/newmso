// ============================================================
// lib/db/functions/counters.ts
// 카운터/증분 RPC의 TypeScript 포트.
//
// 원본:
//   - increment_annual_leave_used(staff_id, days)
//   - increment_post_views(post_id)
//   - cleanup_chat_messages_by_retention()   (정책별 보관기간 만료 메시지 삭제)
//
// 모두 단일 UPDATE/DELETE이므로 SQLite의 statement-level 원자성으로 충분.
// ============================================================

import { sql, eq } from 'drizzle-orm';
import type { D1Client } from '../client-d1';
import { staff_members, board_posts } from '../schema';

/**
 * increment_annual_leave_used TS 포트.
 * UPDATE staff_members SET annual_leave_used = COALESCE(annual_leave_used, 0) + days
 */
export async function incrementAnnualLeaveUsed(
  db: D1Client,
  staffId: string,
  days: number,
): Promise<void> {
  await db
    .update(staff_members)
    .set({ annual_leave_used: sql`COALESCE(annual_leave_used, 0) + ${days}` })
    .where(eq(staff_members.id, staffId));
}

/**
 * increment_post_views TS 포트.
 * UPDATE board_posts SET views = COALESCE(views, 0) + 1
 */
export async function incrementPostViews(
  db: D1Client,
  postId: string,
): Promise<void> {
  await db
    .update(board_posts)
    .set({ views: sql`COALESCE(views, 0) + 1` })
    .where(eq(board_posts.id, postId));
}

/**
 * cleanup_chat_messages_by_retention TS 포트.
 *
 * 보관 정책 (원본 SQL 그대로):
 *   - 텍스트 (file_url 없음)           : 5년 경과 시 삭제
 *   - 이미지 / 10MB 이하 일반 파일     : 1년 경과 시 삭제
 *   - 동영상 / 10MB 초과 파일          : 3개월 경과 시 삭제
 *
 * 반환값: 삭제된 row 수
 *
 * 이 작업은 cron에서 호출 (Workers Scheduled Worker).
 */
export async function cleanupChatMessagesByRetention(
  db: D1Client,
): Promise<number> {
  // 컷오프를 ISO 문자열로 계산 — messages.created_at은 text 컬럼
  const now = Date.now();
  const cutoff5y = new Date(now - 5 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff1y = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff3m = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

  const result = await db.run(sql`
    DELETE FROM messages
    WHERE id IN (
      SELECT id FROM messages
      WHERE (file_url IS NULL OR file_url = '')
        AND created_at < ${cutoff5y}
      UNION
      SELECT id FROM messages
      WHERE file_url IS NOT NULL AND file_url <> ''
        AND (
          file_kind = 'image'
          OR (file_kind = 'file' AND COALESCE(file_size_bytes, 0) <= 10485760)
        )
        AND created_at < ${cutoff1y}
      UNION
      SELECT id FROM messages
      WHERE file_url IS NOT NULL AND file_url <> ''
        AND (file_kind = 'video' OR COALESCE(file_size_bytes, 0) > 10485760)
        AND created_at < ${cutoff3m}
    )
  `);

  // D1 result.meta.changes 또는 result.changes 형태로 affected row 수가 들어옴
  const meta = (result as { meta?: { changes?: number }; changes?: number });
  return meta.meta?.changes ?? meta.changes ?? 0;
}
