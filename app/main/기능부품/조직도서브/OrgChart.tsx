'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getProfilePhotoUrl, normalizeProfileUser } from '@/lib/profile-photo';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';

type OrgChartProps = {
  user?: StaffMember | null;
  staffs?: StaffMember[];
  depts?: string[] | Record<string, unknown>[];
  selectedCo?: string | null;
  setSelectedCo?: (company: string | null) => void;
  compact?: boolean;
};

type DepartmentGroup = {
  name: string;
  accentClass: string;
  members: StaffMember[];
};

type DivisionGroup = {
  name: string;
  headerClass: string;
  borderClass: string;
  bgClass: string;
  departments: DepartmentGroup[];
};

type CompanyTree = {
  company: string;
  leader: StaffMember | null;
  managers: StaffMember[];
  divisions: DivisionGroup[];
  departments: DepartmentGroup[];
  isHospital: boolean;
  activeCount: number;
};

type AttendanceSnapshot = {
  staff_id: string;
  date?: string | null;
  work_date?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: string | null;
};

type PresenceState = 'working' | 'checked_out' | 'before_work';

type PresenceMeta = {
  state: PresenceState;
  label: string;
  toneClass: string;
  dotClass: string;
  checkInLabel: string | null;
  checkOutLabel: string | null;
};

// company → Map<team_name, division_name>
type OrgTeamIndex = Map<string, Map<string, string>>;

const COMPANY_ALL = '전체';

const DEPARTMENT_ACCENTS = [
  'from-sky-500 to-cyan-400',
  'from-emerald-500 to-green-400',
  'from-indigo-500 to-blue-500',
  'from-amber-500 to-orange-400',
  'from-rose-500 to-pink-400',
  'from-violet-500 to-purple-400',
  'from-slate-500 to-slate-400',
];

const DIVISION_STYLES = [
  { headerClass: 'bg-blue-600 text-white', borderClass: 'border-blue-500/20', bgClass: 'bg-blue-500/10' },
  { headerClass: 'bg-emerald-600 text-white', borderClass: 'border-emerald-200', bgClass: 'bg-emerald-50' },
  { headerClass: 'bg-amber-500 text-white', borderClass: 'border-amber-200', bgClass: 'bg-amber-50' },
  { headerClass: 'bg-violet-600 text-white', borderClass: 'border-violet-200', bgClass: 'bg-violet-50' },
  { headerClass: 'bg-rose-500 text-white', borderClass: 'border-rose-200', bgClass: 'bg-rose-50' },
  { headerClass: 'bg-[var(--muted)]0 text-white', borderClass: 'border-slate-200', bgClass: 'bg-[var(--muted)]' },
];

const LEADER_KEYWORDS = [
  '대표이사', '이사장', '병원장', '대표원장', '부원장', '원장',
  '본부장', '센터장', '사장', '대표', '이사',
];

const POSITION_RANK_KEYWORDS = [
  '대표이사', '이사장', '병원장', '대표원장', '부원장', '원장', '이사',
  '본부장', '센터장', '실장', '부장', '대표', '차장', '과장', '팀장',
  '대리', '주임', '선임', '사원',
];

const MANAGER_MAX_IDX = POSITION_RANK_KEYWORDS.indexOf('팀장');

let orgChartDirectoryCache: StaffMember[] | null = null;
let orgChartDirectoryPromise: Promise<StaffMember[]> | null = null;
let orgTeamsCache: OrgTeamIndex | null = null;
let orgTeamsPromise: Promise<OrgTeamIndex> | null = null;

function normalizeText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim();
  }
  return '';
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatClockLabel(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) return text.slice(0, 5);
  if (text.length >= 16 && text[10] === 'T') return text.slice(11, 16);
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(parsed));
  }
  return text.slice(0, 5);
}

function getAttendanceCheckIn(attendance?: AttendanceSnapshot | null) {
  return normalizeText(attendance?.check_in) || normalizeText(attendance?.check_in_time) || null;
}

function getAttendanceCheckOut(attendance?: AttendanceSnapshot | null) {
  return normalizeText(attendance?.check_out) || normalizeText(attendance?.check_out_time) || null;
}

function isWorkingAttendance(attendance?: AttendanceSnapshot | null) {
  return Boolean(getAttendanceCheckIn(attendance)) && !getAttendanceCheckOut(attendance);
}

function getPresenceMeta(attendance?: AttendanceSnapshot | null): PresenceMeta {
  const checkInLabel = formatClockLabel(getAttendanceCheckIn(attendance));
  const checkOutLabel = formatClockLabel(getAttendanceCheckOut(attendance));

  if (checkInLabel && !checkOutLabel) {
    return {
      state: 'working',
      label: '근무중',
      toneClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dotClass: 'bg-emerald-500',
      checkInLabel,
      checkOutLabel: null,
    };
  }

  if (checkInLabel && checkOutLabel) {
    return {
      state: 'checked_out',
      label: '퇴근 완료',
      toneClass: 'border-slate-200 bg-slate-100 text-slate-600',
      dotClass: 'bg-slate-400',
      checkInLabel,
      checkOutLabel,
    };
  }

  return {
    state: 'before_work',
    label: '출근 전',
    toneClass: 'border-amber-200 bg-amber-50 text-amber-700',
    dotClass: 'bg-amber-400',
    checkInLabel: null,
    checkOutLabel: null,
  };
}

function isResignedStaff(staff: StaffMember) {
  const status = normalizeText(staff.status);
  const resignedAt = normalizeText((staff as StaffMember & { resigned_at?: string | null }).resigned_at);
  const resignDate = normalizeText(staff.resign_date);
  const effectiveResignDate = resignedAt || resignDate;

  if (status.includes('퇴사예정')) {
    if (!effectiveResignDate) return false;
    const scheduledTime = Date.parse(effectiveResignDate);
    return Number.isFinite(scheduledTime) && scheduledTime <= Date.now();
  }

  if (status.includes('퇴사') || status.includes('퇴직')) return true;
  if (!effectiveResignDate) return false;
  const resignTime = Date.parse(effectiveResignDate);
  return Number.isFinite(resignTime) && resignTime <= Date.now();
}

function dedupeStaffs(staffs: StaffMember[]) {
  const map = new Map<string, StaffMember>();
  for (const staff of staffs) {
    if (!staff?.id) continue;
    map.set(staff.id, { ...map.get(staff.id), ...staff });
  }
  return Array.from(map.values());
}

function getCompanyName(staff: StaffMember) {
  return normalizeText(staff.company) || '회사 미지정';
}

function getDepartmentName(staff: StaffMember) {
  return normalizeText(staff.department) || '부서 미지정';
}

function findBestKeywordIndex(position: string, keywords: string[]) {
  let bestIndex = -1;
  let bestLen = 0;
  keywords.forEach((keyword, index) => {
    if (position.includes(keyword) && keyword.length > bestLen) {
      bestIndex = index;
      bestLen = keyword.length;
    }
  });
  return bestIndex;
}

function getPositionScore(staff: StaffMember) {
  const position = normalizeText(staff.position);
  const keywordIndex = findBestKeywordIndex(position, POSITION_RANK_KEYWORDS);
  const keywordScore = keywordIndex >= 0 ? POSITION_RANK_KEYWORDS.length - keywordIndex : 0;
  const roleScore = staff.role === 'admin' ? 2 : 0;
  return keywordScore + roleScore;
}

function compareStaff(a: StaffMember, b: StaffMember) {
  const scoreDiff = getPositionScore(b) - getPositionScore(a);
  if (scoreDiff !== 0) return scoreDiff;
  const employeeA = Number.parseInt(normalizeText(a.employee_no), 10);
  const employeeB = Number.parseInt(normalizeText(b.employee_no), 10);
  if (Number.isFinite(employeeA) && Number.isFinite(employeeB) && employeeA !== employeeB) {
    return employeeA - employeeB;
  }
  return normalizeText(a.name).localeCompare(normalizeText(b.name), 'ko-KR');
}

function pickLeader(staffs: StaffMember[]) {
  if (!staffs.length) return null;
  // LEADER_KEYWORDS에 매칭되는 사람만 후보로
  const candidates = staffs.filter(
    (s) => findBestKeywordIndex(normalizeText(s.position), LEADER_KEYWORDS) >= 0,
  );
  if (!candidates.length) return null;
  return candidates.sort((a, b) => {
    const idxA = findBestKeywordIndex(normalizeText(a.position), LEADER_KEYWORDS);
    const idxB = findBestKeywordIndex(normalizeText(b.position), LEADER_KEYWORDS);
    const scoreA = LEADER_KEYWORDS.length - idxA;
    const scoreB = LEADER_KEYWORDS.length - idxB;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return compareStaff(a, b);
  })[0] ?? null;
}

function isManagerStaff(staff: StaffMember) {
  const pos = normalizeText(staff.position);
  const idx = findBestKeywordIndex(pos, POSITION_RANK_KEYWORDS);
  return idx >= 0 && idx <= MANAGER_MAX_IDX;
}

function isHospitalCompany(name: string) {
  return [
    '병원', '의원', '의료', '클리닉', '한의원', '치과',
    '외과', '내과', '이비인후과', '소아과', '산부인과',
    '안과', '피부과', '비뇨기과', '정형외과', '신경외과',
    '흉부외과', '성형외과', '재활의학과', '정신건강의학과',
  ].some((kw) => name.includes(kw));
}

function compareDepartment(a: DepartmentGroup, b: DepartmentGroup) {
  const sizeDiff = b.members.length - a.members.length;
  if (sizeDiff !== 0) return sizeDiff;
  return a.name.localeCompare(b.name, 'ko-KR');
}

async function fetchOrgChartDirectory() {
  if (orgChartDirectoryCache) return orgChartDirectoryCache;
  if (!orgChartDirectoryPromise) {
    orgChartDirectoryPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('staff_members')
          .select('*')
          .order('company', { ascending: true })
          .order('department', { ascending: true })
          .order('employee_no', { ascending: true });
        if (error) throw error;
        const next = dedupeStaffs(
          Array.isArray(data)
            ? data.map((staff) => normalizeProfileUser(staff as StaffMember))
            : [],
        );
        orgChartDirectoryCache = next;
        return next;
      } finally {
        orgChartDirectoryPromise = null;
      }
    })();
  }
  return orgChartDirectoryPromise;
}

async function fetchOrgTeams(): Promise<OrgTeamIndex> {
  if (orgTeamsCache) return orgTeamsCache;
  if (!orgTeamsPromise) {
    orgTeamsPromise = (async () => {
      try {
        const { data } = await supabase
          .from('org_teams')
          .select('company_name, division, team_name, sort_order')
          .order('division')
          .order('sort_order');

        const index: OrgTeamIndex = new Map();
        for (const row of (data || []) as any[]) {
          const co = normalizeText(row.company_name);
          const div = normalizeText(row.division);
          const team = normalizeText(row.team_name);
          if (!co || !div || !team) continue;
          if (!index.has(co)) index.set(co, new Map());
          index.get(co)!.set(team, div);
        }
        orgTeamsCache = index;
        return index;
      } finally {
        orgTeamsPromise = null;
      }
    })();
  }
  return orgTeamsPromise;
}

function buildDivisionsFromIndex(
  company: string,
  departments: DepartmentGroup[],
  teamIndex: OrgTeamIndex,
): DivisionGroup[] {
  const coMap = teamIndex.get(company); // team_name → division_name
  if (!coMap || coMap.size === 0) return [];

  // division_name → 순서 유지를 위해 insertion order 사용
  const divisionOrder: string[] = [];
  const divisionTeams = new Map<string, string[]>();

  for (const [teamName, divName] of coMap) {
    if (!divisionTeams.has(divName)) {
      divisionOrder.push(divName);
      divisionTeams.set(divName, []);
    }
    divisionTeams.get(divName)!.push(teamName);
  }

  const deptByName = new Map(departments.map((d) => [d.name, d]));
  const assigned = new Set<string>();
  const result: DivisionGroup[] = [];

  divisionOrder.forEach((divName, divIdx) => {
    const style = DIVISION_STYLES[divIdx % DIVISION_STYLES.length];
    const teamNames = divisionTeams.get(divName) ?? [];
    const divDepts = teamNames.map((t) => deptByName.get(t)).filter((d): d is DepartmentGroup => !!d);
    divDepts.forEach((d) => assigned.add(d.name));
    result.push({ name: divName, ...style, departments: divDepts });
  });

  // org_teams에 없는 부서는 기타로
  const unassigned = departments.filter((d) => !assigned.has(d.name));
  if (unassigned.length > 0) {
    const style = DIVISION_STYLES[result.length % DIVISION_STYLES.length];
    result.push({ name: '기타', ...style, departments: unassigned });
  }

  return result;
}

function buildCompanyTree(
  company: string,
  staffs: StaffMember[],
  teamIndex: OrgTeamIndex,
): CompanyTree {
  const hospital = isHospitalCompany(company);
  const activeStaffs = staffs.filter((s) => !isResignedStaff(s)).sort(compareStaff);
  const leader = pickLeader(activeStaffs);
  const nonLeader = leader ? activeStaffs.filter((s) => s.id !== leader.id) : activeStaffs;

  const managers = nonLeader.filter(isManagerStaff);
  const regularStaffs = nonLeader.filter((s) => !isManagerStaff(s));

  const departmentMap = new Map<string, StaffMember[]>();
  for (const staff of regularStaffs) {
    const dept = getDepartmentName(staff);
    const bucket = departmentMap.get(dept) ?? [];
    bucket.push(staff);
    departmentMap.set(dept, bucket);
  }

  const departments: DepartmentGroup[] = Array.from(departmentMap.entries())
    .map(([name, members], index) => ({
      name,
      members: members.sort(compareStaff),
      accentClass: DEPARTMENT_ACCENTS[index % DEPARTMENT_ACCENTS.length],
    }))
    .sort(compareDepartment);

  // 병원: org_teams DB에서 division 구조 읽기
  const divisions = hospital ? buildDivisionsFromIndex(company, departments, teamIndex) : [];

  return { company, leader, managers, divisions, departments, isHospital: hospital, activeCount: activeStaffs.length };
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function Avatar({ staff, size = 'md', isWorking = false }: { staff: StaffMember; size?: 'sm' | 'md' | 'lg'; isWorking?: boolean }) {
  const sizeClass =
    size === 'lg' ? 'h-8 w-8 text-xs' : size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-[11px]';
  const palette = [
    'bg-sky-100 text-sky-700',
    'bg-emerald-100 text-emerald-700',
    'bg-violet-100 text-violet-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
  ];
  const name = normalizeText(staff.name) || '?';
  const color = palette[(name.charCodeAt(0) || 0) % palette.length];
  const photoUrl = getProfilePhotoUrl(staff);
  return (
    <div className="relative shrink-0">
      <div
        className={`${sizeClass} ${photoUrl ? 'overflow-hidden bg-[var(--tab-bg)]' : color} flex items-center justify-center rounded-full font-bold`}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`${name} 프로필 사진`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          name[0]
        )}
      </div>
      {isWorking ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 shadow-sm"
          aria-label="현재 근무중"
        />
      ) : null}
    </div>
  );
}

function PresenceBadge({ presence, compact = false, testId }: { presence: PresenceMeta; compact?: boolean; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded-full border font-bold ${presence.toneClass} ${
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${presence.dotClass}`} />
      {presence.label}
    </span>
  );
}

function StaffChip({
  staff,
  onSelect,
  presence,
}: {
  staff: StaffMember;
  onSelect: (s: StaffMember) => void;
  presence: PresenceMeta;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(staff)}
      className="flex w-full items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-left transition hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/60 active:scale-[0.98]"
    >
      <Avatar staff={staff} size="sm" isWorking={presence.state === 'working'} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-[var(--foreground)]">{normalizeText(staff.name)}</p>
        <p className="truncate text-[10px] text-[var(--toss-gray-3)]">{normalizeText(staff.position) || '직급 미지정'}</p>
      </div>
      {presence.state === 'working' ? <PresenceBadge presence={presence} compact /> : null}
    </button>
  );
}

function DepartmentColumn({
  department,
  onSelect,
  attendanceByStaffId,
}: {
  department: DepartmentGroup;
  onSelect: (s: StaffMember) => void;
  attendanceByStaffId: Map<string, AttendanceSnapshot>;
}) {
  return (
    <section className="w-[110px] shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className={`bg-gradient-to-r ${department.accentClass} px-2.5 py-1.5`}>
        <p className="text-xs font-bold text-white truncate">{department.name}</p>
        <p className="text-[10px] font-medium text-white/80">{department.members.length}명</p>
      </div>
      <div className="space-y-1 p-1.5">
        {department.members.length > 0 ? (
          department.members.map((staff) => (
            <StaffChip
              key={staff.id}
              staff={staff}
              onSelect={onSelect}
              presence={getPresenceMeta(attendanceByStaffId.get(staff.id) ?? null)}
            />
          ))
        ) : (
          <p className="py-2 text-center text-[10px] text-[var(--toss-gray-3)]">–</p>
        )}
      </div>
    </section>
  );
}

function LeaderCard({
  leader,
  onSelect,
  presence,
}: {
  leader: StaffMember;
  onSelect: (s: StaffMember) => void;
  presence: PresenceMeta;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(leader)}
      className="flex items-center gap-2 rounded-xl border border-[var(--accent)]/20 bg-[var(--card)] px-3 py-2 shadow-sm transition hover:border-[var(--accent)]/40 hover:shadow-md active:scale-[0.98]"
    >
      <Avatar staff={leader} size="lg" isWorking={presence.state === 'working'} />
      <div className="min-w-0 text-left">
        <p className="text-sm font-black tracking-tight text-[var(--foreground)]">{normalizeText(leader.name)}</p>
        <p className="text-xs font-semibold text-[var(--toss-gray-3)]">{normalizeText(leader.position) || '대표'}</p>
      </div>
      <PresenceBadge presence={presence} compact />
    </button>
  );
}

function ManagerRow({
  managers,
  onSelect,
  attendanceByStaffId,
}: {
  managers: StaffMember[];
  onSelect: (s: StaffMember) => void;
  attendanceByStaffId: Map<string, AttendanceSnapshot>;
}) {
  if (managers.length === 0) return null;
  return (
    <div className="inline-flex flex-col items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className="w-full border-b border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">관리자</p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 px-3 py-2">
        {managers.map((staff) => (
          (() => {
            const presence = getPresenceMeta(attendanceByStaffId.get(staff.id) ?? null);
            return (
          <button
            key={staff.id}
            type="button"
            onClick={() => onSelect(staff)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--page-bg)] px-2 py-1.5 transition hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/60 active:scale-[0.98]"
          >
            <Avatar staff={staff} size="sm" isWorking={presence.state === 'working'} />
            <div className="text-left">
              <p className="text-xs font-bold text-[var(--foreground)]">{normalizeText(staff.name)}</p>
              <p className="text-[10px] text-[var(--toss-gray-3)]">
                {normalizeText(staff.position)} · {getDepartmentName(staff)}
              </p>
            </div>
            <PresenceBadge presence={presence} compact />
          </button>
            );
          })()
        ))}
      </div>
    </div>
  );
}

function DivisionSection({
  division,
  onSelect,
  attendanceByStaffId,
}: {
  division: DivisionGroup;
  onSelect: (s: StaffMember) => void;
  attendanceByStaffId: Map<string, AttendanceSnapshot>;
}) {
  const totalMembers = division.departments.reduce((sum, d) => sum + d.members.length, 0);
  return (
    <div className="shrink-0 flex flex-col">
      {/* 부 헤더 */}
      <div className={`${division.headerClass} rounded-t-xl px-2.5 py-1.5`}>
        <p className="text-xs font-bold whitespace-nowrap">{division.name}</p>
        <p className="text-[10px] font-medium opacity-80">{division.departments.length}팀 · {totalMembers}명</p>
      </div>
      {/* 팀 컬럼들 (가로 배열) */}
      {division.departments.length > 0 ? (
        <div className={`flex items-start gap-1.5 rounded-b-xl border-x border-b ${division.borderClass} ${division.bgClass} p-1.5`}>
          {division.departments.map((dept) => (
            <DepartmentColumn
              key={dept.name}
              department={dept}
              onSelect={onSelect}
              attendanceByStaffId={attendanceByStaffId}
            />
          ))}
        </div>
      ) : (
        <div className={`rounded-b-xl border-x border-b ${division.borderClass} ${division.bgClass} px-3 py-4 text-center text-[10px] text-[var(--toss-gray-3)]`}>
          팀원 없음
        </div>
      )}
    </div>
  );
}

function countWorkingMembers(tree: CompanyTree, attendanceByStaffId: Map<string, AttendanceSnapshot>) {
  let count = 0;
  if (tree.leader && isWorkingAttendance(attendanceByStaffId.get(tree.leader.id) ?? null)) count += 1;
  tree.managers.forEach((staff) => {
    if (isWorkingAttendance(attendanceByStaffId.get(staff.id) ?? null)) count += 1;
  });
  tree.departments.forEach((department) => {
    department.members.forEach((staff) => {
      if (isWorkingAttendance(attendanceByStaffId.get(staff.id) ?? null)) count += 1;
    });
  });
  return count;
}

function CompanyPyramid({
  tree,
  onSelect,
  attendanceByStaffId,
}: {
  tree: CompanyTree;
  onSelect: (s: StaffMember) => void;
  attendanceByStaffId: Map<string, AttendanceSnapshot>;
}) {
  const workingCount = countWorkingMembers(tree, attendanceByStaffId);
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--page-bg)] shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5">
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)]">{tree.company}</h3>
          <p className="text-[10px] font-medium text-[var(--toss-gray-3)]">재직 {tree.activeCount}명 · 근무중 {workingCount}명</p>
        </div>
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">ORG</span>
      </div>

      {/* 상단: 대표 → 관리자 (중앙 정렬) */}
      <div className="flex flex-col items-center gap-2 px-4 pt-4 pb-2">
        {tree.leader && (
          <>
            <LeaderCard
              leader={tree.leader}
              onSelect={onSelect}
              presence={getPresenceMeta(attendanceByStaffId.get(tree.leader.id) ?? null)}
            />
            <div className="h-3 w-px bg-[var(--border)]" />
          </>
        )}
        {tree.managers.length > 0 && (
          <>
            <div className="flex justify-center w-full">
              <ManagerRow managers={tree.managers} onSelect={onSelect} attendanceByStaffId={attendanceByStaffId} />
            </div>
            <div className="h-3 w-px bg-[var(--border)]" />
          </>
        )}
      </div>

      {/* 하단: 부서/부 — 가운데 정렬 + 넘치면 좌우 슬라이드 */}
      <div className="no-scrollbar overflow-x-auto pb-4">
        {tree.isHospital && tree.divisions.length > 0 ? (
          <div className="flex justify-center gap-3 px-4" style={{ minWidth: 'max-content' }}>
            {tree.divisions.map((div) => (
              <DivisionSection key={div.name} division={div} onSelect={onSelect} attendanceByStaffId={attendanceByStaffId} />
            ))}
          </div>
        ) : tree.departments.length > 0 ? (
          <div className="flex justify-center gap-2 px-4" style={{ minWidth: 'max-content' }}>
            {tree.departments.map((dept) => (
              <DepartmentColumn key={dept.name} department={dept} onSelect={onSelect} attendanceByStaffId={attendanceByStaffId} />
            ))}
          </div>
        ) : (
          <div className="mx-4 rounded-xl border border-dashed border-[var(--border)] px-5 py-8 text-center text-xs font-medium text-[var(--toss-gray-3)]">
            표시할 부서 정보가 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}

function InfoRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-4 py-1">
      <span className="text-sm font-semibold text-[var(--toss-gray-3)]">{label}</span>
      <span className="text-right text-sm font-bold text-[var(--foreground)]">{value}</span>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function OrgChart({
  user,
  staffs = [],
  selectedCo,
  setSelectedCo,
  compact = false,
}: OrgChartProps) {
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showWorkingOnly, setShowWorkingOnly] = useState(false);
  const [allStaffs, setAllStaffs] = useState<StaffMember[]>(() =>
    dedupeStaffs([...(orgChartDirectoryCache ?? []), ...staffs]),
  );
  const [teamIndex, setTeamIndex] = useState<OrgTeamIndex>(() => orgTeamsCache ?? new Map());
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(() => !orgChartDirectoryCache);
  const [attendanceByStaffId, setAttendanceByStaffId] = useState<Map<string, AttendanceSnapshot>>(new Map());
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [attendanceRefreshToken, setAttendanceRefreshToken] = useState(0);
  const [attendanceLastSyncAt, setAttendanceLastSyncAt] = useState<Date | null>(null);
  const attendanceRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  useEffect(() => {
    setAllStaffs((prev) => dedupeStaffs([...prev, ...staffs]));
  }, [staffs]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setIsLoadingDirectory(true);
      try {
        const [directory, teams] = await Promise.all([
          fetchOrgChartDirectory(),
          fetchOrgTeams(),
        ]);
        if (!ignore) {
          setAllStaffs((prev) => dedupeStaffs([...directory, ...prev, ...staffs]));
          setTeamIndex(teams);
        }
      } catch (error) {
        if (!ignore) console.error('조직도 로드 실패:', error);
      } finally {
        if (!ignore) setIsLoadingDirectory(false);
      }
    };
    void load();
    return () => { ignore = true; };
  }, [staffs]);

  useEffect(() => {
    let ignore = false;

    const loadTodayAttendance = async () => {
      setIsLoadingAttendance(true);
      try {
        const [attendanceRows, legacyAttendanceRows] = await Promise.allSettled([
          supabase
            .from('attendance')
            .select('staff_id, date, check_in, check_out, status')
            .eq('date', todayKey),
          supabase
            .from('attendances')
            .select('staff_id, work_date, check_in_time, check_out_time, status')
            .eq('work_date', todayKey),
        ]);

        if (ignore) return;

        const merged = new Map<string, AttendanceSnapshot>();
        if (attendanceRows.status === 'fulfilled' && Array.isArray(attendanceRows.value.data)) {
          (attendanceRows.value.data as AttendanceSnapshot[]).forEach((row) => {
            if (!row?.staff_id) return;
            merged.set(String(row.staff_id), { ...row });
          });
        }
        if (legacyAttendanceRows.status === 'fulfilled' && Array.isArray(legacyAttendanceRows.value.data)) {
          (legacyAttendanceRows.value.data as AttendanceSnapshot[]).forEach((row) => {
            if (!row?.staff_id) return;
            const key = String(row.staff_id);
            const existing = merged.get(key) ?? null;
            merged.set(key, {
              ...existing,
              ...row,
              staff_id: key,
              date: existing?.date ?? row.work_date ?? todayKey,
            });
          });
        }

        setAttendanceByStaffId(merged);
        setAttendanceLastSyncAt(new Date());
      } catch (error) {
        if (!ignore) {
          console.error('조직도 근무현황 로드 실패:', error);
          setAttendanceByStaffId(new Map());
        }
      } finally {
        if (!ignore) setIsLoadingAttendance(false);
      }
    };

    void loadTodayAttendance();
    return () => { ignore = true; };
  }, [attendanceRefreshToken, todayKey]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (attendanceRefreshTimerRef.current) clearTimeout(attendanceRefreshTimerRef.current);
      attendanceRefreshTimerRef.current = setTimeout(() => {
        setAttendanceRefreshToken((current) => current + 1);
      }, 250);
    };

    const channel = supabase
      .channel(`org-chart-working-status-${user?.id || 'guest'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances' }, scheduleRefresh)
      .subscribe();

    const handleVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        scheduleRefresh();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', scheduleRefresh);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisible);
    }

    return () => {
      if (attendanceRefreshTimerRef.current) {
        clearTimeout(attendanceRefreshTimerRef.current);
        attendanceRefreshTimerRef.current = null;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', scheduleRefresh);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisible);
      }
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const directoryStaffs = useMemo(
    () =>
      dedupeStaffs(allStaffs)
        .filter((s) => normalizeText(s.name))
        .sort((a, b) => {
          const coDiff = getCompanyName(a).localeCompare(getCompanyName(b), 'ko-KR');
          if (coDiff !== 0) return coDiff;
          const deptDiff = getDepartmentName(a).localeCompare(getDepartmentName(b), 'ko-KR');
          if (deptDiff !== 0) return deptDiff;
          return compareStaff(a, b);
        }),
    [allStaffs],
  );

  const workingEntries = useMemo(
    () =>
      directoryStaffs
        .filter((staff) => !isResignedStaff(staff))
        .map((staff) => ({
          staff,
          attendance: attendanceByStaffId.get(staff.id) ?? null,
        }))
        .filter(
          (entry): entry is { staff: StaffMember; attendance: AttendanceSnapshot } =>
            isWorkingAttendance(entry.attendance),
        )
        .sort((left, right) => compareStaff(left.staff, right.staff)),
    [attendanceByStaffId, directoryStaffs],
  );

  const workingStaffIds = useMemo(
    () => new Set(workingEntries.map((entry) => entry.staff.id)),
    [workingEntries],
  );

  const companyOptions = useMemo(() => {
    const companies = Array.from(new Set(directoryStaffs.map(getCompanyName)));
    const userCompany = normalizeText(user?.company);
    return [
      COMPANY_ALL,
      ...companies.sort((a, b) => {
        if (a === userCompany) return -1;
        if (b === userCompany) return 1;
        return a.localeCompare(b, 'ko-KR');
      }),
    ];
  }, [directoryStaffs, user?.company]);

  const activeCompany =
    selectedCo && normalizeText(selectedCo) ? normalizeText(selectedCo) : COMPANY_ALL;

  const filteredDirectoryStaffs = useMemo(
    () =>
      showWorkingOnly
        ? directoryStaffs.filter((staff) => workingStaffIds.has(staff.id))
        : directoryStaffs,
    [directoryStaffs, showWorkingOnly, workingStaffIds],
  );

  const visibleWorkingEntries = useMemo(
    () =>
      workingEntries.filter(
        ({ staff }) => activeCompany === COMPANY_ALL || getCompanyName(staff) === activeCompany,
      ),
    [activeCompany, workingEntries],
  );

  const workingGroups = useMemo(() => {
    const grouped = new Map<string, Array<{ staff: StaffMember; attendance: AttendanceSnapshot }>>();

    visibleWorkingEntries.forEach((entry) => {
      const label =
        activeCompany === COMPANY_ALL
          ? `${getCompanyName(entry.staff)} · ${getDepartmentName(entry.staff)}`
          : getDepartmentName(entry.staff);
      const bucket = grouped.get(label) ?? [];
      bucket.push(entry);
      grouped.set(label, bucket);
    });

    return Array.from(grouped.entries())
      .map(([label, members]) => ({
        label,
        members: members.sort((left, right) => compareStaff(left.staff, right.staff)),
      }))
      .sort((left, right) => {
        const sizeDiff = right.members.length - left.members.length;
        if (sizeDiff !== 0) return sizeDiff;
        return left.label.localeCompare(right.label, 'ko-KR');
      });
  }, [activeCompany, visibleWorkingEntries]);

  const trees = useMemo(() => {
    const filtered =
      activeCompany === COMPANY_ALL
        ? filteredDirectoryStaffs
        : filteredDirectoryStaffs.filter((s) => getCompanyName(s) === activeCompany);

    const grouped = new Map<string, StaffMember[]>();
    for (const staff of filtered) {
      const co = getCompanyName(staff);
      const bucket = grouped.get(co) ?? [];
      bucket.push(staff);
      grouped.set(co, bucket);
    }

    return Array.from(grouped.entries())
      .map(([co, members]) => buildCompanyTree(co, members, teamIndex))
      .filter((t) => t.activeCount > 0);
  }, [activeCompany, filteredDirectoryStaffs, teamIndex]);

  const searchResults = useMemo(() => {
    const term = normalizeText(searchTerm);
    if (!term) return [];
    return filteredDirectoryStaffs.filter((s) => {
      const hay = [
        normalizeText(s.name),
        normalizeText(s.position),
        getDepartmentName(s),
        getCompanyName(s),
      ].join(' ');
      return hay.includes(term);
    });
  }, [filteredDirectoryStaffs, searchTerm]);

  const activeCount = useMemo(
    () => directoryStaffs.filter((s) => !isResignedStaff(s)).length,
    [directoryStaffs],
  );
  const selectedStaffPresence = useMemo(
    () => (selectedStaff ? getPresenceMeta(attendanceByStaffId.get(selectedStaff.id) ?? null) : null),
    [attendanceByStaffId, selectedStaff],
  );

  return (
    <div data-testid="org-chart-pyramid-view" className="flex flex-col bg-[var(--page-bg)]">
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)] px-3 py-1.5 shadow-sm">
        <div className="flex items-center gap-3">
          {/* 타이틀 */}
          <div className="shrink-0 flex items-baseline gap-1.5">
            <h2 className="text-sm font-black tracking-tight text-[var(--foreground)]">조직도</h2>
            <span className="text-[10px] font-medium text-[var(--toss-gray-3)]">
              {activeCount}명{isLoadingDirectory && ' …'}
            </span>
          </div>

          {/* 회사 탭 */}
          <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
            {companyOptions.map((company) => {
              const active = activeCompany === company;
              return (
                <button
                  key={company}
                  type="button"
                  onClick={() => setSelectedCo?.(company === COMPANY_ALL ? null : company)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                    active
                      ? 'bg-[var(--accent)] text-white'
                      : 'border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {company}
                </button>
              );
            })}
          </div>

          {/* 검색 */}
          <div className="relative shrink-0">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="검색"
              className="w-28 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] text-[var(--foreground)] outline-none transition placeholder:text-[var(--toss-gray-3)] focus:border-[var(--accent)]/50 focus:w-44 focus:ring-1 focus:ring-[var(--accent)]/20"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm leading-none text-[var(--toss-gray-3)] hover:text-[var(--foreground)]"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={`px-2 py-3 md:px-4 ${compact ? 'pb-4' : 'pb-6'}`}>
        <div className="w-full space-y-4">
          <section
            data-testid="org-working-summary"
            className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/70 p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-black text-[var(--foreground)]">오늘 근무중</h3>
                  <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-white">
                    {visibleWorkingEntries.length}명
                  </span>
                  <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                    {activeCompany === COMPANY_ALL ? '전사 기준' : `${activeCompany} 기준`}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-emerald-900/80">
                  출근 처리 후 아직 퇴근하지 않은 직원만 바로 모아 보여줍니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="org-working-only-toggle"
                  onClick={() => setShowWorkingOnly((current) => !current)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                    showWorkingOnly
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-emerald-200 bg-white text-emerald-700 hover:border-emerald-400'
                  }`}
                >
                  오늘 근무중만 보기
                </button>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-3)] ring-1 ring-emerald-100">
                  {isLoadingAttendance ? '근무현황 갱신 중…' : '실시간 반영'}
                </span>
                {attendanceLastSyncAt ? (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-3)] ring-1 ring-emerald-100">
                    {attendanceLastSyncAt.toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })} 갱신
                  </span>
                ) : null}
              </div>
            </div>

            {workingGroups.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {workingGroups.map((group) => (
                  <div
                    key={group.label}
                    className="rounded-[var(--radius-xl)] border border-white/80 bg-white/90 p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-[var(--foreground)]">{group.label}</p>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                        {group.members.length}명
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {group.members.map(({ staff, attendance }) => (
                        <button
                          key={staff.id}
                          type="button"
                          data-testid={`org-working-chip-${staff.id}`}
                          onClick={() => setSelectedStaff(staff)}
                          className="flex min-w-0 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-left transition hover:border-emerald-400 hover:bg-emerald-100"
                        >
                          <Avatar staff={staff} size="sm" isWorking />
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-bold text-emerald-900">
                              {normalizeText(staff.name)}
                            </span>
                            <span className="block truncate text-[10px] font-medium text-emerald-700/80">
                              {[normalizeText(staff.position), formatClockLabel(getAttendanceCheckIn(attendance)) ? `출근 ${formatClockLabel(getAttendanceCheckIn(attendance))}` : '근무중']
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[var(--radius-xl)] border border-dashed border-emerald-200 bg-white/70 px-4 py-6 text-center text-sm font-medium text-emerald-900/70">
                현재 표시 조건에서 오늘 근무중인 직원이 없습니다.
              </div>
            )}
          </section>

          {searchTerm ? (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="font-bold text-[var(--foreground)]">검색 결과</h3>
                <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs font-semibold text-[var(--toss-gray-3)]">
                  {searchResults.length}명
                </span>
              </div>
              {searchResults.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {searchResults.map((staff) => (
                    (() => {
                      const presence = getPresenceMeta(attendanceByStaffId.get(staff.id) ?? null);
                      return (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => setSelectedStaff(staff)}
                      className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 text-left transition hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/50 hover:shadow-sm"
                    >
                      <Avatar staff={staff} isWorking={presence.state === 'working'} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[var(--foreground)]">{normalizeText(staff.name)}</p>
                        <p className="truncate text-xs text-[var(--toss-gray-3)]">
                          {getCompanyName(staff)} · {getDepartmentName(staff)}
                        </p>
                        <p className="truncate text-[11px] text-[var(--toss-gray-3)]/70">{normalizeText(staff.position) || '직급 미지정'}</p>
                      </div>
                      <PresenceBadge presence={presence} compact />
                    </button>
                      );
                    })()
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border)] px-5 py-10 text-center text-sm font-medium text-[var(--toss-gray-3)]">
                  검색 결과가 없습니다.
                </div>
              )}
            </section>
          ) : trees.length > 0 ? (
            trees.map((tree) => (
              <CompanyPyramid
                key={tree.company}
                tree={tree}
                onSelect={setSelectedStaff}
                attendanceByStaffId={attendanceByStaffId}
              />
            ))
          ) : (
            <section className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-16 text-center shadow-sm">
              <h3 className="font-bold text-[var(--foreground)]">
                {showWorkingOnly ? '현재 근무중인 직원이 조직도에 없습니다.' : '조직도에 표시할 직원이 없습니다.'}
              </h3>
              <p className="mt-1 text-sm font-medium text-[var(--toss-gray-3)]">
                {showWorkingOnly ? '필터를 해제하면 전체 조직도를 다시 볼 수 있습니다.' : '회사나 검색 조건을 다시 확인해 주세요.'}
              </p>
            </section>
          )}
        </div>
      </div>

      {selectedStaff && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 backdrop-blur-sm md:items-center md:p-6"
          onClick={() => setSelectedStaff(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-[var(--card)] p-6 shadow-2xl md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-4">
              <Avatar staff={selectedStaff} size="lg" isWorking={selectedStaffPresence?.state === 'working'} />
              <div className="min-w-0">
                <p className="truncate text-xl font-black text-[var(--foreground)]">{normalizeText(selectedStaff.name)}</p>
                <p className="truncate text-sm font-semibold text-[var(--toss-gray-3)]">{normalizeText(selectedStaff.position) || '직급 미지정'}</p>
              </div>
              {selectedStaffPresence ? (
                <PresenceBadge
                  presence={selectedStaffPresence}
                  testId="org-staff-modal-presence"
                />
              ) : null}
            </div>
            <div className="mt-4 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--page-bg)] px-4">
              {selectedStaffPresence ? (
                <InfoRow
                  testId="org-staff-modal-presence-row"
                  label="근무 상태"
                  value={[
                    selectedStaffPresence.label,
                    selectedStaffPresence.checkInLabel ? `출근 ${selectedStaffPresence.checkInLabel}` : null,
                    selectedStaffPresence.checkOutLabel ? `퇴근 ${selectedStaffPresence.checkOutLabel}` : null,
                  ].filter(Boolean).join(' · ')}
                />
              ) : null}
              <InfoRow label="회사" value={getCompanyName(selectedStaff)} />
              <InfoRow label="부서" value={getDepartmentName(selectedStaff)} />
              <InfoRow label="사번" value={normalizeText(selectedStaff.employee_no) || '-'} />
              <InfoRow label="내선" value={normalizeText(selectedStaff.extension) || '-'} />
            </div>
            <button
              type="button"
              onClick={() => setSelectedStaff(null)}
              className="mt-4 w-full rounded-2xl bg-[var(--accent)] py-3 text-sm font-bold text-white transition hover:opacity-90"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
