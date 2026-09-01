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

/**
 * 메인 메뉴 접근 토글 — 사이드바 MAIN_MENUS 순서·이름과 1:1 정렬
 * (조직도측면창.tsx MAIN_MENUS 기준)
 */
export const MAIN_MENU_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'menu_내정보', label: '내정보', hint: '마이페이지 메뉴 접근 여부' },
  { key: 'menu_추가기능', label: '추가기능' },
  { key: 'menu_채팅', label: '채팅', hint: '기본 제공 기능이었으나 노출/숨김 제어가 가능합니다.' },
  { key: 'menu_게시판', label: '게시판' },
  { key: 'menu_공유캘린더', label: '공유캘린더' },
  { key: 'menu_전자결재', label: '전자결재' },
  { key: 'menu_인사관리', label: '인사관리' },
  { key: 'menu_재고관리', label: '재고관리' },
  { key: 'menu_관리자', label: '관리자', hint: '민감 기능은 세부 권한과 계정 역할을 함께 확인합니다.' },
  { key: 'menu_재무회계', label: '재무회계', hint: 'PC 전용 메뉴. 세부 업무는 아래 재무회계 세부 권한에서 설정합니다.' },
];

export const MYPAGE_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'mypage_수정', label: '내정보 직접 수정', hint: '비활성화 시 정보 열람만 가능합니다.' },
  { key: 'mypage_급여조회', label: '내 급여명세서 조회' },
  {
    key: 'mypage_증명서조회',
    label: '내 증명서 조회',
    hint: '전자결재 승인·인사 발급 본인 증명서 확인. 끄면 내정보에서 증명서 탭이 비활성됩니다.',
  },
];

export const CHAT_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'chat_접근', label: '채팅 메뉴 접근' },
  { key: 'chat_방생성', label: '일반 채팅방 생성' },
  { key: 'chat_파일첨부', label: '파일 첨부' },
];

/**
 * 공유캘린더 세부 권한 — 메인 메뉴 menu_공유캘린더 하위
 * (근무표 조회 / 게시판 일정 / 외부 캘린더 동기화)
 */
export const CALENDAR_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  {
    key: 'calendar_근무표조회',
    label: '근무표 일정 조회',
    hint: '간호근무표(nurse_schedules) 월별 편성을 캘린더에 표시합니다.',
  },
  {
    key: 'calendar_게시판일정',
    label: '게시판 일정 표시',
    hint: '게시판 「일정」 카테고리 글을 캘린더에 함께 표시합니다.',
  },
  {
    key: 'calendar_외부동기화',
    label: '외부 캘린더 동기화',
    hint: '구글 캘린더 등 ICS 구독 URL 복사. 끄면 동기화 버튼이 숨겨집니다.',
    tone: 'warning',
  },
  {
    key: 'calendar_전체직원근무표',
    label: '전체 직원 근무표 열람',
    hint: '끄면 본인 근무 일정만 표시합니다. (개인정보 보호)',
  },
];

/**
 * 추가기능 카드 — FEATURE_CARDS(추가기능공통.tsx) 와 동일 목록
 */
export const EXTRA_FEATURE_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'extra_Gemini비서', label: 'Gemini AI 비서' },
  { key: 'extra_조직도', label: '조직도', hint: '기본 공개. 명시 거부 시에만 숨김.' },
  { key: 'extra_부서별재고', label: '부서별 재고' },
  { key: 'extra_근무현황', label: '근무현황' },
  { key: 'extra_직원평가', label: '직원평가' },
];

/**
 * 게시판 — SUB_MENUS.게시판 보드 id 와 읽기/쓰기 1:1
 */
export const BOARD_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'board_공지사항_read', label: '공지사항 읽기' },
  { key: 'board_공지사항_write', label: '공지사항 쓰기' },
  { key: 'board_자유게시판_read', label: '자유게시판 읽기' },
  { key: 'board_자유게시판_write', label: '자유게시판 쓰기' },
  { key: 'board_경조사_read', label: '경조사 소식 읽기' },
  { key: 'board_경조사_write', label: '경조사 소식 쓰기' },
  { key: 'board_수술일정_read', label: '수술 일정 읽기' },
  { key: 'board_수술일정_write', label: '수술 일정 쓰기' },
  { key: 'board_MRI일정_read', label: 'MRI 일정 읽기' },
  { key: 'board_MRI일정_write', label: 'MRI 일정 쓰기' },
  { key: 'board_업무가이드_read', label: '업무 가이드 읽기' },
  { key: 'board_업무가이드_write', label: '업무 가이드 쓰기' },
];

/**
 * 전자결재 — SUB_MENUS.전자결재 + 관리용 확장 권한
 */
export const APPROVAL_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'approval_결재함', label: '결재함' },
  { key: 'approval_기안함', label: '기안함' },
  { key: 'approval_참조문서함', label: '참조 문서함' },
  { key: 'approval_작성하기', label: '작성하기' },
  { key: 'approval_반려권한', label: '강제 반려/회수 (관리자용)', tone: 'warning' },
  { key: 'approval_양식관리', label: '결재 양식 관리' },
  { key: 'approval_전체열람', label: '전체 문서 열람 (감사용)', tone: 'critical' },
];

/**
 * 인사관리 — 6 워크센터(member/attend/leave/payroll/welfare/docs) 기준으로 라벨 정렬
 * 실제 판정 키는 access-control LEGACY 별칭으로 워크센터 합집합에 연결됨
 */
export const HR_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  // 구성원 (member)
  { key: 'hr_직원등록', label: '구성원 · 직원 등록' },
  { key: 'hr_구성원_열람', label: '구성원 · 열람' },
  { key: 'hr_구성원_관리', label: '구성원 · 관리' },
  { key: 'hr_인사발령', label: '구성원 · 인사발령' },
  { key: 'hr_포상징계', label: '구성원 · 포상/징계' },
  { key: 'hr_교육', label: '구성원 · 교육' },
  { key: 'hr_오프보딩', label: '구성원 · 오프보딩' },
  // 근태 (attend)
  { key: 'hr_근태_열람', label: '근태 · 현황 열람' },
  { key: 'hr_근태_수정', label: '근태 · 출퇴근 수정' },
  { key: 'hr_근무표생성', label: '근태 · 근무표 생성' },
  // 연차·휴가 (leave)
  { key: 'hr_연차휴가', label: '연차·휴가' },
  // 급여 (payroll)
  { key: 'hr_급여', label: '급여 · 조회/생성' },
  { key: 'hr_급여_승인', label: '급여 · 대장 최종 승인', tone: 'critical' },
  // 복지 (welfare)
  { key: 'hr_경조사', label: '복지 · 경조사' },
  { key: 'hr_건강검진', label: '복지 · 건강검진' },
  { key: 'hr_면허자격증', label: '복지 · 면허/자격증' },
  { key: 'hr_의료기기점검', label: '복지 · 의료기기점검' },
  { key: 'hr_사고보고서', label: '복지 · 사고보고서' },
  // 계약·문서 (docs)
  { key: 'hr_계약', label: '계약·문서 · 계약' },
  { key: 'hr_문서보관함', label: '계약·문서 · 문서보관함' },
  { key: 'hr_증명서', label: '계약·문서 · 증명서' },
  { key: 'hr_서류제출', label: '계약·문서 · 서류제출' },
];

/**
 * 재고관리 — 4 워크센터(status/io/item/analyze) 기준으로 라벨 정렬
 * page.tsx 는 canAccessInventorySection 의 WORKCENTER_UNIONS 로 합집합 판정
 */
export const INVENTORY_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  // 재고 현황 (status)
  { key: 'inventory_현황', label: '재고 현황 · 현황' },
  { key: 'inventory_이력', label: '재고 현황 · 이력' },
  { key: 'inventory_내부서재고', label: '재고 현황 · 내부서 재고' },
  // 입출고·발주 (io)
  { key: 'inventory_등록', label: '입출고·발주 · 등록' },
  { key: 'inventory_발주', label: '입출고·발주 · 발주' },
  { key: 'inventory_거래처', label: '입출고·발주 · 거래처/명세서' },
  { key: 'inventory_납품확인서', label: '입출고·발주 · 납품확인서' },
  { key: 'inventory_이관', label: '입출고·발주 · 이관' },
  // 물품·자산 (item)
  { key: 'inventory_자산', label: '물품·자산 · 자산' },
  { key: 'inventory_스캔', label: '물품·자산 · 스캔' },
  { key: 'inventory_카테고리', label: '물품·자산 · 카테고리' },
  { key: 'inventory_UDI', label: '물품·자산 · UDI' },
  // 분석·마감 (analyze)
  { key: 'inventory_월마감', label: '분석·마감 · 월마감' },
  { key: 'inventory_수요예측', label: '분석·마감 · 수요예측' },
  { key: 'inventory_재고실사', label: '분석·마감 · 재고실사' },
  { key: 'inventory_소모품통계', label: '분석·마감 · 소모품통계' },
  { key: 'inventory_AS반품', label: '분석·마감 · AS반품' },
];

/**
 * 관리자 — 사이드바 6 워크센터(exec/company/roles/ops/forms/audit) + 시스템마스터
 * labels = ADMIN_SIDEBAR_ITEMS 표시명과 맞춤
 */
export const ADMIN_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'admin_경영분석', label: '경영 대시보드', hint: '워크센터: 경영 대시보드 (exec)' },
  { key: 'admin_회사관리', label: '회사 관리', hint: '워크센터: 회사 관리 (company)' },
  { key: 'admin_직원권한', label: '권한 관리', hint: '워크센터: 권한 관리 (roles)' },
  { key: 'admin_알림자동화', label: '운영 설정 · 알림 자동화', hint: '워크센터: 운영 설정 (ops)' },
  { key: 'admin_수술검사템플릿', label: '운영 설정 · 수술/검사 템플릿', hint: '워크센터: 운영 설정 (ops)' },
  { key: 'admin_팝업관리', label: '운영 설정 · 팝업 관리', hint: '워크센터: 운영 설정 (ops)' },
  { key: 'admin_문서양식', label: '결재 양식', hint: '워크센터: 결재 양식 (forms)' },
  { key: 'admin_감사센터', label: '감사·백업 · 감사/접근 로그', hint: '워크센터: 감사·백업 (audit)' },
  { key: 'admin_급여이상치', label: '감사·백업 · 급여 이상치', hint: '워크센터: 감사·백업 (audit)' },
  { key: 'admin_데이터백업', label: '감사·백업 · 데이터 백업', hint: '워크센터: 감사·백업 (audit)' },
  { key: 'admin_데이터초기화', label: '감사·백업 · 데이터 초기화', tone: 'critical', hint: '워크센터: 감사·백업 (audit)' },
  {
    key: 'admin_시스템마스터센터',
    label: '시스템마스터센터',
    hint: '시스템 마스터 계정이 추가로 필요할 수 있습니다.',
  },
  {
    key: 'admin_공문서대장',
    label: '공문서대장 (전자결재 이전)',
    hint: '전자결재 메뉴 접근 별칭용. 신규 부여보다 전자결재 권한을 사용하세요.',
  },
  {
    key: 'admin_비품대여설정',
    label: '비품대여 설정 (재고 이전)',
    hint: '재고관리 영역으로 이전된 설정입니다.',
  },
];

export const STAFF_META_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'staff_meta_license_no', label: '면허번호 사용', hint: '인사 상세/증명서 등에 사용' },
  { key: 'staff_meta_license_date', label: '면허 취득일 사용' },
  { key: 'staff_meta_employment_type', label: '고용형태 사용' },
  { key: 'staff_meta_contract_end_date', label: '계약 종료일 사용' },
  { key: 'staff_meta_probation_months', label: '수습기간 사용' },
  { key: 'staff_meta_extension', label: '내선번호 사용' },
];

/**
 * 재무회계 — SUB_MENUS.재무회계 10개와 1:1
 */
export const FINANCE_PERMISSION_ITEMS: FeaturePermissionItem[] = [
  { key: 'finance_복식부기', label: '복식부기', hint: '전표 분개장, 계정과목, 시산표' },
  { key: 'finance_부가세', label: '부가세', hint: '세금계산서, 부가세 모의 계산' },
  { key: 'finance_결산', label: '결산', hint: '월차/연차 결산 및 재무 보고서' },
  { key: 'finance_자금흐름', label: '자금흐름', hint: '일일 자금 현황, 수지 예측' },
  { key: 'finance_감가상각', label: '감가상각', hint: '고정자산 대장 및 월 감가상각' },
  { key: 'finance_매입원장', label: '매입원장', hint: '거래처별 매입채무 대장' },
  { key: 'finance_경비청구', label: '경비청구', hint: '영수증 제출 및 법인카드 승인' },
  { key: 'finance_지출결의', label: '지출결의', hint: '자금 집행 지출결의서' },
  { key: 'finance_급여연동', label: '급여연동', hint: 'HR 급여대장 연동 회계전표' },
  { key: 'finance_세무신고', label: '세무신고', hint: '원천세/부가세 신고자료' },
];

export const FEATURE_PERMISSION_GROUPS: FeaturePermissionGroup[] = [
  {
    id: 'main-menu',
    label: '메인 메뉴 접근',
    description: '사이드바에 메뉴를 노출할지 설정합니다. (실제 메인 메뉴와 동일한 순서)',
    items: MAIN_MENU_PERMISSION_ITEMS,
  },
  {
    id: 'chat',
    label: '채팅 세부 권한',
    description: '메신저 내에서의 생성, 파일 전송 등의 세부 권한입니다.',
    items: CHAT_PERMISSION_ITEMS,
  },
  {
    id: 'mypage',
    label: '내정보 세부 권한',
    description: '마이페이지 내 개인정보 수정, 급여 조회 등 민감 권한입니다.',
    items: MYPAGE_PERMISSION_ITEMS,
  },
  {
    id: 'extra',
    label: '추가기능 세부 권한',
    description: '추가기능 안에서 열 수 있는 카드별 접근 권한입니다. (실제 카드 목록과 동일)',
    items: EXTRA_FEATURE_PERMISSION_ITEMS,
  },
  {
    id: 'calendar',
    label: '공유캘린더 세부 권한',
    description:
      '공유캘린더 메뉴 안 기능별 접근입니다. 메인 메뉴 「공유캘린더」를 먼저 허용한 뒤 세부 토글을 설정하세요. 미설정(undefined)은 허용으로 취급합니다.',
    items: CALENDAR_PERMISSION_ITEMS,
  },
  {
    id: 'board',
    label: '게시판 읽기 / 쓰기',
    description: '게시판 하위 메뉴(보드)별 읽기·쓰기입니다. 쓰기 권한은 읽기를 포함합니다.',
    items: BOARD_PERMISSION_ITEMS,
  },
  {
    id: 'approval',
    label: '전자결재 세부 권한',
    description: '전자결재 하위 메뉴(결재함/기안함 등)와 관리용 확장 권한입니다.',
    items: APPROVAL_PERMISSION_ITEMS,
  },
  {
    id: 'hr',
    label: '인사관리 세부 권한',
    description: '인사관리 워크센터(구성원·근태·연차·급여·복지·계약문서) 기준입니다.',
    items: HR_PERMISSION_ITEMS,
  },
  {
    id: 'inventory',
    label: '재고관리 세부 권한',
    description: '재고관리 4 워크센터(현황 / 입출고·발주 / 물품·자산 / 분석·마감) 기준입니다.',
    items: INVENTORY_PERMISSION_ITEMS,
  },
  {
    id: 'finance',
    label: '재무회계 세부 권한',
    description: '재무회계 하위 메뉴 10개와 1:1로 대응합니다. 메인 메뉴 「재무회계」도 함께 허용하세요.',
    items: FINANCE_PERMISSION_ITEMS,
  },
  {
    id: 'admin',
    label: '관리자 세부 권한',
    description: '관리자 사이드바 6 워크센터(경영/회사/권한/운영/양식/감사) 기준입니다.',
    items: ADMIN_PERMISSION_ITEMS,
  },
  {
    id: 'staff-meta',
    label: '직원 부가 정보',
    description: '직원 개별 메타데이터나 계산에 쓰이는 정보입니다.',
    items: STAFF_META_PERMISSION_ITEMS,
  },
];
