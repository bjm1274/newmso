'use client';

/**
 * SAdminRoles — 권한 관리 (직원별 권한 관리 안내)
 *
 * 정책: 모바일은 조회 위주. 권한 세부 변경은 PC 버전에 최적화되어 있으므로 안내 페이지 노출.
 *
 * JM: 200줄 이내
 * JM5: admin만 진입 (라우터에서 1차 차단됨)
 * JM6: 카드는 article, 칩은 의미 색 + 텍스트
 */

import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import { DesktopHint } from './공용UI';

export interface 권한관리Props {
  user: ErpUser;
  onBack: () => void;
}

export default function 권한관리({ user, onBack }: 권한관리Props) {
  const company = typeof user.company === 'string' ? user.company : '';
  return (
    <div className="m-screen">
      <MobileHeader
        title="권한 관리"
        sub={`직원별 권한 관리${company ? ` · ${company}` : ''}`}
        back={onBack}
      />
      <DesktopHint>상세 권한 설정은 데스크톱에서</DesktopHint>
      <div className="m-scroll">
        <div style={{ padding: '16px' }}>
          <article className="m-card" style={{ padding: '24px 20px', textAlign: 'center' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--m-accent-soft, rgba(var(--accent-rgb), 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <MIcon name="shield" size={28} color="var(--accent)" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--foreground)', marginBottom: 8 }}>
              직원별 권한 관리 안내
            </h3>
            <p style={{ fontSize: 13, color: 'var(--z-500)', lineHeight: 1.6, marginBottom: 20, wordBreak: 'keep-all' }}>
              보안 강화 및 정밀한 접근 제어를 위해 <b>역할 매트릭스 기능이 삭제</b>되었으며,
              이제 <b>직원별 맞춤형 권한 관리</b>만 제공됩니다.
            </p>
            <div
              style={{
                background: 'var(--z-100)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '12px 16px',
                fontSize: 12,
                color: 'var(--z-600)',
                textAlign: 'left',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--accent)' }}>💡 데스크톱 PC 안내</div>
              직원 검색, 권한 템플릿 복사, 상세 예외 권한 변경 등 모든 권한 관리 기능은 <b>데스크톱 PC 버전에 최적화</b>되어 있습니다.
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
