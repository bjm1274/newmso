'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type MasterTabId = '개요' | '변경이력' | '전체채팅';

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

export default function SystemMasterCenter({ user }: { user?: any }) {
  const [activeTab, setActiveTab] = useState<MasterTabId>('개요');
  const [overview, setOverview] = useState<any>(null);
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

  const isSystemMaster = user?.permissions?.system_master === true || user?.is_system_master === true;

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
    if (selectedRoomId || chatRooms.length === 0) return;
    setSelectedRoomId(chatRooms[0].id);
  }, [chatRooms, selectedRoomId]);

  const summaryCards = useMemo(() => {
    if (!overview?.summary) return [];
    return [
      { id: 'staff', label: '직원 계정', value: overview.summary.staffCount },
      { id: 'audit', label: '감사 로그', value: overview.summary.auditCount },
      { id: 'payroll', label: '급여 레코드', value: overview.summary.payrollCount },
      { id: 'room', label: '채팅방', value: overview.summary.roomCount },
      { id: 'message', label: '메시지', value: overview.summary.messageCount },
    ];
  }, [overview]);

  if (!isSystemMaster) {
    return (
      <div className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl">🔒</div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">시스템마스터 전용 화면입니다.</h2>
        <p className="mt-2 text-sm text-[var(--toss-gray-3)]">
          `bjm127` 시스템마스터 계정으로 로그인한 경우에만 접근할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="system-master-center">
      <section className="rounded-[24px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--toss-gray-3)]">System Master</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--foreground)]">시스템마스터센터</h2>
            <p className="mt-2 text-sm text-[var(--toss-gray-3)]">
              직원 민감정보, 급여 변경 이력, 전 직원 채팅 대화 내용을 한곳에서 점검합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['개요', '변경이력', '전체채팅'] as MasterTabId[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-2 text-[11px] font-bold transition-all ${
                  activeTab === tab
                    ? 'bg-[var(--foreground)] text-white shadow-sm'
                    : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-blue-light)] hover:text-[var(--foreground)]'
                }`}
              >
                {tab}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (activeTab === '개요') void loadOverview();
                if (activeTab === '변경이력') void loadAuditLogs();
                if (activeTab === '전체채팅') void loadChats();
              }}
              className="rounded-full border border-[var(--toss-border)] px-4 py-2 text-[11px] font-bold text-[var(--foreground)] transition-all hover:bg-[var(--toss-gray-1)]"
            >
              새로고침
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-[16px] border border-[var(--toss-border)] bg-[var(--toss-card)] px-4 py-8 text-center text-sm text-[var(--toss-gray-3)]">
          데이터를 불러오는 중입니다...
        </div>
      )}

      {activeTab === '개요' && overview && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map((card) => (
              <article key={card.id} className="rounded-[18px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">{card.label}</p>
                <p className="mt-3 text-3xl font-black tracking-tight text-[var(--foreground)]">{Number(card.value || 0).toLocaleString('ko-KR')}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--foreground)]">최근 변경 이력</h3>
                  <p className="mt-1 text-xs text-[var(--toss-gray-3)]">직원, 급여, 채팅 관련 최근 로그를 확인합니다.</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {(overview.recentAudits || []).slice(0, 8).map((log: any) => (
                  <div key={log.id} className="rounded-[16px] border border-[var(--toss-border)] bg-[var(--page-bg)] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--toss-blue-light)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-blue)]">{log.action}</span>
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

            <article className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
              <h3 className="text-base font-bold text-[var(--foreground)]">최근 급여 반영</h3>
              <p className="mt-1 text-xs text-[var(--toss-gray-3)]">최근 저장된 급여 레코드 기준입니다.</p>
              <div className="mt-4 space-y-3">
                {(overview.recentPayrolls || []).slice(0, 8).map((record: any) => (
                  <div key={record.id} className="rounded-[16px] border border-[var(--toss-border)] bg-[var(--page-bg)] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[var(--foreground)]">{record.staff_name} #{record.employee_no || '-'}</p>
                        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{record.year_month} · {record.company || '-'} · {record.department || '-'}</p>
                      </div>
                      <p className="text-sm font-black text-[var(--toss-blue)]">{formatCurrency(record.net_pay)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
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
                  className="h-4 w-4 rounded border-[var(--toss-border)]"
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
                  {(overview.sensitiveStaffs || []).map((staff: any) => (
                    <tr key={staff.id} className="border-t border-[var(--toss-border)]">
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
        <section className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
            <select
              value={auditCategory}
              onChange={(event) => setAuditCategory(event.target.value)}
              className="h-11 rounded-[14px] border border-[var(--toss-border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)]"
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
              className="h-11 rounded-[14px] border border-[var(--toss-border)] bg-white px-4 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--toss-blue)]"
            />
            <button
              type="button"
              onClick={() => void loadAuditLogs()}
              className="h-11 rounded-[14px] bg-[var(--toss-blue)] px-5 text-sm font-bold text-white"
            >
              조회
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {auditLogs.length === 0 && !loading && (
              <div className="rounded-[16px] border border-dashed border-[var(--toss-border)] px-4 py-10 text-center text-sm text-[var(--toss-gray-3)]">
                조회된 변경 이력이 없습니다.
              </div>
            )}

            {auditLogs.map((log: any) => (
              <article key={log.id} className="rounded-[18px] border border-[var(--toss-border)] bg-[var(--page-bg)] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--toss-blue-light)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-blue)]">{log.action}</span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)]">{log.category}</span>
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
                    <details className="rounded-[14px] border border-[var(--toss-border)] bg-white px-4 py-3">
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

      {activeTab === '전체채팅' && (
        <section className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <article className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-4 shadow-sm">
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
                  className={`w-full rounded-[16px] border px-4 py-3 text-left transition-all ${
                    selectedRoomId === room.id
                      ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]'
                      : 'border-[var(--toss-border)] bg-[var(--page-bg)] hover:border-[var(--toss-blue)]/40'
                  }`}
                >
                  <p className="text-sm font-bold text-[var(--foreground)]">{room.room_label}</p>
                  <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{room.member_labels?.join(', ') || '참여자 없음'}</p>
                </button>
              ))}
            </div>
          </article>

          <article className="rounded-[20px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">전 직원 채팅 대화 열람</h3>
                <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
                  {selectedRoomId
                    ? `${chatRooms.find((room: any) => room.id === selectedRoomId)?.room_label || '선택 채팅방'} 대화`
                    : '전체 최근 대화'}
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  value={chatKeyword}
                  onChange={(event) => setChatKeyword(event.target.value)}
                  placeholder="대화 내용 검색"
                  className="h-11 min-w-[220px] rounded-[14px] border border-[var(--toss-border)] bg-white px-4 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--toss-blue)]"
                />
                <button
                  type="button"
                  onClick={() => void loadChats()}
                  className="h-11 rounded-[14px] bg-[var(--foreground)] px-5 text-sm font-bold text-white"
                >
                  조회
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-[var(--page-bg)] text-[11px] uppercase tracking-[0.14em] text-[var(--toss-gray-3)]">
                  <tr>
                    <th className="px-3 py-3">시간</th>
                    <th className="px-3 py-3">채팅방</th>
                    <th className="px-3 py-3">발신자</th>
                    <th className="px-3 py-3">내용</th>
                    <th className="px-3 py-3">첨부</th>
                  </tr>
                </thead>
                <tbody>
                  {chatMessages.map((message: any) => (
                    <tr key={message.id} className="border-t border-[var(--toss-border)] align-top">
                      <td className="px-3 py-3 text-[var(--toss-gray-4)]">{new Date(message.created_at).toLocaleString('ko-KR')}</td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-[var(--foreground)]">{message.room_label}</p>
                        {message.edited_at && <p className="mt-1 text-[11px] text-amber-600">수정됨</p>}
                        {message.is_deleted && <p className="mt-1 text-[11px] text-red-500">삭제 처리</p>}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-[var(--foreground)]">{message.sender_name}</p>
                        <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{message.sender_company || '-'}</p>
                      </td>
                      <td className="px-3 py-3 text-[var(--foreground)]">{message.content || '(내용 없음)'}</td>
                      <td className="px-3 py-3">
                        {message.file_url ? (
                          <a
                            href={message.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--toss-blue)] underline"
                          >
                            첨부 보기
                          </a>
                        ) : (
                          <span className="text-[var(--toss-gray-3)]">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}
    </div>
  );
}
