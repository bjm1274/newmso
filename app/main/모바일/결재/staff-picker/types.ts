import type { StaffMember } from '@/types';

/** 공통 직원 선택 항목 — 결재선 / 참조 피커 공용 shape */
export type StaffPick = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  company: string | null;
};

export type ApproverPick = StaffPick;
export type CcPick = StaffPick;

export function toStaffPick(s: StaffMember): StaffPick {
  return {
    id: String(s.id || ''),
    name: String(s.name || ''),
    position: s.position ?? null,
    department: s.department ?? null,
    company: s.company ?? null,
  };
}
