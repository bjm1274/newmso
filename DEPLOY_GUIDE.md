# MSO 시스템 배포 가이드

## 1. Supabase DB 설정

### 1-1. 프로젝트 생성
1. [Supabase](https://supabase.com) 로그인
2. **New Project** 생성 (이름, 비밀번호, 리전 선택)
3. 프로젝트 준비 완료까지 2~3분 대기

### 1-2. SQL 마이그레이션 실행
1. Supabase Dashboard → **SQL Editor** 이동
2. **New query** 클릭
3. `supabase_migrations/00_full_schema_and_migrations.sql` 파일 전체 내용 복사 후 붙여넣기
4. **Run** 실행
5. `MSO 전체 스키마 마이그레이션 완료` 메시지 확인

### 1-3. 환경 변수 확인
`.env.local` 파일에 다음 값 설정:
```
NEXT_PUBLIC_SUPABASE_URL=https://프로젝트ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon키
```

- Supabase Dashboard → **Settings** → **API**에서 URL, anon key 복사

### 1-4. Storage 버킷 (선택)
파일 업로드(휴가 증빙 등) 사용 시:
1. **Storage** → **New bucket** → 이름: `pchos-files`
2. Public 체크 또는 RLS 정책 설정

---

## 2. 로컬 개발 서버

```bash
npm install
npm run dev
```

- http://localhost:3000 접속
- 로그인: 직원 등록 후 `employee_no` + 비밀번호 (초기에는 인증 없을 수 있음)

---

## 3. Vercel 배포

### 3-1. 준비
1. [Vercel](https://vercel.com) 계정
2. GitHub에 프로젝트 푸시

### 3-2. 배포 (방법 A: Vercel 대시보드)
1. [vercel.com](https://vercel.com) 로그인
2. **Add New** → **Project**
3. GitHub에서 `bjm1274/newmso` 레포지토리 Import
4. **Environment Variables**에 추가:
   - `NEXT_PUBLIC_SUPABASE_URL` = Supabase 프로젝트 URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Supabase anon key
5. **Deploy** 클릭

### 3-3. 배포 (방법 B: Vercel CLI)
```bash
npx vercel login     # 먼저 로그인
npx vercel --prod    # 프로덕션 배포
```

### 3-3. 빌드 명령
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`

---

## 4. 배포 후 체크리스트

| 항목 | 확인 |
|------|------|
| 로그인 | 직원 등록 후 로그인 가능 여부 |
| 조직도 | staff_members 로드 |
| 메신저 | 공지방, 1:1 채팅 |
| 전자결재 | 결재 목록, 휴가신청 |
| 근태 | 출퇴근, attendances 반영 |
| 급여 | 정산, payroll_records 저장 |
| 감사 로그 | audit_logs 기록/조회 |

---

## 5. 문제 해결

### 테이블 없음
- `00_full_schema_and_migrations.sql` 재실행
- Supabase SQL Editor에서 `\dt` 또는 Table Editor로 테이블 존재 확인

### RLS 권한
- 개발 중: RLS 비활성화 또는 `supabase_service_role` 사용
- 프로덕션: RLS 활성화 후 정책 설정

### CORS
- Supabase Dashboard → **Authentication** → **URL Configuration**에 배포 URL 추가
