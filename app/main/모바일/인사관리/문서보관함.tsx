'use client';

/**
 * 문서보관함 (모바일) — 데스크톱 DocumentRepository(인사관리서브/문서보관함)를
 * next/dynamic 으로 재사용. "모바일에서도 모든 기능" 정책에 따라 회사 문서 보관함을 모바일에서 노출.
 *
 * PC DocumentRepository props:
 *   { user: UserRecord; selectedCo: string(필수); linkedTarget?; canManageDocuments?; title? }
 *   - user: 작성자/감사 표기 및 권한 판정용 사용자 레코드.
 *   - selectedCo: 회사 컨텍스트(필수) — 없으면 본인 회사, 그것도 없으면 '전체'.
 *   - canManageDocuments: 등록/삭제 권한. mso 또는 인사관리 메뉴 권한 보유 시 true.
 * (DocsWorkcenter.tsx 가 문서보관함을 dynamic import 하는 패턴과 동일)
 *
 * JM: 단일 책임(헤더 + 보관함 마운트). 권한은 user.permissions 로 판정.
 */

import dynamic from 'next/dynamic';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';

const Loading = () => (
  <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)' }}>
    문서보관함을 불러오는 중...
  </div>
);

const DocumentRepository = dynamic(
  () => import('../../기능부품/인사관리서브/문서보관함'),
  { ssr: false, loading: Loading },
);

export type 문서보관함Props = {
  user: ErpUser;
  company?: string;
  onBack: () => void;
};

/** mso 또는 인사관리 메뉴 권한 보유 시 문서 등록/삭제 허용 (UI 가드 — RLS 가 1차 방어). */
function canManageDocuments(user: ErpUser): boolean {
  const perms = (user.permissions ?? {}) as Record<string, unknown>;
  if (perms.mso === true) return true;
  if (perms.menu_인사관리 === true) return true;
  if (perms.hr_문서보관함 === true) return true;
  const role = typeof user.role === 'string' ? user.role : '';
  return role === '관리자' || role === '매니저';
}

export default function 문서보관함({ user, company, onBack }: 문서보관함Props) {
  const userCompany = typeof user.company === 'string' ? user.company : undefined;
  // selectedCo 는 PC 컴포넌트에서 필수. 선택 회사 → 본인 회사 → '전체' 순 폴백.
  const selectedCo = company || userCompany || '전체';

  return (
    <div className="m-screen">
      <MobileHeader title="문서보관함" sub={selectedCo} back={onBack} />
      <div className="m-scroll">
        <DocumentRepository
          user={user as unknown as Record<string, unknown>}
          selectedCo={selectedCo}
          canManageDocuments={canManageDocuments(user)}
        />
      </div>
    </div>
  );
}
