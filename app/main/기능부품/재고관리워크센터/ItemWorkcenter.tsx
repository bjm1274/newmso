// 재고관리 워크센터 — 3. 물품·자산 (item)
//
// 5장 통합: 물품등록 · 카테고리관리 · 품목자산 · 자산 QR · UDI 관리
// 구조: 4 KPI 행 + 4 탭(카탈로그 / 카테고리 / 자산·QR / UDI) + 우측 노트
//
// 데이터 소스 (실데이터):
//  - inventory: 카탈로그 (최근 등록 SKU, 단가, 등록자)
//  - inventory_categories: 카테고리 트리 (parent_id로 6 대분류 카드)
//  - inventory(자산 분류): 자산표 + QR 부착 여부 (qr_code/barcode)
//  - inventory(UDI 필드): UDI 코드·제조사·모델·로트

'use client';

import { useMemo, useState } from 'react';
import {
  KpiRow,
  StockChip,
  StockDarkBanner,
  StockTabs,
  WorkcenterNotes,
  type KpiItem,
  type TabItem,
} from './stock-workcenter-common';
import type { AssetRow, CatalogRow, CategoryCard, ItemTab, UdiRow } from './stock-types';
import { useItemData, useEmptyMessage } from './stock-workcenter-data';

// ─────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────

const TABS: TabItem<ItemTab>[] = [
  { id: 'items', label: '물품 카탈로그' },
  { id: 'cats', label: '카테고리' },
  { id: 'asset', label: '자산·QR' },
  { id: 'udi', label: 'UDI' },
];

export default function ItemWorkcenter() {
  const [tab, setTab] = useState<ItemTab>('items');
  const data = useItemData();

  const kpiItems = useMemo<KpiItem[]>(
    () => [
      {
        label: '물품 카탈로그',
        value: data.totalCount.toLocaleString(),
        unit: '종',
        sub: data.loading ? '불러오는 중…' : 'inventory 기준',
      },
      {
        label: '고정자산',
        value: data.assetCount.toLocaleString(),
        unit: '대',
        sub: 'category=장비/자산',
        tone: 'accent',
      },
      {
        label: 'UDI 등록',
        value: data.udiCount.toLocaleString(),
        unit: '건',
        sub: '의료기기 식별 코드',
        tone: 'success',
      },
      {
        label: '카테고리',
        value: data.categoryCount.toLocaleString(),
        unit: '개',
        sub: 'inventory_categories',
      },
    ],
    [data.totalCount, data.assetCount, data.udiCount, data.categoryCount, data.loading],
  );

  const tabs = useMemo<TabItem<ItemTab>[]>(
    () => [
      { ...TABS[0], count: data.totalCount },
      { ...TABS[1], count: data.categoryCount },
      { ...TABS[2], count: data.assetCount },
      { ...TABS[3], count: data.udiCount },
    ],
    [data.totalCount, data.categoryCount, data.assetCount, data.udiCount],
  );

  return (
    <div className="flex flex-col gap-4">
      <StockTabs tabs={tabs} active={tab} onChange={setTab} ariaLabel="물품·자산 탭" />
      <KpiRow items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <section role="tabpanel">
          {tab === 'items' && (
            <CatalogPanel rows={data.catalog} loading={data.loading} error={data.error} />
          )}
          {tab === 'cats' && (
            <CategoryPanel items={data.categories} loading={data.loading} error={data.error} />
          )}
          {tab === 'asset' && (
            <AssetQrPanel assets={data.assets} loading={data.loading} error={data.error} />
          )}
          {tab === 'udi' && (
            <UdiPanel rows={data.udis} loading={data.loading} error={data.error} />
          )}
        </section>

        <WorkcenterNotes
          kicker="§ 물품·자산"
          title="5장 통합 — 카탈로그·카테고리·자산·QR·UDI 한 메뉴"
          points={[
            '카탈로그: SKU·단가·등록자 한눈에. 일괄 가져오기 + 물품 등록.',
            '카테고리: 6 대분류 트리 카드. 클릭 시 중분류 편집.',
            '자산·QR: QR 라벨 출력 도구는 다크 배너로 별도 시각 강조.',
            'UDI: 의료기기 고유 식별 코드 (제조사·모델·로트).',
          ]}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// 카탈로그 패널
// ─────────────────────────────────────────────────

function CatalogPanel({
  rows,
  loading,
  error,
}: {
  rows: CatalogRow[];
  loading: boolean;
  error: string | null;
}) {
  const emptyMessage = useEmptyMessage(loading, error, rows.length);
  return (
    <section className="app-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <h3 className="text-[13px] font-bold">물품 카탈로그 — 최근 등록</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-bold hover:bg-[var(--muted)]"
            disabled
            title="준비 중"
          >
            일괄 가져오기
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[var(--accent-hover)]"
            disabled
            title="준비 중"
          >
            + 물품 등록
          </button>
        </div>
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
                <th scope="col" className="text-left">SKU</th>
                <th
                  scope="col"
                  className="text-left"
                  style={{
                    position: 'sticky',
                    left: 0,
                    background: 'var(--tab-bg)',
                    zIndex: 1,
                  }}
                >
                  품목명
                </th>
                <th scope="col" className="text-left">카테고리</th>
                <th scope="col" className="text-left">단위</th>
                <th scope="col" className="text-right">단가</th>
                <th scope="col" className="text-left">등록일</th>
                <th scope="col" className="text-left">등록자</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sku}>
                  <td className="font-bold tabular-nums text-[var(--accent)] text-[11px]">
                    {r.sku}
                  </td>
                  <td
                    className="font-bold"
                    style={{
                      position: 'sticky',
                      left: 0,
                      background: 'var(--card)',
                      zIndex: 1,
                    }}
                  >
                    {r.name}
                  </td>
                  <td className="text-[var(--toss-gray-4)]">{r.cat}</td>
                  <td className="text-[var(--toss-gray-4)] tabular-nums">{r.unit}</td>
                  <td className="text-right font-extrabold tabular-nums">
                    {r.price.toLocaleString()}
                    <span className="ml-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
                      원
                    </span>
                  </td>
                  <td className="text-[var(--toss-gray-4)] tabular-nums">{r.date}</td>
                  <td className="text-[var(--toss-gray-4)]">{r.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────
// 카테고리 패널 (6 대분류 트리 카드)
// ─────────────────────────────────────────────────

function CategoryPanel({
  items,
  loading,
  error,
}: {
  items: CategoryCard[];
  loading: boolean;
  error: string | null;
}) {
  const emptyMessage = useEmptyMessage(loading, error, items.length);
  if (emptyMessage) {
    return (
      <p className="app-card px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
        {emptyMessage}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((c) => (
        <article key={c.parent} className="app-card flex flex-col gap-2 p-3">
          <header className="flex items-baseline justify-between gap-2">
            <h4 className="text-[14px] font-bold tracking-tight truncate">{c.parent}</h4>
            <span className="text-[12px] font-extrabold tabular-nums text-[var(--accent)]">
              {c.items} 종
            </span>
          </header>
          {c.kids.length === 0 ? (
            <p className="text-[10.5px] text-[var(--toss-gray-4)]">하위 카테고리 없음</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {c.kids.map((k) => (
                <li
                  key={k}
                  className="rounded-[var(--radius-sm)] bg-[var(--muted)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--toss-gray-4)]"
                >
                  {k}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────
// 자산·QR 패널 (자산 표 + QR 라벨 출력 도구)
// ─────────────────────────────────────────────────

function AssetQrPanel({
  assets,
  loading,
  error,
}: {
  assets: AssetRow[];
  loading: boolean;
  error: string | null;
}) {
  const emptyMessage = useEmptyMessage(loading, error, assets.length);
  const firstAsset = assets[0];
  return (
    <div className="flex flex-col gap-3">
      <StockDarkBanner
        kicker="WORKFLOW TOOL"
        title="QR 라벨 출력 도구"
        desc="자산에 부착할 QR 라벨을 미리보기·인쇄"
      >
        <button
          type="button"
          className="rounded-[var(--radius-md)] bg-white px-3 py-1 text-[11px] font-bold text-[var(--zinc-900)] hover:bg-white/90"
          disabled
          title="준비 중"
        >
          라벨 인쇄
        </button>
      </StockDarkBanner>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <section className="app-card overflow-hidden">
          <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
            <h3 className="text-[13px] font-bold">고정자산</h3>
            <button
              type="button"
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[var(--accent-hover)]"
              disabled
              title="준비 중"
            >
              + 자산 등록
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
                    <th scope="col" className="text-left">자산번호</th>
                    <th scope="col" className="text-left">품목</th>
                    <th scope="col" className="text-left">위치</th>
                    <th scope="col" className="text-left">구매일</th>
                    <th scope="col" className="text-left">QR</th>
                    <th scope="col" className="text-left">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id}>
                      <td className="font-bold tabular-nums text-[var(--accent)] text-[11px]">
                        {a.id}
                      </td>
                      <td className="font-bold">{a.name}</td>
                      <td className="text-[var(--toss-gray-4)]">{a.loc}</td>
                      <td className="text-[var(--toss-gray-4)] tabular-nums">{a.date}</td>
                      <td>
                        {a.qr ? (
                          <StockChip tone="success">부착</StockChip>
                        ) : (
                          <StockChip tone="warn">미부착</StockChip>
                        )}
                      </td>
                      <td>
                        <StockChip tone={a.tone}>{a.status}</StockChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <QrLabelPreview asset={firstAsset} />
      </div>
    </div>
  );
}

function QrLabelPreview({ asset }: { asset: AssetRow | undefined }) {
  // 7×7 QR-like deterministic 더미 패턴
  const cells = useMemo(
    () => Array.from({ length: 49 }, (_, i) => (i * 7 + 3) % 11 > 4),
    [],
  );
  const id = asset?.id ?? '-';
  const name = asset?.name ?? '자산 미선택';
  const meta = asset ? `${asset.loc} · ${asset.date}` : '자산을 선택하세요';

  return (
    <section className="app-card flex flex-col gap-3 p-3" aria-label="QR 라벨 미리보기">
      <h3 className="text-[12px] font-bold">QR 라벨 미리보기</h3>
      <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
        <div
          className="grid h-[84px] w-[84px] shrink-0 grid-cols-7 gap-[1px] rounded-[var(--radius-sm)] border border-[var(--border)] p-1"
          aria-hidden
        >
          {cells.map((on, i) => (
            <div
              key={i}
              className="aspect-square"
              style={{ background: on ? 'var(--zinc-900)' : 'var(--card)' }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-[10px] font-extrabold tabular-nums text-[var(--accent)]">
            {id}
          </div>
          <div className="text-[12px] font-bold truncate">{name}</div>
          <div className="text-[10px] text-[var(--toss-gray-4)] truncate">{meta}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
          라벨 크기
          <select className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-bold text-[var(--foreground)]">
            <option>50 × 30mm</option>
            <option>40 × 25mm</option>
            <option>30 × 20mm</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold text-[var(--toss-gray-4)]">
          출력 매수
          <input
            type="number"
            min={1}
            defaultValue={1}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-bold text-[var(--foreground)]"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StockChip tone="accent">자산번호</StockChip>
        <StockChip tone="accent">품명</StockChip>
        <StockChip tone="muted">+ 위치</StockChip>
        <StockChip tone="muted">+ 구매일</StockChip>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────
// UDI 패널
// ─────────────────────────────────────────────────

function UdiPanel({
  rows,
  loading,
  error,
}: {
  rows: UdiRow[];
  loading: boolean;
  error: string | null;
}) {
  const emptyMessage = useEmptyMessage(loading, error, rows.length);
  return (
    <section className="app-card overflow-hidden">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <h3 className="text-[13px] font-bold">UDI (의료기기 고유 식별 코드)</h3>
        <button
          type="button"
          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[var(--accent-hover)]"
        >
          + UDI 등록
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
                <th scope="col" className="text-left">UDI 코드</th>
                <th scope="col" className="text-left">품목</th>
                <th scope="col" className="text-left">제조사</th>
                <th scope="col" className="text-left">모델</th>
                <th scope="col" className="text-left">로트</th>
                <th scope="col" className="text-left">등록일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u, i) => (
                <tr key={`${u.udi}-${i}`}>
                  <td className="font-bold tabular-nums text-[var(--accent)] text-[11px]">
                    {u.udi}
                  </td>
                  <td className="font-bold">{u.name}</td>
                  <td className="text-[var(--toss-gray-4)]">{u.mfr}</td>
                  <td className="text-[var(--toss-gray-4)] tabular-nums">{u.model}</td>
                  <td className="text-[var(--toss-gray-4)] tabular-nums">{u.lot}</td>
                  <td className="text-[var(--toss-gray-4)] tabular-nums">{u.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
