export type BackupGroupDefinition = {
  id: string;
  label: string;
  description: string;
  tables: string[];
};

export const SIX_HOUR_BACKUP_TABLES = [
  'staff_members',
  'payroll_records',
  'leave_requests',
  'attendances',
  'approvals',
  'audit_logs',
] as const;

export const BACKUP_GROUPS: BackupGroupDefinition[] = [
  {
    id: 'core',
    label: '직원/회사',
    description: '직원, 회사, 조직, 권한 기반 데이터',
    tables: [
      'companies',
      'staff_members',
      'staff_transfer_history',
      'employment_contracts',
      'work_shifts',
      'shift_assignments',
      'annual_leave_promotion_logs',
      'approval_form_types',
      'approval_templates',
    ] },
  {
    id: 'approval',
    label: '전자결재',
    description: '기안, 이력, 증명서 발급, 문서 보관',
    tables: [
      'approvals',
      'approval_history',
      'certificate_issuances',
      'document_repository',
    ] },
  {
    id: 'attendance',
    label: '근태/급여',
    description: '출퇴근, 연차, 근태 보정, 급여 기록',
    tables: [
      'attendance',
      'attendances',
      'attendance_corrections',
      'attendance_deduction_rules',
      'company_holidays',
      'leave_requests',
      'payroll_records',
      'payroll_locks',
    ] },
  {
    id: 'chat',
    label: '채팅/알림',
    description: '대화방, 메시지, 읽음/리액션, 알림/푸시',
    tables: [
      'chat_rooms',
      'messages',
      'message_reads',
      'message_reactions',
      'room_read_cursors',
      'room_notification_settings',
      'polls',
      'poll_votes',
      'pinned_messages',
      'notifications',
      'push_subscriptions',
      'chat_push_jobs',
    ] },
  {
    id: 'board',
    label: '게시판/업무가이드',
    description: '게시글, 댓글, 좋아요, 업무가이드 및 레거시 위키 문서',
    tables: [
      'board_posts',
      'board_post_comments',
      'board_post_likes',
      'posts',
      'wiki_folders',
      'wiki_documents',
      'wiki_document_versions',
    ] },
  {
    id: 'inventory',
    label: '재고/구매',
    description: '재고, 거래처, 발주, 법인카드',
    tables: [
      'inventory',
      'inventory_logs',
      'suppliers',
      'purchase_orders',
      'corporate_cards',
      'corporate_card_transactions',
    ] },
  {
    id: 'work',
    label: '업무/운영',
    description: '할일, 팝업, 감사 로그, 운영 보조 데이터',
    tables: [
      'todos',
      'todo_reminder_logs',
      'backup_restore_runs',
      'tasks',
      'popups',
      'audit_logs',
    ] },
];

/**
 * BACKUP_GROUPS 는 관리자 화면의 그룹 선택 UI 용 목록이다.
 *
 * ⚠ 전체 백업 대상을 이 목록으로 정하면 안 된다.
 *   손으로 관리하는 목록이라 새 테이블이 생겨도 아무도 추가하지 않고,
 *   실제로 스키마 162개 중 52개만 백업되고 있었다 —
 *   연차 원장(leave_ledger)·급여 원본(payroll)·인사발령(personnel_appointments)·
 *   재무 분개장(journal_entries) 등 110개가 어떤 백업에도 없었다.
 *   전체 백업은 lib/backup-cron.ts 에서 DB 의 실제 테이블 목록을 조회해 결정한다.
 */
export const BACKUP_GROUP_TABLES = Array.from(
  new Set(BACKUP_GROUPS.flatMap((group) => group.tables))
);

/**
 * 전체 백업에서 제외할 테이블.
 * 재생성 가능하거나(레이트리밋 카운터), 순간 상태라 복원 의미가 없는 것만 담는다.
 * **여기에 없으면 자동으로 백업 대상이다** — 새 테이블이 조용히 빠지지 않도록 하기 위함.
 */
export const BACKUP_EXCLUDED_TABLES = new Set<string>([
  'rate_limit_attempts',   // 로그인 실패 카운터 — 15분 창이라 복원 의미 없음
  'chat_typing_status',    // 입력중 표시 — 순간 상태
  'd1_migrations',         // wrangler 가 관리
  '_cf_METADATA',          // Cloudflare 내부
]);

/** @deprecated 전체 백업 대상이 아니다. 그룹 UI 목록이 필요하면 BACKUP_GROUP_TABLES 를 쓴다. */
export const FULL_BACKUP_TABLES = BACKUP_GROUP_TABLES;

export const BACKUP_RESTORE_ORDER = Array.from(
  new Set([
    'companies',
    'staff_members',
    'work_shifts',
    'chat_rooms',
    'board_posts',
    'wiki_documents',
    'wiki_document_versions',
    'inventory',
    'todos',
    'todo_reminder_logs',
    'backup_restore_runs',
    ...FULL_BACKUP_TABLES,
  ])
);

export function resolveBackupTables(groupIds?: Iterable<string>) {
  const selectedGroupIds = new Set(groupIds || BACKUP_GROUPS.map((group) => group.id));
  return Array.from(
    new Set(
      BACKUP_GROUPS.filter((group) => selectedGroupIds.has(group.id)).flatMap((group) => group.tables)
    )
  );
}
