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
 * JM5: 계약·증명서·서류는 db RLS에 의존. 클라이언트 측 권한 변경 X.
 * JM6: 탭 a11y는 workcenter-common, 워크플로는 <ol> + aria-current="step".
 */

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { db, d1 } from '@/lib/db-client';
import type { StaffMember } from '@/types';
import {
  WorkcenterDarkBanner,
  WorkcenterEmbed,
  WorkcenterKpiRow,
  WorkcenterShell,
  WorkcenterTabBar,
  type WorkcenterKpi,
  type WorkcenterTab } from './workcenter-common';
import ContractGenWizard from './DocsWorkcenter/ContractGenWizard';
import DocsContractSummary from './DocsWorkcenter/DocsContractSummary';
import DocsGenSummary from './DocsWorkcenter/DocsGenSummary';
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
  loading: DocsLoading });

const ContractAutoGenerator = dynamic(
  () => import('../인사관리서브/계약서자동생성'),
  { ssr: false, loading: DocsLoading },
);

const DocumentRepository = dynamic(() => import('../인사관리서브/문서보관함'), {
  ssr: false,
  loading: DocsLoading });

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
  pendingSubmissions: 0 };

// ─── DB row 타입 (KPI 집계용 — 좁게) ────────────────────────────────
// employment_contracts 에는 계약 종료일 컬럼이 아예 없다(effective_date/start_date 뿐).
// 예전 타입은 end_date / contract_end_date 를 선언하고 셀렉트에도 넣었지만 둘 다 부재
// 컬럼이라 항상 null 이었고, 그래서 모든 계약이 "영구 계약 → 활성"으로 분류되고
// **만료 임박은 구조적으로 언제나 0** 이었다. 만료일 정본은 크론(lib/contract-expiry-jobs)이
// 쓰는 staff_members.permissions.contract_end_date 다 → 만료 집계는 그쪽으로 옮긴다.
interface ContractLite {
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

const REQUIRED_DOCS_KPI = [
  { id: '가족관계', label: '가족관계증명서' },
  { id: '개인정보보호', label: '개인정보 보호교육' },
  { id: '면허자격', label: '면허(자격)증 사본' },
  { id: '보건증', label: '보건선결과(보건증)' },
  { id: '안전보건', label: '산업안전 보건교육' },
  { id: '성희롱예방', label: '성희롱 예방교육' },
  { id: '신분증', label: '신분증 사본' },
  { id: '일반검진', label: '일반 건강검진' },
  { id: '잠복결핵', label: '잠복결핵 검진결과' },
  { id: '장애인인식', label: '장애인 인식개선교육' },
  { id: '등본', label: '주민등록등본' },
  { id: '초본', label: '주민등록초본' },
  { id: '괴롭힘예방', label: '직장내 괴롭힘 예방교육' },
  { id: '통장', label: '통장사본' },
  { id: '퇴직연금', label: '퇴직연금교육' },
  { id: '특수검진', label: '특수 건강검진' },
];

export default function DocsWorkcenter({
  staffs = [],
  selectedCo,
  user = null,
  onRefresh,
  initialTab = 'contract',
  linkedTarget,
  canManageDocuments = false }: DocsWorkcenterProps) {
  const [tab, setTab] = useState<DocsTabId>(initialTab);
  const [counts, setCounts] = useState<DocsCounts>(INITIAL_COUNTS);
  const [countsReady, setCountsReady] = useState(false);

  // ─── KPI 집계 (마운트 시 1회) ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchCounts = async () => {
      try {
        // 계약·결재(증명서대기용)·직원·서류 제출 fetch 병렬
        const [contractRes, approvalsRes, staffRes, repoRes] = await Promise.all([
          d1
            .from('employment_contracts')
            .select('status'),
          // approvals 의 문서종류 컬럼은 `doc_type`(및 레거시 `type`)이다. `form_type` 은
          // 없는 컬럼이라 증명서 판별이 항상 거짓 → 발급 대기 증명서 KPI 가 상시 0 이었다.
          d1
            .from('approvals')
            .select('status, doc_type, type'),
          d1
            .from('staff_members')
            .select('id, status, permissions, employment_type'),
          d1
            .from('document_repository')
            .select('created_by, category'),
        ]);

        if (cancelled) return;
        if (contractRes.error) throw contractRes.error;
        if (approvalsRes.error) throw approvalsRes.error;
        if (staffRes.error) throw staffRes.error;
        if (repoRes.error) throw repoRes.error;

        // 계약: 체결된 계약서 건수 = 활성 계약 (종료일 컬럼이 없어 이전과 동일 기준 유지)
        const contractRows = (contractRes.data as ContractLite[] | null) ?? [];
        const activeContracts = contractRows.length;

        // 증명서: approvals 에서 대기/진행중인 증명서 결재 건수.
        // doc_type 이 정본이고 type 은 레거시 — 둘 다 본다.
        const approvalRows = (approvalsRes.data || []) as Array<{
          status: string | null;
          doc_type: string | null;
          type: string | null;
        }>;
        const pendingCertificates = approvalRows.filter((r) => {
          const kind = `${r.doc_type || ''} ${r.type || ''}`;
          const isCert = kind.includes('증명서') || kind.includes('certificate');
          const isPending = r.status === '대기' || r.status === 'pending' || r.status === '진행중' || r.status === '결재중';
          return isCert && isPending;
        }).length;

        // 서류: 직원별 미제출 서류 합산
        const staffRows = (staffRes.data || []) as Array<{
          id: string;
          status: string | null;
          permissions: Record<string, unknown> | string | null;
          employment_type: string | null;
        }>;
        const repoRows = (repoRes.data || []) as Array<{ created_by: string | null; category: string | null }>;

        const activeStaff = staffRows.filter((s) => s.status === '재직');

        // 만료 임박: 재직 계약직의 permissions.contract_end_date 기준 90일 이내.
        // 크론(lib/contract-expiry-jobs)이 쓰는 것과 같은 SSOT 라 알림과 KPI 가 어긋나지 않는다.
        let expiringContracts = 0;
        for (const s of activeStaff) {
          let perms: Record<string, unknown> = {};
          try {
            perms =
              typeof s.permissions === 'string'
                ? (JSON.parse(s.permissions) as Record<string, unknown>)
                : (s.permissions as Record<string, unknown>) || {};
          } catch {
            perms = {};
          }
          const endRaw = perms.contract_end_date;
          if (typeof endRaw !== 'string' || !endRaw.trim()) continue;
          const d = daysUntil(endRaw.trim());
          if (d === null || d < 0) continue;
          if (d <= 90) expiringContracts += 1;
        }
        let pendingSubmissions = 0;

        for (const staff of activeStaff) {
          const staffDocs = repoRows.filter((d) => String(d.created_by) === String(staff.id));
          for (const doc of REQUIRED_DOCS_KPI) {
            const hasDoc = staffDocs.some(
              (d) => d.category === doc.id || d.category === doc.label
            );
            if (!hasDoc) {
              pendingSubmissions += 1;
            }
          }
        }

        setCounts({
          activeContracts,
          expiringContracts,
          pendingCertificates,
          pendingSubmissions });
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
        sub: activeStaffCount > 0 ? `재직 ${activeStaffCount}명` : '데이터 없음' },
      {
        key: 'expiringContracts',
        label: '만료 임박 (90일)',
        value: fmt(counts.expiringContracts),
        unit: '건',
        sub: '재계약 권고 대상',
        tone: 'warn' },
      {
        key: 'pendingCertificates',
        label: '발급 대기 증명서',
        value: fmt(counts.pendingCertificates),
        unit: '건',
        sub: '결재·요청 대기 합계',
        tone: 'accent' },
      {
        key: 'pendingSubmissions',
        label: '미제출 서류',
        value: fmt(counts.pendingSubmissions),
        unit: '건',
        sub: '제출 마감 임박',
        tone: 'danger' },
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
            <div className="bg-blue-500/10 border border-blue-500/20 text-blue-700 px-4 py-3 rounded-xl text-xs font-semibold leading-relaxed flex items-center gap-2">
              <span>💡</span>
              <span><strong>계약 현황 (전자서명용)</strong>: 구성원 리스트에서 직원을 선택해 **인앱 전자 근로계약서**를 발송하고 실시간 진행 상태(서명대기/완료)를 관리하는 공간입니다.</span>
            </div>
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
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 px-4 py-3 rounded-xl text-xs font-semibold leading-relaxed flex items-center gap-2">
              <span>💡</span>
              <span><strong>계약서 자동생성 (오프라인 수기 인쇄용)</strong>: 서명 프로세스 없이 **오프라인 수기 인쇄 및 보관** 목적으로 근로계약·위임계약·용역계약 양식을 바로 생성·출력하는 공간입니다.</span>
            </div>
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
          <div className="flex min-h-0 flex-col gap-2">
            {/* DocsStoreSummary 중복 목록 제거 — 문서보관함 단일 UI로 통합 */}
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
