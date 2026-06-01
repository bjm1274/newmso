/**
 * MemberWorkcenter — 데이터 헬퍼 / 타입 / KPI 집계
 *
 * 단일 책임: 직원 목록 가공·집계 로직만. UI 코드는 포함하지 않음.
 *
 * JM4: any 금지. StaffMember에 없는 한글 필드는 명시적 인덱스 접근으로만 처리.
 */

import type { StaffMember } from '@/types';
import type { WorkcenterKpi } from '../workcenter-common';

// ─── 부서·고용 분류 ──────────────────────────────────────────────
export type EmployTone = 'success' | 'warn' | 'muted' | 'accent';

const TONE_PALETTE: ReadonlyArray<EmployTone> = ['success', 'accent', 'warn', 'muted'];

/** 직원명 첫 글자를 시드로 일관된 톤 배정 */
export function pickToneForStaff(name: string): EmployTone {
  if (!name) return 'muted';
  const code = name.charCodeAt(0);
  return TONE_PALETTE[code % TONE_PALETTE.length] ?? 'muted';
}

/** ISO 날짜를 YYYY.M.D 형식으로 변환 (불가 시 원본) */
export function formatJoinDate(iso?: string | null): string {
  if (!iso) return '-';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return `${parsed.getFullYear()}.${parsed.getMonth() + 1}.${parsed.getDate()}`;
}

/** 입사일 → 근속(년, 소수1자리)을 사람 친화 텍스트로 */
export function formatTenure(iso?: string | null, now = Date.now()): string {
  if (!iso) return '-';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '-';
  const years = (now - parsed) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 0) return '-';
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12));
    return `${months}개월`;
  }
  return `${years.toFixed(1)}년`;
}

/** 재직자 여부 (퇴사 외 모두 active 로 간주) */
export function isActive(staff: StaffMember): boolean {
  return String(staff.status ?? '').trim() !== '퇴사';
}

/** 입사일을 안전하게 추출 (hire_date 우선, joined_at 보조) */
export function pickHireDate(staff: StaffMember): string | null {
  if (staff.hire_date) return staff.hire_date;
  const joined = (staff as Record<string, unknown>).joined_at;
  return typeof joined === 'string' ? joined : null;
}

/** 부서별 직원 수 집계 — 빈 부서는 "미지정"으로 묶음 */
export interface DepartmentCount {
  key: string;
  label: string;
  count: number;
}

export function aggregateDepartments(staffs: StaffMember[]): DepartmentCount[] {
  const counts = new Map<string, number>();
  for (const staff of staffs) {
    const dept = (staff.department ?? '').trim() || '미지정';
    counts.set(dept, (counts.get(dept) ?? 0) + 1);
  }
  const result: DepartmentCount[] = [];
  for (const [label, count] of counts) {
    result.push({ key: label, label, count });
  }
  result.sort((a, b) => b.count - a.count);
  return result;
}

// ─── KPI 집계 ───────────────────────────────────────────────────
export interface MemberKpiInput {
  staffs: StaffMember[];
  selectedCo?: string;
  now?: number;
}

/**
 * 4개 KPI: 전체 인원 / 신규 입사 (3개월) / 퇴사 예정 (60일) / 평균 근속
 *
 * 퇴사 예정은 resign_date가 60일 이내인 직원 (없으면 0)
 */
export function computeMemberKpis({ staffs, selectedCo, now = Date.now() }: MemberKpiInput): WorkcenterKpi[] {
  const active = staffs.filter(isActive);
  const total = active.length;
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
  const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;
  const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

  const newcomers = active.filter((staff) => {
    const hire = pickHireDate(staff);
    if (!hire) return false;
    const parsed = Date.parse(hire);
    return Number.isFinite(parsed) && now - parsed < NINETY_DAYS;
  });

  const upcoming = active.filter((staff) => {
    if (!staff.resign_date) return false;
    const parsed = Date.parse(staff.resign_date);
    if (!Number.isFinite(parsed)) return false;
    const diff = parsed - now;
    return diff >= 0 && diff < SIXTY_DAYS;
  });

  const tenureYears = active
    .map((staff) => {
      const hire = pickHireDate(staff);
      if (!hire) return null;
      const parsed = Date.parse(hire);
      if (!Number.isFinite(parsed)) return null;
      return (now - parsed) / YEAR_MS;
    })
    .filter((v): v is number => v !== null);

  const avgTenure = tenureYears.length
    ? (tenureYears.reduce((a, b) => a + b, 0) / tenureYears.length).toFixed(1)
    : '-';

  const newSub = newcomers
    .slice(0, 2)
    .map((s) => s.name)
    .filter(Boolean)
    .join(' · ');

  // 고용 유형 집계 (reference §706 "정규 N · 계약 M · 수습 K")
  const employTypeCounts: { 정규: number; 계약: number; 수습: number; 기타: number } = {
    정규: 0,
    계약: 0,
    수습: 0,
    기타: 0,
  };
  for (const s of active) {
    const raw = String((s as Record<string, unknown>).employment_type ?? '').trim();
    if (raw.includes('정규')) employTypeCounts.정규 += 1;
    else if (raw.includes('계약')) employTypeCounts.계약 += 1;
    else if (raw.includes('수습')) employTypeCounts.수습 += 1;
    else if (raw === '') employTypeCounts.정규 += 1; // 미지정은 정규로 간주
    else employTypeCounts.기타 += 1;
  }
  const employSubParts: string[] = [];
  if (employTypeCounts.정규 > 0) employSubParts.push(`정규 ${employTypeCounts.정규}`);
  if (employTypeCounts.계약 > 0) employSubParts.push(`계약 ${employTypeCounts.계약}`);
  if (employTypeCounts.수습 > 0) employSubParts.push(`수습 ${employTypeCounts.수습}`);
  if (employTypeCounts.기타 > 0) employSubParts.push(`기타 ${employTypeCounts.기타}`);
  const employSub = employSubParts.length > 0 ? employSubParts.join(' · ') : '데이터 없음';

  const totalSubPrefix = selectedCo && selectedCo !== '전체' ? `${selectedCo} · ` : '';

  return [
    {
      key: 'total',
      label: '전체 인원',
      value: String(total),
      unit: '명',
      sub: `${totalSubPrefix}${employSub}`,
    },
    {
      key: 'new',
      label: '신규 입사 (3개월)',
      value: String(newcomers.length),
      unit: '명',
      sub: newSub || '없음',
      tone: newcomers.length > 0 ? 'accent' : 'neutral',
    },
    {
      key: 'resign',
      label: '퇴사 예정 (60일)',
      value: String(upcoming.length),
      unit: '명',
      sub: upcoming.length === 0 ? '예정 없음' : `${upcoming[0]?.name ?? ''} 외`,
      tone: upcoming.length > 0 ? 'warn' : 'neutral',
    },
    {
      key: 'tenure',
      label: '평균 근속',
      value: String(avgTenure),
      unit: '년',
      sub: '재직자 기준',
    },
  ];
}

// ─── 인사발령 레코드 ──────────────────────────────────────────────
export interface AppointmentRecord {
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
  status?: string | null;
}

/** order_type별 톤 매핑 */
export function appointmentTone(orderType: string): EmployTone {
  if (orderType.includes('승진')) return 'success';
  if (orderType.includes('전보') || orderType.includes('이동')) return 'accent';
  if (orderType.includes('퇴직') || orderType.includes('면직')) return 'warn';
  return 'muted';
}

// ─── 교육 진행 카드 ──────────────────────────────────────────────
export interface EducationProgress {
  name: string;
  target: string;
  due?: string | null;
  completed: number;
  total: number;
  tone: 'success' | 'warn' | 'danger';
}

export function computeEducationTone(completed: number, total: number): 'success' | 'warn' | 'danger' {
  if (total === 0) return 'warn';
  const ratio = completed / total;
  if (ratio >= 0.9) return 'success';
  if (ratio >= 0.6) return 'warn';
  return 'danger';
}
