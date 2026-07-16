/**
 * Realtime stream/tail 허용 테이블·타임스탬프 컬럼 SSOT.
 * stream·tail 양쪽이 동일 목록을 쓰도록 한곳에서만 관리한다.
 */

/** 클라이언트 polling/SSE 로 노출 가능한 테이블 whitelist */
export const REALTIME_ALLOWED_TABLES = [
  'messages',
  'chat_rooms',
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
] as const;

export type RealtimeAllowedTable = (typeof REALTIME_ALLOWED_TABLES)[number];

export const REALTIME_ALLOWED_TABLE_SET: ReadonlySet<string> = new Set(REALTIME_ALLOWED_TABLES);

/**
 * 변경 감지용 timestamp 컬럼 — 대부분 created_at, 일부 UPSERT 테이블은 예외.
 */
export const REALTIME_TABLE_TIMESTAMP_COLUMN: Readonly<Record<string, string>> = {
  room_read_cursors: 'last_read_at',
  pinned_messages: 'pinned_at',
  chat_rooms: 'last_message_at',
};

export function isRealtimeAllowedTable(tableName: string): boolean {
  return REALTIME_ALLOWED_TABLE_SET.has(tableName);
}

export function getRealtimeTimestampColumn(tableName: string): string {
  return REALTIME_TABLE_TIMESTAMP_COLUMN[tableName] ?? 'created_at';
}
