/* eslint-disable react-hooks/rules-of-hooks */
'use client';

/**
 * 발령탭 — 모바일 인사관리: 구성원 화면의 '인사발령' segment 본체.
 *
 * 책임:
 *   - 회사 단위 staff_appointments fetch (1년치 ~200건 상한)
 *   - 기간/종류/부서/검색 client filter 상태 보관
 *   - 결과 카드 리스트 렌더
 *   - 모바일 인사발령 등록 기능 (PC 버전과 정합성 일치)
 *   - 발령일이 도래한 발령을 staff_members 에 실제 반영 (PC 인사발령관리와 동일 규칙)
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';
import type { StaffMember, ErpUser } from '@/types';
import { getKoreanTodayString } from '@/lib/seoul-time';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MIcon from '../공통/MIcon';
import { MField } from './form-helpers'; // 모바일용 간이 필드 스타일 재사용
import 발령필터, {
  classifyOrderType,
  rangeCutoffISO,
  type AppointmentKind,
  type AppointmentRange } from './발령필터';

export type AppointmentRow = {
  id: string;
  effective_date: string | null;
  order_type: string | null;
  staff_name: string | null;
  before_dept: string | null;
  after_dept: string | null;
  before_position: string | null;
  after_position: string | null;
  before_role?: string | null;
  after_role?: string | null;
  reason?: string | null;
  memo?: string | null;
  status?: string | null;
};

const ORDER_TYPES = ['승진', '전보(부서이동)', '퇴직/면직'] as const;

/**
 * personnel_appointments.status 값.
 *
 * - '대기'     : 아직 staff_members 에 반영되지 않은 발령 (미래 발령 예약 포함)
 * - '발령완료' : staff_members 반영이 끝난 발령 (D1 스키마 default 값이기도 하다)
 *
 * 판정은 "'대기' 가 아니면 반영 완료"로 한다. status 가 null 인 과거 데이터는
 * 스키마 default('발령완료')로 들어간 행이므로 미반영으로 오표시하면 안 된다.
 */
const PENDING_STATUS = '대기';
const APPLIED_STATUS = '발령완료';

function isAppliedAppointment(status: string | null | undefined): boolean {
  return (status ?? '').trim() !== PENDING_STATUS;
}

/**
 * 'YYYY.MM.DD' 텍스트 입력을 'YYYY-MM-DD' 로 정규화.
 *
 * 발령일 비교는 KST 날짜 문자열의 사전순 비교로 하기 때문에(= new Date() 로컬 비교 금지)
 * 구분자를 먼저 통일해야 한다. 형식이 어긋나면 null 을 돌려 호출부가 재입력을 요구한다.
 */
function toIsoDateKey(raw: string): string | null {
  const normalized = raw.trim().replaceAll('.', '-').replaceAll('/', '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

/** 퇴직·면직 계열 발령인지 — 분류는 발령필터의 classifyOrderType 재사용(키워드 중복 정의 방지). */
function isSeparationOrder(orderType: string | null): boolean {
  return classifyOrderType(orderType) === '퇴직';
}

/** 발령 카드에 붙일 반영 상태 배지. today 는 KST 기준 'YYYY-MM-DD'. */
function pickApplyBadge(
  row: AppointmentRow,
  today: string,
): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (isAppliedAppointment(row.status)) return { label: '반영 완료', tone: 'success' };
  // 아직 미반영. 발령일이 남았으면 '예정', 이미 지났으면 자동 반영 스케줄러가 없으므로 '미반영'.
  if (row.effective_date && row.effective_date > today) {
    return { label: '반영 예정', tone: 'warning' };
  }
  return { label: '미반영', tone: 'danger' };
}

function pickAppointmentTone(
  orderType: string | null,
): '' | 'accent' | 'success' | 'warning' | 'danger' {
  const kind = classifyOrderType(orderType);
  if (kind === '승진') return 'success';
  if (kind === '신규채용' || kind === '복직') return 'accent';
  if (kind === '부서이동' || kind === '직급변경') return 'accent';
  if (kind === '휴직') return 'warning';
  if (kind === '퇴직') return 'danger';
  return '';
}

/**
 * 발령 내용을 staff_members 에 실제 반영한다 (발령일이 도래한 발령에서만 호출할 것).
 *
 * PC(인사발령관리.tsx)와 동일한 규칙:
 *   - 값이 실제로 바뀔 때만 payload 에 담는다. 특히 `role` 은 PRIVILEGED_STAFF_COLUMNS 라
 *     admin 만 쓸 수 있어(lib/db/auth/policies.ts staffPrivilegeGuard), 변하지도 않는 role 을
 *     같이 보내면 인사담당자(perms.hr)의 발령이 통째로 거부된다.
 *   - 퇴직·면직 발령은 status/resigned_at 까지 반영. 값은 구성원현황의 퇴사 처리
 *     (구성원현황.tsx 직원삭제 / StaffDrawer 퇴사 처리)와 동일하게 status='퇴사',
 *     resigned_at=발령일. role='inactive' 나 세션 강제 로그아웃 같은 계정 회수는
 *     오프보딩 완료 플로우의 책임이라 발령만으로는 건드리지 않는다.
 *   - db.from().update() 는 실패해도 reject 하지 않고 { error } 로 resolve 한다(lib/db-client.ts).
 *     반드시 throw 해서 성공 토스트가 뜨지 않도록 한다.
 */
async function applyAppointmentToStaff(params: {
  appointmentId: string;
  staffId: string;
  effectiveDate: string;
  separation: boolean;
  before: { department: string | null; position: string | null; role: string | null };
  after: { department: string | null; position: string | null; role: string | null };
}) {
  const { appointmentId, staffId, effectiveDate, separation, before, after } = params;

  const pickChanged = (next: string | null, prev: string | null): string | null => {
    const trimmed = (next ?? '').trim();
    if (!trimmed || trimmed === (prev ?? '').trim()) return null;
    return trimmed;
  };

  const staffUpdates: Record<string, unknown> = {};
  const nextDept = pickChanged(after.department, before.department);
  if (nextDept) staffUpdates.department = nextDept;
  const nextPosition = pickChanged(after.position, before.position);
  if (nextPosition) staffUpdates.position = nextPosition;
  const nextRole = pickChanged(after.role, before.role);
  if (nextRole) staffUpdates.role = nextRole;
  if (separation) {
    staffUpdates.status = '퇴사';
    staffUpdates.resigned_at = effectiveDate;
  }

  if (Object.keys(staffUpdates).length > 0) {
    const { error } = await db.from('staff_members').update(staffUpdates).eq('id', staffId);
    if (error) throw error;
  }

  if (!appointmentId) return;
  const { error: promoteError } = await db
    .from('personnel_appointments')
    .update({ status: APPLIED_STATUS })
    .eq('id', appointmentId);
  if (promoteError) throw promoteError;
}

interface AppointmentTabProps {
  staffs?: StaffMember[];
  company?: string;
  user?: ErpUser;
}

export default function 발령탭({ staffs = [], company, user }: AppointmentTabProps) {
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<AppointmentRange>('3m');
  const [kinds, setKinds] = useState<ReadonlySet<AppointmentKind>>(() => new Set());
  const [dept, setDept] = useState<string>('전체');
  const [search, setSearch] = useState<string>('');

  // 새 발령 등록 모달 상태
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStaffId, setNewStaffId] = useState('');
  const [newOrderType, setNewOrderType] = useState<typeof ORDER_TYPES[number]>('승진');
  const [newEffectiveDate, setNewEffectiveDate] = useState(getKoreanTodayString().replaceAll('-', '.'));
  const [newAfterDept, setNewAfterDept] = useState('');
  const [newAfterPosition, setNewAfterPosition] = useState('');
  const [newAfterRole, setNewAfterRole] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newMemo, setNewMemo] = useState('');

  // 인사 권한 보유 여부 확인 (PC와 동일)
  const isHrAdmin = useMemo(() => {
    if (!user) return false;
    const perms = (user.permissions ?? {}) as Record<string, unknown>;
    return (
      perms.mso === true ||
      perms.menu_인사관리 === true ||
      user.role === '관리자' ||
      user.role === '매니저'
    );
  }, [user]);

  // 대상자 정보 매칭
  const targetStaff = useMemo(() => staffs.find((s) => String(s.id) === newStaffId) || null, [staffs, newStaffId]);

  // 발령일이 오늘(KST) 이후면 등록 시 구성원 정보를 건드리지 않고 '대기'로만 예약된다.
  // 폼에서 미리 알려 주지 않으면 "등록했는데 왜 안 바뀌지?" 오해가 생긴다.
  const isFutureEffective = useMemo(() => {
    const iso = toIsoDateKey(newEffectiveDate);
    return Boolean(iso && iso > getKoreanTodayString());
  }, [newEffectiveDate]);

  // 1년치 발령 데이터 fetch
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      let q = db
        .from('personnel_appointments')
        .select(
          'id, effective_date, order_type, staff_name, before_dept, after_dept, before_position, after_position, status, company',
        )
        .order('effective_date', { ascending: false })
        .limit(200);
      if (company && company !== '전체') q = q.eq('company', company);
      const { data, error } = await q;
      if (error) throw error;
      setRows(
        ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: String(r.id ?? ''),
          effective_date: typeof r.effective_date === 'string' ? r.effective_date : null,
          order_type: typeof r.order_type === 'string' ? r.order_type : null,
          staff_name: typeof r.staff_name === 'string' ? r.staff_name : null,
          before_dept: typeof r.before_dept === 'string' ? r.before_dept : null,
          after_dept: typeof r.after_dept === 'string' ? r.after_dept : null,
          before_position: typeof r.before_position === 'string' ? r.before_position : null,
          after_position: typeof r.after_position === 'string' ? r.after_position : null,
          status: typeof r.status === 'string' ? r.status : null })),
      );
    } catch (err) {
      console.error('[mobile-hr] appointments load failed', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  // 새 인사발령 생성 등록 동작 (D1 저장 + 발령일 도래 시 staff_members 반영)
  const handleCreateAppointment = async () => {
    if (!newStaffId) {
      toast('발령 대상 직원을 선택해 주세요.', 'warning');
      return;
    }
    const effectiveDate = toIsoDateKey(newEffectiveDate);
    if (!effectiveDate) {
      toast('발령일자를 YYYY.MM.DD 형식으로 입력해 주세요.', 'warning');
      return;
    }

    // 발령일 판정은 반드시 KST 기준. 단말 로컬 타임존(new Date())으로 비교하면
    // 해외 로밍·UTC 서버에서 하루가 밀려 미래 발령이 즉시 반영되는 사고가 난다.
    const applyNow = effectiveDate <= getKoreanTodayString();
    const separation = isSeparationOrder(newOrderType);

    try {
      const insertData = {
        staff_id: newStaffId,
        staff_name: targetStaff?.name || '미지정',
        company: company && company !== '전체' ? company : (targetStaff?.company || '전체'),
        order_type: newOrderType,
        effective_date: effectiveDate,
        before_dept: targetStaff?.department || null,
        after_dept: newAfterDept.trim() || targetStaff?.department || null,
        before_position: targetStaff?.position || null,
        after_position: newAfterPosition.trim() || targetStaff?.position || null,
        before_role: targetStaff?.role || null,
        after_role: newAfterRole.trim() || targetStaff?.role || null,
        reason: newReason.trim() || null,
        memo: newMemo.trim() || null,
        // 일단 '대기'로 넣고 staff_members 반영이 끝난 뒤에만 '발령완료'로 승격한다.
        // 중간에 실패해도 '대기'로 남아 목록에 '미반영'으로 드러난다(무음 실패 방지).
        status: PENDING_STATUS };

      const { data: inserted, error } = await db
        .from('personnel_appointments')
        .insert([insertData])
        .select()
        .single();
      if (error || !inserted) throw error || new Error('인사발령 저장 응답이 비어 있습니다.');

      if (applyNow) {
        await applyAppointmentToStaff({
          appointmentId: String((inserted as Record<string, unknown>).id ?? ''),
          staffId: newStaffId,
          effectiveDate,
          separation,
          before: {
            department: insertData.before_dept,
            position: insertData.before_position,
            role: insertData.before_role },
          after: {
            department: insertData.after_dept,
            position: insertData.after_position,
            role: insertData.after_role } });
      }

      // staff_members 를 건드리는 다른 경로(오프보딩·구성원현황·StaffDrawer)와 동일하게
      // 감사로그를 남긴다. logAudit 은 내부에서 실패를 흡수하므로 등록 흐름을 막지 않는다.
      const actor = readClientAuditActor();
      await logAudit(
        '인사발령등록',
        'staff_member',
        newStaffId,
        {
          appointment_id: (inserted as Record<string, unknown>).id ?? null,
          order_type: insertData.order_type,
          effective_date: effectiveDate,
          applied_to_staff: applyNow,
          separation,
          source: 'mobile',
          ...buildAuditDiff(
            {
              department: insertData.before_dept,
              position: insertData.before_position,
              role: insertData.before_role },
            {
              department: insertData.after_dept,
              position: insertData.after_position,
              role: insertData.after_role },
            ['department', 'position', 'role'],
          ),
          reason: insertData.reason,
          memo: insertData.memo },
        actor.userId,
        actor.userName,
      );

      toast(
        applyNow
          ? '인사발령이 등록되고 구성원 정보에 반영되었습니다.'
          : `인사발령이 등록되었습니다. ${effectiveDate}에 반영 예정입니다.`,
        'success',
      );
      setShowCreateModal(false);
      // 폼 리셋
      setNewStaffId('');
      setNewOrderType('승진');
      setNewEffectiveDate(getKoreanTodayString().replaceAll('-', '.'));
      setNewAfterDept('');
      setNewAfterPosition('');
      setNewAfterRole('');
      setNewReason('');
      setNewMemo('');
      void fetchRecords();
    } catch (err) {
      console.error('[mobile-hr] 발령 등록 오류:', err);
      toast('인사발령 등록에 실패했습니다.', 'error');
    }
  };

  // 부서 옵션
  const deptOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.before_dept) set.add(r.before_dept);
      if (r.after_dept) set.add(r.after_dept);
    }
    return ['전체', ...Array.from(set).sort()];
  }, [rows]);

  // 필터 적용
  const filtered = useMemo(() => {
    const cutoff = rangeCutoffISO(range);
    const needle = search.trim().toLowerCase();
    const kindFilter = kinds.size > 0 ? kinds : null;

    return rows.filter((r) => {
      if (cutoff && r.effective_date && r.effective_date < cutoff) return false;
      if (kindFilter) {
        const k = classifyOrderType(r.order_type);
        if (!kindFilter.has(k)) return false;
      }
      if (dept !== '전체') {
        if (r.before_dept !== dept && r.after_dept !== dept) return false;
      }
      if (needle) {
        const haystack = [
          r.staff_name,
          r.order_type,
          r.before_dept,
          r.after_dept,
          r.before_position,
          r.after_position,
        ]
          .map((s) => (s ?? '').toLowerCase())
          .join(' ');
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, range, kinds, dept, search]);

  const toggleKind = (k: AppointmentKind) => {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const reset = () => {
    setRange('3m');
    setKinds(new Set());
    setDept('전체');
    setSearch('');
  };

  const isFiltered =
    range !== '3m' || kinds.size > 0 || dept !== '전체' || search.trim().length > 0;

  return (
    <div style={{ paddingBottom: 24 }}>
      {isHrAdmin && (
        <div style={{ padding: '14px 16px 0' }}>
          <MBtn variant="primary" icon="plus" block onClick={() => setShowCreateModal(true)}>
            새 인사발령 등록
          </MBtn>
        </div>
      )}

      <발령필터
        range={range}
        onRange={setRange}
        kinds={kinds}
        onToggleKind={toggleKind}
        dept={dept}
        onDept={setDept}
        deptOptions={deptOptions}
        search={search}
        onSearch={setSearch}
        onReset={reset}
        canReset={isFiltered}
      />
      <ResultList rows={filtered} loading={loading} total={rows.length} />

      {/* 새 인사발령 등록 모달 */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="새 인사발령 등록"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end' }}
        >
          <div
            className="animate-in slide-in-from-bottom duration-250 macos-glass macos-squircle"
            style={{
              width: '100%',
              background: 'var(--m-card)',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: '20px 16px 24px',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxSizing: 'border-box' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--z-900)' }}>새 인사발령 등록</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                aria-label="닫기"
              >
                <MIcon name="x" size={20} color="var(--z-500)" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 발령 대상 */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-600)' }}>발령 대상자</span>
                <select
                  value={newStaffId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setNewStaffId(id);
                    const staff = staffs.find((s) => String(s.id) === id);
                    if (staff) {
                      setNewAfterDept(staff.department || '');
                      setNewAfterPosition(staff.position || '');
                      setNewAfterRole(staff.role || '');
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    borderRadius: 10,
                    border: '1px solid var(--m-border)',
                    background: 'var(--m-bg)',
                    color: 'var(--z-900)',
                    marginTop: 4,
                    outline: 'none' }}
                >
                  <option value="">대상 직원 선택</option>
                  {staffs
                    .filter((s) => s.status !== '퇴사')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.department || '부서 없음'} · {s.position || '직급 없음'})
                      </option>
                    ))}
                </select>
              </div>

              {/* 이전 정보 정보 노출 */}
              {targetStaff && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'var(--z-50)',
                    borderRadius: 10,
                    border: '1px solid var(--m-border)',
                    fontSize: 11,
                    color: 'var(--z-600)',
                    lineHeight: 1.5 }}
                >
                  <div>
                    <b>현재 소속:</b> {targetStaff.department || '미지정'}
                  </div>
                  <div>
                    <b>현재 직급:</b> {targetStaff.position || '미지정'}
                  </div>
                  {targetStaff.role && (
                    <div>
                      <b>현재 역할:</b> {targetStaff.role}
                    </div>
                  )}
                </div>
              )}

              {/* 발령 구분 */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-600)' }}>발령 구분</span>
                <select
                  value={newOrderType}
                  onChange={(e) => setNewOrderType(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    borderRadius: 10,
                    border: '1px solid var(--m-border)',
                    background: 'var(--m-bg)',
                    color: 'var(--z-900)',
                    marginTop: 4,
                    outline: 'none' }}
                >
                  {ORDER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* 발령일자 */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-600)' }}>발령일자 (효력발생일)</span>
                <input
                  type="text"
                  value={newEffectiveDate}
                  onChange={(e) => setNewEffectiveDate(e.target.value)}
                  placeholder="YYYY.MM.DD"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    borderRadius: 10,
                    border: '1px solid var(--m-border)',
                    background: 'var(--m-bg)',
                    color: 'var(--z-900)',
                    marginTop: 4,
                    outline: 'none',
                    boxSizing: 'border-box' }}
                />
                {isFutureEffective && (
                  <div
                    role="status"
                    style={{
                      marginTop: 6,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'var(--m-warning-soft, var(--z-50))',
                      color: 'var(--m-warning, var(--z-700))',
                      fontSize: 11,
                      fontWeight: 700,
                      lineHeight: 1.5 }}
                  >
                    발령일이 아직 오지 않았습니다. 지금은 이력만 저장되고 구성원 정보는 발령일에 반영됩니다.
                  </div>
                )}
              </div>

              {/* 변경 후 소속 부서 */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-600)' }}>변경 후 소속</span>
                <input
                  type="text"
                  value={newAfterDept}
                  onChange={(e) => setNewAfterDept(e.target.value)}
                  placeholder="경영지원팀, 외래팀 등"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    borderRadius: 10,
                    border: '1px solid var(--m-border)',
                    background: 'var(--m-bg)',
                    color: 'var(--z-900)',
                    marginTop: 4,
                    outline: 'none',
                    boxSizing: 'border-box' }}
                />
              </div>

              {/* 변경 후 직급 */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-600)' }}>변경 후 직급</span>
                <input
                  type="text"
                  value={newAfterPosition}
                  onChange={(e) => setNewAfterPosition(e.target.value)}
                  placeholder="대리, 과장, 팀장 등"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    borderRadius: 10,
                    border: '1px solid var(--m-border)',
                    background: 'var(--m-bg)',
                    color: 'var(--z-900)',
                    marginTop: 4,
                    outline: 'none',
                    boxSizing: 'border-box' }}
                />
              </div>

              {/* 발령 사유 */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-600)' }}>발령 사유</span>
                <input
                  type="text"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="정기 승진, 직무 순환 등"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    borderRadius: 10,
                    border: '1px solid var(--m-border)',
                    background: 'var(--m-bg)',
                    color: 'var(--z-900)',
                    marginTop: 4,
                    outline: 'none',
                    boxSizing: 'border-box' }}
                />
              </div>

              {/* 비고/메모 */}
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-600)' }}>비고 (메모)</span>
                <input
                  type="text"
                  value={newMemo}
                  onChange={(e) => setNewMemo(e.target.value)}
                  placeholder="추가적인 특이사항 기재"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 14,
                    borderRadius: 10,
                    border: '1px solid var(--m-border)',
                    background: 'var(--m-bg)',
                    color: 'var(--z-900)',
                    marginTop: 4,
                    outline: 'none',
                    boxSizing: 'border-box' }}
                />
              </div>

              {/* 버튼 그룹 */}
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <MBtn
                  block
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: 'var(--z-100)', color: 'var(--z-700)' }}
                >
                  취소
                </MBtn>
                <MBtn variant="primary" block onClick={() => void handleCreateAppointment()}>
                  등록 완료
                </MBtn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultList({
  rows,
  loading,
  total }: {
  rows: AppointmentRow[];
  loading: boolean;
  total: number;
}) {
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
        불러오는 중...
      </div>
    );
  }
  if (total === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
        최근 인사발령이 없습니다.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
        조건에 맞는 발령이 없습니다.
      </div>
    );
  }

  // 반영 여부 판정 기준일은 KST 오늘 (단말 타임존 무관하게 동일한 결과를 보이도록)
  const today = getKoreanTodayString();

  return (
    <div style={{ padding: '12px 16px 0' }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--z-500)',
          fontWeight: 700,
          marginBottom: 6,
          paddingLeft: 4 }}
      >
        {rows.length}건 · 전체 {total}건
      </div>
      {rows.map((r) => {
        const tone = pickAppointmentTone(r.order_type);
        // 발령일 도래 전(또는 반영 실패)인 발령은 구성원 정보에 아직 안 들어가 있다 — 카드에 명시.
        const applyBadge = pickApplyBadge(r, today);
        const before = `${r.before_dept ?? '-'}${
          r.before_position ? ` · ${r.before_position}` : ''
        }`;
        const after = `${r.after_dept ?? '-'}${
          r.after_position ? ` · ${r.after_position}` : ''
        }`;
        return (
          <div key={r.id} className="m-card macos-glass macos-squircle-sm" style={{ marginBottom: 8, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <MChip tone={tone}>{r.order_type ?? '발령'}</MChip>
              <MChip tone={applyBadge.tone}>{applyBadge.label}</MChip>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--z-500)',
                  fontWeight: 600,
                  marginLeft: 'auto' }}
              >
                {r.effective_date ?? '-'}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>
              {r.staff_name ?? '직원'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
              {before} → <b style={{ color: 'var(--z-700)' }}>{after}</b>
            </div>
          </div>
        );
      })}
    </div>
  );
}
