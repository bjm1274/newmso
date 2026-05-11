/**
 * settings/company/page.tsx — 회사정보 라우트 진입점 (서버 컴포넌트)
 *
 * Cloudflare Workers 호환: node-only API 미사용
 * JM: thin wrapper, 인터랙션은 CompanyClient에 위임
 */

import type { Metadata } from 'next';
import CompanyClient from './CompanyClient';

export const metadata: Metadata = {
  title: '회사정보 | 관리자 설정',
  description: '병원 기본정보, 근무형태, 법인카드, 계약템플릿, 휴가/공휴일, 급여기준, 문서보관 설정',
};

export default function CompanyPage() {
  return (
    <div className="flex h-full flex-col">
      <CompanyClient />
    </div>
  );
}
