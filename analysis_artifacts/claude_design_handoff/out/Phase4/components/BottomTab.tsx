'use client';

/**
 * BottomTab.tsx — Phase 4 모바일 바텀탭 (Phase 2 재export)
 *
 * 원본: analysis_artifacts/claude_design_handoff/out/Phase2/components/BottomTab.tsx
 * Phase 4에서 신규 생성 없이 동일 인터페이스로 re-export.
 * 실제 프로젝트에서는 Phase2 경로를 직접 import하거나
 * 이 파일이 심볼릭 링크/배럴 역할을 한다.
 *
 * export 시그니처:
 *   default BottomTab(props: BottomTabProps)
 *   BottomTabProps: { currentTabId: BottomTabId; onTabChange(id): void; notificationCount?: number }
 *   BottomTabId: '홈' | '업무' | '내정보' | '알림' | '더보기'
 */

// ── Phase 2 타입 인라인 (임포트 경로 없는 스켈레톤 환경 대응) ─────────────────

export type BottomTabId = '홈' | '업무' | '내정보' | '알림' | '더보기';

export interface BottomTabProps {
  currentTabId: BottomTabId;
  onTabChange: (id: BottomTabId) => void;
  notificationCount?: number;
}

/**
 * 실제 구현은 Phase2 BottomTab을 그대로 사용.
 * 아래 주석을 해제하고 Phase2 경로를 맞게 수정하면 된다.
 *
 * export { default } from '../../Phase2/components/BottomTab';
 *
 * 스켈레톤 파일이므로 stub export:
 */
export default function BottomTab(_props: BottomTabProps): React.ReactElement {
  // 실제 구현: Phase2 BottomTab.tsx 참조
  // 이 stub은 타입 선언·카탈로그 목적으로만 존재
  throw new Error(
    'BottomTab stub: Phase2 BottomTab.tsx를 직접 import 하세요.\n' +
    "import BottomTab from '@/analysis_artifacts/claude_design_handoff/out/Phase2/components/BottomTab'",
  );
}

// React import (stub 함수 반환 타입에 필요)
import React from 'react';
