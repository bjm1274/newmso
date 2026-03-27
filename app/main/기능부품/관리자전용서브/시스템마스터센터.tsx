'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import AnnualLeaveManualGrant from './연차수동부여';
import { SYSTEM_MASTER_ACCOUNT_ID, hasSystemMasterPermission } from '@/lib/system-master';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

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
            <span key={w} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
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

type MasterTabId = '개요' | '변경이력' | '전체채팅' | '연차수동부여';

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

async function readJson(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || '데이터를 불러오지 못했습니다.');
  }
  return payload;
}

export default function SystemMasterCenter({
  user,
  staffs = [],
  onRefresh,
  initialTab,
}: {
  user?: any;
  staffs?: any[];
  onRefresh?: () => void;
  initialTab?: MasterTabId;
}) {
  const [activeTab, setActiveTab] = useState<MasterTabId>('개요');
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
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

  const isSystemMaster = hasSystemMasterPermission(user);

  useEffect(() => {
    if (!initialTab || !isSystemMaster) return;
    setActiveTab(initialTab);
  }, [initialTab, isSystemMaster]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await readJson('/api/admin/system-master?scope=overview');
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
      const payload = await readJson(`/api/admin/system-master?${query.toString()}`);
      setAuditLogs(payload.logs || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '변경 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [auditCategory, auditKeyword]);

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

      const payload = await readJson(`/api/admin/system-master?${query.toString()}`);
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
    if (!isSystemMaster || activeTab !== '전체채팅') return;
    void loadChats();
  }, [activeTab, isSystemMaster, loadChats]);

  useEffect(() => {
    if (chatRooms.length === 0) {
      if (selectedRoomId) setSelectedRoomId('');
      return;
    }

    if (!selectedRoomId || !chatRooms.some((room: any) => room.id === selectedRoomId)) {
      setSelectedRoomId(chatRooms[0].id);
    }
  }, [chatRooms, selectedRoomId]);

  const handleDeleteRoom = useCallback(async (room: any) => {
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

      setChatRooms((prev: any[]) => prev.filter((item: any) => item.id !== room.id));
      setChatMessages((prev: any[]) => prev.filter((message: any) => message.room_id !== room.id));
      setSelectedRoomId((prev) => (prev === room.id ? '' : prev));
      toast('채팅방을 삭제했습니다.', 'success');
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : '채팅방 삭제에 실패했습니다.';
      toast(message, 'error');
    } finally {
      setDeletingRoomId(null);
    }
  }, []);

  const summaryCards = useMemo(() => {
    if (!overview?.summary) return [];
    const summary = overview.summary as Record<string, unknown>;
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
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl">🔒</div>
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
            {(['개요', '변경이력', '전체채팅', '연차수동부여'] as MasterTabId[]).map((tab) => (
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
                if (activeTab === '변경이력') void loadAuditLogs();
                if (activeTab === '전체채팅') void loadChats();
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
        <div className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
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
                {((overview.recentAudits as any[]) || []).slice(0, 8).map((log: any) => (
                  <div key={log.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[10px] font-bold text-[var(--accent)]">{log.action}</span>
                      <span className="text-xs font-semibold text-[var(--foreground)]">{log.target_label}</span>
                      <span className="text-[11px] text-[var(--toss-gray-3)]">{log.actor_label || '-'}</span>
                      <span className="text-[11px] text-[var(--toss-gray-3)]">{new Date(log.created_at).toLocaleString('ko-KR')}</span>
                    </div>
                    {log.changed_fields?.length > 0 && (
                      <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">
                        변경 필드: {log.changed_fields.join(', ')}
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
                {((overview.recentPayrolls as any[]) || []).slice(0, 8).map((record: any) => (
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
                  {((overview.sensitiveStaffs as any[]) || []).map((staff: any) => (
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

            {auditLogs.map((log: any) => (
              <article key={log.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[10px] font-bold text-[var(--accent)]">{log.action}</span>
                      <span className="rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">{log.category}</span>
                    </div>
                    <h4 className="mt-3 text-sm font-bold text-[var(--foreground)]">{log.target_label}</h4>
                    <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
                      실행자 {log.actor_label || '-'} · {new Date(log.created_at).toLocaleString('ko-KR')}
                    </p>
                    {log.changed_fields?.length > 0 && (
                      <p className="mt-2 text-[11px] font-semibold text-[var(--foreground)]">
                        변경 필드: {log.changed_fields.join(', ')}
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
              {chatRooms.map((room: any) => (
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
                    ? `${chatRooms.find((room: any) => room.id === selectedRoomId)?.room_label || '선택 채팅방'} 대화`
                    : '전체 최근 대화'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {selectedRoomId && (
                  <button
                    type="button"
                    disabled={deletingRoomId === selectedRoomId}
                    onClick={() => {
                      const room = chatRooms.find((item: any) => item.id === selectedRoomId);
                      if (room) void handleDeleteRoom(room);
                    }}
                    className="h-9 rounded-[var(--radius-md)] border border-red-200 px-3 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingRoomId === selectedRoomId ? '삭제 중...' : '선택 방 삭제'}
                  </button>
                )}
                {(() => {
                  const flagged = chatMessages.filter((m: any) => m.content && hasBanned(m.content, bannedWords)).length;
                  return flagged > 0 ? (
                    <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">🔍 필터 단어 {flagged}건</span>
                  ) : null;
                })()}
                <button
                  type="button"
                  onClick={() => setShowFlaggedOnly((v) => !v)}
                  className={`h-9 px-3 text-xs font-bold rounded-[var(--radius-md)] border transition ${showFlaggedOnly ? 'bg-red-500 text-white border-red-500' : 'border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]'}`}
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
              <table className="min-w-[980px] w-full table-fixed text-left text-xs">
                <colgroup>
                  <col className="w-[160px]" />
                  <col className="w-[90px]" />
                  <col className="w-[90px]" />
                  <col />
                  <col className="w-[110px]" />
                  <col className="w-[80px]" />
                </colgroup>
                <thead className="bg-[var(--page-bg)] text-[11px] uppercase tracking-[0.14em] text-[var(--toss-gray-3)] [&_th]:whitespace-nowrap">
                  <tr>
                    <th className="px-3 py-3">시간</th>
                    <th className="px-3 py-3">채팅방</th>
                    <th className="px-3 py-3">발신자</th>
                    <th className="px-3 py-3">내용</th>
                    <th className="px-3 py-3">첨부</th>
                    <th className="px-3 py-3">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {chatMessages
                    .filter((message: any) => !showFlaggedOnly || (message.content && hasBanned(message.content, bannedWords)))
                    .map((message: any) => {
                      const flagged = message.content && hasBanned(message.content, bannedWords);
                      return (
                        <tr key={message.id} className={`border-t border-[var(--border)] align-top ${flagged ? 'bg-red-50' : ''}`}>
                          <td className="px-3 py-3 text-[var(--toss-gray-4)] whitespace-nowrap">{new Date(message.created_at).toLocaleString('ko-KR')}</td>
                          <td className="px-3 py-3">
                            <p className="truncate font-semibold text-[var(--foreground)]" title={message.room_label}>{message.room_label}</p>
                            {message.edited_at && <p className="mt-1 text-[11px] text-amber-600">수정됨</p>}
                            {message.is_deleted && <p className="mt-1 text-[11px] text-red-500">삭제 처리</p>}
                          </td>
                          <td className="px-3 py-3">
                            <p className="truncate font-semibold text-[var(--foreground)]" title={message.sender_name}>{message.sender_name}</p>
                            <p className="mt-1 truncate text-[11px] text-[var(--toss-gray-3)]" title={message.sender_company || '-'}>{message.sender_company || '-'}</p>
                          </td>
                          <td className="break-words px-3 py-3 text-[var(--foreground)]">
                            {message.content
                              ? (flagged ? <span>{highlightBanned(message.content, bannedWords)}</span> : message.content)
                              : <span className="text-[var(--toss-gray-3)]">(내용 없음)</span>}
                            {flagged && <span className="ml-1 text-red-500 font-bold text-[11px]">●</span>}
                          </td>
                          <td className="px-3 py-3">
                            {message.file_url ? (
                              <a href={message.file_url} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">첨부 보기</a>
                            ) : (
                              <span className="text-[var(--toss-gray-3)]">-</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              disabled={deletingMsgId === message.id}
                              onClick={async () => {
                                if (!confirm('이 메시지를 삭제하시겠습니까?')) return;
                                setDeletingMsgId(message.id);
                                const { error: delErr } = await supabase.from('messages').delete().eq('id', message.id);
                                if (delErr) { toast('삭제 실패: ' + delErr.message, 'error'); }
                                else { setChatMessages((prev: any[]) => prev.filter((m: any) => m.id !== message.id)); toast('삭제 완료', 'success'); }
                                setDeletingMsgId(null);
                              }}
                              className={`px-2 py-1 text-[11px] font-bold rounded-[var(--radius-md)] transition ${
                                flagged
                                  ? 'bg-red-500 text-white hover:bg-red-600'
                                  : 'border border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-red-500 hover:text-white hover:border-red-500'
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

      {activeTab === '연차수동부여' && (
        <section className="space-y-4">
          <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h3 className="text-base font-bold text-[var(--foreground)]">연차 수동 부여</h3>
            <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
              <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[11px]">{SYSTEM_MASTER_ACCOUNT_ID}</code>
              {' '}시스템마스터 계정 전용 기능입니다. 자동 부여 규칙과 별개로 직원별 연차 총량과 사용량을 직접 조정합니다.
            </p>
          </div>
          <AnnualLeaveManualGrant user={user} staffs={staffs} onRefresh={onRefresh} />
        </section>
      )}
    </div>
  );
}
