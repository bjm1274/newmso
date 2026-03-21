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

type CompanyTree = {
  company: string;
  leader: StaffMember | null;
  departments: DepartmentGroup[];
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
const LEADER_KEYWORDS = ['대표이사', '이사장', '병원장', '원장', '대표원장', '부원장', '본부장', '센터장', '사장', '대표'];
const POSITION_RANK_KEYWORDS = ['대표이사', '이사장', '병원장', '원장', '대표원장', '부원장', '본부장', '센터장', '실장', '부장', '대표', '과장', '주임', '선임', '사원'];

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
    map.set(staff.id, {
      ...map.get(staff.id),
      ...staff,
    });
  }
  return Array.from(map.values());
}

function getCompanyName(staff: StaffMember) {
  return normalizeText(staff.company) || '회사 미지정';
}

function getDepartmentName(staff: StaffMember) {
  return normalizeText(staff.department) || '부서 미지정';
}

function getPositionScore(staff: StaffMember) {
  const position = normalizeText(staff.position);
  const keywordIndex = POSITION_RANK_KEYWORDS.findIndex((keyword) => position.includes(keyword));
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
    const positionA = normalizeText(a.position);
    const positionB = normalizeText(b.position);
    const leaderA = LEADER_KEYWORDS.findIndex((keyword) => positionA.includes(keyword));
    const leaderB = LEADER_KEYWORDS.findIndex((keyword) => positionB.includes(keyword));
    const leaderScoreA = leaderA >= 0 ? LEADER_KEYWORDS.length - leaderA : 0;
    const leaderScoreB = leaderB >= 0 ? LEADER_KEYWORDS.length - leaderB : 0;
    if (leaderScoreB !== leaderScoreA) return leaderScoreB - leaderScoreA;
    return compareStaff(a, b);
  });

  return sorted[0] ?? null;
}

function compareDepartment(a: DepartmentGroup, b: DepartmentGroup) {
  const sizeDiff = b.members.length - a.members.length;
  if (sizeDiff !== 0) return sizeDiff;
  return a.name.localeCompare(b.name, 'ko-KR');
}

async function fetchOrgChartDirectory() {
  if (orgChartDirectoryCache) {
    return orgChartDirectoryCache;
  }

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

function buildCompanyTree(company: string, staffs: StaffMember[]) {
  const activeStaffs = staffs.filter((staff) => !isResignedStaff(staff)).sort(compareStaff);
  const leader = pickLeader(activeStaffs);
  const memberPool = leader ? activeStaffs.filter((staff) => staff.id !== leader.id) : activeStaffs;

  const departmentMap = new Map<string, StaffMember[]>();
  for (const staff of memberPool) {
    const department = getDepartmentName(staff);
    const bucket = departmentMap.get(department) ?? [];
    bucket.push(staff);
    departmentMap.set(department, bucket);
  }

  const departments = Array.from(departmentMap.entries())
    .map(([name, members], index) => ({
      name,
      members: members.sort(compareStaff),
      accentClass: DEPARTMENT_ACCENTS[index % DEPARTMENT_ACCENTS.length],
    }))
    .sort(compareDepartment);

  return {
    company,
    leader,
    departments,
    activeCount: activeStaffs.length,
  } satisfies CompanyTree;
}

function Avatar({ staff, size = 'md' }: { staff: StaffMember; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-9 w-9 text-sm' : 'h-11 w-11 text-base';
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

  return <div className={`${sizeClass} ${color} flex shrink-0 items-center justify-center rounded-full font-black`}>{name[0]}</div>;
}

function StaffChip({ staff, onSelect }: { staff: StaffMember; onSelect: (staff: StaffMember) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(staff)}
      className="flex w-full items-center gap-3 rounded-2xl border border-white/60 bg-white/90 px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <Avatar staff={staff} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-900">{normalizeText(staff.name)}</p>
        <p className="truncate text-xs font-semibold text-slate-500">{normalizeText(staff.position) || '직급 미지정'}</p>
      </div>
    </button>
  );
}

function DepartmentColumn({
  department,
  onSelect,
  compact,
}: {
  department: DepartmentGroup;
  onSelect: (staff: StaffMember) => void;
  compact: boolean;
}) {
  return (
    <section className={`rounded-[28px] border border-slate-200/80 bg-white/85 p-4 shadow-[0_18px_38px_rgba(15,23,42,0.08)] backdrop-blur ${compact ? 'min-w-[240px]' : 'min-w-[280px]'}`}>
      <div className={`rounded-[20px] bg-gradient-to-r ${department.accentClass} px-4 py-4 text-white shadow-lg`}>
        <p className="text-lg font-black">{department.name}</p>
        <p className="mt-1 text-xs font-semibold text-white/85">{department.members.length}명</p>
      </div>
      <div className="mt-4 space-y-3">
        {department.members.map((staff) => (
          <StaffChip key={staff.id} staff={staff} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function CompanyPyramid({
  tree,
  onSelect,
  compact,
}: {
  tree: CompanyTree;
  onSelect: (staff: StaffMember) => void;
  compact: boolean;
}) {
  return (
    <section className="rounded-[32px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_54px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col items-center">
        <div className="rounded-full bg-slate-100 px-4 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          {tree.company}
        </div>
        <div className="mt-5 flex flex-col items-center">
          {tree.leader ? (
            <button
              type="button"
              onClick={() => onSelect(tree.leader!)}
              className="rounded-[28px] border border-sky-200 bg-white px-7 py-5 text-center shadow-[0_22px_40px_rgba(14,165,233,0.18)] transition hover:-translate-y-0.5"
            >
              <div className="mx-auto mb-3 flex justify-center">
                <Avatar staff={tree.leader} size="lg" />
              </div>
              <p className="text-2xl font-black tracking-tight text-slate-900">{normalizeText(tree.leader.name)}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">{normalizeText(tree.leader.position) || '대표'}</p>
            </button>
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-8 py-6 text-center text-sm font-semibold text-slate-500">
              대표자 정보가 없습니다.
            </div>
          )}
          <div className="mt-4 h-10 w-px bg-slate-300" />
        </div>
      </div>

      {tree.departments.length > 0 ? (
        <div className="overflow-x-auto pb-2">
          <div className={`mx-auto flex items-start justify-center gap-4 ${compact ? 'min-w-max' : 'min-w-[980px]'}`}>
            {tree.departments.map((department) => (
              <DepartmentColumn key={department.name} department={department} onSelect={onSelect} compact={compact} />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm font-semibold text-slate-500">
          표시할 부서 정보가 없습니다.
        </div>
      )}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-semibold text-slate-400">{label}</span>
      <span className="text-right text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

export default function OrgChart({
  user,
  staffs = [],
  selectedCo,
  setSelectedCo,
  compact = false,
}: OrgChartProps) {
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [allStaffs, setAllStaffs] = useState<StaffMember[]>(() => dedupeStaffs([...(orgChartDirectoryCache ?? []), ...staffs]));
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(() => !orgChartDirectoryCache);

  useEffect(() => {
    setAllStaffs((previous) => dedupeStaffs([...previous, ...staffs]));
  }, [staffs]);

  useEffect(() => {
    let ignore = false;

    const loadAllStaffs = async () => {
      if (orgChartDirectoryCache) {
        const cachedDirectory = orgChartDirectoryCache ?? [];
        setAllStaffs((previous) => dedupeStaffs([...cachedDirectory, ...previous, ...staffs]));
        setIsLoadingDirectory(false);
        return;
      }

      setIsLoadingDirectory(true);
      try {
        const directory = await fetchOrgChartDirectory();
        if (!ignore) {
          setAllStaffs((previous) => dedupeStaffs([...directory, ...previous, ...staffs]));
        }
      } catch (error) {
        if (!ignore) {
          console.error('조직도 전체 직원 로드 실패:', error);
        }
      } finally {
        if (!ignore) {
          setIsLoadingDirectory(false);
        }
      }
    };

    void loadAllStaffs();
    return () => {
      ignore = true;
    };
  }, [staffs]);

  const directoryStaffs = useMemo(
    () =>
      dedupeStaffs(allStaffs)
        .filter((staff) => normalizeText(staff.name))
        .sort((a, b) => {
          const companyDiff = getCompanyName(a).localeCompare(getCompanyName(b), 'ko-KR');
          if (companyDiff !== 0) return companyDiff;
          const departmentDiff = getDepartmentName(a).localeCompare(getDepartmentName(b), 'ko-KR');
          if (departmentDiff !== 0) return departmentDiff;
          return compareStaff(a, b);
        }),
    [allStaffs]
  );

  const companyOptions = useMemo(() => {
    const companies = Array.from(new Set(directoryStaffs.map((staff) => getCompanyName(staff))));
    const userCompany = normalizeText(user?.company);
    const sorted = companies.sort((a, b) => {
      if (a === userCompany) return -1;
      if (b === userCompany) return 1;
      return a.localeCompare(b, 'ko-KR');
    });
    return [COMPANY_ALL, ...sorted];
  }, [directoryStaffs, user?.company]);

  const activeCompany = selectedCo && normalizeText(selectedCo) ? normalizeText(selectedCo) : COMPANY_ALL;

  const trees = useMemo(() => {
    const filtered = activeCompany === COMPANY_ALL
      ? directoryStaffs
      : directoryStaffs.filter((staff) => getCompanyName(staff) === activeCompany);

    const grouped = new Map<string, StaffMember[]>();
    for (const staff of filtered) {
      const company = getCompanyName(staff);
      const bucket = grouped.get(company) ?? [];
      bucket.push(staff);
      grouped.set(company, bucket);
    }

    return Array.from(grouped.entries())
      .map(([company, members]) => buildCompanyTree(company, members))
      .filter((tree) => tree.activeCount > 0);
  }, [activeCompany, directoryStaffs]);

  const searchResults = useMemo(() => {
    const term = normalizeText(searchTerm);
    if (!term) return [];

    return directoryStaffs.filter((staff) => {
      const haystack = [
        normalizeText(staff.name),
        normalizeText(staff.position),
        getDepartmentName(staff),
        getCompanyName(staff),
      ].join(' ');
      return haystack.includes(term);
    });
  }, [directoryStaffs, searchTerm]);

  const activeCount = useMemo(
    () => directoryStaffs.filter((staff) => !isResignedStaff(staff)).length,
    [directoryStaffs]
  );

  return (
    <div
      data-testid="org-chart-pyramid-view"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[linear-gradient(180deg,#eef4ff_0%,#f8fafc_25%,#f8fafc_100%)]"
    >
      <div className="border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Organization Map</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">회사별 피라미드 조직도</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">전체 회사 직원 {activeCount}명을 회사별로 한 번에 볼 수 있습니다.</p>
            </div>
            {isLoadingDirectory && (
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                전체 직원 불러오는 중
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {companyOptions.map((company) => {
                const active = activeCompany === company;
                return (
                  <button
                    key={company}
                    type="button"
                    onClick={() => setSelectedCo?.(company === COMPANY_ALL ? null : company)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                      active
                        ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/15'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    {company}
                  </button>
                );
              })}
            </div>

            <div className="relative w-full md:max-w-sm">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="이름, 직급, 부서, 회사 검색"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-200/60"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          {searchTerm ? (
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h3 className="text-lg font-black text-slate-900">검색 결과</h3>
                <p className="text-sm font-medium text-slate-500">{searchResults.length}명</p>
              </div>
              {searchResults.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {searchResults.map((staff) => (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => setSelectedStaff(staff)}
                      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
                    >
                      <Avatar staff={staff} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">{normalizeText(staff.name)}</p>
                        <p className="truncate text-xs font-semibold text-slate-500">
                          {getCompanyName(staff)} · {getDepartmentName(staff)}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">{normalizeText(staff.position) || '직급 미지정'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm font-medium text-slate-500">
                  검색 결과가 없습니다.
                </div>
              )}
            </section>
          ) : trees.length > 0 ? (
            trees.map((tree) => <CompanyPyramid key={tree.company} tree={tree} onSelect={setSelectedStaff} compact={compact} />)
          ) : (
            <section className="rounded-[28px] border border-dashed border-slate-300 bg-white px-5 py-16 text-center shadow-sm">
              <h3 className="text-xl font-black text-slate-900">조직도에 표시할 직원이 없습니다.</h3>
              <p className="mt-2 text-sm font-medium text-slate-500">회사나 검색 조건을 다시 확인해 주세요.</p>
            </section>
          )}
        </div>
      </div>

      {selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm md:items-center md:p-6" onClick={() => setSelectedStaff(null)}>
          <div className="w-full max-w-md rounded-t-[32px] bg-white p-6 shadow-2xl md:rounded-[32px]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-4">
              <Avatar staff={selectedStaff} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-2xl font-black text-slate-900">{normalizeText(selectedStaff.name)}</p>
                <p className="truncate text-sm font-semibold text-slate-500">{normalizeText(selectedStaff.position) || '직급 미지정'}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm">
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
              className="mt-5 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
