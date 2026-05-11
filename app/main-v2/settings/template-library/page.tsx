/**
 * settings/template-library/page.tsx — 템플릿 라이브러리 라우트 진입점 (서버 컴포넌트)
 *
 * Cloudflare Workers 호환: node-only API 미사용
 * JM: thin wrapper, 인터랙션은 TemplateLibraryClient에 위임
 */

import type { Metadata } from 'next';
import TemplateLibraryClient from './TemplateLibraryClient';

export const metadata: Metadata = {
  title: '템플릿 라이브러리 | 관리자 설정',
  description: '계약서, 동의서, 안내문, 업무양식, 교육자료 템플릿 모음',
};

export default function TemplateLibraryPage() {
  return (
    <div className="flex h-full flex-col">
      <TemplateLibraryClient />
    </div>
  );
}
