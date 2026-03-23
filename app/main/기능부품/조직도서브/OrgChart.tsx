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

// 병원 진료부서별 팀 매핑
const HOSPITAL_DIVISION_MAP: { name: string; teams: string[]; headerClass: string; borderClass: string; bgClass: string }[] = [
  {
    name: '진료부',
    teams: ['진료팀'],
    headerClass: 'bg-blue-600 text-white',
    borderClass: 'border-blue-200',
    bgClass: 'bg-blue-50',
  },
  {
    name: '간호부',
    teams: ['병동팀', '외래팀', '수술팀', '검사팀'],
    headerClass: 'bg-emerald-600 text-white',
    borderClass: 'border-emerald-200',
    bgClass: 'bg-emerald-50',
  },
  {
    name: '행정관리부',
    teams: ['영양팀', '관리팀', '원무팀', '총무팀'],
    headerClass: 'bg-amber-600 text-white',
    borderClass: 'border-amber-200',
    bgClass: 'bg-amber-50',
  },
];

// 직급 키워드: 높은 직급 순서
const LEADER_KEYWORDS = [
  '대표이사', '이사장', '병원장', '대표원장', '부원장', '원장',
  '본부장', '센터장', '사장', '대표', '이사',
];

const POSITION_RANK_KEYWORDS = [
  '대표이사', '이사장', '병원장', '대표원장', '부원장', '원장', '이사',
  '본부장', '센터장', '실장', '부장', '대표', '차장', '과장', '팀장',
  '대리', '주임', '선임', '사원',
];

// 팀장 인덱스까지 = 부서장 이상
const MANAGER_MAX_IDX = POSITION_RANK_KEYWORDS.indexOf('팀장');

let orgChartDirectoryCache: StaffMember[] | null = null;
let orgChartDirectoryPromise: Promise<StaffMember[]> | null = null;

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
  const sorted = [...staffs].sort((a, b) => {
    const posA = normalizeText(a.position);
    const posB = normalizeText(b.position);
    const idxA = findBestKeywordIndex(posA, LEADER_KEYWORDS);
    const idxB = findBestKeywordIndex(posB, LEADER_KEYWORDS);
    const scoreA = idxA >= 0 ? LEADER_KEYWORDS.length - idxA : 0;
    const scoreB = idxB >= 0 ? LEADER_KEYWORDS.length - idxB : 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return compareStaff(a, b);
  });
  return sorted[0] ?? null;
}

function isManagerStaff(staff: StaffMember) {
  const pos = normalizeText(staff.position);
  const idx = findBestKeywordIndex(pos, POSITION_RANK_KEYWORDS);
  return idx >= 0 && idx <= MANAGER_MAX_IDX;
}

function isHospitalCompany(name: string) {
  return ['병원', '의원', '의료', '클리닉', '한의원', '치과'].some((kw) => name.includes(kw));
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

function buildCompanyTree(company: string, staffs: StaffMember[]): CompanyTree {
  const hospital = isHospitalCompany(company);
  const activeStaffs = staffs.filter((s) => !isResignedStaff(s)).sort(compareStaff);
  const leader = pickLeader(activeStaffs);
  const nonLeader = leader ? activeStaffs.filter((s) => s.id !== leader.id) : activeStaffs;

  // 부서장 이상 관리자 분리
  const managers = nonLeader.filter(isManagerStaff);
  const regularStaffs = nonLeader.filter((s) => !isManagerStaff(s));

  // 부서별 그룹
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

  // 병원 계열사: 진료부/간호부/행정관리부로 묶기
  let divisions: DivisionGroup[] = [];
  if (hospital) {
    const deptByName = new Map(departments.map((d) => [d.name, d]));
    const assigned = new Set<string>();

    for (const div of HOSPITAL_DIVISION_MAP) {
      const divDepts = div.teams
        .map((t) => deptByName.get(t))
        .filter((d): d is DepartmentGroup => !!d);
      divDepts.forEach((d) => assigned.add(d.name));
      // 팀이 없어도 빈 Division 구조는 표시 (팀 추가 전에도 보이도록)
      divisions.push({
        name: div.name,
        headerClass: div.headerClass,
        borderClass: div.borderClass,
        bgClass: div.bgClass,
        departments: divDepts,
      });
    }

    // 매핑에 없는 부서는 기타로
    const unassigned = departments.filter((d) => !assigned.has(d.name));
    if (unassigned.length > 0) {
      divisions.push({
        name: '기타',
        headerClass: 'bg-slate-500 text-white',
        borderClass: 'border-slate-200',
        bgClass: 'bg-slate-50',
        departments: unassigned,
      });
    }
  }

  return { company, leader, managers, divisions, departments, isHospital: hospital, activeCount: activeStaffs.length };
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function Avatar({ staff, size = 'md' }: { staff: StaffMember; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass =
    size === 'lg' ? 'h-12 w-12 text-base' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
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
      className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-left transition hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/60 hover:shadow-sm active:scale-[0.98]"
    >
      <Avatar staff={staff} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[var(--foreground)]">{normalizeText(staff.name)}</p>
        <p className="truncate text-xs text-[var(--toss-gray-3)]">{normalizeText(staff.position) || '직급 미지정'}</p>
      </div>
    </button>
  );
}

function DepartmentColumn({ department, onSelect }: { department: DepartmentGroup; onSelect: (s: StaffMember) => void }) {
  return (
    <section className="w-[200px] shrink-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className={`bg-gradient-to-r ${department.accentClass} px-4 py-3`}>
        <p className="text-sm font-bold text-white">{department.name}</p>
        <p className="mt-0.5 text-xs font-medium text-white/80">{department.members.length}명</p>
      </div>
      <div className="space-y-2 p-3">
        {department.members.length > 0 ? (
          department.members.map((staff) => (
            <StaffChip key={staff.id} staff={staff} onSelect={onSelect} />
          ))
        ) : (
          <p className="py-3 text-center text-xs text-[var(--toss-gray-3)]">–</p>
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
      className="flex items-center gap-3 rounded-2xl border border-[var(--accent)]/20 bg-[var(--card)] px-5 py-4 shadow-md transition hover:border-[var(--accent)]/40 hover:shadow-lg active:scale-[0.98]"
    >
      <Avatar staff={leader} size="lg" />
      <div className="text-left">
        <p className="text-lg font-black tracking-tight text-[var(--foreground)]">{normalizeText(leader.name)}</p>
        <p className="text-sm font-semibold text-[var(--toss-gray-3)]">{normalizeText(leader.position) || '대표'}</p>
      </div>
    </button>
  );
}

function ManagerRow({ managers, onSelect }: { managers: StaffMember[]; onSelect: (s: StaffMember) => void }) {
  if (managers.length === 0) return null;
  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <div className="border-b border-[var(--border)] bg-[var(--muted)] px-4 py-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">관리자</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 p-4">
        {managers.map((staff) => (
          <button
            key={staff.id}
            type="button"
            onClick={() => onSelect(staff)}
            className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2.5 transition hover:border-[var(--accent)]/30 hover:bg-[var(--toss-blue-light)]/60 hover:shadow-sm active:scale-[0.98]"
          >
            <Avatar staff={staff} size="sm" />
            <div className="text-left">
              <p className="text-sm font-bold text-[var(--foreground)]">{normalizeText(staff.name)}</p>
              <p className="text-xs text-[var(--toss-gray-3)]">
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
    <div className={`overflow-hidden rounded-2xl border ${division.borderClass} ${division.bgClass}`}>
      <div className={`${division.headerClass} px-4 py-2.5`}>
        <p className="text-sm font-bold">{division.name}</p>
        <p className="text-xs font-medium opacity-80">{division.departments.length}개 팀 · {totalMembers}명</p>
      </div>
      {division.departments.length > 0 ? (
        <div className="no-scrollbar overflow-x-auto p-3">
          <div className="flex items-start gap-3" style={{ minWidth: 'max-content' }}>
            {division.departments.map((dept) => (
              <DepartmentColumn key={dept.name} department={dept} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-xs font-medium text-[var(--toss-gray-3)]">
          소속 팀원이 없습니다.
        </div>
      )}
    </div>
  );
}

function CompanyPyramid({ tree, onSelect }: { tree: CompanyTree; onSelect: (s: StaffMember) => void }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--page-bg)] shadow-sm">
      {/* 회사 헤더 */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
        <div>
          <h3 className="font-bold text-[var(--foreground)]">{tree.company}</h3>
          <p className="mt-0.5 text-xs font-medium text-[var(--toss-gray-3)]">재직 {tree.activeCount}명</p>
        </div>
        <span className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">
          ORG
        </span>
      </div>

      <div className="flex flex-col items-center gap-0 px-5 py-5">
        {/* 대표/원장 */}
        {tree.leader ? (
          <LeaderCard leader={tree.leader} onSelect={onSelect} />
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border)] px-8 py-5 text-sm font-medium text-[var(--toss-gray-3)]">
            대표자 정보가 없습니다.
          </div>
        )}

        {/* 연결선 */}
        <div className="h-8 w-px bg-[var(--border)]" />

        {/* 관리자 영역 */}
        <div className="w-full">
          <ManagerRow managers={tree.managers} onSelect={onSelect} />
        </div>

        {/* 연결선 (관리자 있을 때) */}
        {tree.managers.length > 0 && <div className="h-8 w-px bg-[var(--border)]" />}

        {/* 부서 영역 */}
        {tree.isHospital ? (
          // 병원: 진료부 / 간호부 / 행정관리부로 구분
          <div className="w-full space-y-3">
            {tree.divisions.map((div) => (
              <DivisionSection key={div.name} division={div} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          // 일반 회사: 평면 부서 목록
          tree.departments.length > 0 ? (
            <div className="no-scrollbar w-full overflow-x-auto">
              <div className="flex items-start gap-3" style={{ minWidth: 'max-content' }}>
                {tree.departments.map((dept) => (
                  <DepartmentColumn key={dept.name} department={dept} onSelect={onSelect} />
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full rounded-2xl border border-dashed border-[var(--border)] px-5 py-10 text-center text-sm font-medium text-[var(--toss-gray-3)]">
              표시할 부서 정보가 없습니다.
            </div>
          )
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
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(() => !orgChartDirectoryCache);

  useEffect(() => {
    setAllStaffs((prev) => dedupeStaffs([...prev, ...staffs]));
  }, [staffs]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (orgChartDirectoryCache) {
        setAllStaffs((prev) => dedupeStaffs([...(orgChartDirectoryCache ?? []), ...prev, ...staffs]));
        setIsLoadingDirectory(false);
        return;
      }
      setIsLoadingDirectory(true);
      try {
        const directory = await fetchOrgChartDirectory();
        if (!ignore) setAllStaffs((prev) => dedupeStaffs([...directory, ...prev, ...staffs]));
      } catch (error) {
        if (!ignore) console.error('조직도 전체 직원 로드 실패:', error);
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
      .map(([co, members]) => buildCompanyTree(co, members))
      .filter((t) => t.activeCount > 0);
  }, [activeCompany, directoryStaffs]);

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
      {/* 헤더 */}
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm md:px-6">
        <div className="mx-auto w-full max-w-7xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black tracking-tight text-[var(--foreground)]">조직도</h2>
              <p className="text-xs font-medium text-[var(--toss-gray-3)]">
                전체 재직 {activeCount}명
                {isLoadingDirectory && (
                  <span className="ml-2 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold">
                    불러오는 중…
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
              {companyOptions.map((company) => {
                const active = activeCompany === company;
                return (
                  <button
                    key={company}
                    type="button"
                    onClick={() => setSelectedCo?.(company === COMPANY_ALL ? null : company)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                      active
                        ? 'bg-[var(--accent)] text-white shadow-sm'
                        : 'border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-3)] hover:border-[var(--accent)]/30 hover:text-[var(--foreground)]'
                    }`}
                  >
                    {company}
                  </button>
                );
              })}
            </div>

            <div className="relative w-full md:max-w-xs">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="이름, 직급, 부서, 회사 검색"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm font-medium text-[var(--foreground)] outline-none transition placeholder:text-[var(--toss-gray-3)] focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-base leading-none text-[var(--toss-gray-3)] hover:text-[var(--foreground)]"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className={`px-4 py-4 md:px-6 ${compact ? 'pb-4' : 'pb-6'}`}>
        <div className="mx-auto w-full max-w-7xl space-y-4">
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

      {/* 직원 상세 모달 */}
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
