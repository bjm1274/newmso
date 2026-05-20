'use client';

/**
 * 감사·백업 — 4탭
 * 개요(KPI + 이상 감지) / 접근 감사 로그 / 급여 이상치 / 데이터 백업
 *
 * JM: 350줄 이내
 * JM2: 실제 서브 컴포넌트는 dynamic import
 * JM5: 백업/복원 권한 검증은 DataBackup 컴포넌트 내부에서 처리
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Card, Chip, KpiGrid, SmBtn, TabBar, WorkcenterHeader } from './admin-workcenter-common';
import {
  ADMIN_WORKCENTERS,
  type AdminKpi,
  type AuditLogRow,
  type ChipTone,
} from './admin-types';

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-7 h-7 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
  </div>
);

// 실제 서브 컴포넌트들
const AccessAuditLog = dynamic(
  () => import('../관리자전용서브/접근감사로그'),
  { ssr: false, loading: Loading }
);
const AuditLogViewer = dynamic(
  () => import('../관리자전용서브/감사로그뷰어'),
  { ssr: false, loading: Loading }
);
const SalaryAnomalyDetector = dynamic(
  () => import('../관리자전용서브/급여이상치감지'),
  { ssr: false, loading: Loading }
);
const DataBackup = dynamic(
  () => import('../관리자전용서브/데이터백업'),
  { ssr: false, loading: Loading }
);

type AuditTabId = 'overview' | 'access' | 'salary' | 'backup';

const TABS: { id: AuditTabId; label: string; count?: number }[] = [
  { id: 'overview', label: '개요' },
  { id: 'access', label: '접근 감사 로그' },
  { id: 'salary', label: '급여 이상치', count: 2 },
  { id: 'backup', label: '데이터 백업' },
];

const AUDIT_KPI: AdminKpi[] = [
  { label: '오늘 로그', value: '1,284', unit: '건', sub: '로그인 86 · 수정 142 · 조회 1,056' },
  { label: '이상 감지', value: '3', unit: '건', sub: '대량 수정 1 · 비정상 시간 2', tone: 'warn' },
  { label: '급여 이상치', value: '2', unit: '건', sub: '전월 대비 30%+ 차이', tone: 'danger' },
  { label: '마지막 백업', value: '12', unit: '시간 전', sub: '자동 백업 정상', tone: 'success' },
];

const LOG_ROWS: (AuditLogRow & { tone: ChipTone })[] = [
  { time: '14:23:48', who: '박유진', action: '급여 정산 결재', target: '2026.5 정산', ip: '192.168.1.42', status: '성공', tone: 'success' },
  { time: '14:15:22', who: '백민', action: '직원 정보 수정', target: '송소현 (2025-018)', ip: '192.168.1.18', status: '성공', tone: 'success' },
  { time: '13:48:11', who: '김지오', action: '근무표 편성', target: '2026.5 외래팀', ip: '192.168.1.34', status: '성공', tone: 'success' },
  { time: '13:32:05', who: '(미인증)', action: '로그인 시도', target: 'admin', ip: '58.224.x.x', status: '실패', tone: 'danger' },
  { time: '12:58:34', who: '박철홍', action: '결재 승인', target: 'PO-2026-0512-001', ip: '192.168.1.10', status: '성공', tone: 'success' },
  { time: '11:42:18', who: '홍자비', action: '증명서 발급', target: '재직증명서 (이나림)', ip: '192.168.1.28', status: '성공', tone: 'success' },
];

type AbnCard = {
  kind: string;
  toneChip: ChipTone;
  who: string;
  meta: string;
  desc: string;
  suggest: string;
  cta: { label: string; primary?: boolean }[];
};

const ABN_CARDS: AbnCard[] = [
  {
    kind: '대량 수정', toneChip: 'warn', who: '백민', meta: '· 경영지원팀',
    desc: '5/10 14:22 — 직원 정보 14건 일괄 수정 (계약·전화·주소 필드)',
    suggest: '사유 확인 + 결재 의무화',
    cta: [{ label: '상세' }, { label: '사유 요청', primary: true }],
  },
  {
    kind: '비정상 시간', toneChip: 'danger', who: '(미인증)', meta: '· IP 58.224.x.x',
    desc: '5/11 03:18 ~ 03:32 — admin 계정 로그인 시도 8회 실패',
    suggest: 'IP 차단 + 2단계 인증 점검',
    cta: [{ label: '상세' }, { label: 'IP 차단', primary: true }],
  },
  {
    kind: '권한 외 시도', toneChip: 'accent', who: '이나림', meta: '· 외래팀',
    desc: '5/9 11:12 — 급여 모듈 접근 시도 (권한 없음)',
    suggest: '권한 정책 안내',
    cta: [{ label: '상세' }, { label: '안내' }],
  },
];

function OverviewTab({ onGoAccess, onGoSalary, onGoBackup }: {
  onGoAccess: () => void;
  onGoSalary: () => void;
  onGoBackup: () => void;
}) {
  return (
    <>
      <KpiGrid items={AUDIT_KPI} cols={4} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Card
          title="최근 감사 로그 (오늘)"
          action={<SmBtn onClick={onGoAccess}>전체 보기 →</SmBtn>}
          className="p-0 overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] font-bold text-[var(--toss-gray-4)] border-b border-[var(--border)]">
                  <th scope="col" className="px-3 py-2">시각</th>
                  <th scope="col" className="px-2 py-2">사용자</th>
                  <th scope="col" className="px-2 py-2">동작</th>
                  <th scope="col" className="px-2 py-2">결과</th>
                </tr>
              </thead>
              <tbody>
                {LOG_ROWS.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/60">
                    <td className="px-3 py-1.5 tabular-nums text-[10.5px] text-[var(--toss-gray-4)]">{r.time}</td>
                    <td className="px-2 py-1.5 font-bold text-[12px]">{r.who}</td>
                    <td className="px-2 py-1.5 text-[10.5px] text-[var(--toss-gray-4)]">{r.action}</td>
                    <td className="px-2 py-1.5"><Chip tone={r.tone}>{r.status}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="이상 감지 · 최근 7일">
          <div className="space-y-2">
            {ABN_CARDS.map((c, i) => (
              <div
                key={i}
                className="px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--muted)] border border-[var(--border)] space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <Chip tone={c.toneChip}>{c.kind}</Chip>
                  <b className="text-[12px] text-[var(--foreground)]">{c.who}</b>
                  <span className="text-[10.5px] text-[var(--toss-gray-4)]">{c.meta}</span>
                </div>
                <div className="text-[11px] text-[var(--toss-gray-4)]">{c.desc}</div>
                <div className="flex items-center gap-1.5">
                  {c.cta.map((b) => (
                    <SmBtn key={b.label} primary={b.primary} onClick={onGoAccess}>
                      {b.label}
                    </SmBtn>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <SmBtn onClick={onGoSalary}>급여 이상치 검사 →</SmBtn>
        <SmBtn onClick={onGoBackup}>백업 현황 →</SmBtn>
        <SmBtn primary onClick={onGoBackup}>즉시 백업</SmBtn>
      </div>
    </>
  );
}

export default function AuditWorkcenter() {
  const meta = ADMIN_WORKCENTERS.audit;
  const [tab, setTab] = useState<AuditTabId>('overview');

  return (
    <>
      <WorkcenterHeader
        title={meta.label}
        subtitle="감사 로그·이상 감지·급여 이상치·백업/DR 통합"
        mergedCount={meta.mergedCount}
        mergedTitles={meta.mergedTitles}
        actions={
          <>
            <SmBtn onClick={() => setTab('access')}>감사 로그</SmBtn>
            <SmBtn primary onClick={() => setTab('backup')}>백업 즉시 실행</SmBtn>
          </>
        }
      />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <OverviewTab
          onGoAccess={() => setTab('access')}
          onGoSalary={() => setTab('salary')}
          onGoBackup={() => setTab('backup')}
        />
      )}
      {tab === 'access' && (
        <div className="space-y-3">
          <AccessAuditLog user={null} />
          <AuditLogViewer />
        </div>
      )}
      {tab === 'salary' && <SalaryAnomalyDetector staffs={[]} />}
      {tab === 'backup' && <DataBackup user={null} />}
    </>
  );
}
