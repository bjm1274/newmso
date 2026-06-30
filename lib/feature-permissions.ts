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
  { key: 'menu_채팅', label: '채팅', hint: '기본 제공 기능이었으나 노출/숨김 제어가 가능합니다.' },
  { key: 'menu_내정보', label: '내정보 (마이페이지)', hint: '내정보 메뉴 접근 여부' },
  { key: 'menu_관리자', label: '관리자', hint: '민감 기능은 세부 권한과 계정 역할을 함께 확인합니다.' },
];

export const MYPAGE_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'mypage_수정', label: '내정보 직접 수정', hint: '비활성화 시 정보 열람만 가능합니다.' },
  { key: 'mypage_급여조회', label: '내 급여명세서 조회' },
];

export const CHAT_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'chat_접근', label: '채팅 메뉴 접근' },
  { key: 'chat_방생성', label: '일반 채팅방 생성' },
  { key: 'chat_파일첨부', label: '파일 첨부' },
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
  { key: 'extra_OP체크', label: 'OP체크' },
  { key: 'extra_ESL관리', label: 'ESL 관리' },
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
  { key: 'board_업무가이드_read', label: '업무가이드 읽기' },
  { key: 'board_업무가이드_write', label: '업무가이드 쓰기' },
];

export const APPROVAL_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'approval_기안함', label: '기안함' },
  { key: 'approval_결재함', label: '결재함' },
  { key: 'approval_참조문서함', label: '참조 문서함' },
  { key: 'approval_작성하기', label: '작성하기' },
  { key: 'approval_반려권한', label: '강제 반려/회수 (관리자용)', tone: 'warning' },
  { key: 'approval_양식관리', label: '결재 양식 관리' },
  { key: 'approval_전체열람', label: '전체 문서 열람 (감사용)', tone: 'critical' },
];

export const HR_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'hr_직원등록', label: '직원 등록' },
  { key: 'hr_구성원_열람', label: '구성원 열람 (조직도 포함)' },
  { key: 'hr_구성원_관리', label: '구성원 관리 (정보 수정/인사기록)' },
  { key: 'hr_인사발령', label: '인사발령' },
  { key: 'hr_포상징계', label: '포상 / 징계' },
  { key: 'hr_교육', label: '교육' },
  { key: 'hr_오프보딩', label: '오프보딩' },
  { key: 'hr_근태_열람', label: '근태 현황 열람' },
  { key: 'hr_근태_수정', label: '근태/출퇴근 임의 수정' },
  { key: 'hr_근무표생성', label: '근무표 생성' },
  { key: 'hr_연차휴가', label: '연차 / 휴가' },
  { key: 'hr_급여', label: '급여 (조회/생성)' },
  { key: 'hr_급여_승인', label: '급여 대장 최종 승인', tone: 'critical' },
  { key: 'hr_건강검진', label: '건강검진' },
  { key: 'hr_경조사', label: '경조사' },
  { key: 'hr_면허자격증', label: '면허 / 자격증' },
  { key: 'hr_의료기기점검', label: '의료기기점검' },
  { key: 'hr_사고보고서', label: '사고보고서' },
  { key: 'hr_계약', label: '계약' },
  { key: 'hr_문서보관함', label: '문서보관함' },
  { key: 'hr_증명서', label: '증명서' },
  { key: 'hr_서류제출', label: '서류제출' },
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
  { key: 'inventory_월마감', label: '월마감' },
  { key: 'inventory_내부서재고', label: '내부서 재고' },
];

export const ADMIN_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'admin_경영분석', label: '경영분석' },
  { key: 'admin_감사센터', label: '감사센터' },
  { key: 'admin_시스템마스터센터', label: '시스템마스터센터', hint: '시스템 마스터 계정이 추가로 필요할 수 있습니다.' },
  { key: 'admin_알림자동화', label: '알림자동화' },
  { key: 'admin_회사관리', label: '회사관리' },
  { key: 'admin_직원권한', label: '직원권한' },
  { key: 'admin_수술검사템플릿', label: '수술검사템플릿' },
  { key: 'admin_팝업관리', label: '팝업관리' },
  { key: 'admin_데이터백업', label: '데이터백업' },
  { key: 'admin_데이터초기화', label: '데이터초기화', tone: 'critical' },
  { key: 'admin_문서양식', label: '문서양식' },
  { key: 'admin_급여이상치', label: '급여이상치' },
  { key: 'admin_공문서대장', label: '공문서대장' },
  { key: 'admin_비품대여설정', label: '비품대여 설정' },
];

export const STAFF_META_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'staff_meta_license_no', label: '면허번호 사용', hint: '인사 상세/증명서 등에 사용' },
  { key: 'staff_meta_license_date', label: '면허 취득일 사용' },
  { key: 'staff_meta_employment_type', label: '고용형태 사용' },
  { key: 'staff_meta_contract_end_date', label: '계약 종료일 사용' },
  { key: 'staff_meta_probation_months', label: '수습기간 사용' },
  { key: 'staff_meta_extension', label: '내선번호 사용' },
];

export const FINANCE_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'finance_복식부기', label: '복식부기', hint: '전표 분개장, 계정과목, 시산표 정밀 관리' },
  { key: 'finance_부가세', label: '부가세', hint: '세금계산서 조회, 부가세 모의 계산, 세무 일정' },
  { key: 'finance_결산', label: '결산', hint: '월차/연차 결산 작업 및 재무 보고서' },
  { key: 'finance_자금흐름', label: '자금흐름', hint: '일일 자금 현황, 자금 수지 예측, 금융 연동' },
  { key: 'finance_감가상각', label: '감가상각', hint: '고정자산 취득 대장 및 월 감가상각 자동 산출' },
  { key: 'finance_매입원장', label: '매입원장', hint: '거래처별 매입채무 대장 및 세금계산서 대사 검증' },
  { key: 'finance_경비청구', label: '경비청구', hint: '영수증 제출/조회 및 법인카드 지출 승인' },
  { key: 'finance_지출결의', label: '지출결의', hint: '자금 집행 지출결의서 등록 및 기안 관리' },
  { key: 'finance_급여연동', label: '급여연동', hint: 'HR 급여대장 연동 회계전표 자동 발행' },
  { key: 'finance_세무신고', label: '세무신고', hint: '원천세/부가세 신고자료 추출 및 홈택스 파일 생성' },
];

export const FEATURE_PERMISSION_GROUPS: FeaturePermissionGroup[] = [
  {
    id: 'main-menu',
    label: '메인 메뉴 접근',
    description: '사이드바 및 하단 탭바에 메뉴를 노출할지 설정합니다.',
    items: MAIN_MENU_PERMISSION_ITEMS },
  {
    id: 'chat',
    label: '채팅 세부 권한',
    description: '메신저 내에서의 생성, 파일 전송 등의 세부 권한입니다.',
    items: CHAT_PERMISSION_ITEMS },
  {
    id: 'mypage',
    label: '내정보 세부 권한',
    description: '마이페이지 내 개인정보 수정, 급여 조회 등 민감 권한입니다.',
    items: MYPAGE_PERMISSION_ITEMS },
  {
    id: 'extra',
    label: '추가기능 세부 권한',
    description: '추가기능 안에서 열 수 있는 카드별 접근 권한입니다.',
    items: EXTRA_FEATURE_PERMISSION_ITEMS },
  {
    id: 'board',
    label: '게시판 읽기 / 쓰기',
    description: '게시판은 읽기와 쓰기를 분리해 설정합니다. 쓰기 권한은 읽기를 포함합니다.',
    items: BOARD_PERMISSION_ITEMS },
  {
    id: 'approval',
    label: '전자결재 세부 권한',
    description: '전자결재 안에서 접근할 수 있는 화면을 설정합니다.',
    items: APPROVAL_PERMISSION_ITEMS },
  {
    id: 'hr',
    label: '인사관리 세부 권한',
    description: '인사관리 안에서 접근할 수 있는 업무 메뉴입니다.',
    items: HR_PERMISSION_ITEMS },
  {
    id: 'inventory',
    label: '재고관리 세부 권한',
    description: '재고관리 안에서 접근할 수 있는 업무 메뉴입니다.',
    items: INVENTORY_PERMISSION_ITEMS },
  {
    id: 'finance',
    label: '재무회계 세부 권한',
    description: '재무회계 메뉴 안에서 접근할 수 있는 세부 업무 메뉴입니다.',
    items: FINANCE_PERMISSION_ITEMS },
  {
    id: 'admin',
    label: '관리자 세부 권한',
    description: '관리자 메뉴 안에서 사용할 수 있는 세부 화면입니다.',
    items: ADMIN_PERMISSION_ITEMS },
  {
    id: 'staff-meta',
    label: '직원 부가 정보',
    description: '직원 개별 메타데이터나 계산에 쓰이는 정보입니다.',
    items: STAFF_META_PERMISSION_ITEMS },
];
