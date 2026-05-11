# Backend Impact Analysis — Phase 3 신규 화면 vs 기존 API

작성일: 2026-05-11  
범위: `app/api/` 전체 47개 엔드포인트 × Phase 3 그룹 8개

---

## 1. API 엔드포인트 전수 목록 (47개)

### 1-1. 인증 / 세션 (4개)
- `POST /api/auth/change-password`
- `GET /api/auth/session`
- `POST /api/auth/verify-password`
- `POST /api/auth/master-login`

### 1-2. 관리자 (6개)
- `DELETE /api/admin/popups/delete`
- `POST /api/admin/reset-staff`
- `PATCH /api/admin/staff-password`
- `POST /api/admin/verify-unlock`
- `POST /api/admin/popups/upload`
- `GET /api/admin/system-master`
- `GET /api/admin/notifications/push-health`
- `POST/PATCH/DELETE /api/admin/annual-leave/manual-grant`

### 1-3. 결재 (3개)
- `POST /api/approvals/upload` — 첨부 파일 업로드 (Supabase / R2)
- `POST /api/approvals/process-final` — 최종 결재 처리
- `POST /api/approvals/transition` — 결재 상태 전환

### 1-4. AI (2개)
- `POST /api/discharge-review` — Gemini 퇴원심사 분석
- `POST /api/ai/roster-recommendation` — Gemini 근무표 추천

### 1-5. 알림 / 푸시 (7개)
- `GET /api/notifications/push-config` — VAPID 공개키 반환
- `POST/DELETE /api/notifications/push-subscription` — 구독 등록/해제
- `POST /api/notifications/mark-read` — 알림 읽음 처리
- `POST /api/notifications/chat-push` — 채팅 즉시 푸시
- `POST /api/notifications/chat-push-flush` — 채팅 푸시 배치 플러시
- `POST /api/notifications/repush-unread` — 미읽 알림 재발송
- `GET /api/notifications/push-self-test` — 푸시 셀프 테스트

### 1-6. 스토리지 / 다운로드 (3개)
- `GET /api/download` — Supabase/R2 파일 다운로드 프록시
- `GET /api/storage/object` — R2 signed URL 스트리밍 프록시
- `POST /api/chat/upload` — 채팅 첨부 업로드 (R2 우선, Supabase 폴백)
- `POST /api/board/upload` — 게시판 첨부 업로드
- `POST /api/approvals/upload` — 결재 첨부 업로드

### 1-7. 크론 (8개)
- `GET /api/cron/auto-report`
- `GET /api/cron/backup`
- `GET /api/cron/chat-push-dispatch`
- `GET /api/cron/leave-notice-announcements`
- `GET /api/cron/push-subscription-cleanup`
- `GET /api/cron/todo-reminders`
- `GET /api/cron/unread-notification-repush`
- `GET /api/cron/chat-retention`
- `GET /api/cron/annual-leave-expiry`

### 1-8. 기타 (8개)
- `GET /api/weather`
- `GET/POST/PATCH/DELETE /api/payments/virtual-account-deposits`
- `POST /api/payments/virtual-account-webhook`
- `POST /api/roster/approval-request`
- `POST /api/chart-ocr`
- `POST /api/chat/og-preview`
- `POST /api/chat/quick-reply`
- `POST /api/consultation/transcribe`
- `POST /api/extract-invoice`
- `POST /api/todos/reminders/dispatch`

---

## 2. Phase 3 그룹 × API 영향 분석

| API 엔드포인트 | 영향받는 Phase 3 그룹 | 변경 필요? | 위험 | 비고 |
|---|---|---|---|---|
| `POST /api/discharge-review` | ③ 퇴원심사 워크플로우 | **아니오** | 낮음 | 현행 Gemini 2.5-pro/flash 모델, 필드 구조 그대로 사용 가능 |
| `POST /api/approvals/process-final` | ③ 퇴원심사 STEP 3 결재 | **아니오** | 중간 | 퇴원심사 결재선 연동 시 `approvals` 테이블 타입 확인 필요 |
| `POST /api/approvals/transition` | ③ 퇴원심사 결재, ⑥ 관리통찰 결재 | **아니오** | 중간 | `type` 필드에 `discharge_review` 추가 필요 여부 검토 |
| `POST /api/approvals/upload` | ③, ⑥ 첨부 지원 화면 | **아니오** | 낮음 | R2/Supabase 듀얼 스토리지 그대로 활용 |
| `GET /api/download` | ① 급여명세서 PDF, ③ 퇴원심사 결과서 | **아니오** | 낮음 | Supabase signed URL 프록시 그대로 동작 |
| `GET /api/storage/object` | ① 급여 관련 첨부, ⑧ 채팅 첨부 | **아니오** | 낮음 | R2 스트리밍 프록시 — 경로 파라미터 호환 |
| `POST /api/chat/upload` | ⑧ 채팅 통합 | **아니오** | 낮음 | 최대 50MB(일반), 200MB(영상) 제한 유지 |
| `POST /api/chat/quick-reply` | ⑧ 채팅 — 알림 답장 | **아니오** | 낮음 | SW push-notification-shared.js에서 직접 호출 |
| `GET /api/notifications/push-config` | 전체 (PWA 설치 후 VAPID) | **아니오** | 낮음 | 24시간 캐시, 정상 |
| `POST/DELETE /api/notifications/push-subscription` | 전체 (BottomTab 알림 탭) | **아니오** | 낮음 | `push_subscriptions` 테이블 구조 호환 |
| `POST /api/notifications/mark-read` | ⑧ 알림 탭 배지 연동 | **아니오** | 낮음 | SW retry queue에서 호출 |
| `POST /api/notifications/chat-push` | ⑧ 채팅 실시간 푸시 | **아니오** | 낮음 | 현행 FCM + Web Push 듀얼 지원 |
| `POST /api/ai/roster-recommendation` | ④ 근태·근무표 그룹 | **아니오** | 낮음 | Gemini 모델 및 속도제한 로직 현행 유지 |
| `POST /api/roster/approval-request` | ④ 근무표 결재 | **아니오** | 낮음 | `roster_approval_requests` 테이블 + 레거시 폴백 내장 |
| `GET/POST/PATCH/DELETE /api/payments/virtual-account-deposits` | (Phase 3 미포함, 별도 재무 화면) | 해당 없음 | — | |
| `GET /api/cron/*` | 전체 백그라운드 | **아니오** | 낮음 | CRON_SECRET 인증, Phase 3 화면 변경 무관 |
| `POST /api/chart-ocr` | ③ 퇴원심사 — 차트 OCR | **아니오** | 낮음 | 현행 그대로 |
| `POST /api/consultation/transcribe` | ③ 수술상담 연계 | **아니오** | 낮음 | 현행 Whisper API |
| `POST /api/extract-invoice` | ⑥ 관리통찰 / 재고 | **아니오** | 낮음 | 현행 Gemini Vision |
| `POST /api/admin/annual-leave/manual-grant` | ④ 근태 그룹 | **아니오** | 낮음 | |
| `GET /api/cron/annual-leave-expiry` | ④ 근태 그룹 | **아니오** | 낮음 | |
| `GET /api/weather` | ⑧ 내정보 대시보드 위젯 | **아니오** | 낮음 | 공공 API 프록시 |

---

## 3. 신규 API 필요 여부

| 기능 | 필요 신규 API | 우선순위 | 비고 |
|---|---|---|---|
| 급여명세서 PDF 생성 (그룹 ①) | `POST /api/payslip/generate-pdf` | 높음 | 현재 `window.print()` 방식 — 서버사이드 PDF는 옵션 |
| 퇴원심사 결과서 서명/직인 첨부 (그룹 ③) | 없음 (클라이언트 canvas) | — | 직인은 PNG 오버레이로 처리 가능 |
| BottomTab 알림 탭 배지 실시간 카운트 | 없음 (기존 `/api/notifications/mark-read` + Supabase Realtime 활용) | — | |
| 근무표 월별 승인 현황 조회 | `GET /api/roster/approval-status` | 중간 | 현재 클라이언트에서 Supabase 직접 쿼리 |
| 증명서 발급 (재직/경력) | `POST /api/hr/certificate/issue` | 중간 | DB 기록 + PDF 생성 |

---

## 4. Supabase 스키마 영향 (최근 변경 연계)

`board/작업보고서_인사연차근무유형_2026-05-11.md` 기준:

| 테이블 | Phase 3 영향 | 비고 |
|---|---|---|
| `staff_members` | ④ 근태·근무표 | position/role 필드로 결재자 판별 — 구조 변경 없음 |
| `approvals` | ③⑥ 결재 | `type` 컬럼에 `discharge_review` 추가 권장 (현재 `roster_schedule_approval` 존재) |
| `roster_approval_requests` | ④ | 현행 스키마 그대로 사용 |
| `push_subscriptions` | 전체 | `device_id`, `platform`, `user_agent` 컬럼 — 확장 컬럼 지원 여부 런타임 감지 로직 이미 내장 |
| `virtual_account_deposits` | (Phase 3 미포함) | — |
| `notifications` | ⑧ 알림 탭 | `type` 필드 카테고리 확장 필요 (`payroll`, `discharge`, `todo`, `system`) |

---

## 5. AI API 호환성

### Gemini (퇴원심사 + 근무표 추천)
- 모델: `gemini-2.5-pro` (1차), `gemini-2.5-flash` (폴백)
- Phase 3 신규 화면에서 호출 방식 변경 없음
- 퇴원심사 STEP 3 (AI 분석 결과 표시 패널)은 현행 응답 구조 `{ analysis, ruleAnalysis }` 그대로 호환
- 위험: Gemini 무료 쿼터 소진 시 사용자 대면 에러 노출 — 현행 에러 메시지 처리 양호

### Firebase FCM + Web Push (VAPID)
- `sendFcmBatch()` + `sendWebPushNotification()` 듀얼 경로 유지
- Phase 3 BottomTab 알림 탭은 `notifications` 테이블 구독(Supabase Realtime)으로 배지 카운트 처리 — 별도 API 불필요

---

## 6. R2 스토리지 서명 URL

현행 `/api/storage/object` (GET):
- `provider=r2`, `bucket`, `key` 파라미터로 signed URL 생성 후 스트리밍 프록시
- `response-content-disposition` 파라미터 제거됨 (2026-04-04 커밋 `21fff330`)
- Phase 3 채팅 첨부, 결재 첨부 모두 현행 경로 호환

---

## 7. 요약

| 구분 | 수량 |
|---|---|
| 전체 엔드포인트 | 47개 |
| Phase 3 직접 사용 | 22개 |
| 코드 변경 필요 | **0개** (즉시 호환) |
| 주의 관찰 필요 (중간 위험) | **2개** (`approvals/process-final`, `approvals/transition` — `type` 확장 여부) |
| 신규 API 권장 | **3개** (PDF 생성, 승인 현황 조회, 증명서 발급) |
| 신규 API 필수 | **0개** |

> 결론: Phase 3 신규 화면은 기존 API와 **즉시 호환**된다. 추가 API는 증분 개발로 대응 가능하며 Phase 3 v1 출시를 막는 블로커가 없다.
