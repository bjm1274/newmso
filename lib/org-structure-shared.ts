import type { StaffMember } from '@/types';
import { isActiveStaff } from './active-staff';

export type OrgMember = {
  id: string;
  name: string;
  department: string;
  role: string;
  position?: string;
  status?: string;
  photo_url?: string | null;
};

export type OrgGroup = {
  department: string;
  members: OrgMember[];
};

export function stripHiddenMetaBlocks(value: unknown): string {
  return String(value || '')
    .replace(/\[\[SCHEDULE_META\]\][\s\S]*?\[\[\/SCHEDULE_META\]\]/g, '')
    .replace(/\[\[BOARD_META\]\][\s\S]*?\[\[\/BOARD_META\]\]/g, '')
    .replace(/\[\[WARD_MESSAGE_META\]\][\s\S]*?\[\[\/WARD_MESSAGE_META\]\]/g, '')
    .replace(/\[\[(?:SCHEDULE_META|BOARD_META|WARD_MESSAGE_META)\]\][\s\S]*$/g, '')
    .replace(/\s{2 }/g, ' ')
    .trim();
}

export function groupStaffByDepartment(staffList: StaffMember[]): OrgGroup[] {
  const active = (staffList || []).filter(isActiveStaff);
  const map = new Map<string, OrgMember[]>();
  for (const s of active) {
    const dept = s.department?.trim() || '미지정';
    const list = map.get(dept) ?? [];
    list.push({
      id: s.id,
      name: s.name ?? '이름없음',
      department: dept,
      role: s.role || '직원',
      position: s.position ?? s.role ?? '',
      status: s.status ?? '근무중',
      photo_url: s.photo_url ?? null });
    map.set(dept, list);
  }
  return Array.from(map.entries()).map(([dept, members]) => ({
    department: dept,
    members }));
}

export function normalizeWardStaffList<
  T extends {
    id?: unknown;
    name?: unknown;
    department?: unknown;
    position?: unknown;
    company?: unknown;
    company_id?: unknown;
  },
>(data: T[] | null | undefined, senderId: string) {
  const deduped = new Map<
    string,
    {
      id: string;
      name: string;
      department: string;
      position: string;
      company: string;
      company_id: string | null;
    }
  >();

  (data || []).forEach((staff) => {
    const normalized = {
      id: String(staff.id || '').trim(),
      name: stripHiddenMetaBlocks(staff.name),
      department: stripHiddenMetaBlocks(staff.department),
      position: stripHiddenMetaBlocks(staff.position),
      company: stripHiddenMetaBlocks(staff.company),
      company_id: String(staff.company_id || '').trim() || null };

    if (!normalized.id || !normalized.name || normalized.id === senderId) return;
    deduped.set(normalized.id, normalized);
  });

  return Array.from(deduped.values());
}
