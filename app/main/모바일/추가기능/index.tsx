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
  guide: { kind: 'guide' } };

export type 추가기능Props = {
  user: ErpUser;
  onBack?: () => void;
  initialView?: AddonModuleKey;
};

export default function 추가기능({ user, onBack, initialView }: 추가기능Props) {
  const [view, setView] = useState<View>(() => {
    if (initialView && MODULE_TO_VIEW[initialView]) {
      return MODULE_TO_VIEW[initialView];
    }
    return { kind: 'hub' };
  });

  const enteredViaInitialView = Boolean(initialView && MODULE_TO_VIEW[initialView]);

  const goHub = useCallback(() => setView({ kind: 'hub' }), []);
  /** initialView로 직접 진입했으면 뒤로가기=이전 탭, 아니면 허브로 */
  const goBackOrHub = useCallback(() => {
    if (enteredViaInitialView && onBack) {
      onBack();
    } else {
      setView({ kind: 'hub' });
    }
  }, [enteredViaInitialView, onBack]);
  const goShareList = useCallback(() => setView({ kind: 'share-list' }), []);
  const goDischargeList = useCallback(() => setView({ kind: 'discharge-list' }), []);
  const goOpBoard = useCallback(() => setView({ kind: 'opboard' }), []);

  let contentElement: React.ReactNode = null;

  switch (view.kind) {
    case 'hub':
      contentElement = (
        <허브
          user={user}
          onBack={onBack}
          onOpen={(key: AddonModuleKey) => setView(MODULE_TO_VIEW[key])}
        />
      );
      break;
    case 'org':
      contentElement = <조직도 user={user} onBack={goBackOrHub} />;
      break;
    case 'inventory':
      contentElement = <부서재고 user={user} onBack={goBackOrHub} />;
      break;
    case 'worknow':
      contentElement = <근무현황 user={user} onBack={goBackOrHub} />;
      break;
    case 'handoff':
      contentElement = <인계노트 user={user} onBack={goBackOrHub} />;
      break;
    case 'eval':
      contentElement = <직원평가 user={user} onBack={goBackOrHub} />;
      break;
    case 'discharge-list':
      contentElement = (
        <퇴원심사목록
          user={user}
          onBack={goBackOrHub}
          onOpenDetail={(id) => setView({ kind: 'discharge-detail', id })}
        />
      );
      break;
    case 'discharge-detail':
      contentElement = <퇴원심사상세 user={user} reviewId={view.id} onBack={goDischargeList} />;
      break;
    case 'consult':
      contentElement = <수술상담 user={user} onBack={goBackOrHub} />;
      break;
    case 'opboard':
      contentElement = (
        <OP체크보드
          user={user}
          onBack={goBackOrHub}
          onOpenDetail={(card) => setView({ kind: 'opdetail', card })}
        />
      );
      break;
    case 'opdetail':
      contentElement = <OP체크상세 user={user} card={view.card} onBack={goOpBoard} />;
      break;
    case 'deposit':
      contentElement = <입금조회 user={user} onBack={goBackOrHub} />;
      break;
    case 'closing':
      contentElement = <마감보고 user={user} onBack={goBackOrHub} />;
      break;
    case 'parking':
      contentElement = <외부주차 user={user} onBack={goBackOrHub} />;
      break;
    case 'webfax':
      contentElement = <외부웹팩스 user={user} onBack={goBackOrHub} />;
      break;
    case 'mri':
      contentElement = <MRI일정 user={user} onBack={goBackOrHub} />;
      break;
    case 'share-list':
      contentElement = (
        <업무공유목록
          user={user}
          onBack={goBackOrHub}
          onOpenDetail={(id) => setView({ kind: 'share-detail', id })}
        />
      );
      break;
    case 'share-detail':
      contentElement = <업무공유상세 user={user} postId={view.id} onBack={goShareList} />;
      break;
    case 'guide':
      contentElement = <업무가이드 user={user} onBack={goBackOrHub} />;
      break;
    default:
      contentElement = null;
  }

  return (
    <div data-testid="extra-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {contentElement}
    </div>
  );
}
