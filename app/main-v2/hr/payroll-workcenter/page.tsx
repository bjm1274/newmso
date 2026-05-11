/**
 * page.tsx — 급여 워크센터 라우트 진입점
 *
 * Server Component: 메타데이터만, 인터랙션은 PayrollWorkcenterClient에 위임
 * Cloudflare Workers 호환 (node-only API 미사용)
 *
 * JM: 이 파일은 thin wrapper 역할
 */

import type { Metadata } from 'next';
import PayrollWorkcenterClient from './PayrollWorkcenterClient';

export const metadata: Metadata = {
  title: '급여 워크센터 | MSO ERP',
  description: '급여 정산 · 대장 · 4대보험 검증 · 원천징수 파일 출력',
};

export default function PayrollWorkcenterPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PayrollWorkcenterClient />
    </div>
  );
}
