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

/**
 * tail 필터(`table:col=eq.val`)에 쓸 수 있는 컬럼 화이트리스트.
 *
 * 예전에는 `/^[a-zA-Z0-9_]+$/` 만 통과하면 **어떤 컬럼이든** 등가 비교를 허용했다.
 * SQL 인젝션은 막혔지만 그게 문제가 아니었다 — 조회 결과가 있으면 타임스탬프,
 * 없으면 null 이 오므로 **임의 컬럼의 값 존재 여부를 캐낼 수 있는 오라클**이 된다.
 * 예: `?tables=staff_members:password=eq.<추정해시>` 로 비밀번호 해시를,
 * `staff_members:resident_no=eq.<주민번호>` 로 주민번호 존재를 확인할 수 있었다.
 * /api/d1/query 는 민감 컬럼을 차단하는데 이 경로만 열려 있었다.
 *
 * 여기 담는 것은 "행을 방·사람·회사 단위로 좁히는 식별자"뿐이다. 이 값들은
 * 이미 알고 있어야 질의할 수 있고, 존재 여부가 드러나도 새로 새는 정보가 없다.
 * 실제 프로덕션 코드가 쓰는 필터는 room_id 와 user_id 두 가지다.
 */
export const REALTIME_ALLOWED_FILTER_COLUMNS: ReadonlySet<string> = new Set([
  'room_id',
  'user_id',
  'staff_id',
  'company_id',
  'id',
]);

export function isRealtimeAllowedFilterColumn(column: string): boolean {
  return REALTIME_ALLOWED_FILTER_COLUMNS.has(column);
}

export function isRealtimeAllowedTable(tableName: string): boolean {
  return REALTIME_ALLOWED_TABLE_SET.has(tableName);
}

export function getRealtimeTimestampColumn(tableName: string): string {
  return REALTIME_TABLE_TIMESTAMP_COLUMN[tableName] ?? 'created_at';
}
