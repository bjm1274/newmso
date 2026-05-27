'use client';

/**
 * SStockIO — 모바일 재고관리: 입출고·발주
 *
 * 핸드오프: m-screens-stock.jsx §SStockIO
 *
 * 5 segment(handoff는 4지만 §SCREENS_INVENTORY가 명세서·이력 분리):
 *  - io: 오늘 입출고 KPI + 최근 거래 리스트
 *  - order: 자동 발주 권장 배너 + 발주 카드 리스트
 *  - vendor: 거래처 카드 리스트 (이름·카테고리·발주건수)
 *  - doc: 거래명세서 리스트 (mock — purchase_orders의 supplier_name 사용)
 *  - history: 최근 30일 이력 (inventory_logs 더 길게)
 *
 * 데이터: useIOData() — inventory_logs, purchase_orders, suppliers
 *
 * JM: ~360줄
 * JM2: 탭 전환마다 재조회하지 않고 한 번 로드.
 * JM4: tab union 사용.
 * JM5: 발주 실행은 권한 가드 — UI는 비활성화 + 안내만(모바일 P0).
 */

import { useMemo, useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MListRow from '../공통/MListRow';
import {
  useIOData,
  toMTone,
  formatAmount,
  canPlaceOrder,
  type StockMutateUser,
} from './data-hooks';
import { IORecordForm, KpiCard } from './입출고-form';

export type IOTab = 'io' | 'order' | 'vendor' | 'doc' | 'history';

export type 입출고Props = {
  user: StockMutateUser | null;
  onBack: () => void;
  onPlaceOrder: () => void;
};

const TABS: ReadonlyArray<{ id: IOTab; label: string }> = [
  { id: 'io', label: '입출고' },
  { id: 'order', label: '발주' },
  { id: 'vendor', label: '거래처' },
  { id: 'doc', label: '명세서' },
  { id: 'history', label: '이력' },
];

export default function 입출고({ user, onBack, onPlaceOrder }: 입출고Props) {
  const [tab, setTab] = useState<IOTab>('io');
  const [showForm, setShowForm] = useState(false);
  const data = useIOData();
  const allowOrder = canPlaceOrder(user);

  if (showForm) {
    return (
      <IORecordForm
        user={user}
        onClose={() => setShowForm(false)}
      />
    );
  }

  return (
    <div className="m-screen">
      <MobileHeader
        title="입출고·발주"
        sub={`오늘 ${data.todayInout}건 · 대기 ${data.pendingOrders}건`}
        back={onBack}
        actions={
          <>
            <button type="button" aria-label="검색">
              <MIcon name="search" size={20} />
            </button>
            <button
              type="button"
              aria-label="입출고 기록"
              onClick={() => setShowForm(true)}
            >
              <MIcon name="plus" size={20} />
            </button>
          </>
        }
      />

      <div className="m-chip-bar" role="tablist" aria-label="입출고 탭">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
          >
            {t.label}
            {t.id === 'order' && data.pendingOrders > 0 && (
              <span className="cnt">{data.pendingOrders}</span>
            )}
          </button>
        ))}
      </div>

      <div className="m-scroll">
        {data.loading && (
          <Empty message="불러오는 중…" />
        )}
        {!data.loading && data.error && (
          <Empty message={`로드 실패: ${data.error}`} tone="danger" />
        )}

        {!data.loading && !data.error && tab === 'io' && (
          <IoPane data={data} />
        )}
        {!data.loading && !data.error && tab === 'order' && (
          <OrderPane
            data={data}
            allowOrder={allowOrder}
            onPlaceOrder={onPlaceOrder}
          />
        )}
        {!data.loading && !data.error && tab === 'vendor' && (
          <VendorPane data={data} />
        )}
        {!data.loading && !data.error && tab === 'doc' && (
          <DocPane data={data} />
        )}
        {!data.loading && !data.error && tab === 'history' && (
          <HistoryPane data={data} />
        )}
      </div>
    </div>
  );
}

// ─── 빈/에러 안내 ─────────────────────────────────────────────
function Empty({
  message,
  tone = 'muted',
}: {
  message: string;
  tone?: 'muted' | 'danger';
}) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: 'center',
        color: tone === 'danger' ? 'var(--m-danger)' : 'var(--z-500)',
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

// ─── 입출고 탭 ────────────────────────────────────────────────
function IoPane({
  data,
}: {
  data: ReturnType<typeof useIOData>;
}) {
  const inCount = data.moves.filter((m) => m.kind === '입고').length;
  const outCount = data.moves.filter((m) => m.kind === '출고').length;

  return (
    <>
      <div
        style={{
          padding: '14px 16px 0',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <KpiCard label="오늘 입고" value={inCount} unit="건" tone="accent" />
        <KpiCard label="오늘 출고" value={outCount} unit="건" tone="success" />
      </div>
      <div className="m-section">
        <div className="m-section-h">
          <div className="lbl">최근 거래</div>
        </div>
        <div className="m-card flush">
          {data.moves.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              오늘 거래 내역이 없습니다.
            </div>
          ) : (
            data.moves.slice(0, 30).map((m, i) => {
              const isIn = m.kind === '입고';
              const signed = isIn ? `+${m.qty}` : `-${m.qty}`;
              return (
                <MListRow
                  key={`${m.time}-${i}`}
                  icon={isIn ? 'arrowDown' : 'arrowUp'}
                  iconTone={isIn ? 'accent' : 'success'}
                  label={m.item}
                  sub={`${m.kind} · ${m.who} · ${m.time}`}
                  val={signed}
                />
              );
            })
          )}
        </div>
      </div>
      <div style={{ height: 24 }} />
    </>
  );
}

// ─── 발주 탭 ──────────────────────────────────────────────────
function OrderPane({
  data,
  allowOrder,
  onPlaceOrder,
}: {
  data: ReturnType<typeof useIOData>;
  allowOrder: boolean;
  onPlaceOrder: () => void;
}) {
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div
        className="m-card"
        style={{
          padding: '14px 16px',
          marginBottom: 12,
          background: 'var(--m-accent-soft)',
          borderColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MIcon name="info" size={18} color="var(--m-accent)" />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--m-accent)',
              }}
            >
              자동 발주 권장 {data.pendingOrders}건
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--z-600)',
                fontWeight: 600,
                marginTop: 1,
              }}
            >
              안전재고 미달 — 거래처 자동 매칭됨
            </div>
          </div>
          <MBtn
            variant="primary"
            disabled={!allowOrder}
            ariaLabel="발주 작성"
            onClick={onPlaceOrder}
          >
            작성
          </MBtn>
        </div>
        {!allowOrder && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--z-500)',
              fontWeight: 600,
              marginTop: 8,
            }}
          >
            발주 권한이 없습니다. 관리자에게 요청하세요.
          </div>
        )}
      </div>

      {data.orders.length === 0 ? (
        <Empty message="발주 내역이 없습니다." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.orders.slice(0, 20).map((o, i) => (
            <div key={`${o.id}-${i}`} className="m-card" style={{ padding: '12px 14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <MChip tone={toMTone(o.tone)}>{o.status}</MChip>
                <div style={{ flex: 1 }} />
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--z-500)',
                    fontWeight: 600,
                  }}
                >
                  {o.placed} 발주
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.012em' }}>
                {o.vendor}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 6,
                  fontSize: 12,
                  color: 'var(--z-500)',
                  fontWeight: 600,
                }}
              >
                <span>품목 {o.items}건</span>
                <span style={{ color: 'var(--z-300)' }}>·</span>
                <span>납기 {o.due || '-'}</span>
                <div style={{ flex: 1 }} />
                <span
                  className="m-tnum"
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: 'var(--z-900)',
                  }}
                >
                  ₩ {formatAmount(o.amt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 거래처 탭 ────────────────────────────────────────────────
function VendorPane({
  data,
}: {
  data: ReturnType<typeof useIOData>;
}) {
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {data.vendors.length === 0 ? (
        <Empty message="등록된 거래처가 없습니다." />
      ) : (
        <div className="m-card flush">
          {data.vendors.map((v, i) => (
            <MListRow
              key={`${v.name}-${i}`}
              icon="users"
              iconTone={toMTone(v.tone)}
              label={v.name}
              sub={`${v.cat} · 발주 ${v.orders}건${v.due > 0 ? ` · 미수금 ${v.due}M` : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 명세서 탭 ────────────────────────────────────────────────
function DocPane({
  data,
}: {
  data: ReturnType<typeof useIOData>;
}) {
  // 발주 중 '확정/완료' 상태만 명세서로 간주
  const docs = useMemo(
    () => data.orders.filter((o) => o.status === '확정' || o.status === '납품 완료'),
    [data.orders],
  );

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {docs.length === 0 ? (
        <Empty message="명세서가 없습니다." />
      ) : (
        <div className="m-card flush">
          {docs.map((d, i) => (
            <MListRow
              key={`${d.id}-${i}`}
              icon="fileText"
              iconTone={toMTone(d.tone)}
              label={`거래명세서 #${d.id.slice(-6)}`}
              sub={`${d.vendor} · ₩ ${formatAmount(d.amt)}`}
              rightSlot={<MChip tone={toMTone(d.tone)}>{d.status}</MChip>}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 이력 탭 (최근 inventory_logs 전체) ───────────────────────
function HistoryPane({
  data,
}: {
  data: ReturnType<typeof useIOData>;
}) {
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {data.moves.length === 0 ? (
        <Empty message="이력이 없습니다." />
      ) : (
        <div className="m-card flush">
          {data.moves.map((m, i) => {
            const isIn = m.kind === '입고';
            return (
              <MListRow
                key={`${m.time}-${i}`}
                icon={isIn ? 'arrowDown' : 'arrowUp'}
                iconTone={toMTone(m.tone)}
                label={m.item}
                sub={`${m.kind} · ${m.from} → ${m.to} · ${m.time}`}
                val={`${isIn ? '+' : '-'}${m.qty}`}
                valUnit={m.unit}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

