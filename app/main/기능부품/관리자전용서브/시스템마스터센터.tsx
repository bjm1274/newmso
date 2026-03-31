'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AnnualLeaveManualGrant from './연차수동부여';
import { SYSTEM_MASTER_ACCOUNT_ID, hasSystemMasterPermission } from '@/lib/system-master';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';

// ── 금지어 관리 ────────────────────────────────────────────────────────
const BANNED_WORDS_KEY = 'erp-banned-words';
const DEFAULT_BANNED = ['씨발', '개새끼', '병신', '지랄', '미친놈', '꺼져', '죽어', '쓰레기', '찐따', 'ㅅㅂ', 'ㅂㅅ', 'ㅈㄹ'];

function loadBannedWords(): string[] {
  if (typeof window === 'undefined') return DEFAULT_BANNED;
  try { const r = localStorage.getItem(BANNED_WORDS_KEY); return r ? JSON.parse(r) : DEFAULT_BANNED; } catch { return DEFAULT_BANNED; }
}
function saveBannedWords(words: string[]) { localStorage.setItem(BANNED_WORDS_KEY, JSON.stringify(words)); }
function hasBanned(content: string, banned: string[]) { const l = content.toLowerCase(); return banned.some((w) => l.includes(w.toLowerCase())); }
function highlightBanned(content: string, banned: string[]): React.ReactNode[] {
  if (!banned.length) return [content];
  const pattern = banned.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  return content.split(regex).map((part, i) =>
    banned.some((w) => part.toLowerCase() === w.toLowerCase())
      ? <mark key={i} className="bg-red-400 text-white rounded px-0.5">{part}</mark>
      : part
  );
}

function BannedWordModal({ onClose }: { onClose: () => void }) {
  const [words, setWords] = useState<string[]>(loadBannedWords);
  const [input, setInput] = useState('');
  const add = () => {
    const w = input.trim(); if (!w) return;
    if (words.includes(w)) { toast('이미 등록된 단어입니다.', 'warning'); return; }
    const next = [...words, w]; setWords(next); saveBannedWords(next); setInput(''); toast(`"${w}" 등록 완료`, 'success');
  };
  const remove = (w: string) => { const next = words.filter((x) => x !== w); setWords(next); saveBannedWords(next); };
  const reset = () => { if (!confirm('기본 금지어로 초기화하시겠습니까?')) return; setWords(DEFAULT_BANNED); saveBannedWords(DEFAULT_BANNED); toast('초기화 완료', 'success'); };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--foreground)]">🔍 단어 필터</h3>
          <button onClick={onClose} className="text-[var(--toss-gray-3)] hover:text-[var(--foreground)] text-lg">×</button>
        </div>
        <div className="flex gap-2 mb-3">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="금지어 입력 후 Enter" className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--page-bg)] text-[var(--foreground)] outline-none focus:border-[var(--accent)]" />
          <button onClick={add} className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)]">추가</button>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto mb-4 p-2 bg-[var(--page-bg)] rounded-[var(--radius-md)] border border-[var(--border)]">
          {words.length === 0 && <p className="text-xs text-[var(--toss-gray-3)]">등록된 금지어 없음</p>}
          {words.map((w) => (
            <span key={w} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-700 text-xs font-semibold rounded-full">
              {w}<button onClick={() => remove(w)} className="hover:text-red-900 font-bold">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={reset} className="px-3 py-1.5 text-xs text-[var(--toss-gray-3)] border border-[var(--border)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]">기본값으로 초기화</button>
          <button onClick={onClose} className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)]">확인</button>
        </div>
      </div>
    </div>
  );
}

type MasterTabId =
  | '개요'
  | '운영대시보드'
  | '변경이력'
  | '권한변경'
  | '전체채팅'
  | '정합성점검'
  | '복구센터'
  | '연차수동부여';

const MASTER_TABS: MasterTabId[] = [
  '개요',
  '운영대시보드',
  '변경이력',
  '권한변경',
  '전체채팅',
  '정합성점검',
  '복구센터',
  '연차수동부여',
];

type SystemMasterUser = Partial<StaffMember> & Record<string, unknown>;

type SystemMasterSummary = {
  staffCount?: number;
  auditCount?: number;
  payrollCount?: number;
  roomCount?: number;
  messageCount?: number;
};

type SystemMasterAuditLog = {
  id: string;
  action?: string | null;
  category?: string | null;
  target_label?: string | null;
  actor_label?: string | null;
  created_at?: string | null;
  changed_fields?: string[];
  details?: unknown;
};

type SystemMasterPermissionSummary = {
  enabled?: string[];
  disabled?: string[];
  beforeRole?: string | null;
  afterRole?: string | null;
};

type SystemMasterPermissionDiffLog = SystemMasterAuditLog & {
  permission_summary?: SystemMasterPermissionSummary | null;
};

type SystemMasterPayrollRecord = {
  id: string;
  staff_name?: string | null;
  employee_no?: string | null;
  year_month?: string | null;
  company?: string | null;
  department?: string | null;
  net_pay?: number | null;
};

type SystemMasterSensitiveStaff = {
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

type SystemMasterOverviewPayload = {
  summary?: SystemMasterSummary;
  recentAudits?: SystemMasterAuditLog[];
  recentPayrolls?: SystemMasterPayrollRecord[];
  sensitiveStaffs?: SystemMasterSensitiveStaff[];
};

type SystemMasterFailureItem = {
  id: string;
  severity?: 'info' | 'warning' | 'critical' | string | null;
  label?: string | null;
  count?: number | null;
  detail?: string | null;
};

type SystemMasterPlatformSummary = {
  platform?: string | null;
  count?: number | null;
};

type SystemMasterPushFailureSummary = {
  error?: string | null;
  count?: number | null;
};

type SystemMasterRecentSubscription = {
  id: string;
  platform?: string | null;
  has_fcm?: boolean | null;
  created_at?: string | null;
};

type SystemMasterCronJob = {
  path: string;
  schedule?: string | null;
  label?: string | null;
};

type SystemMasterBackup = {
  name: string;
  created_at?: string | null;
};

type SystemMasterRestoreRun = {
  id: string;
  file_name?: string | null;
  status?: string | null;
  started_at?: string | null;
};

type SystemMasterWikiVersion = {
  id: string;
  title?: string | null;
  version_no?: number | null;
  created_at?: string | null;
};

type SystemMasterUsageSummary = {
  id: string;
  label?: string | null;
  count?: number | null;
  topAction?: string | null;
  latestAt?: string | null;
};

type SystemMasterOperationsPayload = {
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

type SystemMasterChatRoom = {
  id: string;
  room_label?: string | null;
  member_labels?: string[];
};

type SystemMasterChatMessage = {
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

type SystemMasterChatsPayload = {
  rooms?: SystemMasterChatRoom[];
  messages?: SystemMasterChatMessage[];
};

type SystemMasterIntegrityIssue = {
  id: string;
  severity?: 'info' | 'warning' | 'critical' | string | null;
  title?: string | null;
  description?: string | null;
  count?: number | null;
  samples?: string[];
};

type SystemMasterIntegrityPayload = {
  checkedAt?: string | null;
  issues?: SystemMasterIntegrityIssue[];
};

type SystemMasterAuditPayload = {
  logs?: SystemMasterAuditLog[];
};

type SystemMasterPermissionDiffPayload = {
  logs?: SystemMasterPermissionDiffLog[];
};

type SystemMasterActionId =
  | 'run_backup_full'
  | 'run_chat_push_dispatch'
  | 'run_todo_reminders'
  | 'cleanup_push_subscriptions';

function formatCurrency(value: unknown) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString('ko-KR')}원`;
}

function maskResidentNo(value: string, reveal: boolean) {
  if (!value) return '-';
  if (reveal) return value;
  const normalized = value.replace(/\s/g, '');
  if (normalized.length <= 7) return `${normalized.slice(0, 1)}******`;
  return `${normalized.slice(0, 7)}******`;
}

function maskAccount(value: string, reveal: boolean) {
  if (!value) return '-';
  if (reveal) return value;
  const normalized = value.replace(/\s/g, '');
  if (normalized.length <= 4) return `****${normalized.slice(-2)}`;
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDateTime(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString('ko-KR');
}

function formatPushPlatformLabel(platform: unknown) {
  const normalized = String(platform || '').trim();
  if (!normalized || normalized === 'unknown') return '미분류';
  if (normalized === 'ios-webapp') return 'iPhone 설치형';
  if (normalized === 'ios-browser') return 'iPhone 브라우저';
  if (normalized === 'android') return 'Android';
  if (normalized === 'web') return 'Desktop Web';
  return normalized;
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || '데이터를 불러오지 못했습니다.');
  }
  return payload as T;
}

export default function SystemMasterCenter({
  user,
  staffs = [],
  onRefresh,
  initialTab,
}: {
  user?: unknown;
  staffs?: StaffMember[];
  onRefresh?: () => void;
  initialTab?: MasterTabId;
}) {
  const [activeTab, setActiveTab] = useState<MasterTabId>('개요');
  const [overview, setOverview] = useState<SystemMasterOverviewPayload | null>(null);
  const [operations, setOperations] = useState<SystemMasterOperationsPayload | null>(null);
  const [auditLogs, setAuditLogs] = useState<SystemMasterAuditLog[]>([]);
  const [permissionDiffLogs, setPermissionDiffLogs] = useState<SystemMasterPermissionDiffLog[]>([]);
  const [chatRooms, setChatRooms] = useState<SystemMasterChatRoom[]>([]);
  const [chatMessages, setChatMessages] = useState<SystemMasterChatMessage[]>([]);
  const [integrityReport, setIntegrityReport] = useState<SystemMasterIntegrityPayload | null>(null);
  const [auditCategory, setAuditCategory] = useState('all');
  const [auditKeyword, setAuditKeyword] = useState('');
  const [chatKeyword, setChatKeyword] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [showSensitiveRaw, setShowSensitiveRaw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bannedWords, setBannedWords] = useState<string[]>(loadBannedWords);
  const [showBannedModal, setShowBannedModal] = useState(false);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [opsActionLoading, setOpsActionLoading] = useState<string>('');

  const systemMasterUser =
    typeof user === 'object' && user !== null ? (user as SystemMasterUser) : null;
  const isSystemMaster = hasSystemMasterPermission(systemMasterUser as Record<string, unknown> | null);

  useEffect(() => {
    if (!initialTab || !isSystemMaster) return;
    setActiveTab(initialTab);
  }, [initialTab, isSystemMaster]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await readJson<SystemMasterOverviewPayload>('/api/admin/system-master?scope=overview');
      setOverview(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '개요를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        scope: 'audit',
        category: auditCategory,
        keyword: auditKeyword,
        limit: '200',
      });
      const payload = await readJson<SystemMasterAuditPayload>(`/api/admin/system-master?${query.toString()}`);
      setAuditLogs(payload.logs || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '변경 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [auditCategory, auditKeyword]);

  const loadOperations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const query = new URLSearchParams({
        scope: 'operations',
        limit: '200',
      });
      const payload = await readJson<SystemMasterOperationsPayload>(`/api/admin/system-master?${query.toString()}`);
      setOperations(payload || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '운영 대시보드를 불러오지 못했습니다.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadPermissionDiffs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        scope: 'permission-diffs',
        keyword: auditKeyword,
        limit: '200',
      });
      const payload = await readJson<SystemMasterPermissionDiffPayload>(`/api/admin/system-master?${query.toString()}`);
      setPermissionDiffLogs(payload.logs || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '권한 변경 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [auditKeyword]);

  const loadIntegrityReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await readJson<SystemMasterIntegrityPayload>('/api/admin/system-master?scope=integrity');
      setIntegrityReport(payload || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '정합성 점검 결과를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadChats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        scope: 'chats',
        keyword: chatKeyword,
        limit: '200',
      });
      if (selectedRoomId) {
        query.set('roomId', selectedRoomId);
      }

      const payload = await readJson<SystemMasterChatsPayload>(`/api/admin/system-master?${query.toString()}`);
      setChatRooms(payload.rooms || []);
      setChatMessages(payload.messages || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '채팅 내역을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [chatKeyword, selectedRoomId]);

  useEffect(() => {
    if (!isSystemMaster) return;
    if (activeTab === '개요') {
      void loadOverview();
    }
  }, [activeTab, isSystemMaster, loadOverview]);

  useEffect(() => {
    if (!isSystemMaster || activeTab !== '변경이력') return;
    void loadAuditLogs();
  }, [activeTab, isSystemMaster, loadAuditLogs]);

  useEffect(() => {
    if (!isSystemMaster || activeTab !== '운영대시보드') return;
    void loadOperations();
  }, [activeTab, isSystemMaster, loadOperations]);

  useEffect(() => {
    if (!isSystemMaster || activeTab !== '운영대시보드') return;

    const intervalId = window.setInterval(() => {
      void loadOperations(true);
    }, 30000);

    const handleFocus = () => {
      if (document.visibilityState === 'hidden') return;
      void loadOperations(true);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [activeTab, isSystemMaster, loadOperations]);

  useEffect(() => {
    if (!isSystemMaster || activeTab !== '권한변경') return;
    void loadPermissionDiffs();
  }, [activeTab, isSystemMaster, loadPermissionDiffs]);

  useEffect(() => {
    if (!isSystemMaster || activeTab !== '전체채팅') return;
    void loadChats();
  }, [activeTab, isSystemMaster, loadChats]);

  useEffect(() => {
    if (!isSystemMaster || activeTab !== '정합성점검') return;
    void loadIntegrityReport();
  }, [activeTab, isSystemMaster, loadIntegrityReport]);

  useEffect(() => {
    if (chatRooms.length === 0) {
      if (selectedRoomId) setSelectedRoomId('');
      return;
    }

    if (!selectedRoomId || !chatRooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(chatRooms[0].id);
    }
  }, [chatRooms, selectedRoomId]);

  const handleDeleteRoom = useCallback(async (room: SystemMasterChatRoom) => {
    if (!room?.id) return;
    if (!confirm(`"${room.room_label || '채팅방'}" 채팅방 자체를 삭제하시겠습니까?\n대화내역과 관련 데이터도 함께 삭제됩니다.`)) {
      return;
    }

    setDeletingRoomId(room.id);
    try {
      const response = await fetch(`/api/admin/system-master?scope=chats&roomId=${encodeURIComponent(String(room.id))}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || '채팅방 삭제에 실패했습니다.');
      }

      setChatRooms((prev) => prev.filter((item) => item.id !== room.id));
      setChatMessages((prev) => prev.filter((message) => message.room_id !== room.id));
      setSelectedRoomId((prev) => (prev === room.id ? '' : prev));
      toast('채팅방을 삭제했습니다.', 'success');
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : '채팅방 삭제에 실패했습니다.';
      toast(message, 'error');
    } finally {
      setDeletingRoomId(null);
    }
  }, []);

  const runOpsAction = useCallback(async (action: SystemMasterActionId) => {
    setOpsActionLoading(action);
    try {
      const response = await fetch('/api/admin/system-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || '작업 실행에 실패했습니다.');
      }

      if (action === 'run_backup_full') {
        toast('전체 백업을 실행했습니다.', 'success');
      } else if (action === 'run_chat_push_dispatch') {
        toast('채팅 푸시 큐 재처리를 실행했습니다.', 'success');
      } else if (action === 'run_todo_reminders') {
        const result = payload?.result || {};
        toast(
          `할일 리마인더를 실행했습니다. 신규 ${Number(result.created || 0).toLocaleString('ko-KR')}건`,
          'success'
        );
      } else {
        toast('푸시 구독 정리를 실행했습니다.', 'success');
      }

      await Promise.allSettled([loadOperations(), loadIntegrityReport()]);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : '작업 실행에 실패했습니다.';
      toast(message, 'error');
    } finally {
      setOpsActionLoading('');
    }
  }, [loadIntegrityReport, loadOperations]);

  const selectedChatRoom = useMemo(
    () => chatRooms.find((room) => room.id === selectedRoomId) || null,
    [chatRooms, selectedRoomId],
  );

  const flaggedChatMessageCount = useMemo(
    () => chatMessages.filter((message) => message.content && hasBanned(message.content, bannedWords)).length,
    [chatMessages, bannedWords],
  );

  const visibleChatMessages = useMemo(
    () =>
      chatMessages.filter(
        (message) => !showFlaggedOnly || (message.content && hasBanned(message.content, bannedWords)),
      ),
    [bannedWords, chatMessages, showFlaggedOnly],
  );

  const summaryCards = useMemo(() => {
    if (!overview?.summary) return [];
    const summary = overview.summary;
    return [
      { id: 'staff', label: '직원 계정', value: summary.staffCount },
      { id: 'audit', label: '감사 로그', value: summary.auditCount },
      { id: 'payroll', label: '급여 레코드', value: summary.payrollCount },
      { id: 'room', label: '채팅방', value: summary.roomCount },
      { id: 'message', label: '메시지', value: summary.messageCount },
    ];
  }, [overview]);

  if (!isSystemMaster) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-2xl">🔒</div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">시스템마스터 전용 화면입니다.</h2>
        <p className="mt-2 text-sm text-[var(--toss-gray-3)]">
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[11px]">{SYSTEM_MASTER_ACCOUNT_ID}</code>
          {' '}시스템마스터 계정으로 로그인한 경우에만 접근할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="system-master-center">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--toss-gray-3)]">System Master</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--foreground)]">시스템마스터센터</h2>
            <p className="mt-2 text-sm text-[var(--toss-gray-3)]">
              직원 민감정보, 급여 변경 이력, 전 직원 채팅 대화, 연차 수동 조정을 한곳에서 점검합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {MASTER_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-[var(--radius-md)] px-4 py-2 text-[11px] font-bold transition-all ${
                  activeTab === tab
                    ? 'bg-[var(--foreground)] text-white shadow-sm'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--foreground)]'
                }`}
              >
                {tab === '연차수동부여' ? '연차 수동 부여' : tab}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (activeTab === '개요') void loadOverview();
                if (activeTab === '운영대시보드') void loadOperations();
                if (activeTab === '변경이력') void loadAuditLogs();
                if (activeTab === '권한변경') void loadPermissionDiffs();
                if (activeTab === '전체채팅') void loadChats();
                if (activeTab === '정합성점검') void loadIntegrityReport();
                onRefresh?.();
              }}
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-[11px] font-bold text-[var(--foreground)] transition-all hover:bg-[var(--muted)]"
            >
              새로고침
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-[var(--radius-lg)] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-5 text-center text-sm text-[var(--toss-gray-3)]">
          데이터를 불러오는 중입니다...
        </div>
      )}

      {activeTab === '개요' && overview && (
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
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">직원, 급여, 채팅 관련 최근 로그를 확인합니다.</p>
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
              <p className="mt-1 text-xs text-[var(--toss-gray-3)]">최근 저장된 급여 레코드 기준입니다.</p>
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
                <p className="mt-1 text-xs text-[var(--toss-gray-3)]">시스템마스터만 주민번호, 계좌정보, 급여 기준값을 확인할 수 있습니다.</p>
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
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-[var(--page-bg)] text-[11px] uppercase tracking-[0.14em] text-[var(--toss-gray-3)]">
                  <tr>
                    <th className="px-3 py-3">직원</th>
                    <th className="px-3 py-3">소속</th>
                    <th className="px-3 py-3">주민번호</th>
                    <th className="px-3 py-3">연락처</th>
                    <th className="px-3 py-3">이메일</th>
                    <th className="px-3 py-3">은행 / 계좌</th>
                    <th className="px-3 py-3">기본급</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview.sensitiveStaffs || []).map((staff) => (
                    <tr key={staff.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-3">
                        <p className="font-bold text-[var(--foreground)]">{staff.name}</p>
                        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">#{staff.employee_no || '-'}</p>
                      </td>
                      <td className="px-3 py-3 text-[var(--toss-gray-4)]">{staff.company || '-'} / {staff.department || '-'}</td>
                      <td className="px-3 py-3 font-mono text-[var(--foreground)]">{maskResidentNo(staff.resident_no || '', showSensitiveRaw)}</td>
                      <td className="px-3 py-3 text-[var(--toss-gray-4)]">{staff.phone || '-'}</td>
                      <td className="px-3 py-3 text-[var(--toss-gray-4)]">{staff.email || '-'}</td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-[var(--foreground)]">{staff.bank_name || '-'}</p>
                        <p className="mt-1 font-mono text-[11px] text-[var(--toss-gray-3)]">{maskAccount(staff.bank_account || '', showSensitiveRaw)}</p>
                      </td>
                      <td className="px-3 py-3 font-semibold text-[var(--foreground)]">{formatCurrency(staff.base_salary)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === '운영대시보드' && operations && (
        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
            {[
              { id: 'queue-pending', label: '대기 푸시 작업', value: operations.queue?.pending ?? 0 },
              { id: 'queue-dead', label: 'Dead Letter', value: operations.queue?.deadLettered ?? 0 },
              { id: 'push-total', label: '푸시 구독', value: operations.subscriptions?.total ?? 0 },
              { id: 'backup-count', label: '최근 백업', value: (operations.recentBackups || []).length },
              { id: 'restore-count', label: '복원 이력', value: (operations.restoreRuns || []).length },
              { id: 'todo-due', label: '리마인더 대기', value: operations.todoAutomation?.dueReminders ?? 0 },
              { id: 'wiki-version', label: '위키 버전', value: operations.wiki?.versions ?? 0 },
            ].map((card) => (
              <article key={card.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">{card.label}</p>
                <p className="mt-3 text-3xl font-black tracking-tight text-[var(--foreground)]">{Number(card.value || 0).toLocaleString('ko-KR')}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">실패/주의 작업 모니터</h3>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">푸시 큐, 구독 정리, 백업 지연 같은 운영 이슈를 즉시 확인합니다.</p>
                </div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  마지막 갱신 {formatDateTime(operations.checkedAt)}
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {(operations.failureItems || []).length === 0 && (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--toss-gray-3)]">
                    현재 감지된 실패/주의 작업이 없습니다.
                  </div>
                )}
                {(operations.failureItems || []).map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-[var(--radius-lg)] border px-4 py-3 ${
                      item.severity === 'critical'
                        ? 'border-red-500/20 bg-red-500/10'
                        : item.severity === 'warning'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-[var(--border)] bg-[var(--page-bg)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-[var(--foreground)]">{item.label}</p>
                      <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
                        {Number(item.count || 0).toLocaleString('ko-KR')}건
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">{item.detail}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h3 className="text-base font-bold text-[var(--foreground)]">푸시 큐 / 백업 / 크론 상태</h3>
              <div className="mt-4 space-y-4">
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
                  <p className="text-xs font-bold text-[var(--foreground)]">채팅 푸시 큐</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <p className="text-[11px] text-[var(--toss-gray-3)]">Ready <span className="font-bold text-[var(--foreground)]">{Number(operations.queue?.ready || 0).toLocaleString('ko-KR')}</span></p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">Retrying <span className="font-bold text-[var(--foreground)]">{Number(operations.queue?.retrying || 0).toLocaleString('ko-KR')}</span></p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">In Flight <span className="font-bold text-[var(--foreground)]">{Number(operations.queue?.inFlight || 0).toLocaleString('ko-KR')}</span></p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">Migration Ready <span className="font-bold text-[var(--foreground)]">{operations.queue?.migrationReady ? '예' : '아니오'}</span></p>
                  </div>
                </div>

                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
                  <p className="text-xs font-bold text-[var(--foreground)]">푸시 구독 상태</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <p className="text-[11px] text-[var(--toss-gray-3)]">Null Staff <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.nullStaff || 0).toLocaleString('ko-KR')}</span></p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">Orphan <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.orphan || 0).toLocaleString('ko-KR')}</span></p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">중복 그룹 <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.duplicateEndpointGroups || 0).toLocaleString('ko-KR')}</span></p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">중복 행 <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.duplicateRows || 0).toLocaleString('ko-KR')}</span></p>
                  </div>
                </div>

                <div
                  data-testid="system-master-push-diagnostics"
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-bold text-[var(--foreground)]">푸시 진단</p>
                    <span className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                      최근 실패 {Number(operations.pushFailures?.total || 0).toLocaleString('ko-KR')}건
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <p className="text-[11px] text-[var(--toss-gray-3)]">FCM 연결 <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.fcmEnabled || 0).toLocaleString('ko-KR')}</span></p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">Web Push 전용 <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.webPushOnly || 0).toLocaleString('ko-KR')}</span></p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">가상 Endpoint <span className="font-bold text-[var(--foreground)]">{Number(operations.subscriptions?.placeholderEndpoints || 0).toLocaleString('ko-KR')}</span></p>
                  </div>

                  <div className="mt-4">
                    <p className="text-[11px] font-bold text-[var(--foreground)]">플랫폼 분포</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(operations.subscriptions?.platformSummary || []).length === 0 && (
                        <span className="text-[11px] text-[var(--toss-gray-3)]">표시할 플랫폼 데이터가 없습니다.</span>
                      )}
                      {(operations.subscriptions?.platformSummary || []).map((entry) => (
                        <span
                          key={String(entry.platform)}
                          className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--foreground)]"
                        >
                          {formatPushPlatformLabel(entry.platform)} {Number(entry.count || 0).toLocaleString('ko-KR')}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-bold text-[var(--foreground)]">최근 실패 사유</p>
                      <div className="mt-2 space-y-2">
                        {(operations.pushFailures?.summary || []).length === 0 && (
                          <p className="text-[11px] text-[var(--toss-gray-3)]">최근 실패 사유가 없습니다.</p>
                        )}
                        {(operations.pushFailures?.summary || []).slice(0, 4).map((entry) => (
                          <div key={String(entry.error)} className="flex items-center justify-between gap-3 text-[11px]">
                            <span className="font-semibold text-[var(--foreground)]">{String(entry.error || 'unknown')}</span>
                            <span className="text-[var(--toss-gray-3)]">{Number(entry.count || 0).toLocaleString('ko-KR')}건</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold text-[var(--foreground)]">최근 구독 흐름</p>
                      <div className="mt-2 space-y-2">
                        {(operations.subscriptions?.recentSubscriptions || []).length === 0 && (
                          <p className="text-[11px] text-[var(--toss-gray-3)]">최근 구독 데이터가 없습니다.</p>
                        )}
                        {(operations.subscriptions?.recentSubscriptions || []).slice(0, 4).map((entry) => (
                          <div key={String(entry.id)} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                            <p className="text-[11px] font-semibold text-[var(--foreground)]">{formatPushPlatformLabel(entry.platform)} · {entry.has_fcm ? 'FCM 포함' : 'Web Push'}</p>
                            <p className="mt-1 text-[10px] text-[var(--toss-gray-3)]">{formatDateTime(entry.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
                  <p className="text-xs font-bold text-[var(--foreground)]">크론 스케줄</p>
                  <div className="mt-3 space-y-2">
                    {(operations.cronJobs || []).map((cron) => (
                      <div key={cron.path} className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="font-semibold text-[var(--foreground)]">{cron.label}</span>
                        <span className="text-[var(--toss-gray-3)]">{cron.schedule}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
                  <p className="text-xs font-bold text-[var(--foreground)]">할일 자동화 / 위키 버전</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <p className="text-[11px] text-[var(--toss-gray-3)]">리마인더 대기 <span className="font-bold text-[var(--foreground)]">{Number(operations.todoAutomation?.dueReminders || 0).toLocaleString('ko-KR')}</span></p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">반복 할일 <span className="font-bold text-[var(--foreground)]">{Number(operations.todoAutomation?.repeatingOpenTodos || 0).toLocaleString('ko-KR')}</span></p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">24시간 리마인더 <span className="font-bold text-[var(--foreground)]">{Number(operations.todoAutomation?.reminderLogs24h || 0).toLocaleString('ko-KR')}</span></p>
                    <p className="text-[11px] text-[var(--toss-gray-3)]">위키 문서/버전 <span className="font-bold text-[var(--foreground)]">{Number(operations.wiki?.documents || 0).toLocaleString('ko-KR')} / {Number(operations.wiki?.versions || 0).toLocaleString('ko-KR')}</span></p>
                  </div>
                </div>

                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
                  <p className="text-xs font-bold text-[var(--foreground)]">실기기 QA 체크리스트</p>
                  <div className="mt-3 space-y-2 text-[11px] text-[var(--toss-gray-3)]">
                    <p>1. Android Chrome 또는 iPhone 설치형 앱에서 알림 권한이 허용된 상태인지 확인합니다.</p>
                    <p>2. 앱을 완전히 내려놓은 뒤 다른 계정에서 채팅 메시지를 보내 상단 푸시가 오는지 확인합니다.</p>
                    <p>3. 푸시를 눌렀을 때 채팅방, 결재 문서, 게시글이 정확한 대상까지 열리는지 확인합니다.</p>
                    <p>4. 앱을 다시 열어 알림 설정의 푸시 상태가 연결됨으로 복구되는지 확인합니다.</p>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_0.9fr_1.1fr]">
            <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h3 className="text-base font-bold text-[var(--foreground)]">최근 백업</h3>
              <div className="mt-4 space-y-3">
                {(operations.recentBackups || []).map((backup) => (
                  <div key={backup.name} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                    <p className="text-sm font-bold text-[var(--foreground)]">{backup.name}</p>
                    <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{formatDateTime(backup.created_at)}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h3 className="text-base font-bold text-[var(--foreground)]">최근 복원 / 위키 버전</h3>
              <div className="mt-4 space-y-3">
                {(operations.restoreRuns || []).slice(0, 3).map((run) => (
                  <div key={run.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-[var(--foreground)]">{run.file_name}</p>
                      <span className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-bold ${run.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : run.status === 'failed' ? 'bg-red-500/20 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {run.status === 'completed' ? '완료' : run.status === 'failed' ? '실패' : '진행'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{formatDateTime(run.started_at)}</p>
                  </div>
                ))}
                {(operations.wiki?.recentVersions || []).slice(0, 2).map((version) => (
                  <div key={version.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                    <p className="text-sm font-bold text-[var(--foreground)]">{version.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">버전 {Number(version.version_no || 0).toLocaleString('ko-KR')} · {formatDateTime(version.created_at)}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h3 className="text-base font-bold text-[var(--foreground)]">기능별 사용 로그</h3>
              <div className="mt-4 space-y-3">
                {(operations.usageSummary || []).map((entry) => (
                  <div key={entry.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-[var(--foreground)]">{entry.label}</p>
                      <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
                        {Number(entry.count || 0).toLocaleString('ko-KR')}건
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">최근 액션 {entry.topAction || '-'} · {formatDateTime(entry.latestAt)}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      )}

      {activeTab === '변경이력' && (
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
              onClick={() => void loadAuditLogs()}
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
      )}

      {activeTab === '권한변경' && (
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
                onClick={() => void loadPermissionDiffs()}
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
                        <span key={`on-${key}`} className="rounded-full bg-green-500/20 px-2.5 py-1 text-[10px] font-bold text-green-700">+ {key}</span>
                      ))}
                      {(log.permission_summary?.disabled || []).map((key: string) => (
                        <span key={`off-${key}`} className="rounded-full bg-red-500/20 px-2.5 py-1 text-[10px] font-bold text-red-700">- {key}</span>
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
      )}

      {showBannedModal && (
        <BannedWordModal onClose={() => { setBannedWords(loadBannedWords()); setShowBannedModal(false); }} />
      )}

      {activeTab === '전체채팅' && (
        <section className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
          <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[var(--foreground)]">채팅방 목록</h3>
              <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">{chatRooms.length}개</span>
            </div>
            <div className="mt-4 space-y-2">
              {chatRooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`w-full rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-all ${
                    selectedRoomId === room.id
                      ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]'
                      : 'border-[var(--border)] bg-[var(--page-bg)] hover:border-[var(--accent)]/40'
                  }`}
                >
                  <p className="text-sm font-bold text-[var(--foreground)]">{room.room_label}</p>
                  <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{room.member_labels?.join(', ') || '참여자 없음'}</p>
                </button>
              ))}
            </div>
          </article>

          <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">전 직원 채팅 대화 열람</h3>
                <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
                  {selectedRoomId
                    ? `${selectedChatRoom?.room_label || '선택 채팅방'} 대화`
                    : '전체 최근 대화'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {selectedRoomId && (
                  <button
                    type="button"
                    disabled={deletingRoomId === selectedRoomId}
                    onClick={() => {
                      const room = chatRooms.find((item) => item.id === selectedRoomId);
                      if (room) void handleDeleteRoom(room);
                    }}
                    className="h-9 rounded-[var(--radius-md)] border border-red-500/20 px-3 text-xs font-bold text-red-600 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingRoomId === selectedRoomId ? '삭제 중...' : '선택 방 삭제'}
                  </button>
                )}
                {(() => {
                  return flaggedChatMessageCount > 0 ? (
                    <span className="text-[11px] font-bold text-red-600 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">🔍 필터 단어 {flaggedChatMessageCount}건</span>
                  ) : null;
                })()}
                <button
                  type="button"
                  onClick={() => setShowFlaggedOnly((v) => !v)}
                  className={`h-9 px-3 text-xs font-bold rounded-[var(--radius-md)] border transition ${showFlaggedOnly ? 'bg-red-500/100 text-white border-red-500' : 'border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]'}`}
                >
                  선택검색
                </button>
                <button
                  type="button"
                  onClick={() => setShowBannedModal(true)}
                  className="h-9 px-3 text-xs font-bold rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)] transition"
                >
                  단어 필터
                </button>
                <input
                  value={chatKeyword}
                  onChange={(event) => setChatKeyword(event.target.value)}
                  placeholder="대화 내용 검색"
                  className="h-9 min-w-[180px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => void loadChats()}
                  className="h-9 rounded-[var(--radius-lg)] bg-[var(--foreground)] px-4 text-sm font-bold text-white"
                >
                  조회
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[1320px] w-full table-fixed text-left text-xs">
                <thead className="bg-[var(--page-bg)] text-[11px] uppercase tracking-[0.14em] text-[var(--toss-gray-3)] [&_th]:whitespace-nowrap">
                  <tr>
                    <th className="w-[230px] px-4 py-3 text-left">시간</th>
                    <th className="w-[180px] px-4 py-3 text-left">채팅방</th>
                    <th className="w-[180px] px-4 py-3 text-left">발신자</th>
                    <th className="px-4 py-3 text-left">내용</th>
                    <th className="w-[120px] px-4 py-3 text-left">첨부</th>
                    <th className="w-[96px] px-4 py-3 text-left">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleChatMessages
                    .map((message) => {
                      const flagged = message.content && hasBanned(message.content, bannedWords);
                      return (
                        <tr key={message.id} className={`border-t border-[var(--border)] align-top ${flagged ? 'bg-red-500/10' : ''}`}>
                          <td className="w-[230px] px-4 py-4 align-top text-[var(--toss-gray-4)] whitespace-nowrap">{formatDateTime(message.created_at)}</td>
                          <td className="w-[180px] px-4 py-4 align-top">
                            <p className="truncate whitespace-nowrap break-keep font-semibold text-[var(--foreground)]" title={message.room_label || undefined}>{message.room_label}</p>
                            {message.edited_at && <p className="mt-1 text-[11px] text-amber-600">수정됨</p>}
                            {message.is_deleted && <p className="mt-1 text-[11px] text-red-500">삭제 처리</p>}
                          </td>
                          <td className="w-[180px] px-4 py-4 align-top">
                            <p className="truncate whitespace-nowrap break-keep font-semibold text-[var(--foreground)]" title={message.sender_name || undefined}>{message.sender_name}</p>
                            <p className="mt-1 truncate whitespace-nowrap break-keep text-[11px] text-[var(--toss-gray-3)]" title={message.sender_company || '-'}>{message.sender_company || '-'}</p>
                          </td>
                          <td className="break-words px-4 py-4 align-top leading-6 text-[var(--foreground)]">
                            {message.content
                              ? (flagged ? <span>{highlightBanned(message.content, bannedWords)}</span> : message.content)
                              : <span className="text-[var(--toss-gray-3)]">(내용 없음)</span>}
                            {flagged && <span className="ml-1 text-red-500 font-bold text-[11px]">●</span>}
                          </td>
                          <td className="w-[120px] px-4 py-4 align-top whitespace-nowrap">
                            {message.file_url ? (
                              <a href={message.file_url} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">첨부 보기</a>
                            ) : (
                              <span className="text-[var(--toss-gray-3)]">-</span>
                            )}
                          </td>
                          <td className="w-[96px] px-4 py-4 align-top whitespace-nowrap">
                            <button
                              type="button"
                              disabled={deletingMsgId === message.id}
                              onClick={async () => {
                                if (!confirm('이 메시지를 삭제하시겠습니까?')) return;
                                setDeletingMsgId(message.id);
                                const { error: delErr } = await supabase.from('messages').delete().eq('id', message.id);
                                if (delErr) { toast('삭제 실패: ' + delErr.message, 'error'); }
                                else { setChatMessages((prev) => prev.filter((item) => item.id !== message.id)); toast('삭제 완료', 'success'); }
                                setDeletingMsgId(null);
                              }}
                              className={`px-2 py-1 text-[11px] font-bold rounded-[var(--radius-md)] transition ${
                                flagged
                                  ? 'bg-red-500/100 text-white hover:bg-red-600'
                                  : 'border border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-red-500/100 hover:text-white hover:border-red-500'
                              }`}
                            >
                              {deletingMsgId === message.id ? '…' : '삭제'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {activeTab === '정합성점검' && (
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
                onClick={() => void loadIntegrityReport()}
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
                      ? 'border-amber-200 bg-amber-50'
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
      )}

      {activeTab === '복구센터' && (
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
                  onClick={() => void runOpsAction(action.id as 'run_backup_full' | 'run_chat_push_dispatch' | 'run_todo_reminders' | 'cleanup_push_subscriptions')}
                  disabled={opsActionLoading === action.id}
                  className="mt-4 h-10 rounded-[var(--radius-lg)] bg-[var(--foreground)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {opsActionLoading === action.id ? '실행 중...' : action.button}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === '연차수동부여' && (
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
      )}
    </div>
  );
}
