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

export const MAIN_MENU_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'menu_추가기능', label: '추가기능' },
  { key: 'menu_게시판', label: '게시판' },
  { key: 'menu_전자결재', label: '전자결재' },
  { key: 'menu_인사관리', label: '인사관리' },
  { key: 'menu_재고관리', label: '재고관리' },
  { key: 'menu_관리자', label: '관리자', hint: '민감 기능은 세부 권한과 계정 역할을 함께 확인합니다.', tone: 'warning' },
];

export const EXTRA_FEATURE_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'extra_조직도', label: '조직도' },
  { key: 'extra_부서별재고', label: '부서별 재고' },
  { key: 'extra_근무현황', label: '근무현황' },
  { key: 'extra_인계노트', label: '인계노트' },
  { key: 'extra_퇴원심사', label: '퇴원심사' },
  { key: 'extra_마감보고', label: '마감보고' },
  { key: 'extra_직원평가', label: '직원평가' },
  { key: 'extra_입금실시간조회', label: '입금 실시간 조회' },
];

export const BOARD_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'board_공지사항_read', label: '공지사항 읽기' },
  { key: 'board_공지사항_write', label: '공지사항 쓰기' },
  { key: 'board_자유게시판_read', label: '자유게시판 읽기' },
  { key: 'board_자유게시판_write', label: '자유게시판 쓰기' },
  { key: 'board_경조사_read', label: '경조사 읽기' },
  { key: 'board_경조사_write', label: '경조사 쓰기' },
  { key: 'board_MRI일정_read', label: 'MRI일정 읽기' },
  { key: 'board_MRI일정_write', label: 'MRI일정 쓰기' },
  { key: 'board_수술일정_read', label: '수술일정 읽기' },
  { key: 'board_수술일정_write', label: '수술일정 쓰기' },
];

export const APPROVAL_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'approval_기안함', label: '기안함' },
  { key: 'approval_결재함', label: '결재함' },
  { key: 'approval_참조문서함', label: '참조 문서함' },
  { key: 'approval_작성하기', label: '작성하기' },
];

export const HR_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'hr_구성원', label: '구성원' },
  { key: 'hr_인사발령', label: '인사발령' },
  { key: 'hr_포상징계', label: '포상 / 징계' },
  { key: 'hr_교육', label: '교육' },
  { key: 'hr_오프보딩', label: '오프보딩' },
  { key: 'hr_근태', label: '근태' },
  { key: 'hr_교대근무', label: '교대근무' },
  { key: 'hr_연차휴가', label: '연차 / 휴가' },
  { key: 'hr_급여', label: '급여' },
  { key: 'hr_건강검진', label: '건강검진' },
  { key: 'hr_경조사', label: '경조사' },
  { key: 'hr_면허자격증', label: '면허 / 자격증' },
  { key: 'hr_의료기기점검', label: '의료기기점검' },
  { key: 'hr_비품대여', label: '비품대여' },
  { key: 'hr_사고보고서', label: '사고보고서' },
  { key: 'hr_계약', label: '계약' },
  { key: 'hr_문서보관함', label: '문서보관함' },
  { key: 'hr_증명서', label: '증명서' },
  { key: 'hr_서류제출', label: '서류제출' },
  { key: 'hr_캘린더', label: '캘린더' },
];

export const INVENTORY_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'inventory_현황', label: '현황' },
  { key: 'inventory_이력', label: '이력' },
  { key: 'inventory_수요예측', label: '수요예측' },
  { key: 'inventory_등록', label: '등록' },
  { key: 'inventory_스캔', label: '스캔' },
  { key: 'inventory_발주', label: '발주' },
  { key: 'inventory_재고실사', label: '재고실사' },
  { key: 'inventory_이관', label: '이관' },
  { key: 'inventory_납품확인서', label: '납품확인서' },
  { key: 'inventory_UDI', label: 'UDI' },
  { key: 'inventory_자산', label: '자산' },
  { key: 'inventory_거래처', label: '거래처 / 명세서' },
  { key: 'inventory_카테고리', label: '카테고리' },
  { key: 'inventory_AS반품', label: 'AS반품' },
  { key: 'inventory_소모품통계', label: '소모품통계' },
];

export const ADMIN_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'admin_경영분석', label: '경영분석' },
  { key: 'admin_감사센터', label: '감사센터' },
  { key: 'admin_시스템마스터센터', label: '시스템마스터센터', hint: '시스템 마스터 계정이 추가로 필요할 수 있습니다.', tone: 'warning' },
  { key: 'admin_엑셀등록', label: '엑셀등록' },
  { key: 'admin_알림자동화', label: '알림자동화' },
  { key: 'admin_회사관리', label: '회사관리' },
  { key: 'admin_직원권한', label: '직원권한', tone: 'warning' },
  { key: 'admin_수술검사템플릿', label: '수술검사템플릿' },
  { key: 'admin_팝업관리', label: '팝업관리' },
  { key: 'admin_데이터백업', label: '데이터백업' },
  { key: 'admin_데이터초기화', label: '데이터초기화', tone: 'critical' },
  { key: 'admin_문서양식', label: '문서양식' },
  { key: 'admin_급여이상치', label: '급여이상치' },
  { key: 'admin_공문서대장', label: '공문서대장' },
];

export const STAFF_META_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'license_no', label: '면허번호 사용', hint: '인사 상세/증명서 등에 사용' },
  { key: 'license_date', label: '면허 취득일 사용' },
  { key: 'employment_type', label: '고용형태 사용' },
  { key: 'contract_end_date', label: '계약 종료일 사용' },
  { key: 'probation_months', label: '수습기간 사용' },
  { key: 'extension', label: '내선번호 사용' },
];

export const FEATURE_PERMISSION_GROUPS: FeaturePermissionGroup[] = [
  {
    id: 'main-menu',
    label: '메인 메뉴 접근',
    description: '내정보와 채팅은 기본 제공됩니다. 아래 항목만 메인 메뉴 노출을 설정합니다.',
    items: MAIN_MENU_PERMISSION_ITEMS,
  },
  {
    id: 'extra',
    label: '추가기능 세부 권한',
    description: '추가기능 안에서 열 수 있는 카드별 접근 권한입니다.',
    items: EXTRA_FEATURE_PERMISSION_ITEMS,
  },
  {
    id: 'board',
    label: '게시판 읽기 / 쓰기',
    description: '게시판은 읽기와 쓰기를 분리해 설정합니다. 쓰기 권한은 읽기를 포함합니다.',
    items: BOARD_PERMISSION_ITEMS,
  },
  {
    id: 'approval',
    label: '전자결재 세부 권한',
    description: '전자결재 안에서 접근할 수 있는 화면을 설정합니다.',
    items: APPROVAL_PERMISSION_ITEMS,
  },
  {
    id: 'hr',
    label: '인사관리 세부 권한',
    description: '인사관리 안에서 접근할 수 있는 업무 메뉴입니다.',
    items: HR_PERMISSION_ITEMS,
  },
  {
    id: 'inventory',
    label: '재고관리 세부 권한',
    description: '재고관리 안에서 접근할 수 있는 업무 메뉴입니다.',
    items: INVENTORY_PERMISSION_ITEMS,
  },
  {
    id: 'admin',
    label: '관리자 세부 권한',
    description: '관리자 메뉴 안에서 사용할 수 있는 세부 화면입니다.',
    items: ADMIN_PERMISSION_ITEMS,
  },
  {
    id: 'staff-meta',
    label: '직원 부가 정보',
    description: '직원 개별 메타데이터나 계산에 쓰이는 정보입니다.',
    items: STAFF_META_PERMISSION_ITEMS,
  },
];
