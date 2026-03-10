export type FeaturePermissionTone = 'default' | 'warning' | 'critical';

export type FeaturePermissionItem = {
  key: string;
  label: string;
  hint?: string;
  tone?: FeaturePermissionTone;
};

export type FeaturePermissionGroup = {
  id: string;
  label: string;
  description: string;
  items: FeaturePermissionItem[];
};

export const FEATURE_PERMISSION_GROUPS: FeaturePermissionGroup[] = [
  {
    id: 'core',
    label: '기본 권한',
    description: '상위 권한입니다. 다른 메뉴 접근 범위를 넓히거나 관리자 기능을 열어줍니다.',
    items: [
      { key: 'mso', label: 'MSO 전용 운영 권한', hint: '전체 회사 범위를 다루는 상위 권한', tone: 'critical' },
      { key: 'admin', label: '관리자 권한', hint: '관리자 메뉴 접근의 전제 조건', tone: 'critical' },
      { key: 'mso_plus_all', label: 'MSO + 전체 회사 동시 관리', hint: '전사 범위 조회/관리 확장', tone: 'warning' },
      { key: 'hr', label: '인사관리 전체 접근' },
      { key: 'inventory', label: '재고관리 전체 접근' },
      { key: 'approval', label: '전자결재 사용' },
    ],
  },
  {
    id: 'main-menu',
    label: '메인 메뉴 접근',
    description: '좌측 메인 메뉴 표시 및 진입 가능 여부입니다.',
    items: [
      { key: 'menu_조직도', label: '조직도' },
      { key: 'menu_추가기능', label: '추가기능' },
      { key: 'menu_채팅', label: '채팅' },
      { key: 'menu_게시판', label: '게시판' },
      { key: 'menu_전자결재', label: '전자결재' },
      { key: 'menu_인사관리', label: '인사관리' },
      { key: 'menu_재고관리', label: '재고관리' },
      { key: 'menu_관리자', label: '관리자', hint: 'MSO 또는 관리자 권한이 함께 필요할 수 있음', tone: 'warning' },
    ],
  },
  {
    id: 'hr-core',
    label: '인사관리 핵심 메뉴',
    description: '인사관리 워크스페이스 안에서 실제로 접근 제어되는 메뉴입니다.',
    items: [
      { key: 'hr_구성원', label: '구성원 / 인사발령 / 교육 / 오프보딩' },
      { key: 'hr_근무형태', label: '근무형태 / 근무형태 이력' },
      { key: 'hr_근태', label: '근태 / 근태분석 / 공휴일달력 / 조기퇴근감지' },
      { key: 'hr_교대근무', label: '교대근무 / 간호근무표 / 근무표 자동편성' },
      { key: 'hr_연차휴가', label: '연차 / 휴가 / 연차소멸알림' },
      { key: 'hr_급여', label: '급여 / 정산 / 급여 유틸' },
      { key: 'hr_계약', label: '계약 / 계약서 자동생성' },
      { key: 'hr_문서보관함', label: '문서보관함' },
      { key: 'hr_증명서', label: '증명서 발급' },
      { key: 'hr_캘린더', label: '인사 캘린더' },
      { key: 'hr_비품대여', label: '비품대여' },
    ],
  },
  {
    id: 'staff-meta',
    label: '직원 부가 정보',
    description: '직원 개별 메타데이터나 계산에 쓰이는 정보입니다.',
    items: [
      { key: 'license_no', label: '면허번호 사용', hint: '인사 상세/증명서 등에 사용' },
      { key: 'license_date', label: '면허 취득일 사용' },
      { key: 'employment_type', label: '고용형태 사용' },
      { key: 'contract_end_date', label: '계약 종료일 사용' },
      { key: 'probation_months', label: '수습기간 사용' },
      { key: 'extension', label: '내선번호 사용' },
    ],
  },
];

