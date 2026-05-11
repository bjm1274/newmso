/**
 * page.tsx — OP체크 실시간 보드 페이지 (Server Component)
 *
 * JM:  단일 책임 — metadata 선언 + Client 컴포넌트 마운트
 * JM2: Server Component 유지, 인터랙션은 OpCheckBoardClient에 격리
 */

import type { Metadata } from 'next';
import OpCheckBoardClient from './OpCheckBoardClient';

export const metadata: Metadata = {
  title: 'OP체크 보드',
  description: '수술 대기 환자 실시간 상태 관리',
};

export default function OpCheckBoardPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <OpCheckBoardClient />
    </div>
  );
}
