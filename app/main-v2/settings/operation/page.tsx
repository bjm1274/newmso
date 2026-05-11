/**
 * settings/operation/page.tsx — 운영설정 라우트 진입점 (서버 컴포넌트)
 *
 * Cloudflare Workers 호환: node-only API 미사용
 * JM: thin wrapper, 인터랙션은 OperationClient에 위임
 */

import type { Metadata } from 'next';
import OperationClient from './OperationClient';

export const metadata: Metadata = {
  title: '운영설정 | 관리자 설정',
  description: '직원권한, 운영 일반설정, 팝업관리, 결재양식 설정',
};

export default function OperationPage() {
  return (
    <div className="flex h-full flex-col">
      <OperationClient />
    </div>
  );
}
