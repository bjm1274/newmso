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
import { toast } from '@/lib/toast';
import 허브, { canAccessAddonModule, type AddonModuleKey } from './허브';
import 조직도 from './조직도';
import 부서재고 from './부서재고';
import 근무현황 from './근무현황';
import 직원평가 from './직원평가';
import 외부주차 from './외부주차';
import 외부웹팩스 from './외부웹팩스';
import MRI일정 from './MRI일정';
import 업무공유목록 from './업무공유목록';
import 업무공유상세 from './업무공유상세';
import 업무가이드 from './업무가이드';
import 공유캘린더 from './공유캘린더';

type View =
  | { kind: 'hub' }
  | { kind: 'org' }
  | { kind: 'inventory' }
  | { kind: 'worknow' }
  | { kind: 'eval' }
  | { kind: 'parking' }
  | { kind: 'webfax' }
  | { kind: 'mri' }
  | { kind: 'share-list' }
  | { kind: 'share-detail'; id: string }
  | { kind: 'guide' }
  | { kind: 'calendar' };

const MODULE_TO_VIEW: Partial<Record<AddonModuleKey, View>> = {
  org: { kind: 'org' },
  inventory: { kind: 'inventory' },
  worknow: { kind: 'worknow' },
  eval: { kind: 'eval' },
  parking: { kind: 'parking' },
  webfax: { kind: 'webfax' },
  mri: { kind: 'mri' },
  share: { kind: 'share-list' },
  guide: { kind: 'guide' },
  calendar: { kind: 'calendar' },
  // gemini — PC 전용 (onOpen에서 toast)
};

export type 추가기능Props = {
  user: ErpUser;
  onBack?: () => void;
  initialView?: AddonModuleKey;
};

export default function 추가기능({ user, onBack, initialView }: 추가기능Props) {
  const [view, setView] = useState<View>(() => {
    if (
      initialView &&
      MODULE_TO_VIEW[initialView] &&
      canAccessAddonModule(user, initialView)
    ) {
      return MODULE_TO_VIEW[initialView] as View;
    }
    return { kind: 'hub' };
  });

  const enteredViaInitialView = Boolean(
    initialView && MODULE_TO_VIEW[initialView] && canAccessAddonModule(user, initialView),
  );

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

  let contentElement: React.ReactNode = null;

  switch (view.kind) {
    case 'hub':
      contentElement = (
        <허브
          user={user}
          onBack={onBack}
          onOpen={(key: AddonModuleKey) => {
            if (!canAccessAddonModule(user, key)) {
              toast(
                key === 'calendar'
                  ? '공유캘린더 메뉴 권한이 없습니다.'
                  : '이 추가기능에 대한 권한이 없습니다.',
                'warning',
              );
              return;
            }
            if (key === 'gemini') {
              toast('PC 버전에서 이용 가능합니다', 'info');
              return;
            }
            const next = MODULE_TO_VIEW[key];
            if (next) setView(next);
          }}
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
    case 'eval':
      contentElement = <직원평가 user={user} onBack={goBackOrHub} />;
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
    case 'calendar':
      contentElement = <공유캘린더 onBack={goBackOrHub} user={user} />;
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
