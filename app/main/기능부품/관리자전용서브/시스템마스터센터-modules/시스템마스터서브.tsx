'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { formatWon } from '@/lib/date-formatter';
import type { StaffMember } from '@/types';
import { saveBannedWords, loadBannedWords, DEFAULT_BANNED } from '@/lib/banned-words';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
import { SYSTEM_MASTER_ACCOUNT_ID } from '@/lib/system-master';
import AnnualLeaveManualGrant from '../연차수동부여';
import { useActionDialog } from '@/app/components/useActionDialog';

// === CONSTANTS ===


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

export const CHAT_FETCH_LIMIT = '2000';
export const CHAT_ROOM_FETCH_LIMIT = '5000';


// === TYPES ===


export type MasterTabId =
  | '개요'
  | '운영대시보드'
  | '변경이력'
  | '권한변경'
  | '전체채팅'
  | '정합성점검'
  | '복구센터'
  | '연차수동부여';

export type SystemMasterUser = Partial<StaffMember> & Record<string, unknown>;

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

export type SystemMasterChatRoom = {
  id: string;
  room_label?: string | null;
  member_labels?: string[];
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

export type SystemMasterAuditPayload = {
  logs?: SystemMasterAuditLog[];
};

export type SystemMasterPermissionDiffPayload = {
  logs?: SystemMasterPermissionDiffLog[];
};

export type SystemMasterActionId =
  | 'run_backup_full'
  | 'run_chat_push_dispatch'
  | 'run_todo_reminders'
  | 'cleanup_push_subscriptions';


// === UTILS ===
export const formatCurrency = (value: unknown) => formatWon(Number(value || 0));

export function maskResidentNo(value: string, reveal: boolean) {
  if (!value) return '-';
  if (reveal) return value;
  const normalized = value.replace(/\s/g, '');
  if (normalized.length <= 7) return `${normalized.slice(0, 1)}******`;
  return `${normalized.slice(0, 7)}******`;
}

export function maskAccount(value: string, reveal: boolean) {
  if (!value) return '-';
  if (reveal) return value;
  const normalized = value.replace(/\s/g, '');
  if (normalized.length <= 4) return `****${normalized.slice(-2)}`;
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

export function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatDateTime(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

export function formatPushPlatformLabel(platform: unknown) {
  const normalized = String(platform || '').trim();
  if (!normalized || normalized === 'unknown') return '미분류';
  if (normalized === 'ios-webapp') return 'iPhone 설치형';
  if (normalized === 'ios-browser') return 'iPhone 브라우저';
  if (normalized === 'android') return 'Android';
  if (normalized === 'web') return 'Desktop Web';
  return normalized;
}

export async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || '데이터를 불러오지 못했습니다.');
  }
  return payload as T;
}

export function roomHasMessageHistory(room: SystemMasterChatRoom | null | undefined) {
  if (!room) return false;
  const loose = room as Record<string, unknown>;
  if (typeof loose.has_message_history === 'boolean') {
    return loose.has_message_history;
  }
  if (typeof loose.message_count === 'number') {
    return loose.message_count > 0;
  }
  return Boolean(String(loose.last_message_at || loose.last_activity_at || '').trim());
}

export function isEmptyChatRoom(room: SystemMasterChatRoom | null | undefined) {
  return Boolean(room?.id) && !roomHasMessageHistory(room);
}

// === OVERVIEW PANEL ===
type SummaryCard = { id: string; label: string; value: number | undefined };

type OverviewPanelProps = {
  overview: SystemMasterOverviewPayload;
  summaryCards: SummaryCard[];
  showSensitiveRaw: boolean;
  setShowSensitiveRaw: (value: boolean) => void;
  sensitiveStaffColumns: Column<SystemMasterSensitiveStaff>[];
};

export function OverviewPanel({
  overview,
  summaryCards,
  showSensitiveRaw,
  setShowSensitiveRaw,
  sensitiveStaffColumns,
}: OverviewPanelProps) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <article key={card.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-[var(--foreground)]">{Number(card.value || 0).toLocaleString('ko-KR')}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[var(--foreground)]">최근 변경 이력</h3>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {(overview.recentAudits || []).slice(0, 8).map((log) => (
              <div key={log.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[10px] font-bold text-[var(--accent)]">{log.action}</span>
                  <span className="text-xs font-semibold text-[var(--foreground)]">{log.target_label}</span>
                  <span className="text-[11px] text-[var(--toss-gray-3)]">{log.actor_label || '-'}</span>
                  <span className="text-[11px] text-[var(--toss-gray-3)]">{formatDateTime(log.created_at)}</span>
                </div>
                {(log.changed_fields?.length ?? 0) > 0 && (
                  <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">
                    변경 필드: {log.changed_fields?.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h3 className="text-base font-bold text-[var(--foreground)]">최근 급여 반영</h3>
          <div className="mt-4 space-y-3">
            {(overview.recentPayrolls || []).slice(0, 8).map((record) => (
              <div key={record.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">{record.staff_name} #{record.employee_no || '-'}</p>
                    <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{record.year_month} · {record.company || '-'} · {record.department || '-'}</p>
                  </div>
                  <p className="text-sm font-black text-[var(--accent)]">{formatCurrency(record.net_pay)}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">직원 민감정보 현황</h3>
          </div>
          <label className="inline-flex items-center gap-2 text-[11px] font-bold text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={showSensitiveRaw}
              onChange={(event) => setShowSensitiveRaw(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)]"
            />
            민감정보 원문 보기
          </label>
        </div>
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] overflow-x-auto">
          <ResponsiveTable<SystemMasterSensitiveStaff>
            columns={sensitiveStaffColumns}
            rows={overview.sensitiveStaffs || []}
            keyField="id"
            emptyMessage="민감정보 대상 직원이 없습니다."
          />
        </div>
      </section>
    </>
  );
}

// === AUDIT PANEL ===
type AuditPanelProps = {
  auditCategory: string;
  setAuditCategory: (value: string) => void;
  auditKeyword: string;
  setAuditKeyword: (value: string) => void;
  onSearch: () => void;
  auditLogs: SystemMasterAuditLog[];
  loading: boolean;
};

export function AuditPanel({
  auditCategory,
  setAuditCategory,
  auditKeyword,
  setAuditKeyword,
  onSearch,
  auditLogs,
  loading,
}: AuditPanelProps) {
  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
        <select
          value={auditCategory}
          onChange={(event) => setAuditCategory(event.target.value)}
          className="h-11 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)]"
        >
          <option value="all">전체 카테고리</option>
          <option value="staff">직원 / 민감정보</option>
          <option value="payroll">급여 / 정산</option>
          <option value="chat">채팅 / 메시지</option>
          <option value="general">기타</option>
        </select>
        <input
          value={auditKeyword}
          onChange={(event) => setAuditKeyword(event.target.value)}
          placeholder="직원명, 액션, 변경 필드로 검색"
          className="h-11 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={onSearch}
          className="h-11 rounded-[var(--radius-lg)] bg-[var(--accent)] px-5 text-sm font-bold text-white"
        >
          조회
        </button>
      </div>

      <div className="mt-5 space-y-4">
        {auditLogs.length === 0 && !loading && (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
            조회된 변경 이력이 없습니다.
          </div>
        )}

        {auditLogs.map((log) => (
          <article key={log.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[10px] font-bold text-[var(--accent)]">{log.action}</span>
                  <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">{log.category}</span>
                </div>
                <h4 className="mt-3 text-sm font-bold text-[var(--foreground)]">{log.target_label}</h4>
                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                  실행자 {log.actor_label || '-'} · {formatDateTime(log.created_at)}
                </p>
                {(log.changed_fields?.length ?? 0) > 0 && (
                  <p className="mt-2 text-[11px] font-semibold text-[var(--foreground)]">
                    변경 필드: {log.changed_fields?.join(', ')}
                  </p>
                )}
              </div>
              <div className="max-w-full lg:max-w-[420px]">
                <details className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                  <summary className="cursor-pointer text-[11px] font-bold text-[var(--foreground)]">세부 내역 보기</summary>
                  <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap break-all text-[11px] text-[var(--toss-gray-4)]">
                    {prettyJson(log.details)}
                  </pre>
                </details>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// === PERMISSION AUDIT PANEL ===
type PermissionAuditPanelProps = {
  auditKeyword: string;
  setAuditKeyword: (value: string) => void;
  onSearch: () => void;
  permissionDiffLogs: SystemMasterPermissionDiffLog[];
  loading: boolean;
};

export function PermissionAuditPanel({
  auditKeyword,
  setAuditKeyword,
  onSearch,
  permissionDiffLogs,
  loading,
}: PermissionAuditPanelProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={auditKeyword}
            onChange={(event) => setAuditKeyword(event.target.value)}
            placeholder="직원명, 역할, 권한 키로 검색"
            className="h-11 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={onSearch}
            className="h-11 rounded-[var(--radius-lg)] bg-[var(--accent)] px-5 text-sm font-bold text-white"
          >
            조회
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {permissionDiffLogs.length === 0 && !loading && (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
            조회된 권한 변경 이력이 없습니다.
          </div>
        )}

        {permissionDiffLogs.map((log) => (
          <article key={log.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[10px] font-bold text-[var(--accent)]">{log.target_label}</span>
                  <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">{log.actor_label || '-'}</span>
                </div>
                <p className="mt-3 text-[11px] text-[var(--toss-gray-3)]">{formatDateTime(log.created_at)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(log.permission_summary?.enabled || []).map((key: string) => (
                    <span key={`on-${key}`} className="rounded-full bg-success/20 px-2.5 py-1 text-[10px] font-bold text-success">+ {key}</span>
                  ))}
                  {(log.permission_summary?.disabled || []).map((key: string) => (
                    <span key={`off-${key}`} className="rounded-full bg-danger/20 px-2.5 py-1 text-[10px] font-bold text-danger">- {key}</span>
                  ))}
                </div>
                {(log.permission_summary?.beforeRole || log.permission_summary?.afterRole) && (
                  <p className="mt-3 text-[11px] text-[var(--toss-gray-3)]">
                    역할: {log.permission_summary?.beforeRole || '-'} → {log.permission_summary?.afterRole || '-'}
                  </p>
                )}
              </div>
              <details className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3 xl:max-w-[460px]">
                <summary className="cursor-pointer text-[11px] font-bold text-[var(--foreground)]">세부 diff 보기</summary>
                <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap break-all text-[11px] text-[var(--toss-gray-4)]">{prettyJson(log.details)}</pre>
              </details>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// === INTEGRITY PANEL ===
type IntegrityPanelProps = {
  integrityReport: SystemMasterIntegrityPayload | null;
  onReload: () => void;
};

export function IntegrityPanel({ integrityReport, onReload }: IntegrityPanelProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">DB 정합성 점검 도구</h3>
            <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
              마지막 점검 시각: {formatDateTime(integrityReport?.checkedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onReload}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            다시 점검
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {(integrityReport?.issues || []).map((issue) => (
          <article
            key={issue.id}
            className={`rounded-[var(--radius-xl)] border p-5 shadow-sm ${
              issue.severity === 'critical'
                ? 'border-red-500/20 bg-red-500/10'
                : issue.severity === 'warning'
                  ? 'border-warning/20 bg-warning/10'
                  : 'border-[var(--border)] bg-[var(--card)]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-[var(--foreground)]">{issue.title}</h4>
                <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{issue.description}</p>
              </div>
              <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
                {Number(issue.count || 0).toLocaleString('ko-KR')}건
              </span>
            </div>
            {Array.isArray(issue.samples) && issue.samples.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {issue.samples.map((sample: string, index: number) => (
                  <span key={`${issue.id}-${index}`} className="rounded-full bg-[var(--page-bg)] px-2.5 py-1 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                    {sample}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

// === RECOVERY PANEL ===
type RecoveryPanelProps = {
  opsActionLoading: string;
  runOpsAction: (action: SystemMasterActionId) => void;
};

export function RecoveryPanel({ opsActionLoading, runOpsAction }: RecoveryPanelProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h3 className="text-base font-bold text-[var(--foreground)]">운영자용 문제 복구 센터</h3>
        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
          실패 작업 복구, 푸시 구독 정리, 수동 전체 백업을 운영자가 직접 실행할 수 있습니다.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {[
          {
            id: 'run_backup_full',
            title: '정기 전체 백업 수동 실행',
            description: '즉시 전체 백업을 만들어 최근 백업 목록을 갱신합니다.',
            button: '전체 백업 실행',
          },
          {
            id: 'run_chat_push_dispatch',
            title: '채팅 푸시 큐 재처리',
            description: '대기 중인 채팅 푸시 작업을 바로 다시 처리합니다.',
            button: '푸시 큐 재처리',
          },
          {
            id: 'run_todo_reminders',
            title: '할일 리마인더 수동 실행',
            description: '지금 시점까지 도달한 할일 리마인더를 즉시 발송합니다.',
            button: '리마인더 실행',
          },
          {
            id: 'cleanup_push_subscriptions',
            title: '푸시 구독 정리',
            description: 'null staff, orphan, 중복 endpoint 구독을 정리합니다.',
            button: '푸시 구독 정리',
          },
        ].map((action) => (
          <article key={action.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h4 className="text-sm font-bold text-[var(--foreground)]">{action.title}</h4>
            <p className="mt-2 text-[11px] leading-5 text-[var(--toss-gray-3)]">{action.description}</p>
            <button
              type="button"
              onClick={() => runOpsAction(action.id as SystemMasterActionId)}
              disabled={opsActionLoading === action.id}
              className="mt-4 h-10 rounded-[var(--radius-lg)] bg-[var(--foreground)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {opsActionLoading === action.id ? '실행 중...' : action.button}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

type AnnualLeavePanelProps = {
  systemMasterUser: SystemMasterUser | null;
  staffs: StaffMember[];
  onRefresh?: () => void;
};

export function AnnualLeavePanel({ systemMasterUser, staffs, onRefresh }: AnnualLeavePanelProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h3 className="text-base font-bold text-[var(--foreground)]">연차 수동 부여</h3>
        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[11px]">{SYSTEM_MASTER_ACCOUNT_ID}</code>
          {' '}시스템마스터 계정 전용 기능입니다. 자동 부여 규칙과 별개로 직원별 연차 총량과 사용량을 직접 조정합니다.
        </p>
      </div>
      <AnnualLeaveManualGrant user={systemMasterUser} staffs={staffs} onRefresh={onRefresh} />
    </section>
  );
}

// === BANNED WORD MODAL ===






export function BannedWordModal({ onClose }: { onClose: () => void }) {
  const { dialog, openConfirm } = useActionDialog();
  const [words, setWords] = useState<string[]>(loadBannedWords);
  const [input, setInput] = useState('');

  const add = () => {
    const w = input.trim();
    if (!w) return;
    if (words.includes(w)) { toast('이미 등록된 단어입니다.', 'warning'); return; }
    const next = [...words, w];
    setWords(next);
    saveBannedWords(next);
    setInput('');
    toast(`"${w}" 등록 완료`, 'success');
  };

  const remove = (w: string) => {
    const next = words.filter((x) => x !== w);
    setWords(next);
    saveBannedWords(next);
  };

  const reset = async () => {
    const confirmed = await openConfirm({
      title: '금지어 기본값 초기화',
      description: '현재 금지어 목록을 기본 금지어 목록으로 되돌립니다.',
      confirmText: '초기화',
      tone: 'danger',
    });
    if (!confirmed) return;
    setWords(DEFAULT_BANNED);
    saveBannedWords(DEFAULT_BANNED);
    toast('초기화 완료', 'success');
  };

  return (
    <>
      {dialog}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="banned-word-modal-title"
          className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm w-full max-w-md p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 id="banned-word-modal-title" className="text-sm font-bold text-[var(--foreground)]">단어 필터</h3>
            <button type="button" onClick={onClose} aria-label="닫기" className="text-[var(--toss-gray-3)] hover:text-[var(--foreground)] text-lg">×</button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <label htmlFor="banned-word-input" className="sr-only">금지어 입력</label>
            <input
              id="banned-word-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="금지어 입력 후 Enter"
              className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--page-bg)] text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
            <button type="button" onClick={add} className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)]">추가</button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto mb-4 p-2 bg-[var(--page-bg)] rounded-[var(--radius-md)] border border-[var(--border)]">
            {words.length === 0 && <p className="text-xs text-[var(--toss-gray-3)]">등록된 금지어 없음</p>}
            {words.map((w) => (
              <span key={w} className="inline-flex items-center gap-1 px-2 py-0.5 bg-danger/20 text-danger text-xs font-semibold rounded-full">
                {w}
                <button type="button" onClick={() => remove(w)} aria-label={`${w} 삭제`} className="hover:opacity-70 font-bold">×</button>
              </span>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-end">
            <button
              type="button"
              onClick={reset}
              className="px-3 py-1.5 text-xs text-[var(--toss-gray-3)] border border-[var(--border)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]"
            >
              기본값으로 초기화
            </button>
            <button type="button" onClick={onClose} className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)]">확인</button>
          </div>
        </div>
      </div>
    </>
  );
}

