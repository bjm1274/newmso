'use client';

/**
 * 계약·문서 워크센터 (docs) — 재디자인
 *
 * 원본 5장 통합:
 *   - 계약 관리 / 계약서 자동생성 / 문서보관함 / 증명서 발급 / 서류 제출
 *
 * 구조 (지시서 §1-2):
 *   - 4 KPI 행 (활성 계약 / 만료 임박 / 발급 대기 증명서 / 미제출 서류)
 *   - 탭 5개 (계약 현황 / 계약서 자동생성 / 문서보관함 / 증명서 발급 / 서류 제출)
 *   - 계약서 자동생성 탭: 다크 배너 + 5단계 워크플로 wizard
 *
 * 인터랙션
 *   - 탭은 lazy mount (활성 탭만 마운트 — JM2)
 *   - 계약서 자동생성: 다크 배너로 5단계 안내, 실제 본문은 기존 컴포넌트
 *
 * JM: 단일 책임 — 탭 컨테이너 + KPI + wizard wiring만.
 *     도메인 본문은 기존 한글 컴포넌트에 위임.
 * JM2: 활성 탭만 마운트. KPI fetch 마운트 시 1회.
 * JM3: KPI 실패 시 '-' 폴백, 본문은 WorkcenterEmbed의 ErrorBoundary로 격리.
 * JM4: any 금지. 도메인 row 타입 좁게.
 * JM5: 계약·증명서·서류는 supabase RLS에 의존. 클라이언트 측 권한 변경 X.
 * JM6: 탭 a11y는 workcenter-common, 워크플로는 <ol> + aria-current="step".
 */

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import {
  WorkcenterDarkBanner,
  WorkcenterEmbed,
  WorkcenterKpiRow,
  WorkcenterShell,
  WorkcenterTabBar,
  type WorkcenterKpi,
  type WorkcenterTab,
} from './workcenter-common';
import ContractGenWizard from './DocsWorkcenter/ContractGenWizard';
import DocsContractSummary from './DocsWorkcenter/DocsContractSummary';
import DocsGenSummary from './DocsWorkcenter/DocsGenSummary';
import DocsStoreSummary from './DocsWorkcenter/DocsStoreSummary';
import DocsCertSummary from './DocsWorkcenter/DocsCertSummary';
import DocsSubmSummary from './DocsWorkcenter/DocsSubmSummary';
import type { DocsTabId } from './DocsWorkcenter/types';

// ─── lazy import (활성 탭만 마운트 — JM2) ───────────────────────────
const DocsLoading = () => (
  <div className="flex items-center justify-center py-16">
    <div
      className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"
      role="status"
      aria-label="로딩 중"
    />
  </div>
);

const ContractMain = dynamic(() => import('../인사관리서브/계약관리'), {
  ssr: false,
  loading: DocsLoading,
});

const ContractAutoGenerator = dynamic(
  () => import('../인사관리서브/계약서자동생성'),
  { ssr: false, loading: DocsLoading },
);

const DocumentRepository = dynamic(() => import('../인사관리서브/문서보관함'), {
  ssr: false,
  loading: DocsLoading,
});

const CertificateGenerator = dynamic(
  () => import('../인사관리서브/증명서발급'),
  { ssr: false, loading: DocsLoading },
);

const DocumentScanner = dynamic(
  () => import('../인사관리서브/스마트서류제출'),
  { ssr: false, loading: DocsLoading },
);

// ─── 탭 정의 ────────────────────────────────────────────────────────
const DOCS_TABS: WorkcenterTab<DocsTabId>[] = [
  { id: 'contract', label: '계약 현황' },
  { id: 'autogen', label: '계약서 자동생성' },
  { id: 'repository', label: '문서보관함' },
  { id: 'certificate', label: '증명서 발급' },
  { id: 'submission', label: '서류 제출' },
];

// ─── KPI 카운트 ─────────────────────────────────────────────────────
interface DocsCounts {
  activeContracts: number;     // 활성(만료되지 않은) 계약
  expiringContracts: number;   // 만료 임박 (90일 이내)
  pendingCertificates: number; // 발급 대기 증명서
  pendingSubmissions: number;  // 미제출 서류
}

const INITIAL_COUNTS: DocsCounts = {
  activeContracts: 0,
  expiringContracts: 0,
  pendingCertificates: 0,
  pendingSubmissions: 0,
};

// ─── DB row 타입 (KPI 집계용 — 좁게) ────────────────────────────────
interface ContractLite {
  end_date: string | null;
  contract_end_date?: string | null;
  status?: string | null;
}
interface CertificateLite {
  status: string | null;
}
interface SubmissionLite {
  status: string | null;
}

// ─── 일수 계산 (KST) ────────────────────────────────────────────────
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00+09:00`);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }),
  );
  today.setHours(0, 0, 0, 0);
  return Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

// ─── Props ──────────────────────────────────────────────────────────
interface DocsWorkcenterProps {
  staffs?: StaffMember[];
  selectedCo?: string;
  user?: Record<string, unknown> | null;
  onRefresh?: () => void;
  initialTab?: DocsTabId;
  linkedTarget?: { id?: string; name?: string };
  canManageDocuments?: boolean;
}

export default function DocsWorkcenter({
  staffs = [],
  selectedCo,
  user = null,
  onRefresh,
  initialTab = 'contract',
  linkedTarget,
  canManageDocuments = false,
}: DocsWorkcenterProps) {
  const [tab, setTab] = useState<DocsTabId>(initialTab);
  const [counts, setCounts] = useState<DocsCounts>(INITIAL_COUNTS);
  const [countsReady, setCountsReady] = useState(false);

  // ─── KPI 집계 (마운트 시 1회) ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchCounts = async () => {
      try {
        // 계약·증명서·서류 제출 fetch 병렬
        const [contractRes, certRes, submitRes] = await Promise.all([
          supabase
            .from('employment_contracts')
            .select('end_date, contract_end_date, status'),
          // certificate_issuances는 발급 요청·결재 상태 컬럼이 있을 수 있음.
          // 'status' 또는 'state' 컬럼이 없으면 폴백으로 빈 배열.
          supabase
            .from('certificate_issuances')
            .select('status'),
          // 서류 제출 현황 (document_submissions 또는 document_repository 별도).
          // 안전하게 status 컬럼만 select.
          supabase
            .from('document_submissions')
            .select('status'),
        ]);

        if (cancelled) return;

        // 계약: 활성/만료임박 집계
        const contractRows = (contractRes.data as ContractLite[] | null) ?? [];
        let activeContracts = 0;
        let expiringContracts = 0;
        for (const r of contractRows) {
          const endDate = r.end_date ?? r.contract_end_date ?? null;
          if (!endDate) {
            // 영구 계약 — 활성으로 간주
            activeContracts += 1;
            continue;
          }
          const d = daysUntil(endDate);
          if (d === null) continue;
          if (d < 0) continue; // 이미 종료된 계약 제외
          activeContracts += 1;
          if (d <= 90) expiringContracts += 1;
        }

        // 증명서: 대기 상태
        const certRows = (certRes.data as CertificateLite[] | null) ?? [];
        const pendingCertificates = certRows.filter((r) => {
          const s = (r.status ?? '').toString();
          return s === '대기' || s === 'pending' || s === '요청' || s === '결재중';
        }).length;

        // 서류: 미제출 상태 (submissions 테이블 없으면 0)
        const submitRows = (submitRes.data as SubmissionLite[] | null) ?? [];
        const pendingSubmissions = submitRows.filter((r) => {
          const s = (r.status ?? '').toString();
          return s === '미제출' || s === 'pending' || s === '요청';
        }).length;

        setCounts({
          activeContracts,
          expiringContracts,
          pendingCertificates,
          pendingSubmissions,
        });
      } catch (err) {
        // JM3: KPI 실패해도 화면은 살아 있어야 한다.
        console.error('[DocsWorkcenter] KPI fetch failed', err);
      } finally {
        if (!cancelled) setCountsReady(true);
      }
    };

    fetchCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeStaffCount = useMemo(
    () =>
      staffs.filter((s) => (s as { status?: string | null }).status === '재직')
        .length,
    [staffs],
  );

  // ─── KPI 카드 ──────────────────────────────────────────────────────
  const kpis = useMemo<WorkcenterKpi[]>(() => {
    const fmt = (n: number) => (countsReady ? String(n) : '-');
    return [
      {
        key: 'activeContracts',
        label: '활성 계약',
        value: fmt(counts.activeContracts),
        unit: '건',
        sub: activeStaffCount > 0 ? `재직 ${activeStaffCount}명` : '데이터 없음',
      },
      {
        key: 'expiringContracts',
        label: '만료 임박 (90일)',
        value: fmt(counts.expiringContracts),
        unit: '건',
        sub: '재계약 권고 대상',
        tone: 'warn',
      },
      {
        key: 'pendingCertificates',
        label: '발급 대기 증명서',
        value: fmt(counts.pendingCertificates),
        unit: '건',
        sub: '결재·요청 대기 합계',
        tone: 'accent',
      },
      {
        key: 'pendingSubmissions',
        label: '미제출 서류',
        value: fmt(counts.pendingSubmissions),
        unit: '건',
        sub: '제출 마감 임박',
        tone: 'danger',
      },
    ];
  }, [counts, countsReady, activeStaffCount]);

  // ─── 계약서 자동생성 탭: 다크 배너 + 5단계 wizard ────────────────
  const autogenHeader =
    tab === 'autogen' ? (
      <>
        <WorkcenterDarkBanner
          kicker="워크플로 도구 — 5단계 자동화"
          title="계약서 자동생성"
          description="직원 선택 → 양식 선택 → 항목 입력 → 미리보기 → 전자서명 발송 한 흐름"
        />
        <ContractGenWizard currentStep={1} />
      </>
    ) : null;

  return (
    <WorkcenterShell
      headerExtra={
        <>
          <WorkcenterKpiRow items={kpis} />
          <WorkcenterTabBar
            tabs={DOCS_TABS}
            activeTab={tab}
            onChange={setTab}
            label="계약·문서 워크센터 탭"
          />
          {autogenHeader}
        </>
      }
    >
      <div className="min-h-0 flex-1">
        {tab === 'contract' && (
          <div className="flex flex-col gap-3">
            <DocsContractSummary />
            <WorkcenterEmbed label="계약 현황">
              <ContractMain
                staffs={staffs}
                selectedCo={selectedCo || '전체'}
                onRefresh={onRefresh}
                showAdminPolicyTabs={false}
                showTemplateEditor={false}
              />
            </WorkcenterEmbed>
          </div>
        )}
        {tab === 'autogen' && (
          <div className="flex flex-col gap-3">
            <DocsGenSummary />
            <WorkcenterEmbed label="계약서 자동생성">
              <ContractAutoGenerator
                staffs={staffs}
                selectedCo={selectedCo || '전체'}
                user={user}
              />
            </WorkcenterEmbed>
          </div>
        )}
        {tab === 'repository' && (
          <div className="flex flex-col gap-3">
            <DocsStoreSummary />
            <WorkcenterEmbed label="문서보관함">
              <DocumentRepository
                user={user}
                selectedCo={selectedCo || '전체'}
                linkedTarget={linkedTarget}
                canManageDocuments={canManageDocuments}
              />
            </WorkcenterEmbed>
          </div>
        )}
        {tab === 'certificate' && (
          <div className="flex flex-col gap-3">
            <DocsCertSummary />
            <WorkcenterEmbed label="증명서 발급">
              <CertificateGenerator
                staffs={staffs}
                selectedCo={selectedCo || '전체'}
              />
            </WorkcenterEmbed>
          </div>
        )}
        {tab === 'submission' && (
          <div className="flex flex-col gap-3">
            <DocsSubmSummary />
            <WorkcenterEmbed label="서류 제출">
              <DocumentScanner
                user={user || undefined}
                staffs={staffs}
                selectedCo={selectedCo || '전체'}
              />
            </WorkcenterEmbed>
          </div>
        )}
      </div>
    </WorkcenterShell>
  );
}
