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
  // 컷오프는 **공백형 UTC**("YYYY-MM-DD HH:MM:SS")로 계산한다.
  //
  // messages.created_at 은 text 컬럼이고 운영에 두 형식이 섞여 있다
  // (2026-08-27 실측: 공백형 13,063 / T형 10,975). 예전에는 컷오프만
  // toISOString() = T형으로 만들어 TEXT 로 비교했는데, 사전순에서
  // ' '(0x20) < 'T'(0x54) 이므로 **같은 날짜의 공백형 메시지가 항상 컷오프보다
  // 작게** 판정됐다. 즉 컷오프 당일치가 하루 일찍 지워졌다 — DELETE 라
  // 되돌릴 수 없다(9차 TZ-05).
  //
  // 공백형으로 맞추면 지배적인 공백형과는 정확히 비교되고, T형 행은
  // 사전순에서 항상 공백형 컷오프보다 크게 나와 **덜 지우는 쪽**으로 기운다.
  // 보존 정책에서 덜 지우는 오차는 안전한 방향이다.
  const now = Date.now();
  const toUtcSql = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const cutoff5y = toUtcSql(now - 5 * 365 * 24 * 60 * 60 * 1000);
  const cutoff1y = toUtcSql(now - 365 * 24 * 60 * 60 * 1000);
  const cutoff3m = toUtcSql(now - 90 * 24 * 60 * 60 * 1000);

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
