'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SmartDatePicker from '../공통/SmartDatePicker';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';
import { getScopedActiveStaffs } from '@/lib/active-staff';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
import type { StaffMember } from '@/types';

const ORDER_TYPES = ['승진', '전보(부서이동)', '퇴직/면직'] as const;

/**
 * personnel_appointments.status 값.
 *
 * - '대기'     : staff_members 에 아직 반영되지 않은 발령 (미래 발령 예약분 포함)
 * - '발령완료' : staff_members 반영이 끝난 발령 (D1 스키마 default 값)
 *
 * 판정은 "'대기' 가 아니면 반영 완료". status 가 null 인 과거 행은 스키마 default 로
 * 들어간 것이므로 미반영으로 오표시하면 안 된다.
 */
const PENDING_STATUS = '대기';
const APPLIED_STATUS = '발령완료';

function isAppliedAppointment(status: string | null | undefined): boolean {
  return (status ?? '').trim() !== PENDING_STATUS;
}

/**
 * 퇴직·면직 계열 발령인지.
 * 키워드는 모바일 발령필터의 classifyOrderType '퇴직' 버킷과 동일하게 유지할 것.
 */
function isSeparationOrder(orderType: string | null | undefined): boolean {
  const text = (orderType ?? '').trim();
  return text.includes('퇴직') || text.includes('면직') || text.includes('퇴사');
}

/**
 * 퇴직·면직 발령이 즉시 반영될 때 그 직원의 기존 세션을 끊는다.
 *
 * 왜 여기서 직접 못 쓰는가 — `force_logout_at` 은 PRIVILEGED_STAFF_COLUMNS 라
 * (lib/db/auth/policies.ts:185) 범용 /api/d1/mutate 에서 admin 에게만 열려 있다.
 * staffUpdates 에 그냥 얹으면 인사담당자(perms.hr)의 발령이 통째로 거부된다 —
 * 아래에서 변하지 않는 role 을 payload 에서 빼는 이유와 정확히 같은 제약이다.
 *
 * 그래서 값을 서버가 정하는 오프보딩 전용 라우트를 호출한다. 그 경로는
 * hasStaffRecordScope(admin·mso·hr)로 열려 있고, 찍는 값은
 * lib/offboarding-transition.ts:132 finalize 와 **동일한** `new Date().toISOString()` 이다.
 * (finalize 는 resigned_at 을 기존 행 값에서 그대로 가져가므로, 발령이 먼저 써 둔
 *  resigned_at=발령일 이 덮이지 않는다. 그래서 반드시 staff_members 반영 **뒤에** 부른다.)
 *
 * 실패해도 발령 자체는 되돌리지 않는다(구성원 반영은 이미 커밋됐다). 대신 조용히
 * 넘기지 않고 호출부가 경고로 드러낸다 — 세션이 남았다는 사실이 화면에 안 보이면
 * 지금까지와 똑같이 "퇴사자인데 세션이 살아 있는" 상태가 무음으로 쌓인다.
 *
 * @returns 성공이면 null, 실패면 사용자에게 보일 사유
 */
async function revokeSessionsForSeparation(staffId: string): Promise<string | null> {
  try {
    const response = await fetch('/api/staff/offboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'finalize', staffId }) });

    if (response.ok) return null;

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return payload?.error?.trim() || `HTTP ${response.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : '알 수 없는 오류';
  }
}

/** 발령일(YYYY-MM-DD)이 KST 오늘 이후인지 — 미래 발령은 즉시 반영하지 않는다. */
function isFutureEffectiveDate(effectiveDate: string): boolean {
  const value = effectiveDate.trim();
  if (!value) return false;
  // new Date() 로컬 비교는 타임존에 따라 하루가 밀린다 → KST 날짜 문자열 사전순 비교.
  return value > getKoreanTodayString();
}

type AppointmentRecord = {
  id?: string | number;
  staff_id: string;
  staff_name: string;
  company: string;
  order_type: string;
  effective_date: string;
  before_dept?: string | null;
  after_dept?: string | null;
  before_position?: string | null;
  after_position?: string | null;
  before_role?: string | null;
  after_role?: string | null;
  reason?: string | null;
  memo?: string | null;
  status?: string | null;
  issued_by?: string | null;
  issued_at?: string | null;
};

type Props = {
  staffs?: StaffMember[];
  selectedCo?: string;
  user?: StaffMember | Record<string, unknown> | null;
  onHeaderActions?: (node: React.ReactNode) => void;
};

type AppointmentFormState = {
  staff_id: string;
  order_type: (typeof ORDER_TYPES)[number];
  effective_date: string;
  before_dept: string;
  after_dept: string;
  before_position: string;
  after_position: string;
  before_role: string;
  after_role: string;
  reason: string;
  memo: string;
};

export default function PersonnelAppointment({
  staffs = [],
  selectedCo = '전체',
  user = null,
  onHeaderActions }: Props) {
  const [records, setRecords] = useState<AppointmentRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'발령목록' | '관보생성'>('발령목록');
  const [filter, setFilter] = useState('전체');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AppointmentFormState>({
    staff_id: '',
    order_type: ORDER_TYPES[0],
    effective_date: '',
    before_dept: '',
    after_dept: '',
    before_position: '',
    after_position: '',
    before_role: '',
    after_role: '',
    reason: '',
    memo: '' });

  // 발령 등록 대상은 현직 직원만 (퇴사자 제외 — 이미 status=퇴사면 발령 불필요)
  const filteredStaffs = useMemo(() => {
    return getScopedActiveStaffs(staffs, selectedCo);
  }, [selectedCo, staffs]);

  const fetchRecords = useCallback(async () => {
    try {
      let query = db
        .from('personnel_appointments')
        .select('*')
        .order('effective_date', { ascending: false })
        .order('issued_at', { ascending: false });

      if (selectedCo !== '전체') {
        query = query.eq('company', selectedCo);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecords((data ?? []) as AppointmentRecord[]);
    } catch (error) {
      console.error('인사발령 조회 실패:', error);
      toast('인사발령 이력을 불러오지 못했습니다.', 'warning');
      setRecords([]);
    }
  }, [selectedCo]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (filter !== '전체' && record.order_type !== filter) return false;
      return true;
    });
  }, [filter, records]);

  type AppointmentRow = AppointmentRecord & { rowKey: string };
  const tableRows = useMemo<AppointmentRow[]>(() => {
    return filteredRecords.map((record, index) => ({
      ...record,
      rowKey: record.id != null ? String(record.id) : `idx-${index}` }));
  }, [filteredRecords]);

  const columns = useMemo<Column<AppointmentRow>[]>(() => [
    {
      key: 'staff_name',
      label: '직원',
      primary: true,
      render: (r) => <span className="font-bold text-[var(--foreground)]">{r.staff_name}</span> },
    {
      key: 'order_type',
      label: '유형',
      render: (r) => (
        <span className="rounded-lg bg-blue-500/10 px-2 py-1 font-bold text-blue-700">
          {r.order_type}
        </span>
      ) },
    {
      key: 'change',
      label: '변경 내용',
      render: (r) => (
        <span className="text-[var(--toss-gray-4)]">
          {(r.before_dept || r.after_dept) && (
            <span>
              {r.before_dept || '-'} →{' '}
              <strong className="text-[var(--foreground)]">
                {r.after_dept || r.before_dept || '-'}
              </strong>
            </span>
          )}
          {(r.before_position || r.after_position) && (
            <span className="ml-2">
              {r.before_position || '-'} →{' '}
              <strong className="text-[var(--foreground)]">
                {r.after_position || r.before_position || '-'}
              </strong>
            </span>
          )}
        </span>
      ) },
    {
      key: 'effective_date',
      label: '발령일',
      render: (r) => <span className="text-[var(--toss-gray-4)]">{r.effective_date}</span> },
    {
      key: 'apply_state',
      label: '반영 상태',
      render: (r) => {
        // 발령 이력이 있어도 구성원 정보에 들어갔는지는 별개 — 목록에서 바로 보이게 한다.
        if (isAppliedAppointment(r.status)) {
          return (
            <span className="rounded-lg bg-emerald-500/10 px-2 py-1 font-bold text-emerald-700">
              반영 완료
            </span>
          );
        }
        if (isFutureEffectiveDate(r.effective_date || '')) {
          return (
            <span className="rounded-lg bg-amber-500/10 px-2 py-1 font-bold text-amber-700">
              {r.effective_date} 반영 예정
            </span>
          );
        }
        // 발령일이 지났는데도 '대기' — 자동 반영 스케줄러가 없어 수동 확인이 필요한 상태.
        return (
          <span className="rounded-lg bg-red-500/10 px-2 py-1 font-bold text-red-700">미반영</span>
        );
      } },
    {
      key: 'reason',
      label: '사유',
      render: (r) => <span className="text-[var(--toss-gray-4)]">{r.reason || '-'}</span> },
  ], []);

  const resetForm = () => {
    setForm({
      staff_id: '',
      order_type: ORDER_TYPES[0],
      effective_date: '',
      before_dept: '',
      after_dept: '',
      before_position: '',
      after_position: '',
      before_role: '',
      after_role: '',
      reason: '',
      memo: '' });
  };

  const handleStaffSelect = (staffId: string) => {
    const staff = filteredStaffs.find((item) => String(item.id) === staffId);
    if (!staff) {
      setForm((prev) => ({ ...prev, staff_id: staffId }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      staff_id: staffId,
      before_dept: staff.department || '',
      before_position: staff.position || '',
      before_role: staff.role || '' }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const staff = filteredStaffs.find((item) => String(item.id) === form.staff_id);
    if (!staff) {
      toast('직원을 선택해주세요.', 'warning');
      return;
    }

    if (!form.effective_date) {
      toast('발령일을 선택해주세요.', 'warning');
      return;
    }

    // SmartDatePicker 는 입력 도중 'YYYY-MM' 같은 부분 문자열도 그대로 올려보낸다.
    // 발령일 도래 판정을 날짜 문자열 비교로 하므로 완전한 형식이 아니면 즉시 막는다.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.effective_date.trim())) {
      toast('발령일을 YYYY-MM-DD 형식으로 모두 입력해주세요.', 'warning');
      return;
    }

    // 발령일이 오늘(KST) 이후면 이력만 남기고 staff_members 는 건드리지 않는다.
    // 기존 구현은 발령일을 무시하고 즉시 갱신해 미래 발령이 오늘 적용되는 문제가 있었다.
    const isReserved = isFutureEffectiveDate(form.effective_date);
    const separation = isSeparationOrder(form.order_type);

    setSaving(true);
    const actor = readClientAuditActor();

    try {
      const newRecord: AppointmentRecord = {
        staff_id: String(staff.id),
        staff_name: staff.name,
        company: staff.company,
        order_type: form.order_type,
        effective_date: form.effective_date,
        before_dept: form.before_dept || '',
        after_dept: form.after_dept || '',
        before_position: form.before_position || '',
        after_position: form.after_position || '',
        before_role: form.before_role || '',
        after_role: form.after_role || '',
        reason: form.reason.trim(),
        memo: form.memo.trim(),
        // 일단 '대기'로 저장하고 staff_members 반영이 끝난 뒤에만 '발령완료'로 승격한다.
        // 중간에 실패하면 '대기'로 남아 목록에 '미반영'으로 드러난다(무음 실패 방지).
        status: PENDING_STATUS,
        issued_by:
          typeof user?.name === 'string'
            ? user.name
            : typeof (user as Record<string, unknown> | null)?.['name'] === 'string'
              ? ((user as Record<string, unknown>).name as string)
              : '관리자',
        issued_at: new Date().toISOString() };

      const { data, error } = await db
        .from('personnel_appointments')
        .insert([newRecord])
        .select()
        .single();

      if (error || !data) {
        throw error || new Error('인사발령 저장 응답이 비어 있습니다.');
      }

      // 발령일이 도래한 발령만 구성원 정보에 반영한다.
      //   - 값이 실제로 바뀔 때만 payload 에 담는다. 특히 `role` 은 PRIVILEGED_STAFF_COLUMNS 라
      //     admin 만 쓸 수 있어(lib/db/auth/policies.ts staffPrivilegeGuard), 변하지도 않는 role 을
      //     같이 보내면 인사담당자(perms.hr)의 발령이 통째로 거부된다.
      //   - 퇴직·면직 발령은 status/resigned_at 까지 반영. 값은 구성원현황의 퇴사 처리
      //     (구성원현황.tsx 직원삭제)와 동일하게 status='퇴사', resigned_at=발령일.
      //   - role='inactive' / 세션 회수(force_logout_at)는 이 payload 에 담을 수 없다.
      //     둘 다 PRIVILEGED_STAFF_COLUMNS 라 인사담당자의 발령이 통째로 거부되기 때문.
      //     반영이 끝난 뒤 revokeSessionsForSeparation() 이 오프보딩 라우트로 처리한다.
      const pickChanged = (next: string, prev: string): string | null => {
        const trimmed = next.trim();
        if (!trimmed || trimmed === prev.trim()) return null;
        return trimmed;
      };

      const staffUpdates: Record<string, unknown> = {};
      if (!isReserved) {
        const nextDept = pickChanged(form.after_dept, form.before_dept);
        if (nextDept) staffUpdates.department = nextDept;
        const nextPosition = pickChanged(form.after_position, form.before_position);
        if (nextPosition) staffUpdates.position = nextPosition;
        const nextRole = pickChanged(form.after_role, form.before_role);
        if (nextRole) staffUpdates.role = nextRole;
        if (separation) {
          staffUpdates.status = '퇴사';
          staffUpdates.resigned_at = form.effective_date;
        }
      }

      if (Object.keys(staffUpdates).length > 0) {
        // update() 는 실패해도 reject 하지 않고 { error } 로 resolve 한다(lib/db-client.ts).
        const { error: staffUpdateError } = await db
          .from('staff_members')
          .update(staffUpdates)
          .eq('id', form.staff_id);

        if (staffUpdateError) {
          throw staffUpdateError;
        }
      }

      // 퇴사가 실제로 반영된 발령만 세션을 회수한다(예약 발령은 아직 재직 중).
      // 실패는 발령을 되돌리지 않고 아래 토스트로 드러낸다.
      let sessionRevokeError: string | null = null;
      if (separation && !isReserved) {
        sessionRevokeError = await revokeSessionsForSeparation(String(staff.id));
        if (sessionRevokeError) {
          console.error('퇴직 발령 세션 회수 실패:', sessionRevokeError);
        }
      }

      // 반영이 끝난 뒤에만 '발령완료'로 승격 (예약 발령은 '대기' 유지)
      if (!isReserved) {
        const { error: statusError } = await db
          .from('personnel_appointments')
          .update({ status: APPLIED_STATUS })
          .eq('id', String(data.id));

        if (statusError) {
          throw statusError;
        }
      }

      await logAudit(
        '인사발령등록',
        'staff_member',
        String(staff.id),
        {
          appointment_id: data.id,
          order_type: newRecord.order_type,
          effective_date: newRecord.effective_date,
          // 미래 발령은 이력만 저장된 상태 — 감사로그에서도 반영 여부를 구분할 수 있어야 한다.
          applied_to_staff: !isReserved,
          separation,
          // 퇴사 반영 발령만 세션 회수 결과를 남긴다(예약·비퇴사 발령은 null).
          session_revoked: separation && !isReserved ? !sessionRevokeError : null,
          session_revoke_error: sessionRevokeError,
          ...buildAuditDiff(
            {
              department: form.before_dept || null,
              position: form.before_position || null,
              role: form.before_role || null },
            {
              department: form.after_dept || form.before_dept || null,
              position: form.after_position || form.before_position || null,
              role: form.after_role || form.before_role || null },
            ['department', 'position', 'role'],
          ),
          reason: newRecord.reason || null,
          memo: newRecord.memo || null },
        actor.userId,
        actor.userName,
      );

      setRecords((prev) => [
        { ...(data as AppointmentRecord), status: isReserved ? PENDING_STATUS : APPLIED_STATUS },
        ...prev,
      ]);
      if (sessionRevokeError) {
        // 발령·구성원 반영은 성공했고 세션 회수만 실패한 상태 — 남은 할 일을 문구로 지목한다.
        toast(
          `인사발령은 반영되었지만 기존 세션 회수에 실패했습니다(${sessionRevokeError}). `
          + '오프보딩 탭에서 퇴사 확정을 다시 실행해 주세요.',
          'warning',
        );
      } else {
        toast(
          isReserved
            ? `인사발령이 저장되었습니다. ${form.effective_date}에 반영 예정입니다.`
            : '인사발령이 저장되고 구성원 정보에 반영되었습니다.',
          'success',
        );
      }
      setShowForm(false);
      resetForm();
      fetchRecords();
    } catch (error) {
      console.error('personnel_appointments insert failed:', error);
      toast('인사발령 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateGazette = async () => {
    const now = new Date();
    const currentMonthRecords = filteredRecords.filter((record) => {
      const effectiveDate = new Date(record.effective_date);
      return (
        effectiveDate.getFullYear() === now.getFullYear() &&
        effectiveDate.getMonth() === now.getMonth()
      );
    });

    if (currentMonthRecords.length === 0) {
      toast('이번 달 발령 내역이 없습니다.', 'warning');
      return;
    }

    const lines = currentMonthRecords.map((record, index) => {
      const beforeDept = record.before_dept || '-';
      const afterDept = record.after_dept || beforeDept;
      const beforePosition = record.before_position ? `(${record.before_position})` : '';
      const afterPosition = record.after_position ? `(${record.after_position})` : '';
      return `${index + 1}. ${record.staff_name} | ${record.order_type} | ${beforeDept}${beforePosition} → ${afterDept}${afterPosition} | 발령일: ${record.effective_date}`;
    });

    const text = `═══ 인사발령 관보 ═══\n발행일: ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}\n\n${lines.join('\n')}\n\n위와 같이 인사발령 합니다.\n${selectedCo === '전체' ? '회사 공통' : selectedCo}`;
    await navigator.clipboard?.writeText(text);
    toast('관보 내용이 클립보드에 복사되었습니다.', 'success');
  };

  // 헤더 액션 버튼을 부모 탭바로 전달 (최신 핸들러 참조용 ref)
  const generateGazetteRef = useRef(generateGazette);
  generateGazetteRef.current = generateGazette;

  useEffect(() => {
    onHeaderActions?.(
      <>
        <button
          type="button"
          onClick={() => generateGazetteRef.current()}
          className="rounded-xl bg-[var(--foreground)] px-4 py-2.5 text-[11px] font-bold text-[var(--card)] shadow-md transition-opacity hover:opacity-90"
        >
          관보 생성
        </button>
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-[11px] font-bold text-white shadow-md transition-opacity hover:opacity-90"
        >
          {showForm ? '등록 닫기' : '+ 발령 등록'}
        </button>
      </>
    );
    return () => onHeaderActions?.(null);
  }, [showForm, selectedCo, onHeaderActions]);

  return (
    <div className="flex h-full flex-col animate-in fade-in duration-300">
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] px-4 md:px-5">
        <div className="flex gap-1">
          {(['발령목록', '관보생성'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-5 py-3 text-[11px] font-bold transition-all ${
                activeTab === tab
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--toss-gray-3)]'
              }`}
            >
              {tab === '발령목록' ? '발령 이력' : '관보/공지'}
            </button>
          ))}
        </div>
      </header>

      <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto bg-[var(--page-bg)] p-4 md:p-5">
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
          >
            <h3 className="text-sm font-bold text-[var(--foreground)]">인사발령 등록</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label htmlFor="order-staff-select" className="sr-only">직원 선택</label>
                <select
                  id="order-staff-select"
                  aria-required="true"
                  value={form.staff_id}
                  onChange={(event) => handleStaffSelect(event.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] outline-none"
                  required
                >
                  <option value="">직원 선택</option>
                  {filteredStaffs.map((staff) => (
                    <option key={staff.id} value={String(staff.id)}>
                      {staff.name} ({staff.department || '부서 미지정'} · {staff.position || '직급 미지정'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="order-type-select" className="sr-only">발령 유형</label>
                <select
                  id="order-type-select"
                  value={form.order_type}
                  onChange={(event) => setForm((prev) => ({ ...prev, order_type: event.target.value as typeof ORDER_TYPES[number] }))}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] outline-none"
                >
                  {ORDER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="sr-only">발령 일자</span>
                <SmartDatePicker
                  value={form.effective_date}
                  onChange={(value) => setForm((prev) => ({ ...prev, effective_date: value }))}
                  inputClassName="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] outline-none"
                />
                {/* 미래 발령은 등록해도 구성원 정보가 아직 바뀌지 않는다 — 등록 전에 알린다. */}
                {isFutureEffectiveDate(form.effective_date) && (
                  <p role="status" className="mt-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[10px] font-bold leading-relaxed text-amber-700">
                    발령일이 아직 오지 않았습니다. 이력만 저장되고 구성원 정보는 발령일에 반영됩니다.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border)] bg-[var(--tab-bg)] p-4 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <label htmlFor="order-before-dept" className="mb-1 block text-[9px] font-bold text-[var(--toss-gray-4)]">현재 부서</label>
                <input
                  id="order-before-dept"
                  value={form.before_dept}
                  readOnly
                  className="w-full rounded-lg bg-[var(--tab-bg)] px-2 py-2 text-[11px] font-bold text-[var(--toss-gray-4)]"
                />
              </div>
              <div>
                <label htmlFor="order-after-dept" className="mb-1 block text-[9px] font-bold text-[var(--accent)]">변경 부서</label>
                <input
                  id="order-after-dept"
                  value={form.after_dept}
                  onChange={(event) => setForm((prev) => ({ ...prev, after_dept: event.target.value }))}
                  placeholder="변경 부서"
                  className="w-full rounded-lg border border-[var(--accent)]/30 bg-blue-500/10/30 px-2 py-2 text-[11px] font-bold text-[var(--foreground)] outline-none"
                />
              </div>
              <div>
                <label htmlFor="order-before-position" className="mb-1 block text-[9px] font-bold text-[var(--toss-gray-4)]">현재 직급</label>
                <input
                  id="order-before-position"
                  value={form.before_position}
                  readOnly
                  className="w-full rounded-lg bg-[var(--tab-bg)] px-2 py-2 text-[11px] font-bold text-[var(--toss-gray-4)]"
                />
              </div>
              <div>
                <label htmlFor="order-after-position" className="mb-1 block text-[9px] font-bold text-[var(--accent)]">변경 직급</label>
                <input
                  id="order-after-position"
                  value={form.after_position}
                  onChange={(event) => setForm((prev) => ({ ...prev, after_position: event.target.value }))}
                  placeholder="변경 직급"
                  className="w-full rounded-lg border border-[var(--accent)]/30 bg-blue-500/10/30 px-2 py-2 text-[11px] font-bold text-[var(--foreground)] outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="order-reason" className="sr-only">발령 사유</label>
                <input
                  id="order-reason"
                  type="text"
                  value={form.reason}
                  onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                  placeholder="발령 사유"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]"
                />
              </div>
              <div>
                <label htmlFor="order-memo" className="sr-only">비고</label>
                <input
                  id="order-memo"
                  type="text"
                  value={form.memo}
                  onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
                  placeholder="비고"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-[11px] font-bold text-white shadow-md disabled:opacity-50"
              >
                {saving ? '저장 중...' : '발령 등록'}
              </button>
            </div>
          </form>
        )}

        <div className="w-fit overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
          <div className="flex gap-1">
            {['전체', ...ORDER_TYPES].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${
                  filter === item
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--toss-gray-3)]'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {activeTab === '발령목록' && (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-sm">
            <ResponsiveTable<AppointmentRow>
              columns={columns}
              rows={tableRows}
              keyField="rowKey"
              emptyMessage="발령 이력이 없습니다."
            />
          </div>
        )}

        {activeTab === '관보생성' && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--foreground)]">이번 달 인사발령 관보</h3>
              <button
                type="button"
                onClick={generateGazette}
                className="rounded-xl bg-[var(--foreground)] px-4 py-2 text-[10px] font-bold text-[var(--card)]"
              >
                클립보드 복사
              </button>
            </div>
            <div className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--tab-bg)] p-4 font-mono text-[11px] leading-relaxed text-[var(--foreground)]">
              <p className="mb-4 border-b border-[var(--border)] pb-3 text-center text-lg font-bold">
                ═══ 인사발령 관보 ═══
              </p>
              <p className="mb-4 text-[10px] text-[var(--toss-gray-3)]">
                발행일: {new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
              </p>
              {filteredRecords.length === 0 ? (
                <p className="py-5 text-center text-[var(--toss-gray-3)]">이번 달 발령 내역이 없습니다.</p>
              ) : (
                filteredRecords.map((record, index) => (
                  <div key={record.id} className="border-b border-[var(--border-subtle)] py-2 last:border-0">
                    <span className="text-[var(--toss-gray-3)]">{index + 1}.</span>{' '}
                    <strong>{record.staff_name}</strong> | {record.order_type} |{' '}
                    {record.before_dept || '-'}
                    {record.before_position ? `(${record.before_position})` : ''} →{' '}
                    {record.after_dept || record.before_dept || '-'}
                    {record.after_position ? `(${record.after_position})` : ''} | {record.effective_date}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
