/**
 * 관리자 워크센터 — 타입 정의 & 상수
 * 26장 → 6 통합 (exec / company / roles / ops / forms / audit)
 *
 * JM4: any 금지, 모든 union/interface 명시
 */

// ─── 6 워크센터 ID ────────────────────────────────────────
export type AdminWorkcenterId = 'exec' | 'company' | 'roles' | 'ops' | 'forms' | 'audit';

export interface AdminWorkcenterMeta {
  id: AdminWorkcenterId;
  label: string;
  mergedCount: number;
  mergedTitles: string[];
  primary?: boolean;
}

export const ADMIN_WORKCENTERS: Record<AdminWorkcenterId, AdminWorkcenterMeta> = {
  exec: {
    id: 'exec',
    label: '경영 대시보드',
    mergedCount: 7,
    mergedTitles: ['경영 대시보드', '재무 대시보드', '예산 관리', '통합 보고서', '법인 손익', '경영 분석 a', '경영 분석 b'],
    primary: true },
  company: {
    id: 'company',
    label: '회사 관리',
    mergedCount: 7,
    mergedTitles: ['기본정보', '근무형태', '법인카드', '계약 템플릿', '휴가·공휴일', '급여 기준', '문서 보관'] },
  roles: {
    id: 'roles',
    label: '권한 관리',
    mergedCount: 1,
    mergedTitles: ['직원 권한'] },
  ops: {
    id: 'ops',
    label: '운영 설정',
    mergedCount: 5,
    mergedTitles: ['운영 설정', '템플릿 a', '템플릿 b', '템플릿 c', '팝업 관리'] },
  forms: {
    id: 'forms',
    label: '결재 양식',
    mergedCount: 2,
    mergedTitles: ['양식 관리', '양식 편집'] },
  audit: {
    id: 'audit',
    label: '감사·백업',
    mergedCount: 4,
    mergedTitles: ['감사센터 a', '감사센터 b', '백업·복원', '급여 이상치 검사'] } };

// ─── 권한 매트릭스 값 union (JM4) ───────────────────────
export type RolePermissionValue = '전체' | '부서' | '본인' | '요청' | null;

export interface RolePermissionRow {
  role: string;
  perms: RolePermissionValue[];
}

// ─── 칩 톤 ───────────────────────────────────────────────
export type ChipTone = 'success' | 'warn' | 'danger' | 'accent' | 'muted';

// ─── 결재 양식 카드 ─────────────────────────────────────
export type FormStatus = '활성' | '권한 필요' | '초안' | '보류';

export interface AdminFormCard {
  name: string;
  group: string;
  version: string;
  usageCount: number;
  status: FormStatus;
}

// ─── 백업 row ───────────────────────────────────────────
export interface BackupRow {
  date: string;
  size: string;
  duration: string;
  kind: '자동' | '수동';
  tone: ChipTone;
}

// ─── 감사로그 row ───────────────────────────────────────
export type AuditResult = '성공' | '실패';

export interface AuditLogRow {
  time: string;
  who: string;
  action: string;
  target: string;
  ip: string;
  status: AuditResult;
}

// ─── KPI 카드 ───────────────────────────────────────────
export interface AdminKpi {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: ChipTone;
}

// ─── 칩 톤 → Tailwind 매핑 (공통 사용) ──────────────────
export function chipClass(tone: ChipTone): string {
  switch (tone) {
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60';
    case 'warn':
      return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60';
    case 'danger':
      return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60';
    case 'accent':
      return 'bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30';
    case 'muted':
    default:
      return 'bg-[var(--muted)] text-[var(--toss-gray-4)] border border-[var(--border)]';
  }
}

// ─── 권한 값 → 톤 매핑 ──────────────────────────────────
export function permissionTone(value: RolePermissionValue): ChipTone {
  if (value === '전체') return 'success';
  if (value === '부서') return 'accent';
  if (value === '본인') return 'warn';
  if (value === '요청') return 'danger';
  return 'muted';
}

export function permissionLabel(value: RolePermissionValue): string {
  return value ?? '-';
}
