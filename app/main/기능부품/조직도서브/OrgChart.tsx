'use client';

import { useEffect, useMemo, useState } from 'react';
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
  { headerClass: 'bg-blue-600 text-white', borderClass: 'border-blue-200', bgClass: 'bg-blue-50' },
  { headerClass: 'bg-emerald-600 text-white', borderClass: 'border-emerald-200', bgClass: 'bg-emerald-50' },
  { headerClass: 'bg-amber-500 text-white', borderClass: 'border-amber-200', bgClass: 'bg-amber-50' },
  { headerClass: 'bg-violet-600 text-white', borderClass: 'border-violet-200', bgClass: 'bg-violet-50' },
  { headerClass: 'bg-rose-500 text-white', borderClass: 'border-rose-200', bgClass: 'bg-rose-50' },
  { headerClass: 'bg-slate-500 text-white', borderClass: 'border-slate-200', bgClass: 'bg-slate-50' },
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
  return String(value ?? '').trim();
}

function isResignedStaff(staff: StaffMember) {
  const status = normalizeText(staff.status);
  if (status.includes('퇴사') || status.includes('퇴직')) return true;
  const resignDate = normalizeText(staff.resign_date);
  if (!resignDate) return false;
  const resignTime = Date.parse(resignDate);
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
        const next = dedupeStaffs((data as StaffMember[]) ?? []);
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

function Avatar({ staff, size = 'md' }: { staff: StaffMember; size?: 'sm' | 'md' | 'lg' }) {
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
  return (
    <div className={`${sizeClass} ${color} flex shrink-0 items-center justify-center rounded-full font-bold`}>
      {name[0]}
    </div>
  );
}

function StaffChip({ staff, onSelect }: { staff: StaffMember; onSelect: (s: StaffMember) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(staff)}
      className="flex w-full items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-left transition hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/60 active:scale-[0.98]"
    >
      <Avatar staff={staff} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-[var(--foreground)]">{normalizeText(staff.name)}</p>
        <p className="truncate text-[10px] text-[var(--toss-gray-3)]">{normalizeText(staff.position) || '직급 미지정'}</p>
      </div>
    </button>
  );
}

function DepartmentColumn({ department, onSelect }: { department: DepartmentGroup; onSelect: (s: StaffMember) => void }) {
  return (
    <section className="w-[110px] shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className={`bg-gradient-to-r ${department.accentClass} px-2.5 py-1.5`}>
        <p className="text-xs font-bold text-white truncate">{department.name}</p>
        <p className="text-[10px] font-medium text-white/80">{department.members.length}명</p>
      </div>
      <div className="space-y-1 p-1.5">
        {department.members.length > 0 ? (
          department.members.map((staff) => (
            <StaffChip key={staff.id} staff={staff} onSelect={onSelect} />
          ))
        ) : (
          <p className="py-2 text-center text-[10px] text-[var(--toss-gray-3)]">–</p>
        )}
      </div>
    </section>
  );
}

function LeaderCard({ leader, onSelect }: { leader: StaffMember; onSelect: (s: StaffMember) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(leader)}
      className="flex items-center gap-2 rounded-xl border border-[var(--accent)]/20 bg-[var(--card)] px-3 py-2 shadow-sm transition hover:border-[var(--accent)]/40 hover:shadow-md active:scale-[0.98]"
    >
      <Avatar staff={leader} size="lg" />
      <div className="text-left">
        <p className="text-sm font-black tracking-tight text-[var(--foreground)]">{normalizeText(leader.name)}</p>
        <p className="text-xs font-semibold text-[var(--toss-gray-3)]">{normalizeText(leader.position) || '대표'}</p>
      </div>
    </button>
  );
}

function ManagerRow({ managers, onSelect }: { managers: StaffMember[]; onSelect: (s: StaffMember) => void }) {
  if (managers.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className="border-b border-[var(--border)] bg-[var(--muted)] px-3 py-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">관리자</p>
      </div>
      <div className="flex flex-wrap gap-1.5 p-2">
        {managers.map((staff) => (
          <button
            key={staff.id}
            type="button"
            onClick={() => onSelect(staff)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--page-bg)] px-2 py-1.5 transition hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/60 active:scale-[0.98]"
          >
            <Avatar staff={staff} size="sm" />
            <div className="text-left">
              <p className="text-xs font-bold text-[var(--foreground)]">{normalizeText(staff.name)}</p>
              <p className="text-[10px] text-[var(--toss-gray-3)]">
                {normalizeText(staff.position)} · {getDepartmentName(staff)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DivisionSection({ division, onSelect }: { division: DivisionGroup; onSelect: (s: StaffMember) => void }) {
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
            <DepartmentColumn key={dept.name} department={dept} onSelect={onSelect} />
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

function CompanyPyramid({ tree, onSelect }: { tree: CompanyTree; onSelect: (s: StaffMember) => void }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--page-bg)] shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5">
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)]">{tree.company}</h3>
          <p className="text-[10px] font-medium text-[var(--toss-gray-3)]">재직 {tree.activeCount}명</p>
        </div>
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">ORG</span>
      </div>

      {/* 상단: 대표 → 관리자 (중앙 정렬) */}
      <div className="flex flex-col items-center gap-2 px-4 pt-4 pb-2">
        {tree.leader && (
          <>
            <LeaderCard leader={tree.leader} onSelect={onSelect} />
            <div className="h-3 w-px bg-[var(--border)]" />
          </>
        )}
        {tree.managers.length > 0 && (
          <>
            <div className="w-full max-w-2xl">
              <ManagerRow managers={tree.managers} onSelect={onSelect} />
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
              <DivisionSection key={div.name} division={div} onSelect={onSelect} />
            ))}
          </div>
        ) : tree.departments.length > 0 ? (
          <div className="flex justify-center gap-2 px-4" style={{ minWidth: 'max-content' }}>
            {tree.departments.map((dept) => (
              <DepartmentColumn key={dept.name} department={dept} onSelect={onSelect} />
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
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
  const [allStaffs, setAllStaffs] = useState<StaffMember[]>(() =>
    dedupeStaffs([...(orgChartDirectoryCache ?? []), ...staffs]),
  );
  const [teamIndex, setTeamIndex] = useState<OrgTeamIndex>(() => orgTeamsCache ?? new Map());
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(() => !orgChartDirectoryCache);

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

  const trees = useMemo(() => {
    const filtered =
      activeCompany === COMPANY_ALL
        ? directoryStaffs
        : directoryStaffs.filter((s) => getCompanyName(s) === activeCompany);

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
  }, [activeCompany, directoryStaffs, teamIndex]);

  const searchResults = useMemo(() => {
    const term = normalizeText(searchTerm);
    if (!term) return [];
    return directoryStaffs.filter((s) => {
      const hay = [
        normalizeText(s.name),
        normalizeText(s.position),
        getDepartmentName(s),
        getCompanyName(s),
      ].join(' ');
      return hay.includes(term);
    });
  }, [directoryStaffs, searchTerm]);

  const activeCount = useMemo(
    () => directoryStaffs.filter((s) => !isResignedStaff(s)).length,
    [directoryStaffs],
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
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => setSelectedStaff(staff)}
                      className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 text-left transition hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/50 hover:shadow-sm"
                    >
                      <Avatar staff={staff} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[var(--foreground)]">{normalizeText(staff.name)}</p>
                        <p className="truncate text-xs text-[var(--toss-gray-3)]">
                          {getCompanyName(staff)} · {getDepartmentName(staff)}
                        </p>
                        <p className="truncate text-[11px] text-[var(--toss-gray-3)]/70">{normalizeText(staff.position) || '직급 미지정'}</p>
                      </div>
                    </button>
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
              <CompanyPyramid key={tree.company} tree={tree} onSelect={setSelectedStaff} />
            ))
          ) : (
            <section className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-16 text-center shadow-sm">
              <h3 className="font-bold text-[var(--foreground)]">조직도에 표시할 직원이 없습니다.</h3>
              <p className="mt-1 text-sm font-medium text-[var(--toss-gray-3)]">회사나 검색 조건을 다시 확인해 주세요.</p>
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
              <Avatar staff={selectedStaff} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-xl font-black text-[var(--foreground)]">{normalizeText(selectedStaff.name)}</p>
                <p className="truncate text-sm font-semibold text-[var(--toss-gray-3)]">{normalizeText(selectedStaff.position) || '직급 미지정'}</p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--page-bg)] px-4">
              <InfoRow label="회사" value={getCompanyName(selectedStaff)} />
              <InfoRow label="부서" value={getDepartmentName(selectedStaff)} />
              <InfoRow label="사번" value={normalizeText(selectedStaff.employee_no) || '-'} />
              <InfoRow label="연락처" value={normalizeText(selectedStaff.phone) || '-'} />
              <InfoRow label="이메일" value={normalizeText(selectedStaff.email) || '-'} />
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
