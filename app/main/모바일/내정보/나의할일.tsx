'use client';

/**
 * 나의할일 (모바일) — 데스크톱 MyTodoList(마이페이지 To-Do) 풀기능 재사용.
 * "모바일에서도 모든 기능" 정책: PC 우회 스텁이 아니라 PC 컴포넌트를 그대로 마운트한다.
 * (관리자 권한관리가 RolesWorkcenter를 dynamic import 하는 패턴과 동일)
 *
 * MyTodoList는 자체적으로 todos 테이블을 fetch/구독하므로 user prop만 넘기면 된다.
 * onChatNavigate는 채팅 출처 점프용 — 채팅 탭 전환 콜백이 있을 때만 연결한다.
 * JM: 단일 책임(헤더 + To-Do 마운트)
 */

import dynamic from 'next/dynamic';
import type { ErpUser } from '@/types';
import type { MTab } from '../셸/m-routes';
import MFeatureScreen from '../공통/MFeatureScreen';

const Loading = () => (
  <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)' }}>
    할 일 목록을 불러오는 중...
  </div>
);

const MyTodoList = dynamic(() => import('../../기능부품/마이페이지/나의할일'), {
  ssr: false,
  loading: Loading,
});

export type 나의할일Props = {
  user: ErpUser;
  onBack: () => void;
  onSwitchTab?: (tab: MTab, sub?: string) => void;
};

export default function 나의할일({ user, onBack, onSwitchTab }: 나의할일Props) {
  // 할일에 연결된 채팅 메시지로 점프 — 채팅 탭으로 전환(룸/메시지 컨텍스트는 채팅 화면이 URL/이벤트로 처리).
  const handleChatNavigate = onSwitchTab
    ? () => onSwitchTab('chat')
    : undefined;

  return (
    <MFeatureScreen title="나의 할 일" onBack={onBack}>
      <MyTodoList user={user} onChatNavigate={handleChatNavigate} />
    </MFeatureScreen>
  );
}
