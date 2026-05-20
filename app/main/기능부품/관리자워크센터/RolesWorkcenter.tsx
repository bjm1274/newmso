'use client';

/**
 * 권한 관리 — 2탭: 개요(매트릭스) + 직원별 권한 관리(실제 StaffPermissionManager)
 *
 * JM: 250줄 이내
 * JM2: StaffPermissionManager는 dynamic import
 * JM6: <table> + scope, 칩은 의미 색 + 텍스트 함께
 * JM4: 권한 값은 RolePermissionValue union
 */

import dynamic from 'next/dynamic';
import { memo, useState } from 'react';
import { Card, Chip, KpiGrid, SmBtn, TabBar, WorkcenterHeader } from './admin-workcenter-common';
import {
  ADMIN_WORKCENTERS,
  permissionLabel,
  permissionTone,
  type AdminKpi,
  type RolePermissionRow,
} from './admin-types';

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-7 h-7 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
  </div>
);

// 실제 직원별 권한 관리 컴포넌트
const StaffPermissionManager = dynamic(
  () => import('../관리자전용서브/직원권한통합'),
  { ssr: false, loading: Loading }
);

type RolesTabId = 'matrix' | 'staff';

const TABS: { id: RolesTabId; label: string }[] = [
  { id: 'matrix', label: '역할 매트릭스' },
  { id: 'staff', label: '직원별 권한 관리' },
];

const ROLES_KPI: AdminKpi[] = [
  { label: '정의된 역할', value: '6', unit: '종', sub: '병원장 / 관리자 / 부장 / 직원 / 시급 / 수습' },
  { label: '관리 대상 모듈', value: '6', unit: '개', sub: '결재 · 인사 · 급여 · 재고 · 관리자 · 분석', tone: 'accent' },
  { label: '개별 권한 예외', value: '4', unit: '건', sub: '특별 부여 권한' },
  { label: '권한 요청 대기', value: '2', unit: '건', sub: '결재 진행 중', tone: 'warn' },
];

const MODULES = ['전자결재', '인사관리', '급여', '재고관리', '관리자', '경영분석'];

const MATRIX: RolePermissionRow[] = [
  { role: '병원장', perms: ['전체', '전체', '전체', '전체', '전체', '전체'] },
  { role: '관리자', perms: ['전체', '전체', '전체', '전체', '전체', '전체'] },
  { role: '부장', perms: ['전체', '부서', '부서', '부서', null, '부서'] },
  { role: '직원', perms: ['본인', '본인', '본인', '요청', null, null] },
  { role: '시급직', perms: ['본인', null, '본인', null, null, null] },
  { role: '수습', perms: ['본인', null, '본인', null, null, null] },
];

const MatrixRow = memo(function MatrixRow({ row }: { row: RolePermissionRow }) {
  return (
    <tr className="border-t border-[var(--border)]">
      <th scope="row" className="px-3 py-2.5 text-left font-bold text-[12px] text-[var(--foreground)] bg-[var(--muted)]/50">
        {row.role}
      </th>
      {row.perms.map((v, i) => (
        <td key={i} className="px-2 py-2.5 text-center">
          <Chip tone={permissionTone(v)}>{permissionLabel(v)}</Chip>
        </td>
      ))}
    </tr>
  );
});

type ExceptionItem =
  | { kind: '특별 부여'; tone: 'accent'; who: string; desc: string; meta: string }
  | { kind: '요청 중'; tone: 'warn'; who: string; desc: string; meta?: string };

const EXCEPTIONS: ExceptionItem[] = [
  { kind: '특별 부여', tone: 'accent', who: '박유진', desc: '경영지원팀 책임 · 급여 모듈 부서 → 전체 권한 부여', meta: '2025.11.5 · 박철홍' },
  { kind: '특별 부여', tone: 'accent', who: '이재훈', desc: '경영분석 모듈 본인 → 전체 권한 부여', meta: '2026.1.18 · 박철홍' },
  { kind: '요청 중', tone: 'warn', who: '김지오', desc: '재고관리 모듈 부서 → 전체 권한 요청' },
];

function MatrixTab({ onGoStaff }: { onGoStaff: () => void }) {
  return (
    <>
      <KpiGrid items={ROLES_KPI} cols={4} />

      <Card
        title="권한 매트릭스 · 역할 × 모듈"
        action={<SmBtn onClick={onGoStaff}>직원별 권한 관리 →</SmBtn>}
        className="p-0 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <caption className="sr-only">역할별 모듈 접근 권한 (전체/부서/본인/요청/없음)</caption>
            <thead>
              <tr className="bg-[var(--muted)]">
                <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-bold text-[var(--toss-gray-4)] min-w-[100px]">
                  역할 / 모듈
                </th>
                {MODULES.map((m) => (
                  <th key={m} scope="col" className="px-2 py-2.5 text-center text-[11px] font-bold text-[var(--toss-gray-4)]">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <MatrixRow key={row.role} row={row} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 bg-[var(--muted)]/40 border-t border-[var(--border)] text-[10.5px] text-[var(--toss-gray-4)] flex flex-wrap gap-3">
          <span className="flex items-center gap-1"><Chip tone="success">전체</Chip> 전 부서/전 직원</span>
          <span className="flex items-center gap-1"><Chip tone="accent">부서</Chip> 본인 부서</span>
          <span className="flex items-center gap-1"><Chip tone="warn">본인</Chip> 본인만</span>
          <span className="flex items-center gap-1"><Chip tone="danger">요청</Chip> 결재 후 임시 부여</span>
          <span className="flex items-center gap-1"><Chip tone="muted">-</Chip> 권한 없음</span>
        </div>
      </Card>

      <Card title="개별 권한 예외" className="mt-3">
        <div className="space-y-1.5">
          {EXCEPTIONS.map((e, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] border border-[var(--border)]"
            >
              <Chip tone={e.tone}>{e.kind}</Chip>
              <div className="flex-1 flex items-center gap-1.5 flex-wrap text-[12px]">
                <b className="text-[var(--foreground)]">{e.who}</b>
                <span className="text-[11px] text-[var(--toss-gray-4)]">· {e.desc}</span>
              </div>
              {e.kind === '요청 중' ? (
                <div className="flex items-center gap-1.5">
                  <SmBtn primary onClick={onGoStaff}>승인</SmBtn>
                  <SmBtn onClick={onGoStaff}>반려</SmBtn>
                </div>
              ) : (
                <span className="text-[10.5px] tabular-nums text-[var(--toss-gray-4)]">{e.meta}</span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

export default function RolesWorkcenter() {
  const meta = ADMIN_WORKCENTERS.roles;
  const [tab, setTab] = useState<RolesTabId>('matrix');

  return (
    <>
      <WorkcenterHeader
        title={meta.label}
        subtitle="역할 × 모듈 매트릭스 · 직원별 상세 권한 설정"
        mergedCount={meta.mergedCount}
        mergedTitles={meta.mergedTitles}
        actions={
          <>
            <SmBtn onClick={() => setTab('matrix')}>역할 매트릭스</SmBtn>
            <SmBtn primary onClick={() => setTab('staff')}>직원별 권한 관리</SmBtn>
          </>
        }
      />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'matrix' && <MatrixTab onGoStaff={() => setTab('staff')} />}
      {tab === 'staff' && <StaffPermissionManager onRefresh={undefined} />}
    </>
  );
}
