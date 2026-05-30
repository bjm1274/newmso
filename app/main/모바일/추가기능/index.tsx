'use client';

/**
 * 추가기능 라우터 — 16 화면 분기.
 *
 * 더보기 또는 다른 메뉴에서 진입.
 *   <추가기능 user={user} onBack={() => ...} />
 *
 * 내부 view 상태 (판별 가능한 유니온, JM4):
 *   { kind: 'hub' }
 *   | { kind: 'org' | 'inventory' | 'worknow' | 'handoff' | 'eval' | 'consult'
 *       | 'deposit' | 'closing' | 'parking' | 'webfax' | 'mri' | 'guide' }
 *   | { kind: 'discharge-list' }
 *   | { kind: 'discharge-detail'; id: string }
 *   | { kind: 'opboard' }
 *   | { kind: 'opdetail'; card: OpCheckCard }
 *   | { kind: 'share-list' }
 *   | { kind: 'share-detail'; id: string }
 *
 * JM: ~150줄, 분기만.
 * JM4: 판별 유니온으로 화면별 props 안전.
 */

import { useCallback, useState } from 'react';
import type { ErpUser } from '@/types';
import 허브, { type AddonModuleKey } from './허브';
import 조직도 from './조직도';
import 부서재고 from './부서재고';
import 근무현황 from './근무현황';
import 인계노트 from './인계노트';
import 직원평가 from './직원평가';
import 퇴원심사목록 from './퇴원심사목록';
import 퇴원심사상세 from './퇴원심사상세';
import 수술상담 from './수술상담';
import OP체크보드 from './OP체크보드';
import OP체크상세 from './OP체크상세';
import 입금조회 from './입금조회';
import 마감보고 from './마감보고';
import 외부주차 from './외부주차';
import 외부웹팩스 from './외부웹팩스';
import MRI일정 from './MRI일정';
import 업무공유목록 from './업무공유목록';
import 업무공유상세 from './업무공유상세';
import 업무가이드 from './업무가이드';
import type { OpCheckCard } from './data-hooks';

type View =
  | { kind: 'hub' }
  | { kind: 'org' }
  | { kind: 'inventory' }
  | { kind: 'worknow' }
  | { kind: 'handoff' }
  | { kind: 'eval' }
  | { kind: 'discharge-list' }
  | { kind: 'discharge-detail'; id: string }
  | { kind: 'consult' }
  | { kind: 'opboard' }
  | { kind: 'opdetail'; card: OpCheckCard }
  | { kind: 'deposit' }
  | { kind: 'closing' }
  | { kind: 'parking' }
  | { kind: 'webfax' }
  | { kind: 'mri' }
  | { kind: 'share-list' }
  | { kind: 'share-detail'; id: string }
  | { kind: 'guide' };

const MODULE_TO_VIEW: Record<AddonModuleKey, View> = {
  org: { kind: 'org' },
  inventory: { kind: 'inventory' },
  worknow: { kind: 'worknow' },
  handoff: { kind: 'handoff' },
  eval: { kind: 'eval' },
  discharge: { kind: 'discharge-list' },
  consult: { kind: 'consult' },
  opboard: { kind: 'opboard' },
  deposit: { kind: 'deposit' },
  closing: { kind: 'closing' },
  parking: { kind: 'parking' },
  webfax: { kind: 'webfax' },
  mri: { kind: 'mri' },
  share: { kind: 'share-list' },
  guide: { kind: 'guide' },
};

export type 추가기능Props = {
  user: ErpUser;
  onBack?: () => void;
};

export default function 추가기능({ user, onBack }: 추가기능Props) {
  const [view, setView] = useState<View>({ kind: 'hub' });

  const goHub = useCallback(() => setView({ kind: 'hub' }), []);
  const goShareList = useCallback(() => setView({ kind: 'share-list' }), []);
  const goDischargeList = useCallback(() => setView({ kind: 'discharge-list' }), []);
  const goOpBoard = useCallback(() => setView({ kind: 'opboard' }), []);

  switch (view.kind) {
    case 'hub':
      return (
        <허브
          user={user}
          onBack={onBack}
          onOpen={(key: AddonModuleKey) => setView(MODULE_TO_VIEW[key])}
        />
      );
    case 'org':
      return <조직도 user={user} onBack={goHub} />;
    case 'inventory':
      return <부서재고 user={user} onBack={goHub} />;
    case 'worknow':
      return <근무현황 user={user} onBack={goHub} />;
    case 'handoff':
      return <인계노트 user={user} onBack={goHub} />;
    case 'eval':
      return <직원평가 user={user} onBack={goHub} />;
    case 'discharge-list':
      return (
        <퇴원심사목록
          user={user}
          onBack={goHub}
          onOpenDetail={(id) => setView({ kind: 'discharge-detail', id })}
        />
      );
    case 'discharge-detail':
      return <퇴원심사상세 user={user} reviewId={view.id} onBack={goDischargeList} />;
    case 'consult':
      return <수술상담 user={user} onBack={goHub} />;
    case 'opboard':
      return (
        <OP체크보드
          user={user}
          onBack={goHub}
          onOpenDetail={(card) => setView({ kind: 'opdetail', card })}
        />
      );
    case 'opdetail':
      return <OP체크상세 user={user} card={view.card} onBack={goOpBoard} />;
    case 'deposit':
      return <입금조회 user={user} onBack={goHub} />;
    case 'closing':
      return <마감보고 user={user} onBack={goHub} />;
    case 'parking':
      return <외부주차 user={user} onBack={goHub} />;
    case 'webfax':
      return <외부웹팩스 user={user} onBack={goHub} />;
    case 'mri':
      return <MRI일정 user={user} onBack={goHub} />;
    case 'share-list':
      return (
        <업무공유목록
          user={user}
          onBack={goHub}
          onOpenDetail={(id) => setView({ kind: 'share-detail', id })}
        />
      );
    case 'share-detail':
      return <업무공유상세 user={user} postId={view.id} onBack={goShareList} />;
    case 'guide':
      return <업무가이드 user={user} onBack={goHub} />;
    default:
      return null;
  }
}
