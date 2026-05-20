// 재고관리 워크센터 — 2. 입출고·발주 (io)
//
// 5장 통합: 입출고관리 · 구매 발주 · 거래처관리 · 명세서관리 · 납품확인서
// 구조: 4 KPI 행 + 3 탭(입출고 기록 / 발주 관리 / 거래처·명세서) + 우측 노트
//
// 데이터 소스 (실데이터):
//  - inventory_logs (today): 입출고 기록
//  - purchase_orders: 발주 + 상태
//  - suppliers + purchase_orders: 거래처 카드 (발주 수·지급·미수금 집계)

'use client';

import { useMemo, useState } from 'react';
import {
  FilterChips,
  KpiRow,
  StockChip,
  StockTabs,
  WorkcenterNotes,
  type FilterChip,
  type KpiItem,
  type TabItem,
} from './stock-workcenter-common';
import type { IOTab, PurchaseOrderRow, StockMoveRow, Tone, VendorCard } from './stock-types';
import { useIOData, useEmptyMessage } from './stock-workcenter-data';

// ─────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────

const TABS: TabItem<IOTab>[] = [
  { id: 'inout', label: '입출고 기록' },
  { id: 'order', label: '발주 관리' },
  { id: 'vendor', label: '거래처·명세서' },
];

export default function IOWorkcenter() {
  const [tab, setTab] = useState<IOTab>('inout');
  const data = useIOData();

  const kpiItems = useMemo<KpiItem[]>(
    () => [
      {
        label: '오늘 입출고',
        value: data.todayInout.toLocaleString(),
        unit: '건',
        sub: data.loading ? '불러오는 중…' : '오늘 inventory_logs 집계',
      },
      {
        label: '발주 대기',
        value: data.pendingOrders.toLocaleString(),
        unit: '건',
        sub: '결재 후 발송 예정',
        tone: 'warn',
      },
      {
        label: '배송 중',
        value: data.shippingOrders.toLocaleString(),
        unit: '건',
        sub: '도착 예정',
        tone: 'accent',
      },
      {
        label: '이번 달 발주액',
        value: data.monthAmount.toLocaleString(),
        unit: 'M원',
        sub: '총 발주 금액(현재 월)',
        tone: 'success',
      },
    ],
    [data.todayInout, data.pendingOrders, data.shippingOrders, data.monthAmount, data.loading],
  );

  const tabs = useMemo<TabItem<IOTab>[]>(
    () => [
      { ...TABS[0], count: data.moves.length },
      { ...TABS[1], count: data.orders.length },
      { ...TABS[2], count: data.vendors.length },
    ],
    [data.moves.length, data.orders.length, data.vendors.length],
  );

  return (
    <div className="flex flex-col gap-4">
      <StockTabs tabs={tabs} active={tab} onChange={setTab} ariaLabel="입출고·발주 탭" />
      <KpiRow items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <section role="tabpanel">
          {tab === 'inout' && (
            <InoutPanel
              rows={data.moves}
              loading={data.loading}
              error={data.error}
            />
          )}
          {tab === 'order' && (
            <OrderPanel
              rows={data.orders}
              loading={data.loading}
              error={data.error}
            />
          )}
          {tab === 'vendor' && (
            <VendorPanel
              vendors={data.vendors}
              loading={data.loading}
              error={data.error}
            />
          )}
        </section>

        <WorkcenterNotes
          kicker="§ 입출고·발주"
          title="5장 통합 — 한 메뉴 내에서 흐름을 관리"
          points={[
            '입출고 기록: today 시간순. 입고/출고/이관/반품 톤으로 즉시 식별.',
            '발주 관리: 5단계 상태 칩(대기/확정/배송 중/완료) + PO 표.',
            '거래처: 6 카드 = 발주/지급/미수금 stats — 미수금은 danger·warn 톤.',
            '명세서·납품 확인서는 거래처 카드 클릭 시 상세 패널에서 처리.',
          ]}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// 입출고 기록 패널
// ─────────────────────────────────────────────────

type MoveKindFilter = '전체' | '입고' | '출고' | '이관' | '반품';

function InoutPanel({
  rows,
  loading,
  error,
}: {
  rows: StockMoveRow[];
  loading: boolean;
  error: string | null;
}) {
  const [kindFilter, setKindFilter] = useState<MoveKindFilter>('전체');
  const filtered = useMemo(
    () => (kindFilter === '전체' ? rows : rows.filter((m) => m.kind === kindFilter)),
    [rows, kindFilter],
  );
  const emptyMessage = useEmptyMessage(loading, error, filtered.length);

  const todayLabel = new Date().toLocaleDateString('ko-KR');

  return (
    <section className="app-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <h3 className="text-[13px] font-bold">오늘 입출고 ({todayLabel})</h3>
        <div className="flex items-center gap-2">
          <label className="text-[11px]">
            <span className="sr-only">유형</span>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as MoveKindFilter)}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-bold"
            >
              <option>전체</option>
              <option>입고</option>
              <option>출고</option>
              <option>이관</option>
              <option>반품</option>
            </select>
          </label>
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            + 수동 등록
          </button>
        </div>
      </header>
      {emptyMessage ? (
        <p className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
          {emptyMessage}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {filtered.map((m, i) => (
            <li
              key={`${m.time}-${m.item}-${i}`}
              className="grid grid-cols-[56px_64px_1fr_72px_64px] items-center gap-2 px-4 py-2 text-[12px]"
            >
              <span className="font-bold tabular-nums text-[var(--toss-gray-4)]">{m.time}</span>
              <StockChip tone={m.tone}>{m.kind}</StockChip>
              <div className="min-w-0">
                <div className="font-bold truncate">{m.item}</div>
                <div className="text-[10.5px] text-[var(--toss-gray-4)] truncate">
                  {m.from} → {m.to}
                </div>
              </div>
              <span className="text-right font-extrabold tabular-nums">
                {m.qty}
                <span className="ml-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
                  {m.unit}
                </span>
              </span>
              <span className="text-right text-[11px] text-[var(--toss-gray-4)] truncate">
                {m.who}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────
// 발주 관리 패널
// ─────────────────────────────────────────────────

type OrderScope = 'all' | 'wait' | 'confirm' | 'ship' | 'done';

function OrderPanel({
  rows,
  loading,
  error,
}: {
  rows: PurchaseOrderRow[];
  loading: boolean;
  error: string | null;
}) {
  const [scope, setScope] = useState<OrderScope>('all');
  const filtered = useMemo(() => filterOrders(rows, scope), [rows, scope]);

  const counts = useMemo(() => {
    const c = { all: rows.length, wait: 0, confirm: 0, ship: 0, done: 0 };
    for (const r of rows) {
      if (r.status === '발주 대기') c.wait++;
      else if (r.status === '확정') c.confirm++;
      else if (r.status === '배송 중') c.ship++;
      else if (r.status === '납품 완료') c.done++;
    }
    return c;
  }, [rows]);

  const chips = useMemo<FilterChip<OrderScope>[]>(
    () => [
      { id: 'all', label: '전체', count: counts.all, tone: 'accent' },
      { id: 'wait', label: '대기', count: counts.wait, tone: 'warn' },
      { id: 'confirm', label: '확정', count: counts.confirm, tone: 'success' },
      { id: 'ship', label: '배송 중', count: counts.ship, tone: 'muted' },
      { id: 'done', label: '완료', count: counts.done, tone: 'muted' },
    ],
    [counts],
  );

  const emptyMessage = useEmptyMessage(loading, error, filtered.length);

  return (
    <section className="app-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <FilterChips
          chips={chips}
          active={scope}
          onChange={setScope}
          ariaLabel="발주 상태 필터"
        />
        <button
          type="button"
          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[var(--accent-hover)]"
        >
          + 새 발주
        </button>
      </header>
      {emptyMessage ? (
        <p className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table compact w-full text-[12px]">
            <thead>
              <tr>
                <th scope="col" className="text-left">발주번호</th>
                <th scope="col" className="text-left">거래처</th>
                <th scope="col" className="text-center">품목 수</th>
                <th scope="col" className="text-right">금액</th>
                <th scope="col" className="text-left">발주일</th>
                <th scope="col" className="text-left">납기일</th>
                <th scope="col" className="text-left">상태</th>
                <th scope="col" className="w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td className="font-bold tabular-nums text-[var(--accent)] text-[11px]">
                    {o.id.slice(0, 16)}
                  </td>
                  <td className="font-bold">{o.vendor}</td>
                  <td className="text-center tabular-nums">{o.items}</td>
                  <td className="text-right font-extrabold tabular-nums">
                    {o.amt.toLocaleString()}
                    <span className="ml-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
                      원
                    </span>
                  </td>
                  <td className="text-[var(--toss-gray-4)] tabular-nums">{o.placed}</td>
                  <td className="text-[var(--toss-gray-4)] tabular-nums">{o.due}</td>
                  <td>
                    <StockChip tone={o.tone}>{o.status}</StockChip>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)]"
                    >
                      상세
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function filterOrders(rows: PurchaseOrderRow[], scope: OrderScope): PurchaseOrderRow[] {
  const map: Record<OrderScope, PurchaseOrderRow['status'] | null> = {
    all: null,
    wait: '발주 대기',
    confirm: '확정',
    ship: '배송 중',
    done: '납품 완료',
  };
  const target = map[scope];
  return target ? rows.filter((r) => r.status === target) : rows;
}

// ─────────────────────────────────────────────────
// 거래처·명세서 패널 (6 카드)
// ─────────────────────────────────────────────────

function VendorPanel({
  vendors,
  loading,
  error,
}: {
  vendors: VendorCard[];
  loading: boolean;
  error: string | null;
}) {
  const emptyMessage = useEmptyMessage(loading, error, vendors.length);
  if (emptyMessage) {
    return (
      <p className="app-card px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
        {emptyMessage}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {vendors.map((v) => (
        <VendorCardItem key={v.name} v={v} />
      ))}
    </div>
  );
}

function VendorCardItem({ v }: { v: VendorCard }) {
  const statusTone: Tone = v.due === 0 ? 'success' : v.tone;
  return (
    <article className="app-card flex flex-col gap-2 p-3">
      <header className="flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-bold tracking-tight truncate">{v.name}</h4>
        <StockChip tone={statusTone}>{v.due === 0 ? '정상' : '미수금'}</StockChip>
      </header>
      <p className="text-[11px] text-[var(--toss-gray-4)] truncate">
        {v.cat} · {v.contact || '연락처 미등록'}
      </p>
      <dl className="grid grid-cols-3 gap-1 rounded-[var(--radius-md)] bg-[var(--muted)] p-2">
        <VendorStat label="발주" value={v.orders} unit="건" />
        <VendorStat label="지급" value={v.paid} unit="M" />
        <VendorStat
          label="미수"
          value={v.due}
          unit="M"
          color={v.due > 0 ? 'var(--danger)' : undefined}
        />
      </dl>
    </article>
  );
}

function VendorStat({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 text-center">
      <dt className="text-[10px] font-bold text-[var(--toss-gray-4)]">{label}</dt>
      <dd
        className="text-[13px] font-extrabold tabular-nums leading-tight"
        style={{ color: color ?? 'var(--foreground)' }}
      >
        {value}
        <span className="ml-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">{unit}</span>
      </dd>
    </div>
  );
}
