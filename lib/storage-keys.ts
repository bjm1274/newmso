/**
 * ERP 로컬스토리지 키 상수
 * 기존에 전자결재.tsx, 직인관리.tsx, 비품장비대여관리.tsx 등에 흩어져 있던
 * localStorage 키 상수들을 중앙화
 */

export const STORAGE_KEYS = {
  /** 로그인 사용자 정보 */
  USER: 'erp_user',

  /** 전자결재 임시저장 초안 */
  DRAFT_APPROVAL: 'erp_draft_approval',

  /** 커스텀 결재 양식 종류 목록 */
  APPROVAL_FORM_TYPES_CUSTOM: 'erp_approval_form_types_custom',

  /** 결재 양식 템플릿 디자인 설정 */
  FORM_TEMPLATE_DESIGNS: 'erp_form_template_designs',

  /** 회사 직인 로컬 데이터 */
  COMPANY_SEALS: 'erp_company_seals_local',

  /** 사용자별 결재선 템플릿 (userId 필요) */
  approvelineTemplates: (userId: string) => `erp_approveline_templates_${userId}`,

  /** 사용자별 즐겨찾기 결재선 (userId 필요) */
  approvelineFav: (userId: string) => `erp_fav_approveline_${userId}`,

  /** 비품/장비 종류 설정 (scope 필요) */
  assetLoanItems: (scope: string) => `erp_asset_loan_item_settings:${scope}`,

  /** 알림 설정 (소리, 방해금지 등) */
  NOTIF_SETTINGS: 'erp_notif_settings',

  /** 마지막 로그인 시각 (ISO string) */
  LOGIN_AT: 'erp_login_at',

  /**
   * 수술상담 기록의 레거시 localStorage 키.
   *
   * 상담 기록에는 환자명·차트번호·진단·수술계획이 들어간다. 예전에는 이 키로
   * 최대 30건을 만료 없이 평문 보관했고 로그아웃해도 남았다 — 공용 단말이라면
   * 브라우저 프로필을 여는 것만으로 앱 인증 없이 읽힌다. 지금은 쓰지 않지만
   * 이미 단말에 쌓인 기록을 지워야 하므로 상수는 남겨 둔다.
   */
  CONSULTATION_RECORDS_LEGACY: 'erp_consultation_records',

  /** 수술상담 기록 보관 위치 — 탭을 닫으면 사라지는 sessionStorage */
  CONSULTATION_RECORDS_SESSION: 'erp_consultation_records_session',

  /** 채팅 금지어 목록 */
  BANNED_WORDS: 'erp-banned-words',

  /** 예산 계획 설정 */
  BUDGET_SETTINGS: 'erp_budget_settings',

  /** 예산 집행 내역 */
  BUDGET_EXECUTIONS: 'erp_budget_executions',

  /** 채팅방별 고정/숨김 설정 (userId 필요) */
  chatRoomPrefs: (userId: string) => `erp_chat_room_prefs:${userId || 'guest'}`,

  /** 채팅방 고정 메시지 목록 (roomId 필요) */
  chatPinned: (roomId: string) => `erp_chat_pinned_messages:${roomId || 'none'}`,

  /** 채팅 북마크 목록 (userId 필요) */
  chatBookmarks: (userId: string) => `erp_chat_bookmarks:${userId || 'guest'}`,

  /** 고정 채팅방 순서 (userId 필요) */
  chatPinnedRoomOrder: (userId: string) => `erp_chat_pinned_room_order:${userId || 'guest'}`,
  chatRetryQueue: (userId: string) => `erp_chat_retry_queue:${userId || 'guest'}`,
  chatSavedSearches: (userId: string) => `erp_chat_saved_searches:${userId || 'guest'}`,
  chatThreadPrefs: (userId: string) => `erp_chat_thread_prefs:${userId || 'guest'}`,
  chatNoticeSchedules: (userId: string) => `erp_chat_notice_schedules:${userId || 'guest'}`,
  chatAttachmentRetryQueue: (userId: string) => `erp_chat_attachment_retry_queue:${userId || 'guest'}` } as const;
