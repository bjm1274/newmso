import type { StaffMember } from '@/types';

// ─── 탭 타입 ───
export type MasterTabId =
  | '개요'
  | '운영대시보드'
  | '변경이력'
  | '권한변경'
  | '전체채팅'
  | '정합성점검'
  | '복구센터'
  | '연차수동부여';

export const MASTER_TABS: MasterTabId[] = [
  '개요',
  '운영대시보드',
  '변경이력',
  '권한변경',
  '전체채팅',
  '정합성점검',
  '복구센터',
  '연차수동부여',
];

// ─── 공통 사용자 타입 ───
export type SystemMasterUser = Partial<StaffMember> & Record<string, unknown>;

// ─── 개요 탭 타입 ───
export type SystemMasterSummary = {
  staffCount?: number;
  auditCount?: number;
  payrollCount?: number;
  roomCount?: number;
  messageCount?: number;
};

export type SystemMasterAuditLog = {
  id: string;
  action?: string | null;
  category?: string | null;
  target_label?: string | null;
  actor_label?: string | null;
  created_at?: string | null;
  changed_fields?: string[];
  details?: unknown;
};

export type SystemMasterPermissionSummary = {
  enabled?: string[];
  disabled?: string[];
  beforeRole?: string | null;
  afterRole?: string | null;
};

export type SystemMasterPermissionDiffLog = SystemMasterAuditLog & {
  permission_summary?: SystemMasterPermissionSummary | null;
};

export type SystemMasterPayrollRecord = {
  id: string;
  staff_name?: string | null;
  employee_no?: string | null;
  year_month?: string | null;
  company?: string | null;
  department?: string | null;
  net_pay?: number | null;
};

export type SystemMasterSensitiveStaff = {
  id: string;
  name?: string | null;
  employee_no?: string | null;
  company?: string | null;
  department?: string | null;
  resident_no?: string | null;
  phone?: string | null;
  email?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  base_salary?: number | null;
};

export type SystemMasterOverviewPayload = {
  summary?: SystemMasterSummary;
  recentAudits?: SystemMasterAuditLog[];
  recentPayrolls?: SystemMasterPayrollRecord[];
  sensitiveStaffs?: SystemMasterSensitiveStaff[];
};

// ─── 운영대시보드 탭 타입 ───
export type SystemMasterFailureItem = {
  id: string;
  severity?: 'info' | 'warning' | 'critical' | string | null;
  label?: string | null;
  count?: number | null;
  detail?: string | null;
};

export type SystemMasterPlatformSummary = {
  platform?: string | null;
  count?: number | null;
};

export type SystemMasterPushFailureSummary = {
  error?: string | null;
  count?: number | null;
};

export type SystemMasterRecentSubscription = {
  id: string;
  platform?: string | null;
  has_fcm?: boolean | null;
  created_at?: string | null;
};

export type SystemMasterCronJob = {
  path: string;
  schedule?: string | null;
  label?: string | null;
};

export type SystemMasterBackup = {
  name: string;
  created_at?: string | null;
};

export type SystemMasterRestoreRun = {
  id: string;
  file_name?: string | null;
  status?: string | null;
  started_at?: string | null;
};

export type SystemMasterWikiVersion = {
  id: string;
  title?: string | null;
  version_no?: number | null;
  created_at?: string | null;
};

export type SystemMasterUsageSummary = {
  id: string;
  label?: string | null;
  count?: number | null;
  topAction?: string | null;
  latestAt?: string | null;
};

export type SystemMasterOperationsPayload = {
  checkedAt?: string | null;
  queue?: {
    pending?: number | null;
    deadLettered?: number | null;
    ready?: number | null;
    retrying?: number | null;
    inFlight?: number | null;
    migrationReady?: boolean | null;
  };
  subscriptions?: {
    total?: number | null;
    nullStaff?: number | null;
    orphan?: number | null;
    duplicateEndpointGroups?: number | null;
    duplicateRows?: number | null;
    fcmEnabled?: number | null;
    webPushOnly?: number | null;
    placeholderEndpoints?: number | null;
    platformSummary?: SystemMasterPlatformSummary[];
    recentSubscriptions?: SystemMasterRecentSubscription[];
  };
  pushFailures?: {
    total?: number | null;
    summary?: SystemMasterPushFailureSummary[];
  };
  recentBackups?: SystemMasterBackup[];
  restoreRuns?: SystemMasterRestoreRun[];
  cronJobs?: SystemMasterCronJob[];
  todoAutomation?: {
    dueReminders?: number | null;
    repeatingOpenTodos?: number | null;
    reminderLogs24h?: number | null;
  };
  wiki?: {
    documents?: number | null;
    versions?: number | null;
    recentVersions?: SystemMasterWikiVersion[];
  };
  failureItems?: SystemMasterFailureItem[];
  usageSummary?: SystemMasterUsageSummary[];
};

// ─── 전체채팅 탭 타입 ───
export type SystemMasterChatRoom = {
  id: string;
  room_label?: string | null;
  member_labels?: string[];
  created_at?: string | null;
  last_message_at?: string | null;
  last_activity_at?: string | null;
  has_message_history?: boolean | null;
  message_count?: number | null;
};

export type SystemMasterChatMessage = {
  id: string;
  room_id?: string | null;
  room_label?: string | null;
  sender_name?: string | null;
  sender_company?: string | null;
  content?: string | null;
  file_url?: string | null;
  created_at?: string | null;
  edited_at?: string | null;
  is_deleted?: boolean | null;
};

export type SystemMasterChatsPayload = {
  rooms?: SystemMasterChatRoom[];
  messages?: SystemMasterChatMessage[];
};

// ─── 정합성점검 탭 타입 ───
export type SystemMasterIntegrityIssue = {
  id: string;
  severity?: 'info' | 'warning' | 'critical' | string | null;
  title?: string | null;
  description?: string | null;
  count?: number | null;
  samples?: string[];
};

export type SystemMasterIntegrityPayload = {
  checkedAt?: string | null;
  issues?: SystemMasterIntegrityIssue[];
};

// ─── 변경이력 탭 타입 ───
export type SystemMasterAuditPayload = {
  logs?: SystemMasterAuditLog[];
};

export type SystemMasterPermissionDiffPayload = {
  logs?: SystemMasterPermissionDiffLog[];
};

// ─── 복구센터 탭 타입 ───
export type SystemMasterActionId =
  | 'run_backup_full'
  | 'run_chat_push_dispatch'
  | 'run_todo_reminders'
  | 'cleanup_push_subscriptions';
