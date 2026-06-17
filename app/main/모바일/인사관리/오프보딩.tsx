'use client';

/**
 * 오프보딩 (모바일) — 데스크톱 OffboardingView(인사관리서브/오프보딩)를
 * next/dynamic 으로 재사용. "모바일에서도 모든 기능" 정책에 따라 퇴사 오프보딩을 모바일에서 노출.
 *
 * PC OffboardingView props: { staffs?: StaffMember[]; selectedCo?: string; onRefresh?: () => void }
 *   - staffs: 회사 전체 직원(퇴사자 포함) — 오프보딩 진행/이력 탭 모두 필요하므로 includeResigned.
 *   - selectedCo: 회사 필터(없으면 전체).
 *   - onRefresh: 상태 변경(시작/취소/완료) 후 목록 재조회.
 * (급여워크센터.tsx 가 PayrollWorkcenter 를 dynamic import 하는 패턴과 동일)
 *
 * JM: 단일 책임(헤더 + 워크센터 마운트). 데이터는 useStaffList 로 모바일에서 직접 공급.
 */

import dynamic from 'next/dynamic';
import { useStaffList } from './data-hooks';
import MobileHeader from '../셸/MobileHeader';

const Loading = () => (
  <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)' }}>
    오프보딩을 불러오는 중...
  </div>
);

const OffboardingView = dynamic(
  () => import('../../기능부품/인사관리서브/오프보딩'),
  { ssr: false, loading: Loading },
);

export type 오프보딩Props = {
  company?: string;
  onBack: () => void;
};

export default function 오프보딩({ company, onBack }: 오프보딩Props) {
  // 오프보딩 진행 탭은 재직자, 이력 탭은 퇴사자를 함께 다루므로 퇴사자 포함 조회.
  const { staffs, loading } = useStaffList({ company, includeResigned: true });

  return (
    <div className="m-screen">
      <MobileHeader title="오프보딩" sub={company || '인사관리'} back={onBack} />
      <div className="m-scroll">
        {loading ? (
          <Loading />
        ) : (
          <OffboardingView staffs={staffs} selectedCo={company} />
        )}
      </div>
    </div>
  );
}
