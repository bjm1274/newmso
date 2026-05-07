import type { StaffMember } from '@/types';

// 조직도 내부 데이터 타입
export interface OrgTeam {
  teamName: string;
  members: StaffMember[];
}

export interface OrgDepartment {
  deptName: string;
  heads: StaffMember[];
  teams: OrgTeam[];
}

export interface OrgPyramidData {
  type: 'pyramid';
  companyName?: string;
  director: StaffMember | undefined;
  departments: OrgDepartment[];
  label: string;
}

export interface OrgListData {
  type: 'list';
  companyName?: string;
  members: StaffMember[];
}

export type OrgViewData = OrgPyramidData | OrgListData;

export type CanvasLayout = Record<string, { x: number; y: number }>;

export interface CompanyInfo {
  id: string;
  name: string;
  memo?: string | null;
  [key: string]: unknown;
}

export interface OrgChartProps {
  user: StaffMember | null;
  staffs?: StaffMember[];
  selectedCo: string;
  setSelectedCo: (co: string) => void;
}

export const DEPT_STYLES: Record<string, { gradient: string; color: string }> = {
  진료부: { gradient: 'from-blue-600 to-blue-500', color: '#3B82F6' },
  간호부: { gradient: 'from-rose-500 to-pink-500', color: '#F43F5E' },
  총무부: { gradient: 'from-emerald-600 to-green-500', color: '#10B981' },
  운영본부: { gradient: 'from-violet-600 to-purple-500', color: '#8B5CF6' },
  전략기획본부: { gradient: 'from-sky-600 to-blue-400', color: '#0EA5E9' },
};

export const DEFAULT_DEPT_STYLE = { gradient: 'from-slate-700 to-slate-600', color: '#64748B' };

export function toSafeText(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim() || fallback;
  }
  return fallback;
}

export function getStaffExtensionText(staff: StaffMember | null | undefined) {
  return (
    toSafeText(staff?.extension) ||
    toSafeText(staff?.permissions?.extension) ||
    ''
  );
}
