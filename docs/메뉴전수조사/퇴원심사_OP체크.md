# 메뉴 전수조사 보고서 — 퇴원심사 & OP체크

## A. 퇴원심사

> 조사 대상: `app/main/기능부품/퇴원심사.tsx`(1220줄) + `퇴원심사/공통.ts` + `퇴원심사규정패널.tsx` + `퇴원심사규정빌더.tsx` + `lib/discharge-review-rules.ts` + `lib/discharge-custom-rules.ts`

### 1. 개요
환자 퇴원 심사(진료비 적정성 검토)를 AI 규칙 기반으로 수행하는 메뉴. 차트 데이터 파싱 → 규칙 분석 → 체크리스트 → 승인/반려.

### 2. 주요 기능
- **차트 파싱**: `parseChartData`가 탭 구분 차트 데이터를 파싱(코드/항목명/카테고리/금액).
- **규칙 분석**: `analyzeDischargeReviewRules`(lib)로 퇴원심사 규칙 기반 AI 분석.
- **커스텀 규칙**: `loadDischargeCustomRules`/`saveDischargeCustomRules`(localStorage)로 회사별 커스텀 규칙 관리.
- **상태 체계**: `퇴원심사/공통.ts`가 pending/in_progress/review_requested/rejected/approved 5단계 + 레거시 별칭 정규화.
- **재원일수**: `stayDays` 계산(입원~퇴원 ceil).

### 3. 문제점/리스크
- 🟡 `퇴원심사.tsx` 1220줄 단일 파일 (리스트/작성/템플릿/규칙빌더 모두 내장).
- 🟡 `user: any` 타입 사용.
- 🟡 차트 파싱이 인덱스 기반(`cols[0]`, `cols[2]`, `cols[7]` 등)이라 원본 차트 포맷 변경에 취약.

### 4. 연계 지점
- 퇴원심사 규정 → `lib/discharge-review-rules`(AI 분석)
- 상태 체계 → 모바일(추가기능)과 SSOT 공유

## B. OP체크 (수술 체크리스트)

> 조사 대상: `app/main/기능부품/OP체크.tsx` + `OP체크/`(8개 파일)

### 1. 개요
수술 환자의 준비·소모품 체크리스트 관리. 수술 일정(게시판 board_posts 연계) 기반으로 환자별 체크리스트 생성, 병동 메시지 발송.

### 2. 주요 기능
- **일정 연계**: 게시판 수술일정(board_posts)을 OP체크로 가져와 체크리스트 생성.
- **메타 인코딩**: `[[SCHEDULE_META]]`/`[[WARD_MESSAGE_META]]` 블록으로 일정/병동 메시지 메타 인코딩 (채팅·게시판과 동일 패턴).
- **템플릿 관리**: `TemplateManagerPanel` + `op_check_templates` 테이블. 수술명/마취/준비물/소모품 템플릿.
- **환자 체크**: `op_patient_checks` 테이블, 상태(준비중/준비완료/수술중/완료).
- **출력**: `PrintModal` 인쇄, `WardMessageDialog` 병동 메시지.

### 3. 문제점/리스크
- 🟡 메타를 문자열 블록으로 content에 인코딩 (채팅/게시판과 동일 패턴, 파싱 취약).
- 🟡 `constants.ts`에 `MIGRATION_FILE` 상수 하드코딩 (마이그레이션 파일 경로 잔재).

### 4. 연계 지점
- 수술 일정 → 게시판 board_posts
- 병동 메시지 → 채팅(WARD_MESSAGE_META)
- 템플릿 → 관리자 수술검사템플릿관리
