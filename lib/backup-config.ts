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
      'annual_leave_promotions',
      'approval_form_types',
      'approval_templates',
    ],
  },
  {
    id: 'approval',
    label: '전자결재',
    description: '기안, 이력, 증명서 발급, 문서 보관',
    tables: [
      'approvals',
      'approval_history',
      'certificate_issuances',
      'document_repository',
    ],
  },
  {
    id: 'attendance',
    label: '근태/급여',
    description: '출퇴근, 연차, 근태 보정, 급여 기록',
    tables: [
      'attendance',
      'attendances',
      'attendance_corrections',
      'attendance_deduction_rules',
      'leave_requests',
      'payroll_records',
      'payroll_locks',
    ],
  },
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
    ],
  },
  {
    id: 'board',
    label: '게시판/위키',
    description: '게시글, 댓글, 좋아요, 사내위키 문서',
    tables: [
      'board_posts',
      'board_post_comments',
      'board_post_likes',
      'posts',
      'wiki_folders',
      'wiki_documents',
      'wiki_document_versions',
    ],
  },
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
    ],
  },
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
    ],
  },
];

export const FULL_BACKUP_TABLES = Array.from(
  new Set(BACKUP_GROUPS.flatMap((group) => group.tables))
);

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
