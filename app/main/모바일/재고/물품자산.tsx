'use client';

/**
 * SStockItem — 모바일 재고관리: 물품·자산
 *
 * 핸드오프: m-screens-stock.jsx §SStockItem
 *
 * 4 segment:
 *  - items: 물품 카탈로그 리스트 (SKU · 카테고리 · 현재고)
 *  - cat:   카테고리 카드 리스트 (parent + items count + 하위 chip)
 *  - asset: QR hero + 자산 리스트
 *  - udi:   UDI hero + 등록/대기/미등록 KPI + UDI 리스트
 *
 * 데이터: useItemData() — inventory + inventory_categories
 *
 * JM: ~350줄
 * JM2: useState 1개, 데이터는 한 번 로드
 * JM4: tab union
 * JM6: 헤더 +버튼 aria-label, 카드 click=button (자산 등록은 큰 hero button)
 */

import { useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MListRow from '../공통/MListRow';
import MKpi from '../공통/MKpi';
import {
  useItemData,
  toMTone,
} from './data-hooks';

export type ItemTab = 'items' | 'cat' | 'asset' | 'udi';

export type 물품자산Props = {
  onBack: () => void;
  onOpenItemForm: () => void;
  onOpenAssetForm: () => void;
};

export default function 물품자산({
  onBack,
  onOpenItemForm,
  onOpenAssetForm,
}: 물품자산Props) {
  const [tab, setTab] = useState<ItemTab>('items');
  const data = useItemData();

  return (
    <div className="m-screen">
      <MobileHeader
        title="물품·자산"
        sub={`${data.totalCount}품목 · 자산 ${data.assetCount}`}
        back={onBack}
        actions={
          <>
            <button type="button" aria-label="검색">
              <MIcon name="search" size={20} />
            </button>
            <button
              type="button"
              aria-label={tab === 'asset' ? '자산 등록' : '물품 등록'}
              onClick={tab === 'asset' ? onOpenAssetForm : onOpenItemForm}
            >
              <MIcon name="plus" size={20} />
            </button>
          </>
        }
      />

      <div
        style={{
          padding: '10px 16px 12px',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        <div className="m-seg" role="tablist" aria-label="물품·자산 탭">
          <SegTab on={tab === 'items'} label={`물품 ${data.totalCount}`} onClick={() => setTab('items')} />
          <SegTab on={tab === 'cat'} label="카테고리" onClick={() => setTab('cat')} />
          <SegTab on={tab === 'asset'} label={`자산 ${data.assetCount}`} onClick={() => setTab('asset')} />
          <SegTab on={tab === 'udi'} label="UDI" onClick={() => setTab('udi')} />
        </div>
      </div>

      <div className="m-scroll">
        {data.loading && <EmptyMsg msg="불러오는 중…" />}
        {!data.loading && data.error && <EmptyMsg msg={`로드 실패: ${data.error}`} tone="danger" />}

        {!data.loading && !data.error && tab === 'items' && <ItemsPane data={data} />}
        {!data.loading && !data.error && tab === 'cat' && <CatPane data={data} />}
        {!data.loading && !data.error && tab === 'asset' && (
          <AssetPane data={data} onOpenAssetForm={onOpenAssetForm} />
        )}
        {!data.loading && !data.error && tab === 'udi' && <UdiPane data={data} />}
      </div>
    </div>
  );
}

// ─── Seg tab ──────────────────────────────────────────────────
function SegTab({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={on ? 'on' : ''}
      onClick={onClick}
      role="tab"
      aria-selected={on}
    >
      {label}
    </button>
  );
}

function EmptyMsg({ msg, tone = 'muted' }: { msg: string; tone?: 'muted' | 'danger' }) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: 'center',
        color: tone === 'danger' ? 'var(--m-danger)' : 'var(--z-500)',
        fontSize: 13,
      }}
    >
      {msg}
    </div>
  );
}

// ─── 물품 탭 ──────────────────────────────────────────────────
function ItemsPane({
  data,
}: {
  data: ReturnType<typeof useItemData>;
}) {
  if (data.catalog.length === 0) return <EmptyMsg msg="등록된 물품이 없습니다." />;
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div className="m-card flush">
        {data.catalog.map((r, i) => (
          <MListRow
            key={`${r.sku}-${i}`}
            icon="box"
            iconTone=""
            label={r.name}
            sub={`${r.cat} · SKU ${r.sku}`}
            val={r.price > 0 ? `₩${r.price.toLocaleString()}` : '-'}
            valUnit={r.unit}
          />
        ))}
      </div>
    </div>
  );
}

// ─── 카테고리 탭 ──────────────────────────────────────────────
function CatPane({
  data,
}: {
  data: ReturnType<typeof useItemData>;
}) {
  if (data.categories.length === 0) return <EmptyMsg msg="등록된 카테고리가 없습니다." />;
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div className="m-card flush">
        {data.categories.map((c, i) => (
          <MListRow
            key={`${c.parent}-${i}`}
            icon="layers"
            iconTone={i === 0 ? 'accent' : ''}
            label={c.parent}
            sub={`${c.items}품목${c.kids.length > 0 ? ` · ${c.kids.slice(0, 3).join(' · ')}` : ''}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── 자산 탭 (QR hero) ────────────────────────────────────────
function AssetPane({
  data,
  onOpenAssetForm,
}: {
  data: ReturnType<typeof useItemData>;
  onOpenAssetForm: () => void;
}) {
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <button
        type="button"
        onClick={onOpenAssetForm}
        aria-label="QR로 자산 등록 화면 열기"
        style={{
          width: '100%',
          minHeight: 80,
          marginBottom: 12,
          background: 'var(--m-accent)',
          color: '#fff',
          borderRadius: 'var(--m-radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          border: 0,
          fontSize: 15,
          fontWeight: 800,
        }}
      >
        <MIcon name="qr" size={28} strokeWidth={1.6} />
        <div style={{ textAlign: 'left' }}>
          <div>QR 코드로 자산 등록·확인</div>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, marginTop: 2 }}>
            카메라로 자산 라벨을 스캔하세요
          </div>
        </div>
      </button>

      {data.assets.length === 0 ? (
        <EmptyMsg msg="등록된 자산이 없습니다." />
      ) : (
        <div className="m-card flush">
          {data.assets.map((a, i) => (
            <MListRow
              key={`${a.id}-${i}`}
              icon="settings"
              iconTone={toMTone(a.tone)}
              label={a.name}
              sub={`${a.loc} · ${a.id}`}
              rightSlot={
                a.qr ? (
                  <MIcon name="qr" size={18} color="var(--z-400)" />
                ) : (
                  <MChip tone="warning">QR 미부착</MChip>
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── UDI 탭 ───────────────────────────────────────────────────
function UdiPane({
  data,
}: {
  data: ReturnType<typeof useItemData>;
}) {
  const registered = data.udis.length;
  // PC 훅이 status를 직접 주지 않아 모바일 표시는 등록/미등록만.
  // 실시간 동기화 상태는 PC 화면에서 확인 안내.
  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div
        className="m-card"
        style={{
          padding: '14px 14px',
          marginBottom: 12,
          background: 'var(--m-accent-soft)',
          borderColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MIcon name="qr" size={20} color="var(--m-accent)" />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--m-accent)',
              }}
            >
              UDI 통합 관리 · {registered}품목 등록
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--z-600)',
                fontWeight: 600,
                marginTop: 1,
              }}
            >
              식약처 의료기기 통합정보시스템(MFDS) 연동
            </div>
          </div>
          <MBtn variant="primary" ariaLabel="UDI 스캔">
            스캔
          </MBtn>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <MKpi label="등록" value={String(registered)} tone="success" icon="plus" />
        <MKpi label="대상 자산" value={String(data.assetCount)} tone="accent" icon="box" />
      </div>

      {data.udis.length === 0 ? (
        <EmptyMsg msg="등록된 UDI가 없습니다." />
      ) : (
        <div className="m-card flush">
          {data.udis.map((u, i) => (
            <MListRow
              key={`${u.udi}-${i}`}
              icon="qr"
              iconTone="success"
              label={u.name}
              sub={u.udi}
              rightSlot={<MChip tone="success">등록</MChip>}
            />
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 12,
          padding: '12px 14px',
          background: 'var(--m-accent-soft)',
          borderRadius: 'var(--m-radius-md)',
          fontSize: 12,
          color: 'var(--m-accent)',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <MIcon name="info" size={14} />
        상세 UDI 동기화·매칭은 데스크톱에서 진행하세요
      </div>
    </div>
  );
}

