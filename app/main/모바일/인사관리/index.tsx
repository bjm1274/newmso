'use client';
/* eslint-disable react-hooks/rules-of-hooks */

/**
 * 인사관리 라우터 + 허브.
 *
 * 기본 진입은 'hub' — 회사/KPI + 6개 메뉴 카드. 메뉴 선택 시 각 서브 화면으로 분기.
 * 서브 화면에서 뒤로가기는 허브로 복귀(허브에서 뒤로가기는 모듈 종료 onExit).
 *
 * 외부 진입:
 *   <인사관리 user={user} onExit={() => ...} />            // 허브부터
 *   <인사관리 user={user} initialView="payroll" .../>      // 특정 화면 직접 진입
 *
 * JM: 분기·허브만 담당
 * JM4: HrView union으로 타입 안정성
 */

import { useCallback, useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';
import MobileHeader from '../셸/MobileHeader';
import MListRow from '../공통/MListRow';
import MKpi from '../공통/MKpi';
import MIcon from '../공통/MIcon';
import MSheet from '../공통/MSheet';
import 구성원 from './구성원';
import 근태 from './근태';
import 연차 from './연차';
import 근태이상 from './근태이상';
import 급여워크센터 from './급여워크센터';
import 복지 from './복지';
import 계약문서 from './계약문서';
import 오프보딩 from './오프보딩';
import 문서보관함 from './문서보관함';
import 구성원등록 from './구성원등록';
import 연차신청 from './연차신청';
import { useStaffList } from './data-hooks';
import { isActiveStaff } from '@/lib/active-staff';
import { canAccessHrSection } from '@/lib/access-control';

export type HrView =
  | 'hub'
  | 'member'
  | 'attend'
  | 'leave'
  | 'abnormal'
  | 'payroll'
  | 'welfare'
  | 'docs'
  | 'offboarding'
  | 'archive'
  | 'form-member'
  | 'form-leave';

export type 인사관리Props = {
  user: ErpUser;
  initialView?: HrView;
  /** 인사관리 모듈을 닫고 상위로 돌아갈 때 호출 */
  onExit: () => void;
};

type HrMenuId =
  | 'member'
  | 'attend'
  | 'leave'
  | 'abnormal'
  | 'payroll'
  | 'welfare'
  | 'docs'
  | 'offboarding'
  | 'archive';

type HrTone = '' | 'accent' | 'success' | 'warning' | 'danger';

interface HrMenu {
  id: HrMenuId;
  label: string;
  sub: string;
  icon: string;
  tone: HrTone;
  badge?: string;
  badgeTone?: HrTone;
  /** 접근권한 판정 키(미지정 시 항상 노출). PC canAccessHrSection 과 동일 정책. */
  perm?: string;
}

const HR_MENU: HrMenu[] = [
  { id: 'member', label: '구성원', sub: '명단 · 인사발령 · 교육 · 자격', icon: 'users', tone: 'accent' },
  { id: 'attend', label: '근태', sub: '대시보드 · 근무표 · 3교대 · 근태이상', icon: 'clock', tone: 'success' },
  { id: 'leave', label: '연차 · 휴가', sub: '잔여 · 신청 내역 · 소멸 알림 · 계획서', icon: 'calendar', tone: 'accent' },
  { id: 'abnormal', label: '근태이상', sub: '이상 근태 검토 · 조치', icon: 'alertTri', tone: 'warning' },
  { id: 'payroll', label: '급여 워크센터', sub: '정산 · 대장 · 시뮬레이터 · 13개 모듈', icon: 'won', tone: 'warning', badge: '정산 중', badgeTone: 'warning' },
  { id: 'welfare', label: '복지', sub: '경조사 · 건강검진 · 면허/자격 · 의료기기', icon: 'badge', tone: 'accent' },
  { id: 'docs', label: '계약 · 문서', sub: '계약 · 자동생성 · 증명서 · 서류 제출', icon: 'fileText', tone: '' },
  // 오프보딩·문서보관함은 PC와 동일하게 권한 보유자에게만 노출(퇴사 처리·회사 문서 열람).
  { id: 'offboarding', label: '오프보딩', sub: '퇴사 처리 · 체크리스트 · 권한 회수', icon: 'out', tone: 'danger', perm: 'hr_오프보딩' },
  { id: 'archive', label: '문서보관함', sub: '규정 · 양식 · 근로계약서 · 결재 보관', icon: 'box', tone: '', perm: 'hr_문서보관함' },
];

export default function 인사관리({
  user,
  initialView = 'hub',
  onExit }: 인사관리Props) {
  const [view, setView] = useState<HrView>(initialView);
  const [selectedCompany, setSelectedCompany] = useState<string | undefined>(
    typeof user.company === 'string' ? user.company : undefined
  );
  const [editStaffId, setEditStaffId] = useState<string | null>(null);

  const staffId = useResolvedStaffId(user as Record<string, unknown>);
  const staffName = typeof user.name === 'string' ? user.name : undefined;

  const goBack = useCallback(() => {
    // form은 진입 전 화면으로 복귀
    if (view === 'form-member') {
      setView('member');
      return;
    }
    if (view === 'form-leave') {
      setView('leave');
      return;
    }
    // 허브에서 뒤로 → 모듈 종료, 그 외 화면 → 허브
    if (view === 'hub') {
      onExit();
      return;
    }
    setView('hub');
  }, [view, onExit]);

  switch (view) {
    case 'member':
      return (
        <구성원
          company={selectedCompany}
          user={user}
          onBack={goBack}
          onOpenForm={() => {
            setEditStaffId(null);
            setView('form-member');
          }}
          onEditStaff={(id) => {
            setEditStaffId(id);
            setView('form-member');
          }}
        />
      );
    case 'attend':
      return <근태 staffId={staffId} company={selectedCompany} user={user} onBack={goBack} />;
    case 'leave':
      return (
        <연차 staffId={staffId} user={user} onBack={goBack} onApply={() => setView('form-leave')} />
      );
    case 'abnormal':
      return <근태이상 user={user} onBack={goBack} />;
    case 'payroll':
      return <급여워크센터 user={user} onBack={goBack} />;
    case 'welfare':
      return <복지 user={user} company={selectedCompany} onBack={goBack} />;
    case 'docs':
      return <계약문서 staffId={staffId} user={user} onBack={goBack} />;
    case 'offboarding':
      return <오프보딩 company={selectedCompany} onBack={goBack} />;
    case 'archive':
      return <문서보관함 user={user} company={selectedCompany} onBack={goBack} />;
    case 'form-member':
      return <구성원등록 onBack={goBack} user={user} company={selectedCompany} editStaffId={editStaffId} />;
    case 'form-leave':
      return (
        <연차신청 staffId={staffId} staffName={staffName} user={user} onBack={goBack} />
      );
    case 'hub':
    default:
      return (
        <Hub
          user={user}
          company={selectedCompany}
          onCompanyChange={setSelectedCompany}
          onExit={onExit}
          onOpen={(v) => setView(v)}
        />
      );
  }
}

// ─────────────────────────────────────────────────────────────
// 허브 — 회사/KPI + 6개 메뉴
// ─────────────────────────────────────────────────────────────

function Hub({
  user,
  company,
  onCompanyChange,
  onExit,
  onOpen }: {
  user: ErpUser;
  company?: string;
  onCompanyChange: (co: string | undefined) => void;
  onExit: () => void;
  onOpen: (view: HrMenuId) => void;
}) {
  // Query all staff to:
  // 1. Gather all unique companies in the database
  // 2. Compute accurate stats locally
  // limit 높게: 회사 목록·KPI 집계 누락 방지
  const { staffs: allStaffs, loading } = useStaffList({ includeResigned: true, limit: 1000 });
  const [isCompanySheetOpen, setIsCompanySheetOpen] = useState(false);

  // Filter staff by currently selected company
  const staffs = useMemo(() => {
    if (!company || company === '전체') return allStaffs;
    return allStaffs.filter((s) => s.company === company);
  }, [allStaffs, company]);

  // Extract list of unique companies from all staff
  const companies = useMemo(() => {
    const cos = new Set<string>();
    cos.add('전체');
    allStaffs.forEach((s) => {
      if (s.company) cos.add(s.company);
    });
    return Array.from(cos);
  }, [allStaffs]);

  // 재직자 목록 분리
  const activeStaffs = useMemo(() => staffs.filter(isActiveStaff), [staffs]);
  const resignedStaffs = useMemo(() => staffs.filter((s) => !isActiveStaff(s)), [staffs]);

  const headcount = activeStaffs.length;
  const activeCount = activeStaffs.length;
  const resignedCount = resignedStaffs.length;

  // 고용형태 분포(재직자 기준)
  const empCounts = activeStaffs.reduce(
    (acc, s) => {
      const t = String((s as { employment_type?: string | null }).employment_type ?? '').trim();
      if (t.includes('정규')) acc.regular += 1;
      else if (t.includes('계약')) acc.contract += 1;
      else if (t.includes('수습')) acc.probation += 1;
      return acc;
    },
    { regular: 0, contract: 0, probation: 0 },
  );
  const empSub = empCounts.regular + empCounts.contract + empCounts.probation > 0
    ? `정규 ${empCounts.regular} · 계약 ${empCounts.contract} · 수습 ${empCounts.probation}`
    : '재직 기준';

  // 평균 근속(hire_date 기반, 연 단위).
  const now = Date.now();
  const tenures = activeStaffs
    .map((s) => {
      const raw = String((s as { hire_date?: string | null; join_date?: string | null }).hire_date
        ?? (s as { join_date?: string | null }).join_date ?? '').slice(0, 10);
      const t = raw ? Date.parse(raw) : NaN;
      return Number.isFinite(t) ? (now - t) / (365.25 * 24 * 60 * 60 * 1000) : null;
    })
    .filter((v): v is number => v != null && v >= 0);
  const avgTenure = tenures.length > 0
    ? (tenures.reduce((s, v) => s + v, 0) / tenures.length)
    : null;

  const headcountValue = loading ? '—' : String(headcount);
  const avgTenureValue = avgTenure == null ? '—' : avgTenure.toFixed(1);

  // 회사별 직원 수 집계 (재직자 기준)
  const companyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    activeStaffs.forEach((s) => {
      const co = (s as { company?: string | null }).company;
      const coName = typeof co === 'string' && co.trim() ? co.trim() : '미지정';
      counts[coName] = (counts[coName] || 0) + 1;
    });
    return counts;
  }, [activeStaffs]);

  // 구성원 메뉴 카드에 실제 구성원 인원 수 배지 실연동 +
  // 권한 게이팅(perm 미지정 메뉴는 항상 노출, 지정 시 PC와 동일하게 canAccessHrSection 판정).
  const menuList = useMemo(() => {
    return HR_MENU.filter((m) => !m.perm || canAccessHrSection(user, m.perm)).map((m) => {
      if (m.id === 'member') {
        return {
          ...m,
          badge: loading ? '—' : `${headcount}명` };
      }
      return m;
    });
  }, [headcount, loading, user]);

  return (
    <div className="m-screen">
      <MobileHeader
        title="인사관리"
        eyebrow="운영"
        back={onExit}
        actions={
          <button type="button" aria-label="구성원 검색">
            <MIcon name="search" size={20} />
          </button>
        }
      />
      <div className="m-scroll">
        {/* 회사 선택 — button 전역 리셋(background:transparent) 대비 인라인 보강 */}
        <button
          type="button"
          className="m-company-sel"
          onClick={() => setIsCompanySheetOpen(true)}
          aria-label="회사 선택"
          style={{
            margin: '12px 16px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '13px 14px',
            background: 'var(--m-card)',
            border: '1px solid var(--m-border)',
            borderRadius: 'var(--m-radius-md)',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--z-800)',
            width: 'calc(100% - 32px)',
            textAlign: 'left',
            boxSizing: 'border-box',
            cursor: 'pointer' }}
        >
          <span className="nm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {company || '전체'}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--z-500)' }}>회사 변경</span>
          <MIcon name="chevD" size={18} className="chev" />
        </button>

        {/* KPI — staff_members 실집계(전체 인원·평균 근속). 오늘 근무·평균 잔여연차는 별도 화면 참조. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            padding: '12px 16px' }}
        >
          <MKpi icon="users" label="전체 인원" value={headcountValue} unit="명" sub={empSub} tone="accent" />
          <MKpi icon="star" label="평균 근속" value={avgTenureValue} unit="년" sub="재직 기준" tone="accent" />
        </div>

        {/* 통계 섹션 (회사별 직원 & 재직자퇴사자별 직원) */}
        {!loading && (
          <div className="m-section" style={{ marginTop: 0 }}>
            <div className="m-section-h">
              <div className="lbl">직원 현황 통계</div>
            </div>
            <div className="m-card p-3 space-y-3">
              {/* 재직/퇴사자 통계 */}
              <div>
                <div className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5">재직/퇴사 상태별</div>
                <div className="flex gap-2">
                  <span className="inline-flex items-center bg-[var(--accent-light)] dark:bg-blue-950/45 px-2.5 py-1 rounded-[var(--radius-sm)] text-[11px] font-bold text-[var(--accent)]">
                    재직 {activeCount}명
                  </span>
                  <span className="inline-flex items-center bg-zinc-200/60 dark:bg-zinc-800/80 px-2.5 py-1 rounded-[var(--radius-sm)] text-[11px] font-bold text-[var(--toss-gray-4)]">
                    퇴사 {resignedCount}명
                  </span>
                </div>
              </div>

              {/* 회사별 통계 */}
              <div className="border-t border-[var(--border-subtle)] pt-2.5">
                <div className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5">회사별 직원</div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(companyCounts).map(([companyName, count]) => (
                    <div key={companyName} className="flex justify-between items-center bg-[var(--muted)]/40 px-2 py-1.5 rounded-[var(--radius-sm)] text-[11px] border border-[var(--border-subtle)]/50">
                      <span className="truncate max-w-[100px] text-[var(--toss-gray-4)] font-medium">{companyName}</span>
                      <span className="font-bold text-[var(--foreground)]">{count}명</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">인사관리 메뉴</div>
            <div className="cnt">{menuList.length}</div>
          </div>
          <div className="m-card flush macos-glass macos-squircle">
            {menuList.map((m) => (
              <MListRow
                key={m.id}
                icon={m.icon}
                iconTone={m.tone}
                label={m.label}
                sub={m.sub}
                badge={m.badge}
                badgeTone={m.badgeTone}
                onClick={() => onOpen(m.id)}
                ariaLabel={m.label}
              />
            ))}
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>

      {/* 회사 선택 바텀 시트 */}
      <MSheet
        open={isCompanySheetOpen}
        onClose={() => setIsCompanySheetOpen(false)}
        title="회사 선택"
      >
        <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {companies.map((co) => (
            <button
              key={co}
              type="button"
              onClick={() => {
                onCompanyChange(co === '전체' ? undefined : co);
                setIsCompanySheetOpen(false);
              }}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                borderRadius: 'var(--m-radius-md)',
                background: (company || '전체') === co ? 'var(--m-muted)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 14,
                fontWeight: (company || '전체') === co ? 800 : 600,
                color: (company || '전체') === co ? 'var(--m-accent)' : 'var(--z-800)' }}
            >
              <span>{co}</span>
              {(company || '전체') === co && (
                <MIcon name="check" size={16} color="var(--m-accent)" />
              )}
            </button>
          ))}
        </div>
      </MSheet>
    </div>
  );
}
