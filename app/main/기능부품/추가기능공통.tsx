'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { MenuIcon } from './조직도서브/조직도측면창';

function SubviewLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-[var(--foreground)]">{label} 불러오는 중</p>
          <p className="text-xs font-medium text-[var(--toss-gray-3)]">필요한 기능만 로드해서 반응성을 높이고 있습니다.</p>
        </div>
      </div>
    </div>
  );
}

const FONT_SIZES = [
  { label: '기본', value: 15 },
  { label: '중간', value: 17 },
  { label: '크게', value: 19 },
  { label: '최대', value: 21 },
];
const FONT_SIZE_KEY = 'erp-font-size';

function applyFontSize(px: number) {
  document.documentElement.style.fontSize = `${px}px`;
}

export function FontSizeControl() {
  const [current, setCurrent] = useState<number>(() => {
    if (typeof window === 'undefined') return 15;
    return Number(localStorage.getItem(FONT_SIZE_KEY) || 15);
  });

  useEffect(() => {
    applyFontSize(current);
  }, [current]);

  const change = (px: number) => {
    setCurrent(px);
    localStorage.setItem(FONT_SIZE_KEY, String(px));
    applyFontSize(px);
  };

  return (
    <div className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 shadow-sm">
      <span className="shrink-0 text-[10px] font-semibold text-[var(--toss-gray-3)]">글자</span>
      <select
        value={current}
        onChange={(event) => change(Number(event.target.value))}
        aria-label="글자 크기 선택"
        className="no-style h-6 min-w-[52px] cursor-pointer rounded-[var(--radius-md)] border-0 bg-transparent px-1 py-0 text-[11px] font-bold leading-none text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
      >
        {FONT_SIZES.map((size) => (
          <option key={size.value} value={size.value}>
            {size.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const FONT_FAMILIES = [
  { label: '기본', value: 'pretendard', family: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { label: '맑은고딕', value: 'malgun', family: "'Malgun Gothic', '맑은 고딕', -apple-system, BlinkMacSystemFont, sans-serif" },
  { label: 'Nanum', value: 'nanum', family: "'Nanum Gothic', sans-serif", googleFont: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap' },
  { label: 'Noto', value: 'noto', family: "'Noto Sans KR', sans-serif", googleFont: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap' },
];
const FONT_FAMILY_KEY = 'erp-font-family';

function loadGoogleFont(href: string) {
  if (typeof document === 'undefined' || document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function applyFontFamily(value: string) {
  const font = FONT_FAMILIES.find((item) => item.value === value) || FONT_FAMILIES[0];
  if (font.googleFont) loadGoogleFont(font.googleFont);
  document.documentElement.style.setProperty('--font-sans', font.family);
}

export function FontFamilyControl() {
  const [current, setCurrent] = useState(() => {
    if (typeof window === 'undefined') return 'pretendard';
    return localStorage.getItem(FONT_FAMILY_KEY) || 'pretendard';
  });

  useEffect(() => {
    applyFontFamily(current);
  }, [current]);

  const selectedFont = FONT_FAMILIES.find((item) => item.value === current) || FONT_FAMILIES[0];

  return (
    <div className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 shadow-sm">
      <span className="shrink-0 text-[10px] font-semibold text-[var(--toss-gray-3)]">서체</span>
      <select
        value={current}
        onChange={(event) => {
          const next = event.target.value;
          setCurrent(next);
          localStorage.setItem(FONT_FAMILY_KEY, next);
          applyFontFamily(next);
        }}
        aria-label="폰트 선택"
        style={{ fontFamily: selectedFont.family }}
        className="no-style h-6 min-w-[52px] cursor-pointer rounded-[var(--radius-md)] border-0 bg-transparent px-1 py-0 text-[11px] font-bold leading-none text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
      >
        {FONT_FAMILIES.map((font) => (
          <option key={font.value} value={font.value} style={{ fontFamily: font.family }}>
            {font.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const loadDepartmentInventoryView = () => import('./재고관리서브/부서별물품장비현황');
const loadWorkStatusView = () => import('./근무현황');
const loadHandoverNotesView = () => import('./인계노트');
const loadDischargeReviewView = () => import('./퇴원심사');
const loadClosingReportView = () => import('./마감보고');
const loadStaffEvaluationView = () => import('./직원평가시스템');
const loadRealtimeDepositView = () => import('./입금실시간조회');
const loadSurgeryConsultationView = () => import('./수술상담');
const loadOperationCheckView = () => import('./OP체크');
const loadEslManagerView = () => import('./ESL관리');
const loadOrgChartView = () => import('./조직도서브/OrgChart');

const DepartmentInventoryView = dynamic(loadDepartmentInventoryView, {
  ssr: false,
  loading: () => <SubviewLoading label="부서별 재고" />,
});
const WorkStatusView = dynamic(loadWorkStatusView, {
  ssr: false,
  loading: () => <SubviewLoading label="근무현황" />,
});
const HandoverNotesView = dynamic(loadHandoverNotesView, {
  ssr: false,
  loading: () => <SubviewLoading label="인계노트" />,
});
const DischargeReviewView = dynamic(loadDischargeReviewView, {
  ssr: false,
  loading: () => <SubviewLoading label="퇴원심사" />,
});
const ClosingReportView = dynamic(loadClosingReportView, {
  ssr: false,
  loading: () => <SubviewLoading label="마감보고" />,
});
const StaffEvaluationView = dynamic(loadStaffEvaluationView, {
  ssr: false,
  loading: () => <SubviewLoading label="직원평가" />,
});
const RealtimeDepositView = dynamic(loadRealtimeDepositView, {
  ssr: false,
  loading: () => <SubviewLoading label="입금 실시간 조회" />,
});
const SurgeryConsultationView = dynamic(loadSurgeryConsultationView, {
  ssr: false,
  loading: () => <SubviewLoading label="수술상담 AI 분석" />,
});
const OperationCheckView = dynamic(loadOperationCheckView, {
  ssr: false,
  loading: () => <SubviewLoading label="OP체크" />,
});
const EslManagerView = dynamic(loadEslManagerView, {
  ssr: false,
  loading: () => <SubviewLoading label="ESL 관리" />,
});
const OrgChart = dynamic(loadOrgChartView, {
  ssr: false,
  loading: () => <SubviewLoading label="조직도" />,
});

export const EXTRA_FEATURE_LOADERS: Record<string, () => Promise<unknown>> = {
  조직도: loadOrgChartView,
  부서별재고: loadDepartmentInventoryView,
  근무현황: loadWorkStatusView,
  인계노트: loadHandoverNotesView,
  퇴원심사: loadDischargeReviewView,
  마감보고: loadClosingReportView,
  직원평가: loadStaffEvaluationView,
  입금실시간조회: loadRealtimeDepositView,
  수술상담: loadSurgeryConsultationView,
  OP체크: loadOperationCheckView,
  ESL관리: loadEslManagerView,
};

export type FeatureCard = {
  id: string;
  label: string;
  icon: string;
  subView: string;
  testId: string;
  accentClass: string;
};

export const FEATURE_CARDS: FeatureCard[] = [
  { id: '조직도', label: '조직도', icon: 'Building2', subView: '조직도', testId: 'org-chart', accentClass: 'bg-[var(--muted)] text-[var(--accent)] group-hover:bg-[var(--toss-blue-light)]' },
  { id: '부서별재고', label: '부서별 재고', icon: 'Package', subView: '부서별재고', testId: 'department-inventory', accentClass: 'bg-[var(--muted)] text-[var(--accent)] group-hover:bg-[var(--toss-blue-light)]' },
  { id: '근무현황', label: '근무현황', icon: 'CalendarDays', subView: '근무현황', testId: 'work-status', accentClass: 'bg-[var(--muted)] text-[var(--accent)] group-hover:bg-[var(--toss-blue-light)]' },
  { id: '인계노트', label: '인계노트', icon: 'FileCheck2', subView: '인계노트', testId: 'handover-note', accentClass: 'bg-[var(--muted)] text-[var(--accent)] group-hover:bg-[var(--toss-blue-light)]' },
  { id: '퇴원심사', label: '퇴원심사', icon: 'Building2', subView: '퇴원심사', testId: 'discharge-review', accentClass: 'bg-[var(--muted)] text-[var(--accent)] group-hover:bg-[var(--toss-blue-light)]' },
  { id: '마감보고', label: '마감보고', icon: 'Banknote', subView: '마감보고', testId: 'closing-report', accentClass: 'bg-[var(--muted)] text-[var(--accent)] group-hover:bg-[var(--toss-blue-light)]' },
  { id: '직원평가', label: '직원평가', icon: 'SquarePen', subView: '직원평가', testId: 'staff-evaluation', accentClass: 'bg-[var(--muted)] text-[var(--accent)] group-hover:bg-[var(--toss-blue-light)]' },
  { id: '입금실시간조회', label: '입금 실시간 조회', icon: 'Landmark', subView: '입금실시간조회', testId: 'realtime-deposit', accentClass: 'bg-[var(--muted)] text-[var(--accent)] group-hover:bg-[var(--toss-blue-light)]' },
  { id: '수술상담', label: '수술상담 분석', icon: 'Mic', subView: '수술상담', testId: 'surgery-consultation', accentClass: 'bg-[var(--muted)] text-[var(--accent)] group-hover:bg-[var(--toss-blue-light)]' },
  { id: 'OP체크', label: 'OP체크', icon: 'Stethoscope', subView: 'OP체크', testId: 'op-check', accentClass: 'bg-[var(--muted)] text-[var(--accent)] group-hover:bg-[var(--toss-blue-light)]' },
  { id: 'ESL관리', label: 'ESL 관리', icon: 'Tag', subView: 'ESL관리', testId: 'esl-manager', accentClass: 'bg-[var(--muted)] text-[var(--accent)] group-hover:bg-[var(--toss-blue-light)]' },
];

export const EXTERNAL_LINKS = [
  { id: 'km-park', label: '주차관제', url: 'http://kmp0001103.iptime.org/login?redirectTo=undefined', icon: 'CircleParking' },
  { id: 'webfax', label: '웹팩스', url: 'https://webfax.uplus.co.kr/m', icon: 'Printer' },
];

export function FeatureShell({
  children,
  onBack,
  maxWidth = 'max-w-5xl',
  boxed = false,
}: {
  children: ReactNode;
  onBack: () => void;
  maxWidth?: string;
  boxed?: boolean;
}) {
  const content = boxed ? (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      {children}
    </div>
  ) : (
    children
  );

  return (
    <div data-testid="extra-subview" className="custom-scrollbar flex-1 overflow-y-auto bg-[var(--page-bg)] p-3 md:p-4">
      <div className={`mx-auto flex w-full flex-col gap-3 ${maxWidth}`}>
        <button
          data-testid="extra-back-button"
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 self-start rounded-[var(--radius-md)] px-2 py-1.5 text-[12px] font-bold text-[var(--accent)] transition-colors hover:bg-[var(--muted)]"
        >
          <MenuIcon name="arrow-left" className="h-3.5 w-3.5" />
          목록으로
        </button>
        {content}
      </div>
    </div>
  );
}

type ExtraFeatureSubviewProps = {
  subView: string | null;
  onBack: () => void;
  user?: any;
  staffs?: any[];
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
  orgChartCompany: string | null;
  setOrgChartCompany: Dispatch<SetStateAction<string | null>>;
};

export function ExtraFeatureSubview({
  subView,
  onBack,
  user,
  staffs = [],
  selectedCo,
  selectedCompanyId,
  orgChartCompany,
  setOrgChartCompany,
}: ExtraFeatureSubviewProps) {
  if (subView === '조직도') {
    return (
      <FeatureShell onBack={onBack} maxWidth="max-w-7xl">
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
          <OrgChart
            user={user || null}
            staffs={staffs}
            selectedCo={orgChartCompany}
            setSelectedCo={setOrgChartCompany}
            compact
          />
        </div>
      </FeatureShell>
    );
  }

  if (subView === '부서별재고') {
    return (
      <FeatureShell onBack={onBack} boxed>
        <DepartmentInventoryView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === '근무현황') {
    return (
      <FeatureShell onBack={onBack} boxed>
        <WorkStatusView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === '인계노트') {
    return (
      <FeatureShell onBack={onBack}>
        <HandoverNotesView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === '퇴원심사') {
    return (
      <FeatureShell onBack={onBack}>
        <DischargeReviewView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === '마감보고') {
    return (
      <FeatureShell onBack={onBack}>
        <ClosingReportView user={user || {}} staffs={staffs} selectedCompanyId={selectedCompanyId} />
      </FeatureShell>
    );
  }

  if (subView === '직원평가') {
    return (
      <FeatureShell onBack={onBack} boxed>
        <StaffEvaluationView user={user || {}} staffs={staffs} />
      </FeatureShell>
    );
  }

  if (subView === '입금실시간조회') {
    return (
      <FeatureShell onBack={onBack} maxWidth="max-w-6xl">
        <RealtimeDepositView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === '수술상담') {
    return (
      <FeatureShell onBack={onBack} maxWidth="max-w-4xl">
        <SurgeryConsultationView user={user || {}} />
      </FeatureShell>
    );
  }

  if (subView === 'OP체크') {
    return (
      <FeatureShell onBack={onBack} maxWidth="max-w-7xl">
        <OperationCheckView
          user={user || {}}
          staffs={staffs}
          selectedCo={selectedCo}
          selectedCompanyId={selectedCompanyId}
        />
      </FeatureShell>
    );
  }

  if (subView === 'ESL관리') {
    return (
      <FeatureShell onBack={onBack} boxed>
        <EslManagerView user={user || {}} />
      </FeatureShell>
    );
  }

  return null;
}
