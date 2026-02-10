# MSO 통합 시스템 진행 기록 (요약)

## 1. 인프라 / 배포
- Vercel `newmso` 프로젝트 + GitHub `bjm1274/newmso` 연동
- 도메인 `erp.pchos.kr` → Vercel `newmso` 에 연결 (CNAME `erp` → `...vercel-dns-017z.com`)
- Supabase 새 프로젝트 생성 후 `.env.local`, Vercel 환경변수에 다음 설정:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. 핵심 화면 구조
- `/` → `app/page.tsx` 에서 로그인 페이지로 리다이렉트
- `/login` → `app/login/page.tsx`
  - MSO 관리자 기본 계정: 사번 `100` 또는 `MSO관리자`, 비밀번호 `syinc!!`
- `/main` → `app/main/page.tsx`
  - 메인 메뉴: 조직도, 인사관리, 재고관리, 전자결재, 메신저, 할일 등

## 3. 구현된 기능 (데이터 연동 전 DEMO 버전 포함)

### 3.1 HR (1단계~3단계)
- **연차 자동촉진** (`연차촉진시스템.tsx`)
  - 직원 리스트 기반으로 잔여 연차, 1차/2차 촉진 대상 계산 (더미 로직)
  - "⚡ 촉진 통보 발송" 버튼 (현재는 alert만, 나중에 Supabase `notifications/approvals` 연동 예정)
- **근무형태 관리** (`근무형태관리.tsx`)
  - 데이/나이트전담/스윙 등 DEMO 근무유형 카드
  - 신규 근무형태 추가/삭제 (프론트 상태에서만 관리)
- **근태 관리 메인** (`근태관리메인.tsx`)
  - 일별/월별/달력 보기 UI (더미 데이터)
- **휴가 관리 메인** (`휴가관리메인.tsx`)
  - 휴가 신청 내역 카드 및 리스트 (연차/반차/병가/경조 – 더미)
  - 승인/반려 버튼 (상태만 변경, DB 미연동)
  - 연차사용촉진 탭 → `연차촉진시스템` 포함
  - 연차 자동부여 설정 탭 (입사일 기준 / 회계연도 기준 토글)
- **급여 관리** (`급여관리.tsx`)
  - 급여 대장 + 상세/표표는 기존 구조 유지
  - 오른쪽 패널에:
    - 복리후생 요약 (기본급 기준 5% 등 DEMO 계산)
    - 급여 시뮬레이션 요약 (기준안, +5%, +10%)

### 3.2 메신저 고도화
- **파일 공유**
  - 📎 버튼 → 파일 업로드 (Supabase Storage `pchos-files` 버킷 사용)
  - 메시지에 "📎 파일 첨부됨" 링크 표시
- **투표 기능 (DEMO, 로컬 상태)**
  - 📊 버튼 → 투표 생성 모달 (질문 + 선택지 콤마 구분)
  - 투표 카드에서 선택지별 표 수/퍼센트 표시
- **이모지 반응 & 답글**
  - 메시지 말풍선 안 👍 버튼 → 이모지 반응 토글, 개수 표시
  - 기존 액션 모달의 "↩️ 답글 달기" 유지
- **고정(핀) + 상단 요약**
  - 말풍선 우측 상단 ☆/★ → 고정/해제
  - 상단 "📌 고정된 메시지" 박스에 요약 표시

## 4. 앞으로 Supabase에 추가할 예정인 주요 테이블 (설계만 완료)
- 연차/휴가: `annual_leave_policies`, `annual_leave_balances`, `annual_leave_notices`
- 근무형태: `work_shifts`, `staff_work_types` 등
- 복리후생/시뮬레이션/세무: `benefit_packages`, `employee_benefits`, `salary_simulations`, `tax_reports`
- 알림/감사: `notifications`, `audit_logs`, `login_attempts` 등

## 5. 다음 단계候補
- 알림센터 인박스 페이지 (전체 알림 목록 + 읽음/안읽음 + 유형별 필터)
- 할일 보드(칸반) 확장
- 시스템 관리(회사/사용자/권한) 기본 화면
- Supabase 실제 스키마/쿼리 연동 (위 설계 테이블 기준)

