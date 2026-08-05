// ============================================================
// lib/db/functions/triggers.ts
// PostgreSQL 트리거의 앱 레이어 대체.
//
// D1(SQLite)도 트리거를 지원하지만, 다음 이유로 앱 호출 헬퍼로 변환:
//   1) 트리거 SQL의 plpgsql 구문이 SQLite와 호환되지 않음
//   2) 앱에서 명시적으로 호출하면 디버깅·테스트가 쉬움
//   3) 트리거가 발화되는 경로가 한정적 (write 호출 자체가 적음)
//
// 원본 트리거:
//   - update_chat_room_last_message (AFTER INSERT ON messages)
//   - refresh_chat_room_last_message (AFTER INSERT/UPDATE/DELETE ON messages)
//   - set_row_updated_at / touch_*_updated_at (BEFORE UPDATE on N tables)
//   - sync_inventory_name_stock (inventory.ts에 이미 포트됨)
//
// 트리거 → 헬퍼 매핑은 app/api/messages, app/api/board-posts 등 write
// 라우트에서 INSERT/UPDATE 직후 호출.
// ============================================================

import { sql, eq, desc } from 'drizzle-orm';
import type { D1Client } from '../client-d1';
import { chat_rooms, messages } from '../schema';
import { buildChatRoomPreview } from '@/lib/chat-room-preview';

/**
 * update_chat_room_last_message 트리거 대체.
 *
 * 원본은 AFTER INSERT — 새 메시지 한 건의 created_at과 content로
 * chat_rooms.last_message_at / last_message_preview를 덮어씀.
 *
 * 호출 시점: 메시지 INSERT 직후.
 */
export async function updateChatRoomLastMessage(
  db: D1Client,
  args: {
    room_id: string;
    created_at: string;
    content?: string | null;
    file_name?: string | null;
  },
): Promise<void> {
  const contentText = (args.content && args.content.trim() !== '') ? args.content : null;
  const fileNameText = (args.file_name && args.file_name.trim() !== '') ? args.file_name : null;
  // 8차 D06-015: 미리보기 문구가 여기('(파일)')·refresh 판('(file)')·클라이언트 판('파일')
  // 세 갈래였다. 같은 목록 셀에 보이는 값이라 정본 하나로 모은다.
  const preview = buildChatRoomPreview({ content: contentText, file_name: fileNameText });
  await db
    .update(chat_rooms)
    .set({
      last_message: contentText || fileNameText,
      last_message_at: args.created_at,
      last_message_preview: preview })
    .where(eq(chat_rooms.id, args.room_id))
    .run();
}

/**
 * refresh_chat_room_last_message 트리거 대체.
 *
 * 원본은 messages의 INSERT/UPDATE/DELETE 어떤 변경에도 재계산.
 * 삭제·편집까지 반영하기 위해 chat_rooms를 최신 non-deleted 메시지로
 * 다시 계산해서 덮어씀.
 *
 * 호출 시점: 메시지 DELETE 또는 is_deleted/content 변경 직후.
 */
export async function refreshChatRoomLastMessage(
  db: D1Client,
  roomId: string,
): Promise<void> {
  // 최신 메시지 1건 (삭제 포함) — 최신이 삭제면 목록에 「삭제된 메시지입니다.」
  const rows = await db
    .select({
      created_at: messages.created_at,
      content: messages.content,
      file_name: messages.file_name,
      file_url: messages.file_url,
      is_deleted: messages.is_deleted })
    .from(messages)
    .where(eq(messages.room_id, roomId))
    .orderBy(desc(messages.created_at), desc(messages.id))
    .limit(1);

  const latest = rows[0];
  if (!latest) {
    await db
      .update(chat_rooms)
      .set({
        last_message: null,
        last_message_at: null,
        last_message_preview: null })
      .where(eq(chat_rooms.id, roomId))
      .run();
    return;
  }

  // 8차 D06-015: 미리보기 규칙을 lib/chat-room-preview 정본으로 통합.
  // 여기 있던 판은 파일만 있는 메시지를 '(file)' 이라는 영어 자리표시자로 남겼는데,
  // 같은 컬럼을 나중에 덮어쓰던 클라이언트 사본은 '파일'/'메시지' 로 썼다.
  // 삭제 경로에서 실제 저장값이 클라이언트 규칙이었으므로 그쪽을 정본으로 채택했다.
  const preview = buildChatRoomPreview(latest);

  await db
    .update(chat_rooms)
    .set({
      last_message: preview,
      last_message_at: latest.created_at,
      last_message_preview: preview })
    .where(eq(chat_rooms.id, roomId))
    .run();
}

/**
 * set_row_updated_at / touch_*_updated_at 대체.
 *
 * BEFORE UPDATE 트리거가 NEW.updated_at = NOW()를 강제하던 패턴.
 * D1에서는 UPDATE 호출 시 객체에 이 헬퍼의 결과를 펴넣어 사용.
 *
 * 사용 예:
 *   await db.update(roster_policy_settings)
 *     .set({ ...payload, ...withUpdatedAt() })
 *     .where(eq(roster_policy_settings.id, id));
 */
export function withUpdatedAt(now: Date = new Date()): { updated_at: string } {
  return { updated_at: now.toISOString() };
}

/**
 * raw SQL 안에서 NOW() 대신 쓸 expression.
 *   sql`UPDATE foo SET updated_at = ${nowSqlite()} WHERE ...`
 */
export function nowSqlite() {
  return sql`(CURRENT_TIMESTAMP)`;
}
