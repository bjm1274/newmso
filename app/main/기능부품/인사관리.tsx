'use client';

/**
 * 인사관리 (HR) 메인 뷰 — B(4그룹) 6워크센터 구조
 *
 * - 사이드바: 4그룹 (인력 / 근태·휴가 / 보상 / 복지·문서)
 * - 6개 영문 워크센터 id: member · attend · leave · payroll · welfare · docs
 *   (근태이상 감지(abnormal)는 근태(attend) 내부 탭으로 통합)
 * - 급여(payroll)만 primary ★ 표시
 * - 본문은 HrWorkcenterRouter 로 일원화 (옛 한글 본문 분기 제거)
 *
 * 근거: handoff/hr_b_handoff/DECISION_B.md (2026-05-27 사용자 확정)
 *
 * JM: 파일당 단일 책임 — 사이드바 + 워크센터 라우팅
 * JM3: 옛 localStorage(HR_TAB_KEY) 한글 값은 REMOVED_MENU_FALLBACKS 로 흡수
 * JM4: HrMenuId = WorkcenterId union (영문 6개)
 */

import { useEffect, useMemo, useState } from 'react';
import { HR_COMPANY_KEY, HR_STATUS_KEY, HR_TAB_KEY } from '@/app/main/navigation-state';
import { canAccessHrSection, canAccessMainMenu, isAdminUser } from '@/lib/access-control';
import { MenuIcon } from './조직도서브/조직도측면창';
import { ChevronDown } from 'lucide-react';
import HrWorkcenterRouter, { type WorkcenterId } from './인사관리워크센터';
import { useCompany } from '@/app/main/contexts/CompanyContext';

// ─── 타입 ────────────────────────────────────────────────────────────
type HrMenuId = WorkcenterId;
type StaffStatus = '재직' | '퇴사';
type HrGroupLabel = '인력' | '근태·휴가' | '보상' | '복지·문서';

interface HrTabDef {
  id: HrMenuId;
  label: string;
  icon: string;
  group: HrGroupLabel;
  perm: string;
  primary?: boolean;
}

// ─── B(4그룹) 6워크센터 (근태이상 감지는 근태 내부 탭으로 통합) ───────
const HR_TABS: HrTabDef[] = [
  { id: 'member',   label: '구성원',         group: '인력',      icon: 'users',      perm: 'hr_구성원' },
  { id: 'attend',   label: '근태',           group: '근태·휴가', icon: 'history',    perm: 'hr_근태' },
  { id: 'leave',    label: '연차·휴가',      group: '근태·휴가', icon: 'calendar',   perm: 'hr_연차휴가' },
  { id: 'payroll',  label: '급여 워크센터',  group: '보상',      icon: 'calculator', perm: 'hr_급여' },
  { id: 'welfare',  label: '복지',           group: '복지·문서', icon: 'bell',       perm: 'hr_경조사' },
  { id: 'docs',     label: '계약·문서',      group: '복지·문서', icon: 'document',   perm: 'hr_계약' },
];

const HR_GROUPS: HrGroupLabel[] = ['인력', '근태·휴가', '보상', '복지·문서'];

// ─── 옛 한글 메뉴 id → 신 영문 id 매핑 (localStorage·즐겨찾기·외부 호출 호환) ──
const REMOVED_MENU_FALLBACKS: Record<string, HrMenuId> = {
  // 인력
  구성원: 'member',
  인사변동: 'member',
  '입퇴사·교육센터': 'member',
  인력생애주기센터: 'member',
  채용관리: 'member',
  교육: 'member',
  오프보딩: 'member',
  조직도: 'member',
  스킬매트릭스: 'member',
  회의실예약: 'member',
  차량배차: 'member',
  비품대여: 'member',
  인사발령: 'member',
  '포상/징계': 'member',
  칭찬배지: 'member',
  // 근태
  근태: 'attend',
  근무형태이력: 'attend',
  근무표자동편성: 'attend',
  '근무표 자동편성': 'attend',
  간호근무표: 'attend',
  교대근무: 'attend',
  // 연차·휴가
  '연차/휴가': 'leave',
  연차소멸알림: 'leave',
  공휴일달력: 'leave',
  // 근태이상 감지 — 근태 워크센터 내부 'abnormal' 탭으로 통합 (사이드바 메뉴 미노출)
  abnormal: 'attend',
  '근태이상 감지': 'attend',
  근태이상: 'attend',
  지각조퇴분석: 'attend',
  근태이상분석: 'attend',
  '지각·조퇴·조기퇴근': 'attend',
  '근태 차감 시뮬레이터': 'attend',
  근태차감시뮬레이터: 'attend',
  '근태 이상 탐지': 'attend',
  근태이상탐지: 'attend',
  조기퇴근감지: 'attend',
  // 보상
  급여: 'payroll',
  '4대보험': 'payroll',
  원천징수파일: 'payroll',
  // 복지
  경조사: 'welfare',
  '생일/기념일': 'welfare',
  생일기념일: 'welfare',
  '자격·안전센터': 'welfare',
  규정준수센터: 'welfare',
  건강검진: 'welfare',
  '면허/자격증': 'welfare',
  의료기기점검: 'welfare',
  사고보고서: 'welfare',
  // 계약·문서
  계약: 'docs',
  문서센터: 'docs',
  문서보관함: 'docs',
  증명서: 'docs',
  서류제출: 'docs',
  계약서생성기: 'docs',
};

const HR_TAB_IDS = HR_TABS.map((tab) => tab.id);

function normalizeHrMenu(menuId?: string | null): HrMenuId {
  if (!menuId) return 'member';
  if (HR_TAB_IDS.includes(menuId as HrMenuId)) {
    return menuId as HrMenuId;
  }
  if (REMOVED_MENU_FALLBACKS[menuId]) {
    return REMOVED_MENU_FALLBACKS[menuId];
  }
  return 'member';
}

function getInitialHrMenuState(initialMenu?: string | null): HrMenuId {
  if (initialMenu) {
    return normalizeHrMenu(initialMenu);
  }
  if (typeof window !== 'undefined') {
    try {
      const savedTab = window.localStorage.getItem(HR_TAB_KEY);
      if (savedTab) return normalizeHrMenu(savedTab);
    } catch {
      // ignore — storage 접근 실패 시 기본값
    }
  }
  return 'member';
}

type HrUser = Parameters<typeof canAccessHrSection>[0];

// 워크센터별 접근권한 그룹 — 단일 perm 으로 막기 어려운 경우 합집합 처리
function canAccessHrTab(user: HrUser, tab: HrTabDef): boolean {
  switch (tab.id) {
    case 'attend':
      return (
        canAccessHrSection(user, 'hr_근태') ||
        canAccessHrSection(user, 'hr_연차휴가') ||
        canAccessHrSection(user, 'hr_근무표생성')
      );
    case 'leave':
      return canAccessHrSection(user, 'hr_연차휴가') || canAccessHrSection(user, 'hr_근태');
    case 'welfare':
      return (
        canAccessHrSection(user, 'hr_경조사') ||
        canAccessHrSection(user, 'hr_건강검진') ||
        canAccessHrSection(user, 'hr_면허자격증') ||
        canAccessHrSection(user, 'hr_의료기기점검') ||
        canAccessHrSection(user, 'hr_사고보고서')
      );
    case 'docs':
      return (
        canAccessHrSection(user, 'hr_계약') ||
        canAccessHrSection(user, 'hr_문서보관함') ||
        canAccessHrSection(user, 'hr_증명서') ||
        canAccessHrSection(user, 'hr_서류제출')
      );
    case 'member':
      return canAccessHrSection(user, 'hr_구성원') || canAccessHrSection(user, 'hr_인사발령');
    case 'payroll':
      return canAccessHrSection(user, 'hr_급여');
    default:
      return canAccessHrSection(user, tab.perm);
  }
}

// ─── Props ───────────────────────────────────────────────────────────
interface HRMainViewProps {
  user?: Record<string, unknown> | null;
  staffs?: Record<string, unknown>[];
  depts?: Record<string, unknown>[];
  onRefresh?: () => void;
  initialMenu?: string | null;
  selectedCo?: string | null;
}

// ─── 본체 ────────────────────────────────────────────────────────────
export default function HRMainView({
  user,
  staffs,
  onRefresh,
  initialMenu,
  selectedCo: mainSelectedCo,
}: HRMainViewProps) {
  const { selectedCo: globalSelectedCo, setSelectedCo: setGlobalSelectedCo } = useCompany();
  const [현재메뉴, 메뉴설정] = useState<HrMenuId>(() => getInitialHrMenuState(initialMenu));
  const [선택사업체, 사업체설정] = useState('전체');
  const [subNavCollapsed, setSubNavCollapsed] = useState(false);
  const [직원상태필터, 직원상태필터설정] = useState<StaffStatus>('재직');
  const [문서연결대상, 문서연결대상설정] = useState<{ id?: string; name?: string } | undefined>(undefined);

  type UserLike = Parameters<typeof canAccessMainMenu>[0];
  const userLike = user as unknown as UserLike;
  const hasAccess = canAccessMainMenu(userLike, '인사관리');
  const isMsoViewer =
    (user?.company as string) === 'SY INC.' ||
    (user?.permissions as Record<string, unknown>)?.mso === true;

  const hrUser = user as HrUser;
  const visibleHrTabs = useMemo(
    () => HR_TABS.filter((tab) => canAccessHrTab(hrUser, tab)),
    [hrUser]
  );
  const visibleHrTabIds = visibleHrTabs.map((tab) => tab.id);
  const activeMenu: HrMenuId = visibleHrTabIds.includes(현재메뉴)
    ? 현재메뉴
    : visibleHrTabs[0]?.id || 'member';
  const canRegisterNewStaff = isAdminUser(user) || canAccessHrSection(hrUser, 'hr_직원등록');

  const 인사직원목록 = useMemo(
    () => (isMsoViewer && Array.isArray(staffs) ? staffs : staffs || []),
    [isMsoViewer, staffs]
  );

  const 사업체목록: string[] = useMemo(() => {
    const set = new Set<string>(['전체']);
    인사직원목록.forEach((s) => {
      const co = (s as Record<string, unknown>)?.company;
      if (typeof co === 'string' && co.trim()) set.add(co);
    });
    set.add('SY INC.');
    return Array.from(set);
  }, [인사직원목록]);

  const stats = useMemo(() => {
    const companyCounts: Record<string, number> = {};
    let activeCount = 0;
    let resignedCount = 0;

    인사직원목록.forEach((s) => {
      const co = (s as Record<string, unknown>)?.company;
      const status = (s as Record<string, unknown>)?.status;
      const companyName = typeof co === 'string' && co.trim() ? co.trim() : '미지정';
      
      // count by company
      companyCounts[companyName] = (companyCounts[companyName] || 0) + 1;
      
      // count by status
      if (status === '퇴사') {
        resignedCount++;
      } else {
        activeCount++;
      }
    });

    return {
      companyCounts,
      activeCount,
      resignedCount,
    };
  }, [인사직원목록]);

  // 사업체 동기화
  useEffect(() => {
    const targetCo = globalSelectedCo || mainSelectedCo || '전체';
    if (사업체목록.includes(targetCo)) {
      사업체설정(targetCo);
    }
  }, [globalSelectedCo, mainSelectedCo, 사업체목록]);

  const handleCompanyChange = (val: string) => {
    사업체설정(val);
    if (setGlobalSelectedCo) {
      setGlobalSelectedCo(val === '전체' ? null : val);
    }
  };

  // 메뉴 적용
  const 적용입장메뉴 = (requestedMenu?: string | null) => {
    메뉴설정(normalizeHrMenu(requestedMenu));
  };

  const handleMenuSelect = (menuId: HrMenuId) => {
    적용입장메뉴(menuId);
  };

  useEffect(() => {
    if (initialMenu) {
      적용입장메뉴(initialMenu);
    }
  }, [initialMenu]);

  // 초기 localStorage 복원
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedTab = window.localStorage.getItem(HR_TAB_KEY);
      const savedCo = window.localStorage.getItem(HR_COMPANY_KEY);
      const savedStatus = window.localStorage.getItem(HR_STATUS_KEY) as StaffStatus | null;
      const hasExplicitInitial = typeof initialMenu === 'string' && initialMenu.trim().length > 0;
      if (!hasExplicitInitial && savedTab) {
        적용입장메뉴(savedTab);
      }
      if (savedCo) 사업체설정(savedCo);
      if (savedStatus === '재직' || savedStatus === '퇴사') 직원상태필터설정(savedStatus);
    } catch {
      // 무시 — storage 접근 차단 환경 (사파리 시크릿 등)
    }
  }, [initialMenu, user?.id]);

  useEffect(() => {
    const handleHrMenuChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail && HR_TAB_IDS.includes(customEvent.detail as HrMenuId)) {
        메뉴설정(customEvent.detail as HrMenuId);
      }
    };
    window.addEventListener('hr-menu-change', handleHrMenuChange);
    return () => window.removeEventListener('hr-menu-change', handleHrMenuChange);
  }, []);

  // 권한 변경으로 현재 메뉴가 사라진 경우 fallback
  const visibleHrTabIdsKey = visibleHrTabIds.join(',');
  useEffect(() => {
    if (!visibleHrTabIds.includes(activeMenu)) {
      메뉴설정(visibleHrTabs[0]?.id || 'member');
    }
  }, [activeMenu, visibleHrTabIdsKey]);

  // localStorage 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(HR_TAB_KEY, activeMenu);
      window.localStorage.setItem(HR_COMPANY_KEY, 선택사업체);
      window.localStorage.setItem(HR_STATUS_KEY, 직원상태필터);
    } catch {
      // ignore
    }
  }, [activeMenu, 선택사업체, 직원상태필터]);

  // 문서 워크센터로 점프 (직원 상세에서 호출)
  const 인사서류보기 = (직원: { id?: string; name?: string; company?: string }) => {
    문서연결대상설정({ id: 직원.id, name: 직원.name });
    if (직원.company) 사업체설정(직원.company);
    메뉴설정('docs');
  };

  if (!hasAccess || visibleHrTabs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--muted)] p-4">
        <div className="mb-4 text-5xl" aria-hidden="true">🔒</div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">인사관리 접근 권한이 없습니다.</h2>
        <p className="mt-2 text-sm font-bold text-[var(--toss-gray-4)]">
          메인 메뉴 권한과 세부 인사관리 권한을 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="app-page flex h-full min-h-0 flex-col overflow-x-hidden md:flex-row">
      {/* ─── 사이드바 (B 4그룹) ─── */}
      <aside className="app-subnav no-scrollbar scroll-smooth snap-x snap-mandatory flex h-auto w-full shrink-0 flex-col overflow-x-auto border-b md:sticky md:top-0 md:h-[100dvh] md:max-h-[100dvh] md:w-[var(--submenu-width)] md:snap-none md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {/* 모바일 토글 헤더 */}
          <button
            type="button"
            onClick={() => setSubNavCollapsed((v) => !v)}
            aria-expanded={!subNavCollapsed}
            aria-controls="hr-subnav-items"
            className="flex min-h-11 w-full shrink-0 touch-manipulation items-center justify-between gap-2 px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] md:hidden"
          >
            <span className="truncate">
              {visibleHrTabs.find((t) => t.id === activeMenu)?.label || '서브메뉴'}
            </span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`shrink-0 transition-transform duration-150 ${subNavCollapsed ? '' : 'rotate-180'}`}
            />
          </button>

          {/* 모바일 칩 리스트 */}
          <div
            id="hr-subnav-items"
            className={`no-scrollbar ${subNavCollapsed ? 'hidden' : 'flex'} gap-0.5 overflow-x-auto px-2 py-1.5 md:hidden`}
          >
            {visibleHrTabs.map(({ id, label, icon, primary }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleMenuSelect(id)}
                data-testid={`hr-menu-${id}`}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] px-3 py-2.5 text-[12px] font-semibold tracking-normal transition-all ${
                  activeMenu === id
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--toss-gray-4)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <MenuIcon name={icon} className="h-[14px] w-[14px] shrink-0" />
                <span>{label}</span>
                {primary && (
                  <span
                    aria-label="우선순위"
                    className="ml-1 inline-flex h-[16px] items-center rounded-full bg-[#FEF3C7] px-1.5 text-[10px] font-bold text-[#92400E]"
                  >
                    ★
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 데스크톱 4그룹 리스트 */}
          <div className="hidden px-2 py-3 md:block">
            {HR_GROUPS.map((group, groupIndex) => {
              const groupTabs = visibleHrTabs.filter((tab) => tab.group === group);
              if (groupTabs.length === 0) return null;

              return (
                <div
                  key={group}
                  className={`flex flex-col gap-0.5 ${groupIndex > 0 ? 'mt-3.5' : ''}`}
                >
                  <p className="app-subnav-group-label px-2 pb-1 select-none">{group}</p>
                  {groupTabs.map(({ id, label, icon, primary }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleMenuSelect(id)}
                      data-testid={`hr-menu-${id}`}
                      aria-current={activeMenu === id ? 'page' : undefined}
                      className={`app-subnav-item flex min-h-[32px] w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold tracking-normal ${
                        activeMenu === id ? 'is-active' : ''
                      }`}
                    >
                      <span
                        className="inline-flex shrink-0"
                        style={{ opacity: activeMenu === id ? 1 : 0.65 }}
                      >
                        <MenuIcon name={icon} className="h-[14px] w-[14px]" />
                      </span>
                      <span className="flex-1 truncate">{label}</span>
                      {primary && (
                        <span
                          aria-label="우선순위"
                          className="inline-flex h-[16px] shrink-0 items-center rounded-full bg-[#FEF3C7] px-1.5 text-[10px] font-bold text-[#92400E]"
                        >
                          ★
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* 사업체·상태 필터 */}
        <div className="shrink-0 border-t border-[var(--border)] px-2 py-2 md:sticky md:bottom-0 md:z-10 md:bg-[var(--card)] md:px-3">
          <div className="flex gap-1.5 md:flex-col md:gap-1.5">
            <select
              id="hr-company-select"
              aria-label="사업체 선택"
              data-testid="hr-company-select"
              value={선택사업체}
              onChange={(event) => handleCompanyChange(event.target.value)}
              className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] outline-none"
            >
              {사업체목록.map((회사명) => (
                <option key={회사명} value={회사명}>
                  {회사명}
                </option>
              ))}
            </select>
            <select
              id="hr-status-select"
              aria-label="직원 상태 필터"
              data-testid="hr-status-select"
              value={직원상태필터}
              onChange={(event) => 직원상태필터설정(event.target.value as StaffStatus)}
              className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--tab-bg)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] outline-none"
            >
              <option value="재직">재직자</option>
              <option value="퇴사">퇴사자</option>
            </select>
          </div>

          {/* 데스크톱/모바일 전체 노출 통계 */}
          <div className="mt-2.5 space-y-2 rounded-lg bg-[var(--muted)]/50 p-2 text-[10px] border border-[var(--border-subtle)]">
            <div>
              <div className="font-bold text-[var(--toss-gray-3)] px-0.5 mb-1 text-[9.5px]">상태별 현황</div>
              <div className="flex gap-1 px-0.5">
                <span className="inline-flex items-center gap-0.5 bg-emerald-500/10 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-[var(--radius-xs)] font-bold text-emerald-600 dark:text-emerald-400">
                  재직 {stats.activeCount}명
                </span>
                <span className="inline-flex items-center gap-0.5 bg-zinc-200/50 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded-[var(--radius-xs)] font-bold text-[var(--toss-gray-4)]">
                  퇴사 {stats.resignedCount}명
                </span>
              </div>
            </div>
            
            <div className="border-t border-[var(--border-subtle)] pt-2">
              <div className="font-bold text-[var(--toss-gray-3)] px-0.5 mb-1 text-[9.5px]">회사별 직원</div>
              <div className="grid grid-cols-1 gap-1 px-0.5 max-h-[120px] overflow-y-auto custom-scrollbar">
                {Object.entries(stats.companyCounts).map(([companyName, count]) => (
                  <div key={companyName} className="flex justify-between items-center text-[10px]">
                    <span className="truncate max-w-[110px] text-[var(--toss-gray-4)] font-medium">{companyName}</span>
                    <span className="font-bold text-[var(--foreground)] shrink-0">{count}명</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── 메인: 워크센터 라우터 ─── */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <section className="custom-scrollbar flex-1 overflow-y-auto bg-[var(--page-bg)]">
          <HrWorkcenterRouter
              workcenterId={activeMenu}
              staffs={인사직원목록 as never}
              selectedCo={선택사업체}
              statusFilter={직원상태필터}
              user={user}
              onRefresh={onRefresh}
              canRegisterNewStaff={canRegisterNewStaff}
              onOpenNewStaff={undefined /* MemberWorkcenter 내부에서 자체 등록 모달 처리 */}
              onOpenDocumentRepoForStaff={(staff) =>
                인사서류보기(staff as { id?: string; name?: string; company?: string })
              }
              linkedTarget={문서연결대상}
              canManageDocuments={isAdminUser(user)}
              initialMenu={initialMenu}
            />
        </section>
      </main>
    </div>
  );
}
