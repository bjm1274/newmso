'use client';

/**
 * MFeatureScreen — 모바일 풀스크린 프레임 (헤더 + 스크롤 영역).
 * 데스크톱 풀기능 컴포넌트를 dynamic import 해 모바일에 그대로 노출할 때의 공통 껍데기.
 * JM: 단일 책임, ~30줄
 */

import type { ReactNode } from 'react';
import MobileHeader from '../셸/MobileHeader';

export default function MFeatureScreen({
  title,
  sub,
  onBack,
  children }: {
  title: string;
  sub?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="m-screen">
      <MobileHeader title={title} sub={sub} back={onBack} />
      <div className="m-scroll">{children}</div>
    </div>
  );
}
