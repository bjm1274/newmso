# Supabase RLS 1차 적용 가이드

이번 단계는 `세션 쿠키 -> Supabase JWT 브리지`를 먼저 붙이고, 개인/회사 범위가 비교적 명확한 테이블만 RLS로 잠그는 단계입니다.

## 선행 조건

- `SESSION_SECRET` 설정
- `SUPABASE_SERVICE_ROLE_KEY` 설정
- `SUPABASE_JWT_SECRET` 설정

`SUPABASE_JWT_SECRET`가 비어 있으면 앱은 기존처럼 anon key로만 동작하고, 이번 RLS 정책을 켜면 정상 동작하지 않습니다.

## 이번에 추가된 파일

- [20260308_auth_company_foundation.sql](/C:/Users/baek_/newmso/supabase_migrations/20260308_auth_company_foundation.sql)
- [20260308_phase1_rls_personal_scope.sql](/C:/Users/baek_/newmso/supabase_migrations/20260308_phase1_rls_personal_scope.sql)

## 적용 순서

1. `20260308_auth_company_foundation.sql` 실행
2. 앱 환경변수에 `SUPABASE_JWT_SECRET` 추가
3. 앱 재배포
4. 로그인 후 브라우저 `localStorage.erp_supabase_access_token` 값 생성 확인
5. `20260308_phase1_rls_personal_scope.sql` 실행

## 1차 RLS 대상

- `push_subscriptions`
- `notifications`
- `attendance`
- `attendances`
- `leave_requests`
- `payroll_records`

## 이번 단계에서 일부러 제외한 것

- `staff_members`
- `chat_rooms`
- `messages`
- `board_posts`
- `approvals`
- `inventory`

이 테이블들은 아직 화면이 `select('*')`, 다대다 멤버십, 회사 간 협업, 관리자 대량 처리 같은 패턴을 많이 쓰고 있어서 바로 잠그면 회귀 위험이 큽니다.

특히 `staff_members`는 급여 관련 컬럼까지 같이 들어 있어, 2차에서는 `directory view` 또는 민감 컬럼 분리 후 RLS를 거는 쪽이 안전합니다.

## 브리지 토큰 클레임

앱은 로그인 성공 또는 세션 조회 시 Supabase용 JWT를 같이 발급합니다. 이 토큰에는 아래 클레임이 들어갑니다.

- `erp_staff_id`
- `erp_company_id`
- `erp_company_name`
- `erp_role`
- `erp_is_admin`
- `erp_is_mso`
- `erp_is_company_admin`
- `erp_can_manage_company`

이번 1차 RLS는 `auth.jwt()` 기준으로 이 클레임을 읽습니다.

## 확인 포인트

- 일반 직원: 자기 알림/근태/휴가/급여만 보이는지
- 병원 관리자/HR: 자기 회사 직원의 근태/휴가/급여가 보이는지
- MSO 관리자: 여러 회사 전환 후 계속 조회되는지
- 브라우저 콘솔/네트워크에 `42501` 권한 오류가 없는지

## 다음 단계

2차에서는 아래 순서가 맞습니다.

1. `staff_members` 민감 컬럼 분리 또는 뷰 도입
2. `approvals`, `board_posts`, `inventory`의 회사 범위 정책 추가
3. `chat_rooms`, `messages`의 멤버 기반 RLS 추가
