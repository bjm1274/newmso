// 재고관리 워크센터 — 1. 재고 현황 (status) ★
//
// 4장 통합: 재고현황 · 내 부서 재고 · 재고 알림 · 유효기간 알림
// 구조: 4 KPI 행 + 메인(표 + 필터 칩) + 우측 노트(긴급 알림 + 부서별 사용량)
//
// 데이터 소스 (실데이터):
//  - inventory: 품목·재고 수량·최소·유효기간·위치
//  - inventory_logs: 부서별 사용량 TOP 5 (사용/소모/출고 로그)
// 표시: useStatusData 훅 (stock-workcenter-data.ts)

'use client';

import { useMemo, useState } from 'react';
import {
  FilterChips,
  KpiRow,
  WorkcenterNotes,
  type FilterChip,
  type KpiItem,
} from './stock-workcenter-common';
import {
  STATUS_SCOPE_LABEL,
  type StatusScope,
  type StockStatusRow,
} from './stock-types';
import { useStatusData, useEmptyMessage } from './stock-workcenter-data';
import { DeptUsageTop5, StockStatusTable, UrgentAlertList } from './StatusSubViews';

type SortKey = '위치별' | '카테고리별' | '재고 적은 순' | '만료 임박 순';

const SCOPE_TONE: Record<StatusScope, FilterChip<StatusScope>['tone']> = {
  all: 'accent',
  my: 'muted',
  low: 'warn',
  zero: 'danger',
  expire: 'warn',
};

// ─────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────

export default function StatusWorkcenter() {
  const [scope, setScope] = useState<StatusScope>('all');
  const [sortBy, setSortBy] = useState<SortKey>('위치별');

  const data = useStatusData();

  const kpiItems = useMemo<KpiItem[]>(
    () => [
      {
        label: '전체 품목',
        value: data.total.toLocaleString(),
        unit: '종',
        sub: data.loading ? '불러오는 중…' : `등록된 inventory 기준`,
      },
      {
        label: '부족 품목',
        value: data.lowCount.toLocaleString(),
        unit: '건',
        sub: '최소재고 미만',
        tone: 'warn',
      },
      {
        label: '재고 0',
        value: data.zeroCount.toLocaleString(),
        unit: '건',
        sub: '긴급 보충 필요',
        tone: 'danger',
      },
      {
        label: '유효기간 임박',
        value: data.expireCount.toLocaleString(),
        unit: '건',
        sub: '90일 이내 만료',
        tone: 'warn',
      },
    ],
    [data.total, data.lowCount, data.zeroCount, data.expireCount, data.loading],
  );

  // 'my' 칩 카운트는 filterByScope('my')와 동일 휴리스틱으로 산출해야
  // 칩 숫자와 실제 필터 결과가 일치한다. (data.myCount는 userCompany
  // 인자가 전달되지 않아 항상 0이므로 사용하지 않음)
  const myCount = useMemo(() => filterByScope(data.rows, 'my').length, [data.rows]);

  const scopeCount = useMemo<Record<StatusScope, number>>(
    () => ({
      all: data.total,
      my: myCount,
      low: data.lowCount,
      zero: data.zeroCount,
      expire: data.expireCount,
    }),
    [data, myCount],
  );

  const chips = useMemo<FilterChip<StatusScope>[]>(
    () =>
      (Object.keys(STATUS_SCOPE_LABEL) as StatusScope[]).map((k) => ({
        id: k,
        label: STATUS_SCOPE_LABEL[k],
        count: scopeCount[k],
        tone: SCOPE_TONE[k],
      })),
    [scopeCount],
  );

  const filtered = useMemo(() => filterByScope(data.rows, scope), [data.rows, scope]);
  const sorted = useMemo(() => sortRows(filtered, sortBy), [filtered, sortBy]);
  const emptyMessage = useEmptyMessage(data.loading, data.error, sorted.length);

  return (
    <div className="flex flex-col gap-4">
      <KpiRow items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* ── 메인: 표 ── */}
        <section className="app-card flex flex-col overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--muted)] px-4 py-2.5">
            <FilterChips
              chips={chips}
              active={scope}
              onChange={setScope}
              ariaLabel="재고 범위 필터"
            />
            <label className="flex items-center gap-1.5 text-[11px]">
              <span className="sr-only">정렬</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-bold text-[var(--foreground)]"
              >
                <option>위치별</option>
                <option>카테고리별</option>
                <option>재고 적은 순</option>
                <option>만료 임박 순</option>
              </select>
            </label>
          </header>

          <StockStatusTable rows={sorted} emptyMessage={emptyMessage} />
        </section>

        {/* ── 우측: 긴급 알림 + 부서별 사용량 ── */}
        <aside className="flex flex-col gap-3">
          <UrgentAlertList rows={data.rows} />
          <DeptUsageTop5 items={data.deptUsageTop5} />
        </aside>
      </div>

      <WorkcenterNotes
        kicker="§ 재고 현황"
        title="4장 통합 — 전체·내 부서·재고 알림·유효기간을 하나로"
        points={[
          '필터 칩으로 즉시 컨텍스트 전환 (전체/내 부서/부족/재고 0/유효기간).',
          '재고 0 / 만료 임박 / 부족은 항상 danger·warn 톤으로 즉시 식별.',
          '우측 긴급 알림에서 자동 발주·사용 우선 등 인라인 액션 제공.',
          '부서별 사용량 TOP 5는 inventory_logs 최근 30일 기준.',
        ]}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────
// 필터·정렬 로직 (메모이즈 — JM2)
// ─────────────────────────────────────────────────

function filterByScope(rows: StockStatusRow[], scope: StatusScope): StockStatusRow[] {
  switch (scope) {
    case 'all':
      return rows;
    case 'my':
      return rows.filter((r) => r.loc !== '본사' && r.loc !== 'MSO 본사 창고');
    case 'low':
      return rows.filter((r) => r.status === '부족');
    case 'zero':
      return rows.filter((r) => r.status === '재고 0');
    case 'expire':
      return rows.filter((r) => r.status === '유효기간');
    default:
      return rows;
  }
}

function sortRows(rows: StockStatusRow[], sortBy: SortKey): StockStatusRow[] {
  const next = [...rows];
  switch (sortBy) {
    case '재고 적은 순':
      next.sort((a, b) => a.stock - b.stock);
      break;
    case '카테고리별':
      next.sort((a, b) => a.cat.localeCompare(b.cat));
      break;
    case '만료 임박 순':
      next.sort((a, b) => a.expire.localeCompare(b.expire));
      break;
    case '위치별':
    default:
      next.sort((a, b) => a.loc.localeCompare(b.loc));
  }
  return next;
}
