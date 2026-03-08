# Supabase RLS 감사보고서 (2026-03-08)

## 결론

- 현재 프로젝트는 `브라우저 -> Supabase anon 클라이언트`로 직접 읽기/쓰기를 수행하는 구조입니다.
- 앱 세션은 이제 서버 쿠키로 보호되지만, 이 쿠키는 Supabase PostgREST의 `auth.uid()`와 직접 연결되지 않습니다.
- 따라서 **지금 바로 핵심 테이블에 RLS를 강제 적용하면 앱이 깨지거나, 의미 없는 `USING (true)` 정책만 남는 상태**가 됩니다.
- 즉, 현재 단계의 정답은 `무작정 RLS 활성화`가 아니라 `RLS 준비도 정리 + 스키마 정규화 + 인증 전략 확정`입니다.

## 확인 결과

### 1. 핵심 업무 테이블은 사실상 RLS 미적용

- 기준 파일: [supabase_migrations/00_full_schema_and_migrations.sql](/C:/Users/baek_/newmso/supabase_migrations/00_full_schema_and_migrations.sql)
- 파일 하단에 RLS 관련 문구가 있지만 실제 적용은 주석 상태입니다.
- 확인된 주석:
  - `ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;`
  - `... 각 테이블별 정책 설정`

즉, `staff_members`, `messages`, `chat_rooms`, `notifications`, `board_posts`, `approvals`, `inventory`, `payroll_records` 등 핵심 테이블은 기본적으로 정책 보호를 받지 않는 상태로 봐야 합니다.

### 2. 실제 존재하는 정책 중 일부는 전체 허용

- 기준 파일: [supabase_migrations/20260227_daily_closure.sql](/C:/Users/baek_/newmso/supabase_migrations/20260227_daily_closure.sql)
- `daily_closures`, `daily_closure_items`, `daily_checks`에는 RLS가 켜져 있지만 정책이 `USING (true)`입니다.
- 이 형태는 “RLS가 있다”기보다 “누구나 허용”에 가깝습니다.

### 3. Storage 정책도 public 중심

- 기준 파일:
  - [supabase_migrations/storage_profiles_policies.sql](/C:/Users/baek_/newmso/supabase_migrations/storage_profiles_policies.sql)
  - [supabase_migrations/storage_board_attachments.sql](/C:/Users/baek_/newmso/supabase_migrations/storage_board_attachments.sql)
  - [supabase_migrations/storage_document_pdfs.sql](/C:/Users/baek_/newmso/supabase_migrations/storage_document_pdfs.sql)
- `profiles`, `board-attachments`, `document-pdfs` 관련 정책은 `to public` 또는 public select 구조입니다.
- 프로필/게시판 첨부/문서 PDF가 민감정보를 포함하면 공개 범위를 다시 설계해야 합니다.

## 구조적 한계

### 1. 현재 세션은 Supabase Auth 세션이 아님

- 현재 앱은 자체 서버 세션 쿠키를 사용합니다.
- 하지만 브라우저의 Supabase JS는 `NEXT_PUBLIC_SUPABASE_ANON_KEY`로 직접 PostgREST에 접근합니다.
- 따라서 DB 정책에서 `auth.uid()`를 사용해도 현재 로그인 사용자와 연결되지 않습니다.

### 2. 주요 테이블에 사용자/회사 식별 키가 부족함

대표 예시:

- `staff_members`
  - `company` 텍스트는 있지만 `auth_user_id`가 없음
- `board_posts`
  - `company` 텍스트만 있고 `company_id` 정규화가 약함
- `inventory`
  - `company` 텍스트 기반
- `approvals`
  - `sender_company` 텍스트, 결재선은 `approver_line JSONB`
- `chat_rooms`
  - `members UUID[]`는 있지만 공지방/예외방 처리 일관성이 약함

이 상태에서는 정책을 써도 `회사별`, `직원 본인`, `결재선 참여자`, `부서장` 같은 규칙을 안정적으로 표현하기 어렵습니다.

## 테이블별 준비도

### 바로 RLS 설계가 가능한 편

- `notifications`
  - 기준 컬럼: `user_id`
  - 목표 정책: 본인 알림만 조회/수정
- `push_subscriptions`
  - 기준 컬럼: `staff_id`
  - 목표 정책: 본인 구독만 관리
- `attendance`, `attendances`, `leave_requests`, `payroll_records`
  - 기준 컬럼: `staff_id`
  - 목표 정책: 본인 조회, 관리자/HR 확장

단, 이마저도 `auth.uid() -> staff_members` 연결이 먼저 필요합니다.

### 스키마 보강 후에야 안전하게 가능

- `staff_members`
  - `auth_user_id uuid unique` 필요
- `board_posts`, `posts`, `inventory`, `inventory_logs`
  - `company_id uuid` 표준화 필요
- `approvals`
  - `company_id`, `created_by`, `current_approver_id` 외에 결재선 접근 규칙 정형화 필요
- `messages`, `chat_rooms`
  - 공지방 예외, 멤버십 정책, 숨김방/퇴장 처리 규칙 정리 필요

## 권장 적용 순서

### 1단계. 인증 전략 확정

둘 중 하나를 선택해야 합니다.

- 선택 A: `Supabase Auth` 도입
  - 브라우저 직접 조회/수정이 많은 현재 구조와 가장 잘 맞음
  - `auth.uid()` 기반 RLS 가능
- 선택 B: `브라우저 anon 접근 제거`
  - Next API/Server Action만 DB 접근
  - RLS 의존도는 줄지만 서버 API 전환 작업량이 큼

현재 코드베이스는 A가 더 현실적입니다.

### 2단계. 스키마 정규화

최소 필요 컬럼:

- `staff_members.auth_user_id uuid unique`
- 모든 회사 범위 테이블에 `company_id uuid`
- 주요 변경 테이블에 `created_by`, `updated_by`
- 스토리지 파일 경로에 `company_id/staff_id` 식별 규칙

### 3단계. 1차 RLS 적용

우선순위:

1. `notifications`
2. `push_subscriptions`
3. `attendance`, `leave_requests`
4. `payroll_records`

이 그룹은 “본인 데이터” 중심이라 정책이 가장 단순합니다.

### 4단계. 2차 RLS 적용

우선순위:

1. `chat_rooms`, `messages`
2. `approvals`
3. `board_posts`, `board_post_comments`
4. `inventory`, `inventory_logs`

이 그룹은 회사/부서/결재선/멤버십 규칙이 필요합니다.

## 당장 하면 안 되는 것

- 핵심 테이블 전체에 일괄 `ENABLE ROW LEVEL SECURITY`
- `TO public USING (true)` 형태로 “보호한 척” 하는 정책 추가
- `company` 텍스트 비교만으로 회사 격리를 끝냈다고 판단

## 실제 운영 권고

- 현재 상태는 `내부망/제한적 운영`에는 접근 가능
- `외부 공개 운영` 또는 `병원 전체 실사용` 기준으로는 **Supabase Auth 또는 서버 BFF 전환 전까지 완전 안전하다고 볼 수 없음**

## 다음 작업 제안

1. `staff_members`에 `auth_user_id` 추가
2. 로그인 흐름을 `Supabase Auth`와 연결
3. `notifications`, `push_subscriptions`, `payroll_records`부터 RLS 적용
4. 그 다음 `chat`, `approval`, `inventory`, `board` 순으로 확장
