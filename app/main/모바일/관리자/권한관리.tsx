'use client';

/**
 * SAdminRoles — 권한 관리
 *
 * 역할 6 + 직원 수 + 권한 요청/예외 KPI
 * 매트릭스(역할×모듈) 편집은 데스크톱 (안내).
 *
 * 정책: 모바일은 조회 위주. 토글은 PC와 동일 패턴이지만 본 단계에서는
 * 안전을 위해 read-only로 시작한다 (mutation 없음).
 *
 * JM: 200줄 이내
 * JM5: admin만 진입 (라우터에서 1차 차단됨) — 본 화면에서 staff list 노출
 * JM6: 카드는 article, 칩은 의미 색 + 텍스트
 */

import { memo } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import { DesktopHint, MiniKpi } from './공용UI';

export interface 권한관리Props {
  user: ErpUser;
  onBack: () => void;
}

interface RoleCard {
  name: string;
  count: number;
  modules: string[];
  tone: '' | 'accent' | 'success' | 'warning' | 'danger';
}

const ROLES: RoleCard[] = [
  { name: '대표', count: 1, modules: ['전체'], tone: 'danger' },
  { name: '경영지원 (이사)', count: 2, modules: ['결재', 'HR', '재고', '회사관리'], tone: 'accent' },
  { name: '팀장', count: 4, modules: ['결재 1차', 'HR 조회', '재고 입출고'], tone: 'success' },
  { name: '급여 담당', count: 1, modules: ['급여 정산', '대장 조회'], tone: 'warning' },
  { name: '재고 담당', count: 2, modules: ['재고 전체', '발주', '거래처'], tone: 'success' },
  { name: '일반 직원', count: 22, modules: ['본인 결재', '본인 명세서', '본인 근태'], tone: '' },
];

export default function 권한관리({ user, onBack }: 권한관리Props) {
  const company = typeof user.company === 'string' ? user.company : '';
  const totalStaff = ROLES.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="m-screen">
      <MobileHeader
        title="권한 관리"
        sub={`역할 ${ROLES.length}개 · 직원 ${totalStaff}명${company ? ` · ${company}` : ''}`}
        back={onBack}
      />
      <DesktopHint>역할 × 모듈 매트릭스 편집은 데스크톱에서</DesktopHint>
      <div className="m-scroll">
        {/* KPI */}
        <div
          style={{
            padding: '14px 16px 0',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <MiniKpi label="권한 요청" value="3" unit="건" tone="warning" />
          <MiniKpi label="예외 권한" value="7" unit="건" />
        </div>

        <div className="m-section-h" style={{ padding: '12px 16px 8px' }}>
          <div className="lbl">역할</div>
        </div>
        <div
          style={{
            padding: '0 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {ROLES.map((r) => (
            <RoleItem key={r.name} role={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

const RoleItem = memo(function RoleItem({ role }: { role: RoleCard }) {
  return (
    <article className="m-card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          className={'ico-tile' + (role.tone ? ' tone-' + role.tone : '')}
          style={{ width: 36, height: 36 }}
        >
          <MIcon name="shield" size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.012em' }}>
            {role.name}
          </div>
          <div
            style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 1 }}
          >
            {role.count}명
          </div>
        </div>
        <MIcon name="chevR" size={18} color="var(--z-400)" />
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
        {role.modules.map((m, i) => (
          <MChip key={m} tone={i === 0 ? role.tone : ''}>
            {m}
          </MChip>
        ))}
      </div>
    </article>
  );
});
