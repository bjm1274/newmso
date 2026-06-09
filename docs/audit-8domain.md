# MSO 8개 도메인 전 파일 전수조사 보고서

> 생성 방식: 자동화 워크플로(mso-8domain-audit) — **카탈로그 → 적대적 import그래프 검증** 2단계.
> 조사 단위 9개(채팅을 PC/모바일·API로 분할), 보고 도메인 8개. 모든 역할 설명은 에이전트가 파일을 직접 열어 작성.

## 핵심 결론

- 총 카탈로그 파일: **395개**
- 데드/중복/레거시 **의심 후보 15건 전부, 적대적 검증에서 반증됨(삭제 대상 0).**
- 원인: 이 코드베이스는 구(서브) → 신(워크센터/모듈) **동적 import 래핑**으로 점진 마이그레이션 중이라, 단순 grep으로는 데드처럼 보이지만 실제로는 `dynamic(() => import(...))`로 살아있음.

### 의심 후보 검증 결과

| 도메인 | 파일 | 의심 | 검증 | 근거 |
|---|---|---|---|---|
| 알림 | app/main/모바일/내정보/알림탭.tsx | component | ✅ 살아있음 | app\main\모바일\셸\MobileShell.tsx:18: import 알림탭 from '../내정보/알림탭'; + line 280: {route.tab === 'notif' && <알림탭 user={user} />} — Direct import and active rendering in MobileShell router |
| 내정보 | app/main/기능부품/마이페이지/역할별대시보드/format-utils.ts | re-export proxy | ✅ 살아있음 | app/main/모바일/결재/data-hooks.ts:31: import { normalizeApprovalLineIds, resolveApprovalLineIds as resolveLineIdsPc, resolveStoredCurrentApproverId } from '@/app/main/기능부품/마이페이지/역할별대시보드/format-utils'; data-hooks.ts:64 re-exports these functions. Zero dynamic/lazy import variants found. |
| 추가기능 | app/main/모바일/추가기능/data-hooks.ts | dead? | ✅ 살아있음 | 68 direct imports across mobile modules. Examples: app/main/모바일/게시판/index.tsx:28, app/main/모바일/결재/index.tsx:26, app/main/모바일/내정보/급여명세.tsx:18, app/main/모바일/인사관리/index.tsx:33, app/main/모바일/재고/index.tsx:30. No dead code detected - all 13 hooks actively imported. |
| 추가기능 | app/main/기능부품/추가기능.tsx | legacy? | ✅ 살아있음 | PC routing verified: dynamic import at 조직도본문.tsx:20, dynamic component at :83, conditional render at :370-385. Mobile: MobileShell.tsx:20 direct import. Sidebar: page.tsx:87 menu entry. All routes accessible from main navigation. |
| 채팅 | app/main/기능부품/메신저방데이터-queries.ts | dead? | ✅ 살아있음 | 메신저방데이터훅.ts:38: import { selectMessageBookmarkRows, selectMessageReactionRows } from './메신저방데이터-queries'; |
| 채팅 | app/main/기능부품/메신저방데이터-types.ts | dead? | ✅ 살아있음 | 메신저방데이터훅.ts:30,36: import type { LoadedMessageCursor, MessageJumpLoadResult, ReactionUsersByMessage, RoomSummary, UseChatRoomDataSyncParams } from './메신저방데이터-types'; 및 import { CHAT_METADATA_REFRESH_TTL_MS, DATE_JUMP_CONTEXT_AFTER, DATE_JUMP_CONTEXT_BEFORE, MESSAGE_PAGE_SIZE } from './메신저방데이터-types'; |
| 채팅 | app/main/기능부품/메신저방데이터-utils.ts | dead? | ✅ 살아있음 | 메신저방데이터훅.ts:37: import { defaultLegacySelectChatMessagesWithFallback, describeQueryError, normalizeMessageCursorTime } from './메신저방데이터-utils'; 및 메신저방데이터-queries.ts:2: import { chunkArray } from './메신저방데이터-utils'; |
| 채팅 | app/main/기능부품/메신저메시지서비스.ts | dead? | ✅ 살아있음 | 메신저전송훅.ts:11: import type { SendMessageOptions } from './메신저메시지서비스'; 및 메신저전송훅.ts:24: export type { SendMessageOptions } from './메신저메시지서비스'; |
| 채팅 | app/main/기능부품/메신저포매팅.ts | legacy? | ✅ 살아있음 | 메신저메시지렌더.tsx:5: import { parseMarkdownSegments } from './메신저포매팅'; 및 메신저메시지렌더.tsx:37: const segments = parseMarkdownSegments(content); |
| 전자결재 | app/main/기능부품/전자결재서브/양식빌더.tsx | component | ✅ 살아있음 | Dynamic import at D:/newmso/app/main/기능부품/관리자전용.tsx:52 with active render at line 347: {activeTab === '문서양식' && <FormBuilder />}. Routed through 조직도본문.tsx AdminView when mainMenu === '관리자'. Menu alias in admin-menu-config.ts:107 maps '양식빌더' -> '문서양식'. |
| 재고관리 | app/main/기능부품/재고관리서브 | legacy | ✅ 살아있음 | 6 dynamic imports found: ItemWorkcenter.tsx:43 (물품등록), ItemWorkcenter.tsx:48 (자산QR관리), ItemWorkcenter.tsx:53 (UDI관리), IOWorkcenter.tsx:33 (발주관리), StatusSubViews.tsx:20 (발주관리), AnalyzeWorkcenter.tsx:35 (재고실사). Plus 2 static type imports from types.ts. All accessed through 4 workcenter components (status/io/item/analyze) that render legacy components as modal overlays during progressive migration. |
| 관리자 | app/main/기능부품/관리자전용서브/회사관리.tsx | legacy? | ✅ 살아있음 | /d/newmso/app/main/기능부품/관리자전용.tsx:49 - const CompanyManager = dynamic(() => import('./관리자전용서브/회사관리'), { ssr: false, loading: AdminSubViewLoading }) |
| 관리자 | app/main/기능부품/관리자전용서브/데이터백업.tsx | dead? | ✅ 살아있음 | /d/newmso/app/main/기능부품/관리자전용.tsx:46 - const DataBackup = dynamic(() => import('./관리자전용서브/데이터백업'), { ssr: false, loading: AdminSubViewLoading }) |
| 관리자 | app/main/기능부품/관리자전용서브/전자결재양식관리.tsx | dead? | ✅ 살아있음 | /d/newmso/app/main/기능부품/관리자워크센터/FormsWorkcenter.tsx:24-26 - const ApprovalFormTypesManager = dynamic(() => import('../관리자전용서브/전자결재양식관리'), { ssr: false, loading: Loading }) |
| 관리자 | app/main/기능부품/관리자전용서브/시스템마스터센터-modules/PermissionDiffPanel.tsx | dup? | ✅ 중복아님 | /d/newmso/app/main/기능부품/관리자전용서브/시스템마스터센터.tsx:43 - import { PermissionDiffPanel } from './시스템마스터센터-modules/PermissionDiffPanel'. 직원권한통합/PermissionDiffPanel와는 완전히 다른 컴포넌트: 시스템마스터센터 버전은 권한감사로그 조회UI(auditKeyword, permissionDiffLogs props), 직원권한통합 버전은 권한변경리뷰 표시(review, mode props). 두 버전 모두 각자 다른 곳에서 사용 중. |

### 비대 파일(분리 권고 — 데드/중복 아님, ≥700줄)

| 도메인 | 파일 | 줄수 |
|---|---|---|
| 채팅 | app/main/기능부품/메신저.tsx | 3435 |
| 게시판 | app/main/기능부품/게시판.tsx | 2889 |
| 알림 | app/main/page.tsx | 2800 |
| 게시판 | app/main/기능부품/게시판서브/업무가이드.tsx | 2189 |
| 알림 | app/main/기능부품/알림시스템.tsx | 1927 |
| 채팅 | app/main/기능부품/메신저방데이터훅.ts | 1689 |
| 전자결재 | app/main/기능부품/전자결재.tsx | 1415 |
| 알림 | app/main/기능부품/알림인박스.tsx | 1350 |
| 내정보 | app/main/기능부품/마이페이지/index.tsx | 1145 |
| 내정보 | app/main/기능부품/마이페이지/출퇴근기록/index.tsx | 1137 |
| 채팅 | app/main/기능부품/메신저타임라인.tsx | 1003 |
| 추가기능 | app/main/모바일/추가기능/data-hooks.ts | 954 |
| 채팅 | app/main/기능부품/메신저운영센터.tsx | 885 |
| 내정보 | app/main/기능부품/마이페이지/나의할일.tsx | 880 |
| 관리자 | app/main/기능부품/관리자전용서브/직원권한통합.tsx | 864 |
| 내정보 | app/main/모바일/내정보/홈.tsx | 862 |
| 채팅 | app/main/기능부품/메신저드로어.tsx | 850 |
| 전자결재 | app/main/기능부품/전자결재서부/useApprovalSubmit.ts | 807 |
| 전자결재 | app/main/모바일/결재/결재상세.tsx | 803 |
| 관리자 | app/main/기능부품/관리자전용서브/전자결재양식관리.tsx | 782 |
| 채팅 | app/main/모바일/채팅/채팅목록.tsx | 753 |
| 관리자 | app/main/기능부품/관리자전용서브/데이터백업.tsx | 741 |
| 전자결재 | app/main/기능부품/전자결재서부/ApprovalMetaPanels.tsx | 729 |
| 전자결재 | app/main/기능부품/전자결재서부/출결정정양식.tsx | 712 |

### 알려진 버그(별도 수정)

- `app/main/모바일/내정보/알림탭.tsx`: 로컬 `NOTIFICATION_LIST_UPDATED_EVENT` 값이 변수명 문자열(`'NOTIFICATION_LIST_UPDATED_EVENT'`)로 잘못 설정 → 정식 이벤트명 `'erp-notification-list-updated'`과 불일치하여 모바일 알림탭이 실시간 갱신 이벤트를 수신 못함. **수정 완료.**

---

## 도메인별 전 파일 카탈로그

## 알림 (25개 파일)

| 경로 | 줄수 | 역할 | 판정 |
|---|---|---|---|
| app/main/기능부품/알림시스템.tsx | 1927 | Core engine: Real-time notification polling + toast UI + push subscription management + delivery/debug logging. Single source of truth for all notifications via NOTIFICATION_LIST_UPDATED_EVENT broadcast. | 정상 |
| app/main/기능부품/알림인박스.tsx | 1350 | Notification list/inbox view with tabs (all/chat/approval/hr/inventory/other), search, filters, date grouping, batch operations, and settings panel. Consumes NOTIFICATION_LIST_UPDATED_EVENT from NotificationSystem. | 정상 |
| app/main/기능부품/알림센터.tsx | 577 | Dropdown notification bell icon with unread badge, shake animation, quick list (50 items), mark-read/delete buttons, and footer link to full inbox. Consumes NOTIFICATION_LIST_UPDATED_EVENT and mount-time fetch. | 정상 |
| app/main/기능부품/채팅알림배너.tsx | 260 | Mobile-only chat message preview banner (6s queue-based display). Listens to erp-chat-notification custom event dispatched by NotificationSystem. Desktop excludes via md:hidden. | 정상 |
| app/main/모바일/내정보/알림탭.tsx | 338 | Mobile standalone notification tab (bar nav integration). Uses local NOTIFICATION_LIST_UPDATED_EVENT constant (NOT the export from NotificationSystem). Mirrors PC inbox UI adapted for mobile. | 레거시의심 |
| app/main/기능부품/알림시스템/settings.ts | 64 | Notification preferences persistence: sound, vibration, DND, weekend mute, keyword filters, per-type toggles. localStorage-backed (STORAGE_KEYS.NOTIF_SETTINGS). | 정상 |
| app/main/기능부품/알림시스템/filter-helpers.ts | 153 | Notification suppression logic: DND check, weekend quiet, keyword matching, chat room preference resolution (mute/mention-only/keyword mode), followed-thread detection. | 정상 |
| app/main/기능부품/알림시스템/push-utils.ts | 25 | Web Push utility: VAPID key Base64<->Uint8Array conversion, storage key generators for push subscription & device ID. | 정상 |
| app/main/기능부품/알림시스템/delivery-log.ts | 61 | Notification delivery audit trail: localStorage-backed (NOTIFICATION_DELIVERY_LOG_KEY). Records stages (received/skipped-type-disabled/skipped-keyword-filtered/toast-shown/suppressed-active-room/system-popup-requested). Events via NOTIFICATION_DELIVERY_EVENT. | 정상 |
| app/main/기능부품/알림시스템/push-debug.ts | 65 | Push subscription debug log: app vs service-worker source, stage tracking (init-start/sw-registered/permission-result/subscribe-failed/subscription-active), detail normalization, localStorage (PUSH_DEBUG_STORAGE_KEY) + PUSH_DEBUG_EVENT broadcast. | 정상 |
| app/main/기능부품/알림시스템/ui-config.ts | 18 | Toast card visual config: emoji icons, Tailwind colors, progress bar colors per notification type (message/mention/approval/payroll/inventory/attendance/board/인사/education/todo/notification). | 정상 |
| app/main/기능부품/알림시스템/device-feedback.ts | 64 | Device feedback: app badge (setAppBadge/clearAppBadge), vibration pattern selection (chat=[90,40,120] vs default=[180]), notification sound playback (talk vs system), requestAnimationFrame batching. | 정상 |
| app/main/기능부품/관리자전용서브/알림자동화설정.tsx | 519 | Admin-only notification automation settings: payroll alert scheduling (day-of-month), annual leave promotion alert stages (step1/step2 toggles), promotion log viewer, D1 staff list + logs sync (localStorage fallback). | 정상 |
| app/api/notifications/chat-push/route.ts | 57 | Chat message push trigger: Receives message insert events, dedupes by message_id, builds chat notification payload, dispatches to push queue for delivery. | 정상 |
| app/api/notifications/chat-push-flush/route.ts | 31 | Chat push queue flush: Batches pending chat pushes (up to limit), retries on transient failures, updates delivery status. | 정상 |
| app/api/notifications/mark-read/route.ts | 63 | Notification read-state sync: Marks single/multiple notifications as read, returns updated count, triggers badge/UI refresh via event. | 정상 |
| app/api/notifications/push-subscription/route.ts | 270 | Web Push subscription management: POST registers browser subscription (endpoint + VAPID keys + FCM token + platform/device metadata), DELETE unsubscribes, stores in push_subscriptions table for later dispatch. | 정상 |
| app/api/notifications/push-config/route.ts | 16 | Push environment validation: Returns VAPID key & FCM config for client initialization. Minimal endpoint. | 정상 |
| app/api/notifications/push-self-test/route.ts | 166 | Push self-test: Validates Cloudflare env vars (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, FCM_PROJECT_ID, etc.), sends test push to authenticated user, returns diagnostics. | 정상 |
| app/api/notifications/repush-unread/route.ts | 38 | Unread notification repush: Called by cron daily 09:00 KST. Re-queues unread non-chat notifications for delivery (excludes message/mention). Single-per-user throttle to prevent duplicates. | 정상 |
| app/api/admin/notifications/push-health/route.ts | 43 | Admin push health check: Queries push_subscriptions table, returns summary stats (total/active/by-platform), admin-only endpoint for monitoring. | 정상 |
| app/api/cron/inapp-notifications/route.ts | 52 | Cron (frequency: ad-hoc/schedule TBD): Generates in-app notifications from domain events (approvals/inventory/payroll/education/etc.). Inserts into notifications table for Realtime/polling pickup. | 정상 |
| app/api/cron/unread-notification-repush/route.ts | 26 | Cron 09:00 KST: Calls /api/notifications/repush-unread. Re-queues read notifications for eligible users. | 정상 |
| app/api/cron/chat-push-dispatch/route.ts | 28 | Cron (frequency: TBD): Drains chat push queue (chat-push table), dispatches WebPush/FCM payloads to subscribed devices, marks sent. | 정상 |
| app/main/page.tsx | 2800 | Main app layout: Renders NotificationSystem + ChatAlertBanner + sidebar + content area. Passes user, onOpen* callbacks for modal routing. Dynamic import of MobileShell for responsive mode. | 정상 |

검증된 후보:

- `app/main/모바일/내정보/알림탭.tsx` — **✅ 살아있음** — app\main\모바일\셸\MobileShell.tsx:18: import 알림탭 from '../내정보/알림탭'; + line 280: {route.tab === 'notif' && <알림탭 user={user} />} — Direct import and active rendering in MobileShell router

## 내정보 (35개 파일)

| 경로 | 줄수 | 역할 | 판정 |
|---|---|---|---|
| app/main/기능부품/마이페이지/index.tsx | 1145 | 메인 PC 마이페이지 컴포넌트 - 7개 탭(프로필, 출퇴근, 할일, 서류, 급여·증명서, 알림) 라우팅, 계약서 서명 모달, 즐겨찾기 관리 | 정상 |
| app/main/기능부품/마이페이지/급여명세서/index.tsx | 408 | PC 급여명세서 출력 컨테이너 - 비밀번호 인증, 월별 선택, 모바일/데스크탑 분기 | 정상 |
| app/main/기능부품/마이페이지/급여명세서/모바일명세서.tsx | 262 | 모바일 급여명세서 표시 컴포넌트 - 지급/공제 항목 렌더, 실지급액 강조, 통상시급 계산 | 정상 |
| app/main/기능부품/마이페이지/출퇴근기록/index.tsx | 1137 | PC 출퇴근 기록 탭 - 일일/주간/월간 뷰, 캘린더, 차트, 체크인/아웃, 정정 요청 | 정상 |
| app/main/기능부품/마이페이지/출퇴근기록/attendance-utils.ts | 87 | 출퇴근 데이터 집계 유틸 - calculateMonthlyAttendance(PC/모바일 공용) | 정상 |
| app/main/기능부품/마이페이지/출퇴근기록/checkin-utils.ts | 341 | 출퇴근 체크인/아웃 로직 - shift boundary, 시간 계산, near-field 체크 | 정상 |
| app/main/기능부품/마이페이지/출퇴근기록/late-status.ts | 47 | 지각 상태 판단 유틸 - decideCheckInStatus | 정상 |
| app/main/기능부품/마이페이지/출퇴근기록/commute-types.ts | 59 | 출퇴근 도메인 타입 정의 - CommuteLog, ShiftBoundary, MonthlyShiftAssignmentRow | 정상 |
| app/main/기능부품/마이페이지/출퇴근기록/출퇴근차트.tsx | 244 | 출퇴근 차트/달력/통계 컴포넌트 - AttendanceCalendar, WorkHoursChart, StatItem | 정상 |
| app/main/기능부품/마이페이지/출퇴근기록/출퇴근모달.tsx | 226 | 체크인/아웃 성공 모달 - 날씨, AQI 뱃지, 근무시간 요약 | 정상 |
| app/main/기능부품/마이페이지/나의할일.tsx | 880 | 할일 목록 탭 - 미완료 항목 표시, 카테고리 분류 | 정상 |
| app/main/기능부품/마이페이지/서류제출.tsx | 656 | 서류제출 탭 - 계약서, 면허수교, 기타 문서 제출 폼 | 정상 |
| app/main/기능부품/마이페이지/연차휴가내역.tsx | 300 | 연차 사용 내역 탭 - 연도별 통계, 사용 내역 리스트 | 정상 |
| app/main/기능부품/마이페이지/증명서관리.tsx | 360 | 증명서 관리 탭 - 발급 이력, 재발급, 인쇄 | 정상 |
| app/main/기능부품/마이페이지/프로필카드.tsx | 461 | 프로필 카드 컴포넌트 - 기본정보 수정, 비밀번호, 로그아웃 | 정상 |
| app/main/기능부품/마이페이지/프로필카드/InfoItems.tsx | 26 | 정보 항목 컴포넌트 | 정상 |
| app/main/기능부품/마이페이지/프로필카드/types.ts | 19 | 프로필카드 타입 정의 | 정상 |
| app/main/기능부품/마이페이지/프로필카드/format-utils.ts | 8 | 프로필카드 포맷 유틸 - toSafeText | 정상 |
| app/main/기능부품/마이페이지/마이페이지공통섹션.tsx | 236 | 급여·증명서 허브 컴포넌트 - PayrollAndCertificatesHub, 뷰 전환, 요약 정보 | 정상 |
| app/main/기능부품/마이페이지/홈탭헤더.tsx | 182 | 홈 탭 KPI 카드 - 근태, 연차, 급여, 증명서, 미결재 통계 | 정상 |
| app/main/기능부품/마이페이지/즐겨찾기설정.ts | 375 | 즐겨찾기 메뉴 정의, 권한 필터링, 마이그레이션 로직 | 정상 |
| app/main/기능부품/마이페이지/단축키설정.ts | 162 | 글로벌 단축키 맵핑 - Ctrl+Shift 조합 | 정상 |
| app/main/기능부품/마이페이지/useGlobalShortcuts.ts | 69 | 글로벌 단축키 훅 - window이벤트 리스너 | 정상 |
| app/main/기능부품/마이페이지/면허보수교육제출.tsx | 318 | 면허/보수교육 제출 모달 - 증명서 업로드, 인증 | 정상 |
| app/main/기능부품/마이페이지/certificate-print-utils.ts | 430 | 증명서 인쇄 포맷팅 유틸 - HTML/PDF 생성, 서명 포함 | 정상 |
| app/main/기능부품/마이페이지/역할별대시보드/format-utils.ts | 46 | 역할별대시보드 포맷 유틸 (주로 재사용성 없음, 코멘트상 삭제됨) | 레거시의심 |
| app/main/모바일/내정보/index.tsx | 62 | 모바일 내정보 라우터 - home/attend/leave/payslip/cert/edit 분기 | 정상 |
| app/main/모바일/내정보/홈.tsx | 862 | 모바일 내정보 홈 - 프로필 히어로, 빠른메뉴 그리드, 설정 리스트 | 정상 |
| app/main/모바일/내정보/급여명세.tsx | 203 | 모바일 급여명세 화면 - useMyLatestPayroll 훅 사용, 실지급액 강조 | 정상 |
| app/main/모바일/내정보/출퇴근체크인.tsx | 394 | 모바일 출퇴근 체크인 - 현위치, GPS, 체크인/아웃 UI | 정상 |
| app/main/모바일/내정보/연차.tsx | 166 | 모바일 연차 휴가 화면 - useMyLeave 훅, 내역 리스트 | 정상 |
| app/main/모바일/내정보/증명서.tsx | 174 | 모바일 증명서 화면 - useMyRecentCerts 훅, 발급 이력 | 정상 |
| app/main/모바일/내정보/정보수정.tsx | 234 | 모바일 정보수정 화면 - 프로필, 비밀번호, 연락처 | 정상 |
| app/main/모바일/내정보/알림탭.tsx | 338 | 모바일 알림 탭 - 미읽음, 결재 대기, 공지 | 정상 |
| app/main/모바일/내정보/data-hooks.ts | 335 | 모바일 내정보 공용 훅 - useMonthlyAttendance, useTodayCounts, useMyLeave, useMyLatestPayroll, useMyRecentCerts | 정상 |

검증된 후보:

- `app/main/기능부품/마이페이지/역할별대시보드/format-utils.ts` — **✅ 살아있음** — app/main/모바일/결재/data-hooks.ts:31: import { normalizeApprovalLineIds, resolveApprovalLineIds as resolveLineIdsPc, resolveStoredCurrentApproverId } from '@/app/main/기능부품/마이페이지/역할별대시보드/format-utils'; data-hooks.ts:64 re-exports these functions. Zero dynamic/lazy import variants found.

## 추가기능 (25개 파일)

| 경로 | 줄수 | 역할 | 판정 |
|---|---|---|---|
| app/main/모바일/추가기능/index.tsx | 197 | Mobile router — 16 screens. Discriminated union View type + MODULE_TO_VIEW mapping. | 정상 |
| app/main/모바일/추가기능/data-hooks.ts | 954 | Shared Supabase query hooks (13 total) + utils. All 13:1 usage ratio (not dead). | 데드의심 |
| app/main/모바일/추가기능/허브.tsx | 125 | Hub entry screen — 3 groups x 4 modules quick grid. | 정상 |
| app/main/모바일/추가기능/조직도.tsx | 232 | Org chart — dept tree + card + org views. | 정상 |
| app/main/모바일/추가기능/근무현황.tsx | 135 | Real-time work status — KPI 4 + filter + list. | 정상 |
| app/main/모바일/추가기능/부서재고.tsx | 135 | Dept inventory — filter + supply list. | 정상 |
| app/main/모바일/추가기능/인계노트.tsx | 345 | Handover notes — day/week/all views + new form. | 정상 |
| app/main/모바일/추가기능/직원평가.tsx | 313 | Staff evaluation — mine/target/result + eval form. | 정상 |
| app/main/모바일/추가기능/퇴원심사목록.tsx | 137 | Discharge review list — mine/request/all/done. | 정상 |
| app/main/모바일/추가기능/퇴원심사상세.tsx | 276 | Discharge detail — summary/record/comment + sticky action. | 정상 |
| app/main/모바일/추가기능/수술상담.tsx | 188 | Surgery consultation — voice PC-only + manual form. | 정상 |
| app/main/모바일/추가기능/OP체크보드.tsx | 156 | OP check board — real-time card state. 5s polling. | 정상 |
| app/main/모바일/추가기능/OP체크상세.tsx | 441 | OP check detail — surgery card + checklist + supplies. | 정상 |
| app/main/모바일/추가기능/OP체크카드.tsx | 218 | OP check card unit — card + state actions. | 정상 |
| app/main/모바일/추가기능/입금조회.tsx | 174 | Deposit realtime — hourly chart + list. | 정상 |
| app/main/모바일/추가기능/마감보고.tsx | 203 | Daily closure — today/week/month + checklist. | 정상 |
| app/main/모바일/추가기능/외부주차.tsx | 133 | External parking — safe URL wrapper. | 정상 |
| app/main/모바일/추가기능/외부웹팩스.tsx | 132 | External webfax — safe URL wrapper. | 정상 |
| app/main/모바일/추가기능/MRI일정.tsx | 175 | MRI schedule — today/week/read-queue. | 정상 |
| app/main/모바일/추가기능/업무공유목록.tsx | 172 | Task share list — all/handoff/todo/asset. | 정상 |
| app/main/모바일/추가기능/업무공유상세.tsx | 323 | Task share detail — post + comments + form. | 정상 |
| app/main/모바일/추가기능/업무가이드.tsx | 285 | SOP guides — auto-category + filter. | 정상 |
| app/main/모바일/추가기능/OP메시지시트.tsx | 216 | OP quick message sheet — quick chips + staff lookup. | 정상 |
| app/main/기능부품/추가기능.tsx | 333 | PC ExtraFeatures hub. EXTRA_FEATURE_LOADERS dynamic import pattern. | 레거시의심 |
| app/main/기능부품/추가기능공통.tsx | 368 | Shared UI (FEATURE_CARDS, EXTERNAL_LINKS, EXTRA_FEATURE_LOADERS, ExtraFeatureSubview). | 정상 |

검증된 후보:

- `app/main/모바일/추가기능/data-hooks.ts` — **✅ 살아있음** — 68 direct imports across mobile modules. Examples: app/main/모바일/게시판/index.tsx:28, app/main/모바일/결재/index.tsx:26, app/main/모바일/내정보/급여명세.tsx:18, app/main/모바일/인사관리/index.tsx:33, app/main/모바일/재고/index.tsx:30. No dead code detected - all 13 hooks actively imported.
- `app/main/기능부품/추가기능.tsx` — **✅ 살아있음** — PC routing verified: dynamic import at 조직도본문.tsx:20, dynamic component at :83, conditional render at :370-385. Mobile: MobileShell.tsx:20 direct import. Sidebar: page.tsx:87 menu entry. All routes accessible from main navigation.

## 채팅 (83개 파일)

### 조사단위: 채팅-PC

| 경로 | 줄수 | 역할 | 판정 |
|---|---|---|---|
| app/main/기능부품/메신저.tsx | 3435 | Main chat component - orchestration, message list, room mgmt, UI | 비대(분리권고) |
| app/main/기능부품/메신저검색훅.ts | 678 | Global search hook - member/room/message/file search | 정상 |
| app/main/기능부품/메신저전역검색.tsx | 314 | Global search modal UI | 정상 |
| app/main/기능부품/메신저방데이터훅.ts | 1689 | Room data sync, message fetch, unread count, room state | 비대(분리권고) |
| app/main/기능부품/메신저재시도큐.ts | 211 | Message retry queue - localStorage | 정상 |
| app/main/기능부품/메신저첨부재시도큐.ts | 235 | Attachment retry queue - IndexedDB | 정상 |
| app/main/기능부품/메신저재시도큐공통.ts | 20 | Retry queue utilities | 정상 |
| app/main/기능부품/메신저테스트이벤트.ts | 43 | Mock event system for testing | 정상 |
| app/main/기능부품/메신저방데이터-queries.ts | 29 | Stub/refactoring artifact | 데드의심 |
| app/main/기능부품/메신저방데이터-types.ts | 63 | Stub/refactoring artifact | 데드의심 |
| app/main/기능부품/메신저방데이터-utils.ts | 44 | Stub/refactoring artifact | 데드의심 |
| app/main/기능부품/메신저드로어.tsx | 850 | Drawer - room info, media, members, settings | 정상 |
| app/main/기능부품/메신저타임라인.tsx | 1003 | Message timeline with threading, reactions | 정상 |
| app/main/기능부품/메신저운영센터.tsx | 885 | Notice scheduling, reminders | 정상 |
| app/main/기능부품/메신저컴포저.tsx | 540 | Composer - input, mentions, attachments | 정상 |
| app/main/기능부품/메신저첨부.tsx | 570 | Attachment rendering | 정상 |
| app/main/기능부품/메신저첨부미리보기.tsx | 546 | Attachment preview gallery | 정상 |
| app/main/기능부품/메신저사이드바.tsx | 559 | Room list, inboxes | 정상 |
| app/main/기능부품/메신저파생훅.ts | 644 | Derived state hook | 정상 |
| app/main/기능부품/메신저입력워크플로훅.ts | 559 | Input workflow, draft, autocomplete | 정상 |
| app/main/기능부품/메신저방관리훅.ts | 466 | Room create, add/remove members | 정상 |
| app/main/기능부품/메신저구독훅.ts | 484 | Realtime subscriptions polling | 정상 |
| app/main/기능부품/메신저전송훅.ts | 365 | Message sending, retry, delivery | 정상 |
| app/main/기능부품/메신저업로드훅.ts | 548 | File upload S3, progress, retry | 정상 |
| app/main/기능부품/메신저메시지액션워크플로훅.ts | 182 | Message action edit/delete/reply | 정상 |
| app/main/기능부품/메신저메시지렌더.tsx | 221 | Message rendering | 정상 |
| app/main/기능부품/메신저유틸.ts | 619 | Utilities, date, storage | 정상 |
| app/main/기능부품/메신저데이터유틸.ts | 186 | Data query utilities | 정상 |
| app/main/기능부품/메신저액션훅.ts | 256 | Action state hooks | 정상 |
| app/main/기능부품/메신저상태훅.ts | 416 | UI state management | 정상 |
| app/main/기능부품/메신저사이드바훅.ts | 245 | Sidebar state | 정상 |
| app/main/기능부품/메신저방전환훅.ts | 216 | Room navigation | 정상 |
| app/main/기능부품/메신저방환경설정훅.ts | 134 | Room preferences | 정상 |
| app/main/기능부품/메신저예약공지훅.ts | 231 | Scheduled notice management | 정상 |
| app/main/기능부품/메신저공지스케줄.ts | 311 | Notice persistence, localStorage | 정상 |
| app/main/기능부품/메신저투표모달.tsx | 301 | Poll creation | 정상 |
| app/main/기능부품/메신저스레드패널.tsx | 146 | Thread panel | 정상 |
| app/main/기능부품/메신저액션.tsx | 78 | Reaction detail modal | 정상 |
| app/main/기능부품/메신저그룹생성모달.tsx | 78 | Group chat modal | 정상 |
| app/main/기능부품/메신저멤버관리모달.tsx | 140 | Member/forward modals | 정상 |
| app/main/기능부품/메신저수정모달.tsx | 148 | Message edit modals | 정상 |
| app/main/기능부품/메신저읽음모달.tsx | 81 | Read status modal | 정상 |
| app/main/기능부품/메신저미디어아카이브.tsx | 94 | Media archive | 정상 |
| app/main/기능부품/메신저공통.tsx | 85 | Common components | 정상 |
| app/main/기능부품/메신저메시지서비스.ts | 30 | Service stub | 데드의심 |
| app/main/기능부품/메신저포매팅.ts | 87 | Text formatting utils | 레거시의심 |
| app/main/기능부품/메신저섹션/ChatRoomHeader.tsx | 157 | Room header | 정상 |
| app/main/기능부품/메신저섹션/StaffDetailModal.tsx | 259 | Staff profile modal | 정상 |
| app/main/기능부품/메신저섹션/DateJumpModal.tsx | 71 | Date jump modal | 정상 |
| app/main/기능부품/메신저섹션/RetryQueueBanner.tsx | 37 | Retry queue banner | 정상 |
| app/main/기능부품/메신저섹션/TypingNotice.tsx | 21 | Typing notice | 정상 |
| app/main/기능부품/메신저액션서브/MessageActionsHost.tsx | 220 | Message actions host | 정상 |
| app/main/기능부품/메신저액션서브/MessageContextMenu.tsx | 254 | Context menu | 정상 |
| app/main/기능부품/메신저액션서브/EmojiPicker.tsx | 369 | Emoji picker | 정상 |
| app/main/기능부품/메신저액션서브/emoticon-engine.ts | 628 | Emoticon engine | 정상 |
| app/main/기능부품/메신저액션서브/emoji-data.ts | 262 | Emoji data | 정상 |
| app/main/기능부품/메신저액션서브/index.ts | 10 | Module exports | 정상 |
| app/main/기능부품/chatQueryService.ts | 133 | Chat room query service | 정상 |
| app/main/기능부품/useChatTypingD1.ts | 227 | Typing D1 polling hook | 정상 |

검증된 후보:

- `app/main/기능부품/메신저방데이터-queries.ts` — **✅ 살아있음** — 메신저방데이터훅.ts:38: import { selectMessageBookmarkRows, selectMessageReactionRows } from './메신저방데이터-queries';
- `app/main/기능부품/메신저방데이터-types.ts` — **✅ 살아있음** — 메신저방데이터훅.ts:30,36: import type { LoadedMessageCursor, MessageJumpLoadResult, ReactionUsersByMessage, RoomSummary, UseChatRoomDataSyncParams } from './메신저방데이터-types'; 및 import { CHAT_METADATA_REFRESH_TTL_MS, DATE_JUMP_CONTEXT_AFTER, DATE_JUMP_CONTEXT_BEFORE, MESSAGE_PAGE_SIZE } from './메신저방데이터-types';
- `app/main/기능부품/메신저방데이터-utils.ts` — **✅ 살아있음** — 메신저방데이터훅.ts:37: import { defaultLegacySelectChatMessagesWithFallback, describeQueryError, normalizeMessageCursorTime } from './메신저방데이터-utils'; 및 메신저방데이터-queries.ts:2: import { chunkArray } from './메신저방데이터-utils';
- `app/main/기능부품/메신저메시지서비스.ts` — **✅ 살아있음** — 메신저전송훅.ts:11: import type { SendMessageOptions } from './메신저메시지서비스'; 및 메신저전송훅.ts:24: export type { SendMessageOptions } from './메신저메시지서비스';
- `app/main/기능부품/메신저포매팅.ts` — **✅ 살아있음** — 메신저메시지렌더.tsx:5: import { parseMarkdownSegments } from './메신저포매팅'; 및 메신저메시지렌더.tsx:37: const segments = parseMarkdownSegments(content);

### 조사단위: 채팅-모바일API

| 경로 | 줄수 | 역할 | 판정 |
|---|---|---|---|
| app/main/모바일/채팅/index.tsx | 115 | 채팅 라우터 — 3개 뷰(목록/방/새대화) 전환 관리 | 정상 |
| app/main/모바일/채팅/data-hooks.ts | 649 | 채팅 데이터 훅 모음 — rooms/messages/staff/search/read-counts | 비대(분리권고) |
| app/main/모바일/채팅/메시지버블.tsx | 515 | 메시지 렌더 + 스와이프 제스처 + 빠른 이모지 + 반응 칩 | 정상 |
| app/main/모바일/채팅/반응.ts | 139 | 이모지 반응(reaction) 토글 유틸 | 정상 |
| app/main/모바일/채팅/버블리스트.tsx | 97 | 메시지 + 날짜 구분선 렌더 | 정상 |
| app/main/모바일/채팅/새대화.tsx | 441 | 새 대화 시작 폼 — 세그먼트(구성원/조직도/채널생성) 분리 | 정상 |
| app/main/모바일/채팅/업로드.ts | 264 | 파일 업로드 유틸 — R2 PUT signed URL + fallback | 정상 |
| app/main/모바일/채팅/이모지피커.tsx | 519 | 이모지/이모티콘/스티커 피커 — PC 엔진 공유 | 정상 |
| app/main/모바일/채팅/조직도탭.tsx | 249 | 새 대화 / 조직도 탭 — 부서 트리 + 일괄 토글 | 정상 |
| app/main/모바일/채팅/채널생성탭.tsx | 259 | 새 대화 / 채널 생성 탭 — 관리자 권한 검증 | 정상 |
| app/main/모바일/채팅/채팅목록.tsx | 753 | 채팅 목록 화면 — 6개 칩 탭 + 메시지 본문 검색 | 정상 |
| app/main/모바일/채팅/채팅방.tsx | 673 | 채팅방 화면 — 헤더 + 무한스크롤 + 컴포저 + 정보 | 정상 |
| app/api/chat/og-preview/route.ts | 165 | URL OG 메타 추출 API | 정상 |
| app/api/chat/quick-reply/route.ts | 99 | 푸시 알림 인라인 답장 API | 정상 |
| app/api/chat/read-cursors/route.ts | 46 | 읽음 커서 upsert 서버 라우트 | 정상 |
| app/api/chat/typing/route.ts | 154 | typing 상태 관리 API | 정상 |
| app/api/chat/upload/route.ts | 159 | 파일 업로드 플랜 API | 정상 |
| app/api/chat-rooms/route.ts | 156 | 채팅방 생성/upsert API | 정상 |
| app/api/chat-rooms/[id]/route.ts | 96 | 채팅방 부분 업데이트 API | 정상 |
| app/api/realtime/stream/route.ts | 157 | EventStream SSE polling | 정상 |
| app/api/realtime/tail/route.ts | 118 | polling 변경 신호 API | 정상 |
| app/api/notifications/chat-push/route.ts | 47 | 푸시 트리거 API | 정상 |
| app/api/notifications/chat-push-flush/route.ts | 25 | 관리자용 pending job 처리 API | 정상 |
| app/api/notifications/mark-read/route.ts | 55 | 알림 읽음 처리 API | 정상 |

## 게시판 (18개 파일)

| 경로 | 줄수 | 역할 | 판정 |
|---|---|---|---|
| app/main/기능부품/게시판.tsx | 2889 | PC 게시판 핵심 컴포넌트 | 정상 |
| app/main/기능부품/게시판-view-utils.ts | 429 | canonical data normalization/formatting | 정상 |
| app/main/기능부품/게시판공통.ts | 84 | constants + re-export | 정상 |
| app/main/기능부품/게시판메뉴.ts | 28 | menu data definition | 정상 |
| app/main/기능부품/게시판업로드.ts | 109 | attachment upload wrapper | 정상 |
| app/main/기능부품/게시판/ReadStatusModal.tsx | 120 | read status modal | 정상 |
| app/main/기능부품/게시판/post-helpers.ts | 39 | pure helpers | 정상 |
| app/main/기능부품/게시판서브/BoardBodyPickerModal.tsx | 159 | body part picker | 정상 |
| app/main/기능부품/게시판서브/BoardMobilePostCard.tsx | 203 | mobile post card | 정상 |
| app/main/기능부품/게시판서브/BoardScheduleCalendar.tsx | 236 | schedule calendar | 정상 |
| app/main/기능부품/게시판서브/GuideDetailPanel.tsx | 267 | guide detail panel | 정상 |
| app/main/기능부품/게시판서브/PostMoreMenu.tsx | 160 | post dropdown menu | 정상 |
| app/main/기능부품/게시판서브/PostTableView.tsx | 476 | post table view | 정상 |
| app/main/기능부품/게시판서브/업무가이드.tsx | 2189 | guide main screen | 정상 |
| app/main/기능부품/게시판서브/board-poll-prize.ts | 164 | poll prize logic | 정상 |
| app/main/기능부품/게시판서브/guide-types.ts | 126 | type definitions | 정상 |
| app/main/기능부품/게시판서브/guide-utils.ts | 484 | guide utilities | 정상 |
| app/main/기능부품/게시판서브/post-table-helpers.ts | 81 | table helpers | 정상 |

## 전자결재 (65개 파일)

| 경로 | 줄수 | 역할 | 판정 |
|---|---|---|---|
| app/main/기능부품/전자결재.tsx | 1415 | 핵심 진입점: 모든 뷰(작성하기·기안함·결재함·참조함) 라우팅, 상태관리, 필터링 로직 중심 | 비대(분리권고) |
| app/main/기능부품/전자결재-types.ts | 69 | 타입/상수 모음 (re-export approval-constants) | 정상 |
| app/main/기능부품/전자결재-utils.ts | 339 | 공통 유틸: CC사용자정근화, 결재선병합, 참조사용자 처리 | 정상 |
| app/main/기능부품/전자결재서부/ApprovalComposerView.tsx | 445 | PC 작성하기 뷰 (작성, 결재선선택, 초안저장) | 정상 |
| app/main/기능부품/전자결재서부/ApprovalInboxView.tsx | 538 | PC 결재함/기안함/참조함 뷰 (목록표시, 필터, 일괄처리) | 정상 |
| app/main/기능부품/전자결재서부/ApprovalDetailModal.tsx | 353 | 상세 조회 모달 (결재선진행, 메타표시, 액션버튼) | 정상 |
| app/main/기능부품/전자결재서부/useApprovalSubmit.ts | 807 | PC 상신 로직: approvals/leave_requests insert, 알림, 문서보관함 동기화 | 비대(분리권고) |
| app/main/기능부품/전자결재서부/useApprovalComposeDraft.ts | 602 | PC 초안저장/복구 로직, 라우팅, 뷰전환 관리 | 정상 |
| app/main/기능부품/전자결재서부/useApprovalActions.ts | 337 | 승인/반늄/회수 액션 핸들러 (권한검증, 트랜잭션) | 정상 |
| app/main/기능부품/전자결재서부/useApprovalBulkActions.ts | 205 | 일괄 승인/반뉴 액션 (선택된 항목 처리) | 정상 |
| app/main/기능부품/전자결재서부/useApprovalRouting.ts | 228 | 결재선 라우팅 (위임, 지연, 락 처리) | 정상 |
| app/main/기능부품/전자결재서부/ApprovalMetaPanels.tsx | 729 | 메타데이터 표시 패널 (연차요약, 비품수량, 출결정정사유) | 비대(분리권고) |
| app/main/기능부품/전자결재서부/ApprovalLineTimeline.tsx | 348 | 결재 진행 타임라인 (결재이력 시간화) | 정상 |
| app/main/기능부품/전자결재서부/ApprovalFlowCard.tsx | 422 | 결재 흐름 카드 (현재결재자, 대기, 승인/반늄) | 정상 |
| app/main/기능부품/전자결재서부/ApprovalInboxColumns.tsx | 223 | 테이블 컬럼 정의 (DataTable columns schema) | 정상 |
| app/main/기능부품/전자결재서부/ApprovalWorkflowKpi.tsx | 140 | KPI 표시 (평균승인시간, 처리율) | 정상 |
| app/main/기능부품/전자결재서부/approval-constants.ts | 0 | 상수정의 (APPROVAL_VIEWS, APPROVER_POSITIONS, 양식정의) | 정상 |
| app/main/기능부품/전자결재서부/approval-print-utils.tsx | 451 | 인쇄 HTML 생성 (결재 문서 인쇄레이아웃) | 정상 |
| app/main/기능부품/전자결재서부/양식신청.tsx | 275 | 증명서발급 양식신청 (직급순정렬, 용도, 긴급도) | 정상 |
| app/main/기능부품/전자결재서부/양식빌댔.tsx | 11 | 양식관리 래퍼 (관리자전용서부의 전자결재양식관리로 위임) | 데드의심 |
| app/main/기능부품/전자결재서부/비품구매양식.tsx | 177 | 비품구매 양식 (PC: EditableGrid, 모바일: 카드, 재고연동) | 정상 |
| app/main/기능부품/전자결재서부/비품구매양식Grid.tsx | 361 | EditableGrid 기반 비품 테이블 (PC 스프레드시트) | 정상 |
| app/main/기능부품/전자결재서부/SuppliesMobileCard.tsx | 149 | 비품구매양식 모바일 한 행 카드 (비품구매양식에서 import) | 정상 |
| app/main/기능부품/전자결재서부/SuppliesSummary.tsx | 218 | 비품 요약 (총수량, 금액합계, 카테고리분류) | 정상 |
| app/main/기능부품/전자결재서부/SuppliesContextBar.tsx | 115 | 비품 컨텍스트바 (필터, 검색, 인쇄) | 정상 |
| app/main/기능부품/전자결재서부/SuppliesStatPicker.tsx | 145 | 비품 상태 피커 (부서별필터, 카테고리필터) | 정상 |
| app/main/기능부품/전자결재서부/supplies-helpers.ts | 164 | 비품 헬퍼함수 (유효성검증, 데이터정규화) | 정상 |
| app/main/기능부품/전자결재서부/useSuppliesForm.ts | 491 | 비품양식 훅 (툦 추가/제거, 검색, 선택) | 정상 |
| app/main/기능부품/전자결재서부/공문발송양식.tsx | 226 | 공문발송 양식 (수신자, 발송내용) | 정상 |
| app/main/기능부품/전자결재서부/관리행정양식.tsx | 229 | 관리행정 양식 (사건유형, 내용) | 정상 |
| app/main/기능부품/전자결재서부/근태신청양식.tsx | 486 | 근태신청 양식 (신청유형: 지각/조퇴/반차) | 정상 |
| app/main/기능부품/전자결재서부/연차사용계획서양식.tsx | 145 | 연차계획서 양식 (연차기간지정) | 정상 |
| app/main/기능부품/전자결재서부/수리요청서양식.tsx | 109 | 수리요청 양식 (시설명, 고장사항, 수리내용) | 정상 |
| app/main/기능부품/전자결재서부/직원평가양식.tsx | 433 | 직원평가 양식 (평가항목, 등급) | 정상 |
| app/main/기능부품/전자결재서부/출결정정양식.tsx | 712 | 출결정정 양식 (날짜/시간 정정, 사유, 증빙) | 비대(분리권고) |
| app/main/기능부품/전자결재서부/ReportApprovalForm.tsx | 430 | 리포트 기반 승인 양식 (주간리포트, 월간리포트) | 정상 |
| app/main/기능부품/전자결재서부/WorkflowBoard.tsx | 319 | 결재 워크플로우 보드 (칸반뷰) | 정상 |
| app/main/기능부품/전자결재서부/ApprovalRiskReviewDialog.tsx | 262 | 리스크 검토 다이얼로그 (위험도판단, 추가결재선) | 정상 |
| app/main/모바일/결재/연차신청폼.tsx | 389 | 모바일 연차신청 인라인 양식 (useApprovalFormBase 사용) | 정상 |
| app/main/모바일/결재/일반기안폼.tsx | 249 | 모바일 일반기안 범용 양식 (useApprovalFormBase 사용) | 정상 |
| app/main/모바일/결재/연장근무폼.tsx | 287 | 모바일 연장근무 양식 (useApproverLine+submitApprovalDraft) | 정상 |
| app/main/모바일/결재/연차계획폼.tsx | 196 | 모바일 연차계획 양식 (useApproverLine+submitApprovalDraft) | 정상 |
| app/main/모바일/결재/useApprovalFormBase.ts | 268 | 모바일 공통훅: 연차신청+일반기안 (결재선매핀, 상신, 첨부) | 정상 |
| app/main/모바일/결재/useApproverLine.ts | 95 | 모바일 결재선훅: 연장근무+연차계획 (자동매핑, 수동변경) | 정상 |
| app/main/모바일/결재/ApproverLineSection.tsx | 119 | 모바일 결재선UI: 연장근무+연차계획 (카드표시, 변경버튼) | 정상 |
| app/main/모바일/결재/기안상신.ts | 163 | submitApprovalDraft 함수: 연장근무+연차계획+일반 상신공통로직 | 정상 |
| app/main/모바일/결재/결재선피커.tsx | 478 | 모달 결재선선택 (직급순정렬, 다중선택) | 정상 |
| app/main/모바일/결재/AttachmentPicker.tsx | 340 | 첨부파일선택 (업로드, 삭제, 오프라인큐) | 정상 |
| app/main/모바일/결재/data-hooks.ts | 345 | 모바일 데이터훅 (문서번호생성, 원장조회) | 정상 |
| app/main/모바일/결재/결재함.tsx | 359 | 모바일 결재함 (대기→승인/반놄, 직급순정렬) | 정상 |
| app/main/모바일/결재/기안함.tsx | 203 | 모바일 기안함 (본인기안조회, 회수) | 정상 |
| app/main/모바일/결재/작성하기.tsx | 112 | 모바일 작성하기 라우터 (양식선택) | 정상 |
| app/main/모바일/결재/결재상세.tsx | 803 | 모바일 상세조회 (결재이력, 승인/반놄/회수 액션, 메타표시) | 비대(분리권고) |
| app/main/모바일/결재/결재함-cards.tsx | 220 | 결재함 카드 행 렌더 (우선도, 상태, 회사표시) | 정상 |
| app/main/모바일/결재/참조함.tsx | 193 | 모바일 참조함 (CC대상 문서, 읽음처리) | 정상 |
| app/main/모바일/결재/문서조회.tsx | 278 | 모바일 문서조회 (전체조회, 필터, 검색) | 정상 |
| app/main/모바일/결재/필터시트.tsx | 281 | 모바일 필터시트 (상태, 문서유형, 기간) | 정상 |
| app/main/모바일/결재/첨부카드.tsx | 166 | 첨부파일 카드 표시 | 정상 |
| app/main/모바일/결재/달력선택.tsx | 117 | 연차계획 다중날짜달력 선택 | 정상 |
| app/main/모바일/결재/index.tsx | 211 | 모바일 결재 메인 라우터 | 정상 |
| app/api/approval/recall/route.ts | 141 | 기안회수 API (sender검증, status→회수, 이력append) | 정상 |
| app/api/approval/upload/route.ts | 108 | 첨부파일업로드 API | 정상 |
| app/api/approvals/process-final/route.ts | 134 | 최종결재처리 API (모든대기제거, 상태→승인) | 정상 |
| app/api/approvals/transition/route.ts | 54 | 결재상태전환 API (다음결재자activate) | 정상 |
| app/api/approvals/upload/route.ts | 114 | 첨부파일업로드 API (approvals용) | 정상 |

검증된 후보:

- `app/main/기능부품/전자결재서브/양식빌더.tsx` — **✅ 살아있음** — Dynamic import at D:/newmso/app/main/기능부품/관리자전용.tsx:52 with active render at line 347: {activeTab === '문서양식' && <FormBuilder />}. Routed through 조직도본문.tsx AdminView when mainMenu === '관리자'. Menu alias in admin-menu-config.ts:107 maps '양식빌더' -> '문서양식'.

## 재고관리 (34개 파일)

| 경로 | 줄수 | 역할 | 판정 |
|---|---|---|---|
| app/main/기능부품/재고관리통합.tsx |  | 워크센터 통합 라우터. 초기뷰 id(status/io/item/analyze)를 받아 해당 워크센터 컴포넌트를 동적 로드. | 정상 |
| app/main/기능부품/재고관리서브/types.ts |  | 레거시·공통 타입: INVENTORY_VIEWS, LEGACY_VIEWS, IntegratedInventoryProps 정의. | 정상 |
| app/main/기능부품/재고관리서브/UDI관리.tsx |  | 의료기기 UDI 공급내역 보고서 생성(CSV). 레거시 서브 화면. | 정상 |
| app/main/기능부품/재고관리서브/물품등록.tsx |  | 물품 등록 폼. 레거시 서브 화면. ItemWorkcenter 모달로 dynamic import됨. | 정상 |
| app/main/기능부품/재고관리서브/발주관리.tsx |  | 구매발주 관리. 레거시 서브 화면. IOWorkcenter/StatusSubViews 모달로 dynamic import됨. | 정상 |
| app/main/기능부품/재고관리서브/자산QR관리.tsx |  | QR 자산 대여 관리. 레거시 서브 화면. ItemWorkcenter 모달로 dynamic import됨. | 정상 |
| app/main/기능부품/재고관리서브/재고실사.tsx |  | 실사 수량 입력 폼. 레거시 서브 화면. AnalyzeWorkcenter 모달로 dynamic import됨. | 정상 |
| app/main/기능부품/재고관리워크센터/index.ts |  | 워크센터 라우팅 진입점. dynamic import로 4개 워크센터 분리. STOCK_WORKCENTER_MAP. | 정상 |
| app/main/기능부품/재고관리워크센터/AnalyzeWorkcenter.tsx |  | 4번째 워크센터: ABC분석·수요예측·실사·월마감·소모품통계·AS반품 통합. | 정상 |
| app/main/기능부품/재고관리워크센터/IOWorkcenter.tsx |  | 2번째 워크센터: 입출고·발주·거래처·명세서·납품확인서 통합. | 정상 |
| app/main/기능부품/재고관리워크센터/ItemWorkcenter.tsx |  | 3번째 워크센터: 물품·카테고리·자산·QR·UDI 통합. | 정상 |
| app/main/기능부품/재고관리워크센터/StatusWorkcenter.tsx |  | 1번째 워크센터(★): 재고현황·내부서재고·알림·유효기간 통합. | 정상 |
| app/main/기능부품/재고관리워크센터/StatusSubViews.tsx |  | StatusWorkcenter 보조 뷰. 발주관리 모달 래퍼. 500줄 규율 준수. | 정상 |
| app/main/기능부품/재고관리워크센터/stock-types.ts |  | 공통 타입/상수: StockWorkcenterId, STOCK_WORKCENTER_META, LEGACY_TO_WORKCENTER 매핑. | 정상 |
| app/main/기능부품/재고관리워크센터/data-helpers.ts |  | 공통 데이터 헬퍼: asString, pickString, pickNumber, toMonthString 등 안전 추출. | 정상 |
| app/main/기능부품/재고관리워크센터/stock-workcenter-common.tsx |  | 공통 UI 컴포넌트: KpiRow, StockChip, StockTabs, WorkcenterNotes 등 4워크센터 공유. | 정상 |
| app/main/기능부품/재고관리워크센터/stock-workcenter-data.ts |  | 훅 barrel export. useStatusData/useIOData/useItemData/useAnalyzeData 재export. | 정상 |
| app/main/기능부품/재고관리워크센터/use-status-data.ts |  | status 워크센터 Supabase fetch 훅. inventory 기반 KPI·행·부서사용량. | 정상 |
| app/main/기능부품/재고관리워크센터/use-io-data.ts |  | io 워크센터 Supabase fetch 훅. inventory_logs·purchase_orders·suppliers 데이터. | 정상 |
| app/main/기능부품/재고관리워크센터/use-item-data.ts |  | item 워크센터 Supabase fetch 훅. inventory·inventory_categories 기반 카탈로그·카테고리·자산·UDI. | 정상 |
| app/main/기능부품/재고관리워크센터/use-analyze-data.ts |  | analyze 워크센터 Supabase fetch 훅. ABC분류·수요예측·실사·월마감 데이터. | 정상 |
| app/main/모바일/재고/index.tsx |  | 모바일 재고관리 라우터·허브. 4개 메뉴 카드 + 3개 폼 분기. | 정상 |
| app/main/모바일/재고/data-hooks.ts |  | 모바일 데이터 훅 어댑터. PC use-*-data.ts 재export + toMTone/useShortageTop 추가. | 정상 |
| app/main/모바일/재고/재고현황.tsx |  | 모바일 재고현황. 카테고리 필터 칩바 + 부족 알람 카드 + 현황 리스트. | 정상 |
| app/main/모바일/재고/입출고.tsx |  | 모바일 입출고·발주. 5개 탭: 입출고·발주·거래처·명세서·이력. | 정상 |
| app/main/모바일/재고/입출고-form.tsx |  | 모바일 입출고 기록 폼 + KPI 카드. 120줄 분리 컴포넌트. | 정상 |
| app/main/모바일/재고/물품자산.tsx |  | 모바일 물품·자산. 4개 탭: 물품카탈로그·카테고리·자산·UDI. | 정상 |
| app/main/모바일/재고/물품등록.tsx |  | 모바일 물품 등록 폼. 사진/QR 스캔 + 필드 검증 + Supabase insert. | 정상 |
| app/main/모바일/재고/자산등록.tsx |  | 모바일 자산 등록 폼(QR 진입). 스캔 hero + 자산 필드들. | 정상 |
| app/main/모바일/재고/발주등록.tsx |  | 모바일 발주 등록 폼. 거래처 카드 + 품목 리스트 + 결재 올림. | 정상 |
| app/main/모바일/재고/분석마감.tsx |  | 모바일 분석·마감. 6개 탭: ABC·수요예측·실사·월마감·소모품통계·AS반품. | 정상 |
| app/api/inventory/stock-consume/route.ts |  | 부서 소모 API. D1 배치 트랜잭션: 수량 차감 + 로그 기록 원자적. | 정상 |
| app/api/inventory/stock-transfer/route.ts |  | 재고 이관 API. D1 배치: 출발지 차감 + 목적지 증가(신규 생성 포함) + 이력·로그. | 정상 |
| app/api/inventory/stock-update/route.ts |  | 재고 수량 증감 API. D1 원자적 업데이트. atomicStockUpdate 래퍼. | 정상 |

검증된 후보:

- `app/main/기능부품/재고관리서브` — **✅ 살아있음** — 6 dynamic imports found: ItemWorkcenter.tsx:43 (물품등록), ItemWorkcenter.tsx:48 (자산QR관리), ItemWorkcenter.tsx:53 (UDI관리), IOWorkcenter.tsx:33 (발주관리), StatusSubViews.tsx:20 (발주관리), AnalyzeWorkcenter.tsx:35 (재고실사). Plus 2 static type imports from types.ts. All accessed through 4 workcenter components (status/io/item/analyze) that render legacy components as modal overlays during progressive migration.

## 관리자 (110개 파일)

| 경로 | 줄수 | 역할 | 판정 |
|---|---|---|---|
| app/main/기능부품/관리자전용.tsx | 332 | 관리자 메뉴 라우터 및 권한 게이팅 (한글 id & 워크센터 id 이원화) | 정상 |
| app/main/기능부품/권한요청모달.tsx | 167 | 알림·GPS 권한 요청 모달 | 정상 |
| app/main/기능부품/관리자워크센터/index.ts | 58 | 워크센터 라우터: 영문 id → 컴포넌트 매핑 | 정상 |
| app/main/기능부품/관리자워크센터/admin-types.ts | 124 | 워크센터 타입 | 정상 |
| app/main/기능부품/관리자워크센터/admin-workcenter-common.tsx | 204 | 워크센터 공용 UI | 정상 |
| app/main/기능부품/관리자워크센터/ExecDashboard.tsx | 281 | 경영 대시보드 (exec 워크센터) | 정상 |
| app/main/기능부품/관리자워크센터/CompanyWorkcenter.tsx | 56 | 회사 관리 워크센터 | 정상 |
| app/main/기능부품/관리자워크센터/RolesWorkcenter.tsx | 38 | 권한 관리 워크센터 | 정상 |
| app/main/기능부품/관리자워크센터/OpsWorkcenter.tsx | 141 | 운영 설정 워크센터 | 정상 |
| app/main/기능부품/관리자워크센터/FormsWorkcenter.tsx | 119 | 결재 양식 워크센터 | 정상 |
| app/main/기능부품/관리자워크센터/AuditWorkcenter.tsx | 252 | 감사·백업 워크센터 | 정상 |
| app/main/기능부품/관리자워크센터/CompanyWorkcenter/CompanyBasicTab.tsx | 516 | 회사 기본정보 탭 | 정상 |
| app/main/기능부품/관리자워크센터/CompanyWorkcenter/CompanyCardTab.tsx | 379 | 카드사 인터페이스 탭 | 정상 |
| app/main/기능부품/관리자워크센터/CompanyWorkcenter/CompanyDocsTab.tsx | 372 | 문서·계약 관리 탭 | 정상 |
| app/main/기능부품/관리자워크센터/CompanyWorkcenter/CompanyLeaveTab.tsx | 440 | 연차정책 탭 | 정상 |
| app/main/기능부품/관리자워크센터/CompanyWorkcenter/CompanyPayrollTab.tsx | 258 | 급여기준 탭 | 정상 |
| app/main/기능부품/관리자워크센터/CompanyWorkcenter/CompanyTemplateTab.tsx | 148 | 템플릿 탭 | 정상 |
| app/main/기능부품/관리자워크센터/CompanyWorkcenter/fallback-data.ts | 95 | 데이터 폴백 | 정상 |
| app/main/기능부품/관리자워크센터/CompanyWorkcenter/types.ts | 65 | 타입 정의 | 정상 |
| app/main/기능부품/관리자워크센터/OpsWorkcenter/IntegrationsTab.tsx | 178 | 통합연동 탭 | 정상 |
| app/main/기능부품/관리자워크센터/OpsWorkcenter/IntegrationCard.tsx | 103 | 카드 컴포넌트 | 정상 |
| app/main/기능부품/관리자워크센터/OpsWorkcenter/MessageTemplatesTab.tsx | 603 | 메시지 자동화 탭 | 정상 |
| app/main/기능부품/관리자워크센터/OpsWorkcenter/MessageTemplateCard.tsx | 111 | 메시지 카드 | 정상 |
| app/main/기능부품/관리자워크센터/AuditWorkcenter/AuditAnomalyTab.tsx | 113 | 이상치 감지 탭 | 정상 |
| app/main/기능부품/관리자워크센터/AuditWorkcenter/AuditBackupTab.tsx | 223 | 백업·복원 탭 | 정상 |
| app/main/기능부품/관리자워크센터/AuditWorkcenter/AuditPayrollOutlierTab.tsx | 104 | 급여 아웃라이어 탭 | 정상 |
| app/main/기능부품/관리자워크센터/AuditWorkcenter/types.ts | 47 | 타입 | 정상 |
| app/main/기능부품/관리자워크센터/AuditWorkcenter/fallback.ts | 22 | 데이터 폴백 | 정상 |
| app/main/기능부품/관리자전용서브/경영대시보드.tsx | 160 | 경영 대시보드 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/재무대시보드.tsx | 116 | 재무 대시보드 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/예산관리.tsx | 515 | 예산 관리 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/통합보고서.tsx | 401 | 통합 보고서 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/법인손익현황.tsx | 233 | 법인 손익 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/커스텀대시보드.tsx | 190 | 커스텀 대시보드 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/회사관리.tsx | 580 | 회사 관리 레거시 | 레거시의심 |
| app/main/기능부품/관리자전용서브/팀관리.tsx | 387 | 팀 관리 | 정상 |
| app/main/기능부품/관리자전용서브/직원권한통합.tsx | 864 | 직원권한 통합 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/직원권한통합/permission-review.ts | 115 | 권한 리뷰 유틸 | 정상 |
| app/main/기능부품/관리자전용서브/직원권한통합/PermissionDiffPanel.tsx | 103 | 권한 차이 패널 | 정상 |
| app/main/기능부품/관리자전용서브/직원권통합/style-utils.ts | 43 | UI 유틸 | 정상 |
| app/main/기능부품/관리자전용서브/직원권한통합/types.ts | 25 | 타입 | 정상 |
| app/main/기능부품/관리자전용서브/감사로그뷰어.tsx | 178 | 감사로그 뷰어 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/접근감사로그.tsx | 217 | 접근감사로그 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/급여이상치감지.tsx | 436 | 이상치 감지 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/데이터백업.tsx | 741 | 데이터 백업 레거시 | 데드의심 |
| app/main/기능부품/관리자전용서브/데이터초기화.tsx | 434 | 데이터 초기화 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/알림자동화설정.tsx | 483 | 알림 자동화 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/수술검사템플릿관리.tsx | 337 | 수술검사 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/시스템마스터센터.tsx | 683 | 시스템마스터센터 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/시스템마스터센터-modules/OverviewPanel.tsx | 100 | 개요 패널 | 정상 |
| app/main/기능부품/관리자전용서브/시스템마스터센터-modules/AuditPanel.tsx | 87 | 감사 패널 | 정상 |
| app/main/기능부품/관리자전용서브/시스템마스터센터-modules/IntegrityPanel.tsx | 61 | 무결성 패널 | 정상 |
| app/main/기능부품/관리자전용서브/시스템마스터센터-modules/OperationsPanel.tsx | 228 | 운영 패널 | 정상 |
| app/main/기능부품/관리자전용서브/시스템마스터센터-modules/ChatsPanel.tsx | 272 | 채팅 패널 | 정상 |
| app/main/기능부품/관리자전용서브/시스템마스터센터-modules/RecoveryPanel.tsx | 80 | 복구 패널 | 정상 |
| app/main/기능부품/관리자전용서브/시스템마스터센터-modules/BannedWordModal.tsx | 87 | 금지어 모달 | 정상 |
| app/main/기능부품/관리자전용서브/시스템마스터센터-modules/PermissionDiffPanel.tsx | 75 | 권한 차이 패널 | 중복의심 |
| app/main/기능부품/관리자전용서브/시스템마스터센터-modules/types.ts | 200 | 타입 | 정상 |
| app/main/기능부품/관리자전용서브/시스템마스터센터-modules/utils.ts | 61 | 유틸 | 정상 |
| app/main/기능부품/관리자전용서브/시스템마스터센터-modules/constants.ts | 13 | 상수 | 정상 |
| app/main/기능부품/관리자전용서브/연차수동부여.tsx | 294 | 연차 수동부여 | 정상 |
| app/main/기능부품/관리자전용서브/연차수동부여Grid.tsx | 215 | 연차 그리드 | 정상 |
| app/main/기능부품/관리자전용서브/근태차감규칙설정.tsx | 134 | 근태 차감 규칙 | 정상 |
| app/main/기능부품/관리자전용서브/계약관리도구.tsx | 314 | 계약 관리 도구 | 정상 |
| app/main/기능부품/관리자전용서브/전자결재양식관리.tsx | 782 | 전자결재 양식 관리 레거시 | 데드의심 |
| app/main/기능부품/관리자전용서브/전자결재양식관리/design-utils.ts | 146 | 디자인 유틸 | 정상 |
| app/main/기능부품/관리자전용서브/전자결재양식관리/DocumentPreviewCanvas.tsx | 144 | 프리뷰 캔버스 | 정상 |
| app/main/기능부품/관리자전용서브/전자결재양식관리/preview-builder.ts | 338 | 미리보기 빌더 | 정상 |
| app/main/기능부품/관리자전용서브/전자결재양식관리/store-utils.ts | 125 | 스토어 유틸 | 정상 |
| app/main/기능부품/관리자전용서브/전자결재양식관리/types.ts | 59 | 타입 | 정상 |
| app/main/기능부품/관리자전용서브/팝업창관리자.tsx | 402 | 팝업창 관리 레거시 | 정상 |
| app/main/기능부품/관리자전용서브/charts/BudgetBarChart.tsx | 49 | 차트 | 정상 |
| app/main/기능부품/관리자전용서브/charts/ReportCharts.tsx | 140 | 차트 | 정상 |
| app/main/기능부품/관리자전용서브/경영분석/모바일대시보드.tsx | 145 | 모바일 버전 | 정상 |
| app/main/모바일/관리자/index.tsx | 198 | 모바일 메뉴 | 정상 |
| app/main/모바일/관리자/경영대시.tsx | 19 | 모바일 스텁 | 정상 |
| app/main/모바일/관리자/회사관리.tsx | 18 | 모바일 스텁 | 정상 |
| app/main/모바일/관리자/권한관리.tsx | 18 | 모바일 스텁 | 정상 |
| app/main/모바일/관리자/운영설정.tsx | 18 | 모바일 스텁 | 정상 |
| app/main/모바일/관리자/결재양식.tsx | 18 | 모바일 스텁 | 정상 |
| app/main/모바일/관리자/감사백업.tsx | 19 | 모바일 스텁 | 정상 |
| app/main/모바일/관리자/시스템마스터.tsx | 20 | 모바일 스텁 | 정상 |
| app/api/admin/annual-leave/manual-grant/route.ts | 304 | 연차수동부여 API | 정상 |
| app/api/admin/annual-leave/sync/route.ts | 18 | 동기화 API | 정상 |
| app/api/admin/audit/_shared.ts | 311 | 공용 유틸 | 정상 |
| app/api/admin/audit/summary/route.ts | 140 | 요약 API | 정상 |
| app/api/admin/audit/anomalies/route.ts | 29 | 이상치 API | 정상 |
| app/api/admin/audit/backups/route.ts | 144 | 목록 API | 정상 |
| app/api/admin/audit/backups/restore/route.ts | 7 | 복원 API | 정상 |
| app/api/admin/audit/payroll-outliers/route.ts | 29 | 아웃라이어 API | 정상 |
| app/api/admin/audit/restore/route.ts | 56 | 복원 API | 정상 |
| app/api/admin/data-reset/route.ts | 157 | 초기화 API | 정상 |
| app/api/admin/force-logout/route.ts | 119 | 로그아웃 API | 정상 |
| app/api/admin/notifications/push-health/route.ts | 106 | 헬스 체크 API | 정상 |
| app/api/admin/popups/delete/route.ts | 108 | 삭제 API | 정상 |
| app/api/admin/popups/upload/route.ts | 114 | 업로드 API | 정상 |
| app/api/admin/reset-staff/route.ts | 260 | 초기화 API | 정상 |
| app/api/admin/seal/upload/route.ts | 65 | 도장 API | 정상 |
| app/api/admin/staff-password/route.ts | 119 | 비밀번호 API | 정상 |
| app/api/admin/staff-permission/route.ts | 152 | 권한 API | 정상 |
| app/api/admin/system-master/route.ts | 98 | 라우터 | 정상 |
| app/api/admin/system-master/_shared.ts | 565 | 공용 로직 | 정상 |
| app/api/admin/system-master/handlers/overview.ts | 122 | 핸들러 | 정상 |
| app/api/admin/system-master/handlers/audit.ts | 72 | 핸들러 | 정상 |
| app/api/admin/system-master/handlers/integrity.ts | 68 | 핸들러 | 정상 |
| app/api/admin/system-master/handlers/operations.ts | 239 | 핸들러 | 정상 |
| app/api/admin/system-master/handlers/chats.ts | 115 | 핸들러 | 정상 |
| app/api/admin/system-master/handlers/delete-chat.ts | 106 | 핸들러 | 정상 |
| app/api/admin/system-master/handlers/actions.ts | 33 | 핸들러 | 정상 |
| app/api/admin/verify-unlock/route.ts | 39 | 검증 API | 정상 |

검증된 후보:

- `app/main/기능부품/관리자전용서브/회사관리.tsx` — **✅ 살아있음** — /d/newmso/app/main/기능부품/관리자전용.tsx:49 - const CompanyManager = dynamic(() => import('./관리자전용서브/회사관리'), { ssr: false, loading: AdminSubViewLoading })
- `app/main/기능부품/관리자전용서브/데이터백업.tsx` — **✅ 살아있음** — /d/newmso/app/main/기능부품/관리자전용.tsx:46 - const DataBackup = dynamic(() => import('./관리자전용서브/데이터백업'), { ssr: false, loading: AdminSubViewLoading })
- `app/main/기능부품/관리자전용서브/전자결재양식관리.tsx` — **✅ 살아있음** — /d/newmso/app/main/기능부품/관리자워크센터/FormsWorkcenter.tsx:24-26 - const ApprovalFormTypesManager = dynamic(() => import('../관리자전용서브/전자결재양식관리'), { ssr: false, loading: Loading })
- `app/main/기능부품/관리자전용서브/시스템마스터센터-modules/PermissionDiffPanel.tsx` — **✅ 중복아님** — /d/newmso/app/main/기능부품/관리자전용서브/시스템마스터센터.tsx:43 - import { PermissionDiffPanel } from './시스템마스터센터-modules/PermissionDiffPanel'. 직원권한통합/PermissionDiffPanel와는 완전히 다른 컴포넌트: 시스템마스터센터 버전은 권한감사로그 조회UI(auditKeyword, permissionDiffLogs props), 직원권한통합 버전은 권한변경리뷰 표시(review, mode props). 두 버전 모두 각자 다른 곳에서 사용 중.

