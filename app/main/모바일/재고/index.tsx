'use client';

/**
 * 재고관리 라우터 + 허브.
 *
 * 기본 진입은 'hub' — KPI 4종 + 4개 메뉴 카드. 메뉴 선택 시 각 워크센터 화면으로 분기.
 * 워크센터 화면에서 뒤로가기는 허브로 복귀(허브에서 뒤로가기는 모듈 종료 onBack).
 * 폼(form-*) 진입은 워크센터에서, 닫으면 원래 화면으로 복귀.
 *
 * 외부 진입:
 *   <재고관리 user={user} onBack={() => ...} />
 *
 * JM: 분기·허브만 담당
 * JM4: StockView union, ReturnFrom union
 */

import { useCallback, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MListRow from '../공통/MListRow';
import MKpi from '../공통/MKpi';
import MIcon from '../공통/MIcon';
import 재고현황 from './재고현황';
import 입출고 from './입출고';
import 물품자산 from './물품자산';
import 분석마감 from './분석마감';
import 물품등록 from './물품등록';
import 자산등록 from './자산등록';
import 발주등록 from './발주등록';

export type StockView =
  | 'hub'
  | 'stock'
  | 'io'
  | 'item'
  | 'analyze'
  | 'form-item'
  | 'form-asset'
  | 'form-order';

type ReturnFrom = 'stock' | 'io' | 'item' | 'analyze';

export type 재고관리Props = {
  user: ErpUser;
  onBack: () => void;
};

type StockMenuId = 'stock' | 'io' | 'item' | 'analyze';

interface StockMenu {
  id: StockMenuId;
  label: string;
  sub: string;
  icon: string;
  tone: '' | 'accent' | 'success' | 'warning' | 'danger';
  badge?: string;
  badgeTone?: '' | 'accent' | 'success' | 'warning' | 'danger';
}

const STOCK_MENU: StockMenu[] = [
  { id: 'stock', label: '재고 현황', sub: '현황 · 내 부서 · 알림 · 유효기간', icon: 'box', tone: 'accent', badge: '부족 23', badgeTone: 'warning' },
  { id: 'io', label: '입출고 · 발주', sub: '입출고 · 발주 · 거래처 · 명세서', icon: 'download', tone: 'success', badge: '발주 3', badgeTone: 'warning' },
  { id: 'item', label: '물품 · 자산', sub: '물품등록 · 카테고리 · 자산 QR · UDI', icon: 'grid', tone: 'accent' },
  { id: 'analyze', label: '분석 · 마감', sub: 'ABC · 수요예측 · 실사 · 월마감', icon: 'layers', tone: '' },
];

export default function 재고관리({ user, onBack }: 재고관리Props) {
  const [view, setView] = useState<StockView>('hub');
  const [returnFrom, setReturnFrom] = useState<ReturnFrom>('stock');

  const company = typeof user.company === 'string' ? user.company : undefined;

  const openForm = useCallback(
    (form: 'form-item' | 'form-asset' | 'form-order', from: ReturnFrom) => {
      setReturnFrom(from);
      setView(form);
    },
    [],
  );
  const exitForm = useCallback(() => {
    setView(returnFrom);
  }, [returnFrom]);
  const goHub = useCallback(() => setView('hub'), []);

  switch (view) {
    case 'stock':
      return (
        <재고현황
          company={company}
          onBack={goHub}
          onPlaceOrder={() => openForm('form-order', 'stock')}
        />
      );
    case 'io':
      return (
        <입출고
          user={user}
          onBack={goHub}
          onPlaceOrder={() => openForm('form-order', 'io')}
        />
      );
    case 'item':
      return (
        <물품자산
          onBack={goHub}
          onOpenItemForm={() => openForm('form-item', 'item')}
          onOpenAssetForm={() => openForm('form-asset', 'item')}
        />
      );
    case 'analyze':
      return <분석마감 company={company} onBack={goHub} />;
    case 'form-item':
      return <물품등록 user={user} onBack={exitForm} />;
    case 'form-asset':
      return <자산등록 user={user} onBack={exitForm} />;
    case 'form-order':
      return <발주등록 user={user} onBack={exitForm} />;
    case 'hub':
    default:
      return <Hub company={company} onExit={onBack} onOpen={(v) => setView(v)} />;
  }
}

// ─────────────────────────────────────────────────────────────
// 허브 — KPI 4종 + 4개 메뉴
// ─────────────────────────────────────────────────────────────

function Hub({
  company,
  onExit,
  onOpen,
}: {
  company?: string;
  onExit: () => void;
  onOpen: (view: StockMenuId) => void;
}) {
  return (
    <div className="m-screen">
      <MobileHeader
        title="재고관리"
        eyebrow="운영"
        back={onExit}
        actions={
          <button type="button" aria-label="품목 검색">
            <MIcon name="search" size={20} />
          </button>
        }
      />
      <div className="m-scroll">
        <div className="m-company-sel">
          <span className="nm">{company || '박철홍정형외과'}</span>
          <MIcon name="chevD" size={18} className="chev" />
        </div>
        {/* KPI — 데이터 연동은 추후 일괄(현재 표기값은 더미) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            padding: '12px 16px',
          }}
        >
          <MKpi icon="box" label="전체 품목" value="847" unit="종" sub="소모품 412" tone="accent" />
          <MKpi icon="alertTri" label="부족 품목" value="23" unit="건" sub="발주 권장 12" tone="warning" />
          <MKpi icon="alertTri" label="재고 0" value="4" unit="건" sub="긴급 보충" tone="danger" />
          <MKpi icon="clock" label="유효기간 임박" value="8" unit="건" sub="30일 이내" tone="warning" />
        </div>
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">재고관리 메뉴</div>
            <div className="cnt">{STOCK_MENU.length}</div>
          </div>
          <div className="m-card flush">
            {STOCK_MENU.map((m) => (
              <MListRow
                key={m.id}
                icon={m.icon}
                iconTone={m.tone}
                label={m.label}
                sub={m.sub}
                badge={m.badge}
                badgeTone={m.badgeTone}
                onClick={() => onOpen(m.id)}
                ariaLabel={m.label}
              />
            ))}
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
