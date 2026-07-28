'use client';

/**
 * MemberWorkcenter — 직원 프로필 드로어 (우측) - PC 개선 버전
 *
 * - 정보 탭 도입 (인적/면허, 최근 활동/근태, 인사이력)
 * - PC 공간을 활용한 인적 사항 상세 노출 (연락처, 이메일, 주소, 계좌)
 * - HSL 그라데이션 아바타 및 세련된 비주얼 테마
 */

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import type { StaffMember } from '@/types';
import {
  formatJoinDate,
  formatTenure,
  pickHireDate,
  pickToneForStaff } from './data';
import { computeLicenseStatus } from '@/lib/license-renewal-policy';
import { toast } from '@/lib/toast';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { readClientAuditActor, logAudit, buildAuditDiff } from '@/lib/audit';
import RiskActionDialog from '../../인사관리서브/RiskActionDialog';

const StaffHistoryTimeline = dynamic(
  () => import('../../인사관리서브/인사이력타임라인'),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-6 text-center text-[12px] text-[var(--toss-gray-4)]">
        인사 이력을 불러오는 중…
      </div>
    ) },
);

const TONE_BG: Record<string, string> = {
  success: 'bg-gradient-to-tr from-emerald-500/10 to-teal-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20',
  accent: 'bg-gradient-to-tr from-[var(--accent-soft)] to-blue-500/10 text-[var(--accent)] border border-[var(--accent)]/10',
  warn: 'bg-gradient-to-tr from-amber-500/10 to-orange-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/20',
  muted: 'bg-gradient-to-tr from-[var(--muted)] to-zinc-500/10 text-[var(--toss-gray-4)] border border-[var(--border)]' };

interface StaffDrawerProps {
  staff: StaffMember | null;
  onClose?: () => void;
  onOpenDocumentRepoForStaff?: (staff: StaffMember) => void;
  onEditStaff?: (staff: StaffMember) => void;
  canRegisterNewStaff?: boolean;
  onRefresh?: () => void;
}

export default function StaffDrawer({
  staff,
  onClose,
  onOpenDocumentRepoForStaff,
  onEditStaff,
  canRegisterNewStaff = false,
  onRefresh }: StaffDrawerProps) {
  if (!staff) {
    return (
      <aside className="app-card flex h-full items-center justify-center px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
        좌측에서 직원을 선택하면<br />상세 프로필이 표시됩니다.
      </aside>
    );
  }
  return (
    <StaffDrawerInner
      staff={staff}
      onClose={onClose}
      onOpenDocumentRepoForStaff={onOpenDocumentRepoForStaff}
      onEditStaff={onEditStaff}
      canRegisterNewStaff={canRegisterNewStaff}
      onRefresh={onRefresh}
    />
  );
}

function StaffDrawerInner({
  staff,
  onClose,
  onOpenDocumentRepoForStaff,
  onEditStaff,
  canRegisterNewStaff,
  onRefresh }: {
  staff: StaffMember;
  onClose?: () => void;
  onOpenDocumentRepoForStaff?: (staff: StaffMember) => void;
  onEditStaff?: (staff: StaffMember) => void;
  canRegisterNewStaff?: boolean;
  onRefresh?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'activity' | 'history'>('info');
  const [pendingRetirementStaff, setPendingRetirementStaff] = useState<StaffMember | null>(null);
  const [pendingDeleteStaff, setPendingDeleteStaff] = useState<StaffMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const 직원삭제 = async (직원: StaffMember) => {
    try {
      const actor = readClientAuditActor();
      const today = getKoreanTodayString();
      const afterStaff = {
        ...직원,
        status: '퇴사',
        resigned_at: (직원 as any).resigned_at || today };
      // db-client 는 실패해도 reject 하지 않고 { data: null, error } 로 resolve 한다.
      // error 를 받지 않으면 403/500 인데도 성공 토스트가 떠 퇴사 처리가 된 것처럼 보인다.
      // (구성원현황.tsx 의 직원삭제와 동일한 검사)
      const { error: updateErr } = await db
        .from('staff_members')
        .update({
          status: '퇴사',
          resigned_at: (직원 as any).resigned_at || today })
        .eq('id', 직원.id);

      if (updateErr) throw updateErr;

      await logAudit(
        '직원퇴사처리',
        'staff_member',
        String(직원.id),
        {
          staff_name: 직원.name,
          employee_no: 직원.employee_no || null,
          ...buildAuditDiff(직원, afterStaff, ['status', 'resigned_at']) },
        actor.userId,
        actor.userName
      );
      toast('직원이 퇴사 처리되었습니다.', 'success');
      onClose?.();
      onRefresh?.();
    } catch (e: unknown) {
      console.error('직원 퇴사 처리 실패:', e);
      const errMsg = (e as { message?: string } | null)?.message || String(e || '');
      toast(
        errMsg
          ? `직원 퇴사 처리 중 오류가 발생했습니다: ${errMsg}`
          : '직원 퇴사 처리 중 오류가 발생했습니다.',
        'error',
      );
    }
  };

  const 직원완전삭제 = async (직원: StaffMember) => {
    setIsDeleting(true);
    try {
      const actor = readClientAuditActor();
      const { error } = await db
        .from('staff_members')
        .delete()
        .eq('id', 직원.id);

      if (error) throw error;

      await logAudit(
        '직원완전삭제',
        'staff_member',
        String(직원.id),
        {
          staff_name: 직원.name,
          employee_no: 직원.employee_no || null },
        actor.userId,
        actor.userName
      );

      toast('직원 정보가 데이터베이스에서 완전히 삭제되었습니다.', 'success');
      onClose?.();
      onRefresh?.();
    } catch (e: any) {
      console.error('직원 완전 삭제 실패:', e);
      const errMsg = e?.message || String(e || '');
      if (errMsg.includes('FOREIGN KEY') || errMsg.includes('foreign key') || errMsg.includes('constraint') || errMsg.includes('삭제할 수 없습니다')) {
        toast('이 직원은 연결된 결재 문서, 근태, 급여 또는 공지채팅 등 활동 이력이 존재하여 완전 삭제할 수 없습니다. 대신 퇴사 처리를 진행해 주세요.', 'error');
      } else {
        toast(`직원 삭제 중 오류가 발생했습니다: ${errMsg}`, 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const tone = pickToneForStaff(staff.name ?? '');
  const hire = pickHireDate(staff);
  const initial = (staff.name ?? '?').charAt(0);

  const labelId = useMemo(() => `member-drawer-title-${staff.id}`, [staff.id]);
  const status = staff.status ?? '재직';
  const employ = (() => {
    const raw = (staff as Record<string, unknown>).employment_type;
    return typeof raw === 'string' ? raw : '정규직';
  })();
  const licenseSummary = (() => {
    const raw = (staff as Record<string, unknown>).license_name;
    return typeof raw === 'string' ? raw : null;
  })();

  return (
    <aside
      role="dialog"
      aria-labelledby={labelId}
      className="app-card flex h-full min-h-0 flex-col overflow-hidden"
    >
      {/* 헤더 영역 */}
      <header className="flex items-start gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3.5">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-[20px] font-bold shadow-sm ${TONE_BG[tone]}`}
          aria-hidden="true"
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <h3 id={labelId} className="truncate text-[15px] font-bold text-[var(--foreground)]">
            {staff.name}
            {staff.employee_no && (
              <span className="ml-2 text-[11px] font-medium text-[var(--toss-gray-4)]">
                · {staff.employee_no}
              </span>
            )}
          </h3>
          <p className="mt-0.5 truncate text-[12px] font-medium text-[var(--toss-gray-4)]">
            {staff.department || '부서 미지정'} · {staff.position || '직급 미지정'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip tone={status === '퇴사' ? 'warn' : 'success'}>{status}</Chip>
            <Chip tone="accent">{employ}</Chip>
            {licenseSummary && <Chip tone="muted">{licenseSummary}</Chip>}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="프로필 닫기"
            className="rounded-[var(--radius-md)] p-1 text-[var(--toss-gray-3)] transition-colors hover:bg-[var(--muted)]"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </header>

      {/* PC형 탭 바 */}
      <div className="flex border-b border-[var(--border)] bg-[var(--card)] px-3 shrink-0">
        {[
          { id: 'info', label: '인적/면허' },
          { id: 'activity', label: '활동/근태' },
          { id: 'history', label: '인사이력' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2 text-center text-[12px] font-bold border-b-2 transition-all ${
              activeTab === tab.id
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 바디 */}
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3 md:px-4 md:py-4">
        {activeTab === 'info' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* 기본 소속 정보 */}
            <dl className="grid grid-cols-3 gap-3 rounded-[var(--radius-md)] bg-[var(--page-bg)] px-3 py-2.5">
              <MetaCell label="입사일" value={formatJoinDate(hire)} />
              <MetaCell label="근속" value={formatTenure(hire)} />
              <MetaCell label="소속" value={staff.department || '-'} />
            </dl>

            {/* 인적 사항 상세 노출 (PC 공간 활용) */}
            <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 space-y-2.5">
              <h4 className="text-[11px] font-extrabold text-[var(--toss-gray-4)] uppercase tracking-wider">상세 인적사항</h4>
              <div className="grid grid-cols-1 gap-2 text-[12px]">
                <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1.5">
                  <span className="text-[var(--toss-gray-3)] font-medium">연락처</span>
                  <span className="font-semibold text-[var(--foreground)]">{staff.phone || '-'}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1.5">
                  <span className="text-[var(--toss-gray-3)] font-medium">이메일</span>
                  <span className="font-semibold text-[var(--foreground)] truncate max-w-[170px]">{staff.email || '-'}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1.5">
                  <span className="text-[var(--toss-gray-3)] font-medium">내선번호</span>
                  <span className="font-semibold text-[var(--foreground)]">{(staff as any).extension || '-'}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1.5">
                  <span className="text-[var(--toss-gray-3)] font-medium">급여계좌</span>
                  <span className="font-semibold text-[var(--foreground)] truncate max-w-[170px]">
                    {(staff as any).bank_name ? `${(staff as any).bank_name} ${(staff as any).bank_account}` : '-'}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[var(--toss-gray-3)] font-medium">거주지 주소</span>
                  <span className="font-semibold text-[var(--foreground)] leading-normal">{staff.address || '-'}</span>
                </div>
              </div>
            </section>

            {/* 면허 및 자격 정보 */}
            <StaffLicensesSection staffId={String(staff.id)} />

            {/* 빠른 액션 */}
            {(onOpenDocumentRepoForStaff || (canRegisterNewStaff && onEditStaff)) && (
              <section className="pt-2 border-t border-[var(--border)]">
                <div className="section-title mb-2">빠른 액션</div>
                <div className="flex flex-col gap-2">
                  {canRegisterNewStaff && onEditStaff && (
                    <>
                      <button
                        type="button"
                        onClick={() => onEditStaff(staff)}
                        className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-[12px] font-bold text-white transition-all hover:bg-[var(--accent-hover)] shadow-sm"
                      >
                        ✏️ 정보 수정하기
                      </button>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setPendingRetirementStaff(staff)}
                          className="flex-1 rounded-[var(--radius-md)] bg-amber-500/10 text-amber-600 px-3 py-2 text-[11px] font-bold transition-all hover:bg-amber-500/20"
                        >
                          퇴사 처리
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteStaff(staff)}
                          className="flex-1 rounded-[var(--radius-md)] bg-red-500/10 text-red-600 px-3 py-2 text-[11px] font-bold transition-all hover:bg-red-500/20"
                        >
                          완전 삭제
                        </button>
                      </div>
                    </>
                  )}
                  {onOpenDocumentRepoForStaff && (
                    <button
                      type="button"
                      onClick={() => onOpenDocumentRepoForStaff(staff)}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                    >
                      서류보관함 열기 →
                    </button>
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* 최근 활동 */}
            <RecentActivitySection staffId={String(staff.id)} />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* 인사 이력 타임라인 */}
            <section>
              <div className="section-title mb-2">인사 이력 타임라인</div>
              <StaffHistoryTimeline staffId={String(staff.id)} staffName={staff.name ?? ''} />
            </section>
          </div>
        )}
      </div>

      {/* 리스크 액션 다이얼로그 모달 */}
      <RiskActionDialog
        open={!!pendingRetirementStaff}
        title="퇴사 처리 확인"
        description="직원 퇴사 처리 버튼은 실제 삭제가 아니라 재직 상태를 퇴사로 전환합니다."
        targetLabel={pendingRetirementStaff ? `${pendingRetirementStaff.name} · ${pendingRetirementStaff.company || '-'} · ${pendingRetirementStaff.department || '-'}` : undefined}
        tone="danger"
        items={[
          { label: '처리 방식', value: '재직 → 퇴사', tone: 'danger' },
          { label: '퇴사일', value: String((pendingRetirementStaff as any)?.resigned_at || getKoreanTodayString()) },
          { label: '사번', value: String(pendingRetirementStaff?.employee_no || '-') },
          { label: '직함', value: String(pendingRetirementStaff?.position || '-') },
        ]}
        changes={[
          { label: '상태', before: String(pendingRetirementStaff?.status || '재직'), after: '퇴사' },
          { label: '퇴사일', before: String((pendingRetirementStaff as any)?.resigned_at || '(빈 값)'), after: String((pendingRetirementStaff as any)?.resigned_at || getKoreanTodayString()) },
        ]}
        impacts={[
          '재직자 목록과 인사관리 기본 필터에서 제외됩니다.',
          '퇴사 처리 감사 로그가 남고 선택 중인 직원 편집 화면은 닫힙니다.',
          '급여, 계약, 문서 이력은 삭제되지 않으며 기존 데이터와 연결을 유지합니다.',
        ]}
        warnings={[
          '최종 급여 정산, 계약 종료, 장비 반납 등 오프보딩 작업 완료 여부를 확인하세요.',
        ]}
        confirmLabel="퇴사 처리"
        onCancel={() => setPendingRetirementStaff(null)}
        onConfirm={async () => {
          if (!pendingRetirementStaff) return;
          const target = pendingRetirementStaff;
          await 직원삭제(target);
          setPendingRetirementStaff(null);
        }}
      />

      <RiskActionDialog
        open={!!pendingDeleteStaff}
        title="직원 정보 완전 삭제"
        description="이 작업은 선택된 직원의 모든 마스터 데이터를 데이터베이스에서 영구적으로 삭제합니다."
        targetLabel={pendingDeleteStaff ? `${pendingDeleteStaff.name} · ${pendingDeleteStaff.company || '-'} · ${pendingDeleteStaff.department || '-'}` : undefined}
        tone="danger"
        loading={isDeleting}
        items={[
          { label: '처리 방식', value: '데이터베이스 영구 삭제 (완전 삭제)', tone: 'danger' },
          { label: '사번', value: String(pendingDeleteStaff?.employee_no || '-') },
          { label: '입사일', value: String(pendingDeleteStaff?.joined_at || '-') },
          { label: '직함', value: String(pendingDeleteStaff?.position || '-') },
        ]}
        changes={[
          { label: '직원 정보', before: pendingDeleteStaff?.name, after: '완전 삭제 (복구 불가)' },
        ]}
        impacts={[
          '해당 직원의 인적 사항, 급여 기준, 면허 사항 등 모든 정보가 삭제됩니다.',
          '직원 삭제 감사 로그가 영구 기록됩니다.',
        ]}
        warnings={[
          '실제 결재 내역, 메신저 메시지 등 감사 추적이 필요한 다른 정보에 이 직원의 ID가 사용된 경우 외래키 제약조건에 의해 삭제가 차단될 수 있습니다. 이 경우, 완전 삭제 대신 퇴사 처리를 해야 합니다.',
          '삭제 후에는 데이터를 복구할 수 없습니다. 신중히 실행하세요.',
        ]}
        confirmLabel="완전 삭제 실행"
        onCancel={() => setPendingDeleteStaff(null)}
        onConfirm={async () => {
          if (!pendingDeleteStaff) return;
          await 직원완전삭제(pendingDeleteStaff);
          setPendingDeleteStaff(null);
        }}
      />
    </aside>
  );
}

// ─── 최근 활동 (근태/연차/서류) — reference §781~787 ─────────────────────
interface RecentActivityState {
  attend: { label: string; meta: string; tone: ChipTone } | null;
  leave: { label: string; meta: string; tone: ChipTone } | null;
  document: { label: string; meta: string; tone: ChipTone } | null;
  loading: boolean;
}

function formatDateShort(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}/${d}`;
}

function RecentActivitySection({ staffId }: { staffId: string }) {
  const [state, setState] = useState<RecentActivityState>({
    attend: null,
    leave: null,
    document: null,
    loading: true });

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setState((prev) => ({ ...prev, loading: true }));
      const safeQuery = async (p: any) => {
        try {
          const { data } = await p;
          return data ?? null;
        } catch {
          return null;
        }
      };
      const cleanStaffId = String(staffId || '').toLowerCase().trim();
      const [att, lv, doc] = await Promise.all([
        safeQuery(
          db
            .from('attendances')
            .select('work_date, status, check_in_time')
            .eq('staff_id', cleanStaffId)
            .order('work_date', { ascending: false })
            .limit(1)
            .maybeSingle() as unknown as PromiseLike<{
              data: { work_date?: string; status?: string; check_in_time?: string } | null;
              error: unknown;
            }>,
        ),
        safeQuery(
          db
            .from('leave_requests')
            .select('start_date, end_date, leave_type, status, created_at')
            .eq('staff_id', cleanStaffId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle() as unknown as PromiseLike<{
              data: {
                start_date?: string;
                end_date?: string;
                leave_type?: string;
                status?: string;
                created_at?: string;
              } | null;
              error: unknown;
            }>,
        ),
        safeQuery(
          db
            .from('document_repository')
            .select('category, file_url, created_at, updated_at')
            .eq('created_by', cleanStaffId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle() as unknown as PromiseLike<{
              data: {
                category?: string;
                file_url?: string;
                created_at?: string;
                updated_at?: string;
              } | null;
              error: unknown;
            }>,
        ),
      ]);
      if (cancelled) return;

      const attendDisplay = att
        ? {
            label: '근태',
            meta:
              `${formatDateShort(att.work_date)} · ${att.status || '기록'}` +
              (att.check_in_time ? ` · ${String(att.check_in_time).slice(0, 5)}` : ''),
            tone: (att.status === '지각' ? 'warn' : att.status === '결근' ? 'warn' : 'success') as ChipTone }
        : null;

      const leaveDisplay = lv
        ? {
            label: '연차',
            meta:
              `${lv.leave_type || '연차'} · ${formatDateShort(lv.start_date)}` +
              (lv.end_date && lv.end_date !== lv.start_date ? `~${formatDateShort(lv.end_date)}` : '') +
              ` · ${lv.status || '신청'}`,
            tone: (lv.status === '반려' ? 'warn' : lv.status === '승인' ? 'success' : 'accent') as ChipTone }
        : null;

      const docDisplay = doc
        ? {
            label: '서류',
            meta:
              `${doc.category || '문서'} · ${formatDateShort(doc.updated_at ?? doc.created_at)}` +
              (doc.file_url ? ' · 제출완료' : ' · 미제출'),
            tone: (doc.file_url ? 'success' : 'muted') as ChipTone }
        : null;

      setState({
        attend: attendDisplay,
        leave: leaveDisplay,
        document: docDisplay,
        loading: false });
    };

    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  const items = [state.attend, state.leave, state.document].filter(Boolean) as Array<
    NonNullable<RecentActivityState['attend']>
  >;

  return (
    <section>
      <div className="section-title mb-2">최근 활동</div>
      {state.loading ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--toss-gray-4)]">
          최근 활동을 불러오는 중…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--toss-gray-4)]">
          최근 활동 기록이 없습니다.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((row) => (
            <li
              key={row.label}
              className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5"
            >
              <Chip tone={row.tone}>{row.label}</Chip>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--foreground)]">
                {row.meta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface StaffLicense {
  id: string;
  license_type: string | null;
  license_name: string;
  license_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  renewed_date: string | null;
  issuing_body: string | null;
  memo: string | null;
}

const LICENSE_STATUS_COLORS: Record<string, string> = {
  valid: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  expiring: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  expired: 'bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
  unknown: 'bg-gray-500/15 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400' };

const LICENSE_STATUS_LABELS: Record<string, string> = {
  valid: '유효',
  expiring: '만료 임박',
  expired: '만료',
  unknown: '확인 필요' };

function StaffLicensesSection({ staffId }: { staffId: string }) {
  const [licenses, setLicenses] = useState<StaffLicense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchLicenses = async () => {
      setLoading(true);
      const cleanStaffId = String(staffId || '').toLowerCase().trim();
      try {
        const { data, error } = await db
          .from('staff_licenses')
          .select('*')
          .eq('staff_id', cleanStaffId)
          .order('expiry_date', { ascending: true });
        if (error) throw error;
        if (!cancelled) {
          setLicenses((data as StaffLicense[]) ?? []);
        }
      } catch (err) {
        console.error('[StaffLicensesSection] failed to fetch licenses:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchLicenses();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  if (loading) {
    return (
      <section>
        <div className="section-title mb-2">면허 및 자격 정보</div>
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--toss-gray-4)]">
          면허 및 자격 정보를 불러오는 중…
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="section-title mb-2">면허 및 자격 정보</div>
      {licenses.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--toss-gray-4)]">
          등록된 면허/자격 정보가 없습니다.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {licenses.map((lic) => {
            const computed = computeLicenseStatus({
              license_type: lic.license_type,
              expiry_date: lic.expiry_date,
              renewed_date: lic.renewed_date,
              issued_date: lic.issued_date });
            const statusLabel = LICENSE_STATUS_LABELS[computed.status] || '확인 필요';
            const statusColor = LICENSE_STATUS_COLORS[computed.status] || 'bg-gray-500/15 text-gray-700';

            return (
              <li
                key={lic.id}
                className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-3 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-[var(--foreground)]">
                    {lic.license_name}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>
                {lic.license_number && (
                  <div className="text-[11px] font-medium text-[var(--toss-gray-4)]">
                    면허번호:{' '}
                    <span className="font-semibold text-[var(--foreground)]">
                      {lic.license_number}
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap gap-x-2 text-[10px] text-[var(--toss-gray-4)] border-t border-[var(--border)] pt-1.5 mt-0.5">
                  {lic.issued_date && <span>발급: {lic.issued_date}</span>}
                  {lic.renewed_date && <span>· 갱신: {lic.renewed_date}</span>}
                  {computed.effective.date && (
                    <span className="font-semibold text-[var(--foreground)]">
                      · 만료: {computed.effective.date}
                    </span>
                  )}
                  {lic.issuing_body && <span>· {lic.issuing_body}</span>}
                </div>
                {lic.memo && (
                  <div className="text-[10px] italic text-[var(--toss-gray-4)] bg-[var(--muted)]/50 px-2 py-1 rounded-[var(--radius-sm)] mt-1">
                    {lic.memo}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--toss-gray-4)]">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[12px] font-semibold text-[var(--foreground)]">
        {value}
      </dd>
    </div>
  );
}

type ChipTone = 'success' | 'warn' | 'accent' | 'muted';
const CHIP_CLS: Record<ChipTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  warn: 'bg-amber-500/15 text-amber-700',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]' };
function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CHIP_CLS[tone]}`}>
      {children}
    </span>
  );
}
