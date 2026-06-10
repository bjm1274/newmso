'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActionDialog } from '@/app/components/useActionDialog';
import {
  includesBannedWord,
  pickFirstFlaggedChatMessage,
} from '@/lib/system-master-chat-filter';
import { SYSTEM_MASTER_ACCOUNT_ID, hasSystemMasterPermission } from '@/lib/system-master';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';
import { loadBannedWords } from '@/lib/banned-words';
import { BannedWordModal } from './시스템마스터센터-modules/BannedWordModal';
import { MASTER_TABS, CHAT_FETCH_LIMIT, CHAT_ROOM_FETCH_LIMIT } from './시스템마스터센터-modules/constants';
import type {
  MasterTabId,
  SystemMasterUser,
  SystemMasterOverviewPayload,
  SystemMasterOperationsPayload,
  SystemMasterAuditLog,
  SystemMasterPermissionDiffLog,
  SystemMasterChatRoom,
  SystemMasterChatMessage,
  SystemMasterIntegrityPayload,
  SystemMasterAuditPayload,
  SystemMasterPermissionDiffPayload,
  SystemMasterChatsPayload,
  SystemMasterActionId,
  SystemMasterSensitiveStaff,
} from './시스템마스터센터-modules/types';
import { type Column } from '@/app/components/ResponsiveTable';
import {
  formatCurrency,
  maskResidentNo,
  maskAccount,
  readJson,
  isEmptyChatRoom,
} from './시스템마스터센터-modules/utils';
import { OverviewPanel } from './시스템마스터센터-modules/OverviewPanel';
import { OperationsPanel } from './시스템마스터센터-modules/OperationsPanel';
import { AuditPanel } from './시스템마스터센터-modules/AuditPanel';
import { PermissionDiffPanel } from './시스템마스터센터-modules/PermissionDiffPanel';
import { ChatsPanel } from './시스템마스터센터-modules/ChatsPanel';
import { IntegrityPanel } from './시스템마스터센터-modules/IntegrityPanel';
import { RecoveryPanel, AnnualLeavePanel } from './시스템마스터센터-modules/RecoveryPanel';

type SystemMasterCenterProps = {
  user?: unknown;
  staffs?: StaffMember[];
  onRefresh?: () => void;
  initialTab?: MasterTabId;
};

export default function SystemMasterCenter(props: SystemMasterCenterProps) {
  // 전부 모바일화: 모바일 차단 해제 — 데스크톱 풀 UI를 모바일에서도 렌더
  return <SystemMasterCenterDesktop {...props} />;
}

function SystemMasterCenterDesktop({
  user,
  staffs = [],
  onRefresh,
  initialTab,
}: SystemMasterCenterProps) {
  const { dialog, openConfirm } = useActionDialog();
  const [activeTab, setActiveTab] = useState<MasterTabId>('개요');
  const [overview, setOverview] = useState<SystemMasterOverviewPayload | null>(null);
  const [operations, setOperations] = useState<SystemMasterOperationsPayload | null>(null);
  const [auditLogs, setAuditLogs] = useState<SystemMasterAuditLog[]>([]);
  const [permissionDiffLogs, setPermissionDiffLogs] = useState<SystemMasterPermissionDiffLog[]>([]);
  const [chatRooms, setChatRooms] = useState<SystemMasterChatRoom[]>([]);
  const [chatCatalogMessages, setChatCatalogMessages] = useState<SystemMasterChatMessage[]>([]);
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
  const [showEmptyRoomsOnly, setShowEmptyRoomsOnly] = useState(false);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [opsActionLoading, setOpsActionLoading] = useState<string>('');
  const [chatJumpTarget, setChatJumpTarget] = useState<{ messageId: string; roomId: string } | null>(null);
  const chatMessageRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const lastFetchedAtRef = useRef<number>(0);

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
      lastFetchedAtRef.current = Date.now();
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
      const catalogParams: Record<string, string> = {
        scope: 'chats',
        keyword: chatKeyword,
        limit: CHAT_FETCH_LIMIT,
        roomLimit: CHAT_ROOM_FETCH_LIMIT,
      };
      // 단어 필터 선택검색 — 서버에서 매칭 채팅방 전체 조회
      if (showFlaggedOnly && bannedWords.length > 0) {
        catalogParams.bannedWords = bannedWords.join(',');
        catalogParams.flaggedRoomsOnly = '1';
      }
      const catalogQuery = new URLSearchParams(catalogParams);
      const roomQuery = new URLSearchParams({
        scope: 'chats',
        keyword: chatKeyword,
        limit: CHAT_FETCH_LIMIT,
      });
      if (selectedRoomId) {
        roomQuery.set('roomId', selectedRoomId);
      }

      const [catalogPayload, roomPayload] = await Promise.all([
        readJson<SystemMasterChatsPayload>(`/api/admin/system-master?${catalogQuery.toString()}`),
        selectedRoomId
          ? readJson<SystemMasterChatsPayload>(`/api/admin/system-master?${roomQuery.toString()}`)
          : Promise.resolve<SystemMasterChatsPayload | null>(null),
      ]);

      setChatRooms(catalogPayload.rooms || []);
      setChatCatalogMessages(catalogPayload.messages || []);
      setChatMessages(roomPayload?.messages || catalogPayload.messages || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '채팅 내역을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [chatKeyword, selectedRoomId, showFlaggedOnly, bannedWords]);

  useEffect(() => {
    if (!isSystemMaster || activeTab !== '개요') return;
    let cancelled = false;
    loadOverview().finally(() => { if (cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, isSystemMaster, loadOverview]);

  useEffect(() => {
    if (!isSystemMaster || activeTab !== '변경이력') return;
    let cancelled = false;
    loadAuditLogs().finally(() => { if (cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, isSystemMaster, loadAuditLogs]);

  useEffect(() => {
    if (!isSystemMaster || activeTab !== '운영대시보드') return;
    void loadOperations();
  }, [activeTab, isSystemMaster, loadOperations]);

  useEffect(() => {
    if (!isSystemMaster || activeTab !== '운영대시보드') return;

    const THROTTLE_MS = 60_000;

    let intervalId: number | undefined;

    const startPolling = () => {
      intervalId = window.setInterval(() => {
        if (!document.hidden) void loadOperations(true);
      }, 60000);
    };

    const stopPolling = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const handleFocus = () => {
      if (document.hidden) return;
      if (Date.now() - lastFetchedAtRef.current < THROTTLE_MS) return;
      void loadOperations(true);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        if (Date.now() - lastFetchedAtRef.current >= THROTTLE_MS) {
          void loadOperations(true);
        }
        startPolling();
      }
    };

    startPolling();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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

  const handleDeleteRoom = useCallback(async (room: SystemMasterChatRoom) => {
    if (!room?.id) return;
    const confirmed = await openConfirm({
      title: '채팅방 삭제',
      description: `"${room.room_label || '채팅방'}" 채팅방 자체를 삭제합니다.\n대화내역과 관련 데이터도 함께 삭제됩니다.`,
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;

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
      setChatCatalogMessages((prev) => prev.filter((message) => message.room_id !== room.id));
      setChatMessages((prev) => prev.filter((message) => message.room_id !== room.id));
      setSelectedRoomId((prev) => (prev === room.id ? '' : prev));
      toast('채팅방을 삭제했습니다.', 'success');
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : '채팅방 삭제에 실패했습니다.';
      toast(message, 'error');
    } finally {
      setDeletingRoomId(null);
    }
  }, [openConfirm]);

  const handleDeleteEmptyRooms = useCallback(async () => {
    const targets = chatRooms.filter((room) => isEmptyChatRoom(room));
    if (targets.length === 0) {
      toast('대화 내역이 없는 채팅방이 없습니다.', 'warning');
      return;
    }
    const confirmed = await openConfirm({
      title: '대화 없는 채팅방 일괄 삭제',
      description: `대화 내역이 전혀 없는 채팅방 ${targets.length}개를 한 번에 삭제합니다.\n참여자 목록, 알림 설정 등 관련 데이터도 함께 정리됩니다.`,
      confirmText: `${targets.length}개 삭제`,
      tone: 'danger',
    });
    if (!confirmed) return;

    setDeletingRoomId('__bulk__');
    try {
      const ids = targets.map((room) => String(room.id)).filter(Boolean);
      const response = await fetch(
        `/api/admin/system-master?scope=chats&roomIds=${encodeURIComponent(ids.join(','))}`,
        { method: 'DELETE' },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || '일괄 삭제에 실패했습니다.');
      }
      const deletedIds = new Set<string>((payload?.deletedRoomIds as string[]) || []);
      setChatRooms((prev) => prev.filter((room) => !deletedIds.has(String(room.id))));
      setChatCatalogMessages((prev) => prev.filter((message) => !deletedIds.has(String(message.room_id || ''))));
      setChatMessages((prev) => prev.filter((message) => !deletedIds.has(String(message.room_id || ''))));
      setSelectedRoomId((prev) => (prev && deletedIds.has(prev) ? '' : prev));

      const failureCount = Number(payload?.failureCount || 0);
      if (failureCount > 0) {
        toast(`${deletedIds.size}개 삭제 · ${failureCount}개 실패`, 'warning');
      } else {
        toast(`${deletedIds.size}개 채팅방을 일괄 삭제했습니다.`, 'success');
      }
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : '일괄 삭제에 실패했습니다.';
      toast(message, 'error');
    } finally {
      setDeletingRoomId(null);
    }
  }, [chatRooms, openConfirm]);

  const handleDeleteMessage = useCallback(async (message: SystemMasterChatMessage) => {
    const confirmed = await openConfirm({
      title: '채팅 메시지 삭제',
      description: '선택한 메시지를 삭제합니다.\n전체 채팅 모니터링 목록에서도 제거됩니다.',
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;
    setDeletingMsgId(message.id);
    const { error: delErr } = await supabase.from('messages').delete().eq('id', message.id);
    if (delErr) { toast('삭제 실패: ' + delErr.message, 'error'); }
    else {
      setChatCatalogMessages((prev) => prev.filter((item) => item.id !== message.id));
      setChatMessages((prev) => prev.filter((item) => item.id !== message.id));
      setChatJumpTarget((prev) => (prev?.messageId === message.id ? null : prev));
      toast('삭제 완료', 'success');
    }
    setDeletingMsgId(null);
  }, [openConfirm]);

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

  const emptyChatRooms = useMemo(
    () => chatRooms.filter((room) => isEmptyChatRoom(room)),
    [chatRooms],
  );

  const selectedRoomIsEmpty = useMemo(
    () => isEmptyChatRoom(selectedChatRoom),
    [selectedChatRoom],
  );

  const flaggedChatMessageCount = useMemo(
    () => chatCatalogMessages.filter((message) => includesBannedWord(message.content, bannedWords)).length,
    [bannedWords, chatCatalogMessages],
  );

  const visibleChatRooms = useMemo(
    () => {
      if (showEmptyRoomsOnly) return emptyChatRooms;
      // 단어 필터(showFlaggedOnly)는 서버 사이드에서 수행된다.
      //   loadChats가 showFlaggedOnly && bannedWords.length > 0 일 때
      //   flaggedRoomsOnly=1 + bannedWords 파라미터로 매칭 채팅방만 받아오므로
      //   여기서는 추가 클라이언트 필터링 없이 chatRooms를 그대로 사용한다.
      //   (bannedWords가 비어 있으면 서버도 전체를 반환하므로 동일 처리)
      return chatRooms;
    },
    [bannedWords, chatRooms, emptyChatRooms, showEmptyRoomsOnly, showFlaggedOnly],
  );

  const visibleChatMessages = useMemo(
    () =>
      chatMessages.filter(
        (message) => !showFlaggedOnly || includesBannedWord(message.content, bannedWords),
      ),
    [bannedWords, chatMessages, showFlaggedOnly],
  );

  useEffect(() => {
    if (visibleChatRooms.length === 0) {
      setSelectedRoomId((prev) => prev ? '' : prev);
      return;
    }

    setSelectedRoomId((prev) => {
      if (!prev || !visibleChatRooms.some((room) => room.id === prev)) {
        return visibleChatRooms[0].id;
      }
      return prev;
    });
  }, [visibleChatRooms]);

  useEffect(() => {
    const targetMessageId = String(chatJumpTarget?.messageId || '').trim();
    if (!targetMessageId) return;
    if (!visibleChatMessages.some((message) => message.id === targetMessageId)) return;

    const row = chatMessageRowRefs.current[targetMessageId];
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [chatJumpTarget, visibleChatMessages]);

  const handleFocusFlaggedChats = useCallback(() => {
    const target = pickFirstFlaggedChatMessage(chatCatalogMessages, bannedWords);
    if (!target) {
      toast('필터 단어가 포함된 채팅이 없습니다.', 'warning');
      return;
    }

    const nextRoomId = String(target.room_id || '').trim();
    const nextMessageId = String(target.id || '').trim();
    setShowFlaggedOnly(true);
    if (nextRoomId) {
      setSelectedRoomId(nextRoomId);
    }
    if (nextRoomId && nextMessageId) {
      setChatJumpTarget({ roomId: nextRoomId, messageId: nextMessageId });
    }
  }, [bannedWords, chatCatalogMessages]);

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

  const sensitiveStaffColumns = useMemo((): Column<SystemMasterSensitiveStaff>[] => [
    {
      key: 'name',
      label: '직원',
      primary: true,
      render: (s) => (
        <div>
          <p className="font-bold text-[var(--foreground)]">{s.name}</p>
          <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">#{s.employee_no || '-'}</p>
        </div>
      ),
    },
    {
      key: 'company',
      label: '소속',
      render: (s) => (
        <span className="text-[var(--toss-gray-4)]">{s.company || '-'} / {s.department || '-'}</span>
      ),
    },
    {
      key: 'resident_no',
      label: '주민번호',
      render: (s) => (
        <span className="font-mono text-[var(--foreground)]">{maskResidentNo(s.resident_no || '', showSensitiveRaw)}</span>
      ),
    },
    {
      key: 'phone',
      label: '연락처',
      render: (s) => <span className="text-[var(--toss-gray-4)]">{s.phone || '-'}</span>,
    },
    {
      key: 'email',
      label: '이메일',
      render: (s) => <span className="text-[var(--toss-gray-4)]">{s.email || '-'}</span>,
    },
    {
      key: 'bank_account',
      label: '은행 / 계좌',
      render: (s) => (
        <div>
          <p className="font-semibold text-[var(--foreground)]">{s.bank_name || '-'}</p>
          <p className="mt-1 font-mono text-[11px] text-[var(--toss-gray-3)]">{maskAccount(s.bank_account || '', showSensitiveRaw)}</p>
        </div>
      ),
    },
    {
      key: 'base_salary',
      label: '기본급',
      align: 'right',
      render: (s) => (
        <span className="font-semibold text-[var(--foreground)]">{formatCurrency(s.base_salary)}</span>
      ),
    },
  ], [showSensitiveRaw]);

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
      {dialog}
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-end">
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
        <div className="rounded-[var(--radius-lg)] border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-5 text-center text-sm text-[var(--toss-gray-3)]">
          데이터를 불러오는 중입니다...
        </div>
      )}

      {activeTab === '개요' && overview && (
        <OverviewPanel
          overview={overview}
          summaryCards={summaryCards}
          showSensitiveRaw={showSensitiveRaw}
          setShowSensitiveRaw={setShowSensitiveRaw}
          sensitiveStaffColumns={sensitiveStaffColumns}
        />
      )}

      {activeTab === '운영대시보드' && operations && (
        <OperationsPanel operations={operations} />
      )}

      {activeTab === '변경이력' && (
        <AuditPanel
          auditCategory={auditCategory}
          setAuditCategory={setAuditCategory}
          auditKeyword={auditKeyword}
          setAuditKeyword={setAuditKeyword}
          onSearch={() => void loadAuditLogs()}
          auditLogs={auditLogs}
          loading={loading}
        />
      )}

      {activeTab === '권한변경' && (
        <PermissionDiffPanel
          auditKeyword={auditKeyword}
          setAuditKeyword={setAuditKeyword}
          onSearch={() => void loadPermissionDiffs()}
          permissionDiffLogs={permissionDiffLogs}
          loading={loading}
        />
      )}

      {showBannedModal && (
        <BannedWordModal onClose={() => { setBannedWords(loadBannedWords()); setShowBannedModal(false); }} />
      )}

      {activeTab === '전체채팅' && (
        <ChatsPanel
          chatRooms={chatRooms}
          visibleChatRooms={visibleChatRooms}
          visibleChatMessages={visibleChatMessages}
          selectedRoomId={selectedRoomId}
          setSelectedRoomId={setSelectedRoomId}
          selectedChatRoom={selectedChatRoom}
          selectedRoomIsEmpty={selectedRoomIsEmpty}
          emptyChatRooms={emptyChatRooms}
          flaggedChatMessageCount={flaggedChatMessageCount}
          showFlaggedOnly={showFlaggedOnly}
          setShowFlaggedOnly={setShowFlaggedOnly}
          showEmptyRoomsOnly={showEmptyRoomsOnly}
          setShowEmptyRoomsOnly={setShowEmptyRoomsOnly}
          chatKeyword={chatKeyword}
          setChatKeyword={setChatKeyword}
          bannedWords={bannedWords}
          deletingRoomId={deletingRoomId}
          deletingMsgId={deletingMsgId}
          chatJumpTarget={chatJumpTarget}
          chatMessageRowRefs={chatMessageRowRefs}
          onLoadChats={() => void loadChats()}
          onOpenBannedModal={() => setShowBannedModal(true)}
          onFocusFlaggedChats={handleFocusFlaggedChats}
          onDeleteRoom={(room) => void handleDeleteRoom(room)}
          onDeleteEmptyRooms={() => void handleDeleteEmptyRooms()}
          onDeleteMessage={(message) => void handleDeleteMessage(message)}
        />
      )}

      {activeTab === '정합성점검' && (
        <IntegrityPanel
          integrityReport={integrityReport}
          onReload={() => void loadIntegrityReport()}
        />
      )}

      {activeTab === '복구센터' && (
        <RecoveryPanel
          opsActionLoading={opsActionLoading}
          runOpsAction={(action) => void runOpsAction(action)}
        />
      )}

      {activeTab === '연차수동부여' && (
        <AnnualLeavePanel
          systemMasterUser={systemMasterUser}
          staffs={staffs}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
