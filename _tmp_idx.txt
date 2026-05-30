'use client';

/**
 * 재고관리 라우터 — 7 view 분기.
 *
 * 외부 진입:
 *   <재고관리 user={user} onBack={() => ...} />
 *
 * 내부 view:
 *   'stock' | 'io' | 'item' | 'analyze' | 'form-item' | 'form-asset' | 'form-order'
 *
 * 라우팅 정책:
 *  - 4 워크센터 화면 (stock/io/item/analyze) 사이는 자유롭게 이동.
 *  - 폼 진입은 stock/io/item에서, 닫기는 원래 화면으로 복귀.
 *  - 최상위(stock) 에서 onBack은 부모 모듈 종료 (셸 home 등).
 *
 * JM: 분기 + 진입/복귀 상태만 담당, ~110줄
 * JM4: StockView union, returnFrom union
 */

import { useCallback, useState } from 'react';
import type { ErpUser } from '@/types';
import 재고현황 from './재고현황';
import 입출고 from './입출고';
import 물품자산 from './물품자산';
import 분석마감 from './분석마감';
import 물품등록 from './물품등록';
import 자산등록 from './자산등록';
import 발주등록 from './발주등록';

export type StockView =
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

export default function 재고관리({ user, onBack }: 재고관리Props) {
  const [view, setView] = useState<StockView>('stock');
  // 폼 진입 직전 화면 — 폼 닫을 때 돌아갈 곳
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

  switch (view) {
    case 'stock':
      return (
        <재고현황
          company={company}
          onBack={onBack}
          onPlaceOrder={() => openForm('form-order', 'stock')}
        />
      );
    case 'io':
      return (
        <입출고
          user={user}
          onBack={onBack}
          onPlaceOrder={() => openForm('form-order', 'io')}
        />
      );
    case 'item':
      return (
        <물품자산
          onBack={onBack}
          onOpenItemForm={() => openForm('form-item', 'item')}
          onOpenAssetForm={() => openForm('form-asset', 'item')}
        />
      );
    case 'analyze':
      return <분석마감 company={company} onBack={onBack} />;
    case 'form-item':
      return <물품등록 user={user} onBack={exitForm} />;
    case 'form-asset':
      return <자산등록 user={user} onBack={exitForm} />;
    case 'form-order':
      return <발주등록 user={user} onBack={exitForm} />;
    default:
      return null;
  }
}
