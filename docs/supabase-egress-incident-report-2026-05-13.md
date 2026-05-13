# Supabase Egress 장애 원인 보고서

작성일: 2026-05-13  
대상 시스템: SY INC. 통합 시스템 / `erp-pchos` Cloudflare Worker  
장애 증상: 로그인 시 `아이디 또는 비밀번호가 일치하지 않습니다` 또는 `현재 인증 데이터베이스를 조회할 수 없습니다` 표시

## 1. 결론

이번 장애의 직접 원인은 Supabase 프로젝트가 `exceed_egress_quota` 상태로 제한된 것입니다.

조사 중 Supabase API가 다음 오류를 반환했습니다.

```text
Service for this project is restricted due to the following violations: exceed_egress_quota.
```

즉, 사번/비밀번호가 틀려서가 아니라 Supabase에서 데이터가 밖으로 나가는 전송량, 즉 egress 한도를 초과해 `staff_members` 같은 인증 테이블 조회 자체가 막힌 상태였습니다.

Pro 플랜 업그레이드 후 동일 Supabase 프로젝트에서 `staff_members` 조회가 정상화되었고, 배포 서버의 로그인 API도 더 이상 503을 반환하지 않는 것을 확인했습니다.

## 2. Supabase egress 의미

Supabase 공식 문서 기준으로 egress는 Supabase 플랫폼 밖으로 전송되는 데이터입니다. Database API(PostgREST), Storage, Realtime, Auth, Edge Functions, Database, Supavisor 모두 egress에 포함됩니다.

공식 문서 기준 플랜별 egress quota는 다음과 같습니다.

| 플랜 | Uncached Egress | Cached Egress |
|---|---:|---:|
| Free | 5 GB | 5 GB |
| Pro | 250 GB | 250 GB |

참고 문서:

- https://supabase.com/docs/guides/troubleshooting/all-about-supabase-egress-a_Sg_e
- https://supabase.com/docs/guides/platform/manage-your-usage/egress

## 3. 장애 흐름

1. 사용자는 로그인 화면에서 사번 `2`로 접속 시도.
2. 로그인 API가 Supabase `staff_members`를 조회.
3. Supabase가 egress quota 초과로 프로젝트 요청을 제한.
4. 기존 로그인 API는 DB 제한 오류를 비밀번호 불일치처럼 보여줌.
5. 코드 수정 후 DB 제한 오류를 `현재 인증 데이터베이스를 조회할 수 없습니다`로 표시.
6. Pro 플랜 업그레이드 후 Supabase 제한이 풀렸고, 사번 `2` 계정 조회 정상 확인.

## 4. 확인된 근거

### 4.1 Supabase 상태

Pro 업그레이드 전:

- `staff_members` 조회가 Supabase 제한 오류로 실패
- 오류 메시지에 `exceed_egress_quota` 포함

Pro 업그레이드 후:

- `staff_members` 사번 `2` 조회 성공
- 계정 확인 결과:
  - 사번: `2`
  - 이름: `백정민`
  - 역할: `admin`
  - 부서: `경영지원팀`
  - 회사: `SY INC.`
  - 상태: `재직`
  - 비밀번호 저장 형태: bcrypt hash

### 4.2 현재 DB 주요 테이블 규모

가벼운 샘플링 기준입니다. 정확한 egress 기여도는 Supabase Dashboard의 Billing/Observability에서 확인해야 합니다.

| 테이블 | 행 수 | 샘플 기준 추정 JSON 크기 |
|---|---:|---:|
| `notifications` | 23,045 | 약 10.4 MB |
| `messages` | 9,319 | 약 5.1 MB |
| `chat_push_jobs` | 9,231 | 약 4.1 MB |
| `audit_logs` | 1,104 | 약 2.1 MB |
| `shift_assignments` | 1,467 | 약 0.35 MB |
| `attendances` | 1,080 | 약 0.34 MB |
| `inventory` | 1,030 | 약 0.64 MB |

상위 테이블만 합산해도 전체 행 조회 시 약 23.8 MB 이상이 응답으로 나갈 수 있습니다. 실제 전체 백업/대시보드/관리 화면은 더 많은 테이블을 읽기 때문에 더 커질 수 있습니다.

### 4.3 Storage 현황

Storage 자체 총량은 크지 않지만, 다운로드 횟수가 많으면 egress는 반복 누적됩니다.

| 버킷 | 파일 수 | 총 크기 | 특이사항 |
|---|---:|---:|---|
| `mso-backups` | 34 | 약 70.9 MB | 백업 JSON 보관 |
| `profiles` | 54 | 약 36.8 MB | 7.1 MB, 4.4 MB 등 큰 프로필 이미지 존재 |
| `board-attachments` | 45 | 약 21.3 MB | 7 MB 이미지 2개 존재 |
| `company-seals` | 2 | 약 1.25 MB | 직인 이미지 |

특히 `profiles`의 대형 이미지가 자주 표시되면 Storage egress가 반복 발생할 수 있습니다.

## 5. 원인 후보별 판단

### A. 직접 원인: Supabase unified egress quota 초과

확정입니다. Supabase가 `exceed_egress_quota` 제한 오류를 반환했고, Pro 업그레이드 후 정상화되었습니다.

### B. 높은 가능성: 전체 행 조회 패턴 누적

코드베이스에서 `.select('*')` 사용이 `app/`, `lib/` 기준 182건(113개 파일)에서 확인되었습니다. 대표 예시는 다음과 같습니다.

- `app/main/hooks/useERPData.ts`: 로그인 후 `staff_members` 전체 행 조회
- `lib/backup-cron.ts`: 백업 시 대상 테이블 전체를 `select('*')`로 페이지 단위 조회
- 재고, 인사, 결재, 알림, 채팅 관련 화면 다수에서 전체 컬럼 조회

`select('*')`는 필요한 컬럼보다 훨씬 많은 데이터를 응답으로 보내므로 Database Egress를 증가시킵니다.

### C. 높은 가능성: 백업 Cron 설계

`lib/backup-cron.ts`는 백업 실행 시 52개 테이블을 대상으로 `select('*')`를 반복 호출합니다.

```ts
supabase
  .from(table)
  .select('*')
  .range(offset, offset + PAGE_SIZE - 1)
```

기존 배포 설정에는 전체 백업 Cron이 포함되어 있었습니다.

```toml
"0 15 * * *" # /api/cron/backup
```

다만 Storage에 남은 `mso-backups` 최신 파일은 2026-04-10 기준이라, 2026-05-13 당일 초과의 단독 원인으로는 단정하지 않습니다. 재발 위험이 큰 구조로 판단합니다.

현재 조치로 전체 백업 Cron은 중지했습니다.

### D. 가능성 있음: Storage 대형 이미지 반복 다운로드

Supabase Storage egress는 파일을 조회/다운로드할 때 발생합니다. 현재 프로필/게시판 이미지 중 4~7 MB급 이미지가 있으며, 사용자가 여러 번 접속하거나 브라우저 캐시가 무효화되면 반복 누적됩니다.

### E. 가능성 있음: Realtime 및 알림/채팅 데이터

Supabase Realtime도 egress에 포함됩니다. 현재 채팅, 알림, 게시판, 근무현황 등 여러 화면에서 realtime subscription이 존재합니다. 이벤트가 많거나 접속자가 늘면 egress가 증가할 수 있습니다.

## 6. 즉시 조치한 내용

### 6.1 로그인 API 개선

파일: `app/api/auth/master-login/route.ts`

- 기존 `select('*')` 제거
- 로그인에 필요한 컬럼만 조회
- Supabase quota 제한 오류를 비밀번호 불일치로 숨기지 않고 503으로 명확히 반환
- DB 제한 상황에서도 관리자/마스터 환경변수 검증 계정은 비상 로그인 가능하도록 보완

### 6.2 배포 Cron 조정

파일: `wrangler.toml`, `cloudflare-worker.ts`

- 전체 DB 백업 Cron 중지
- 운영에 필요한 4개 Cron만 재활성화
  - chat-retention
  - chat-push-dispatch
  - leave-notice-announcements
  - push-subscription-cleanup

### 6.3 배포 및 확인

최종 배포:

- Worker: `erp-pchos`
- Version ID: `94475e79-a4ef-42ea-9cc9-f148f0a522d8`

확인:

- `/` 응답 200
- 사번 `2` 틀린 비밀번호 요청 시 503이 아닌 정상적인 비밀번호 불일치 응답
- 비상 관리자 로그인 성공
- Supabase DB 조회 정상화 확인

## 7. 재발 방지 권고

### 7.1 Supabase Dashboard에서 원인 확정

정확한 서비스별 기여율은 로컬 코드만으로는 확정할 수 없습니다. Supabase Dashboard에서 다음을 확인해야 합니다.

1. Billing 또는 Usage 페이지의 Total Egress 일별 그래프
2. 서비스별 breakdown: Database, Storage, Realtime, Auth, Supavisor
3. Observability > Custom Report
   - Database API > API Egress
   - Storage Egress Requests
4. Log Explorer > Top Paths
5. Advisors > Query Performance
   - 호출 빈도
   - 평균 반환 row 수

### 7.2 `select('*')` 단계적 제거

우선순위:

1. 로그인/세션/권한 조회
2. 메인 초기 로딩
3. 알림/채팅/게시판 목록
4. 백업/관리자 리포트
5. 재고/인사 전체 목록

원칙:

- 목록 화면은 목록에 필요한 컬럼만 조회
- 상세 화면 진입 시 상세 컬럼 조회
- `limit`, `range`, 검색 조건 필수 적용
- insert/update 후 전체 row 반환이 필요 없으면 최소 컬럼만 반환

### 7.3 Storage 이미지 최적화

권장:

- 프로필 이미지는 업로드 시 512px 이하, 200KB 이하로 리사이즈
- 게시판/팝업 이미지는 WebP 변환
- Supabase Storage 대신 R2 공개 URL 우선 사용
- 기존 4~7 MB급 프로필/게시판 이미지는 압축본으로 교체
- 이미지에는 브라우저 캐시 헤더와 CDN 캐시 정책 적용

### 7.4 백업 방식 재설계

현재 방식은 Supabase API로 전체 테이블을 읽어 JSON을 만들기 때문에 Database Egress를 직접 발생시킵니다.

권장:

- 전체 백업은 Supabase 내장 백업/PITR 정책 우선 검토
- 수동 JSON 백업은 매일이 아니라 주 1회 또는 필요 시 실행
- `notifications`, `chat_push_jobs`, `audit_logs` 같은 로그성 테이블은 보관 기간 적용 후 백업
- 변경분 백업으로 전환
- 백업 저장소는 Supabase Storage가 아니라 R2로 이전

### 7.5 알림/채팅 데이터 보관 정책 강화

현재 큰 테이블:

- `notifications`: 23,045 rows
- `messages`: 9,319 rows
- `chat_push_jobs`: 9,231 rows

권장:

- 읽은 알림은 일정 기간 후 archive/delete
- 완료된 `chat_push_jobs`는 짧은 보관 기간 적용
- 메시지 첨부는 R2 이전 지속
- 채팅 목록은 최근 메시지/커서만 조회하고, 과거 메시지는 페이지네이션

## 8. 운영 체크리스트

매주 확인:

- Supabase Usage > Egress 일별 증가량
- Storage 대형 파일 top 목록
- Database API Top Paths
- 평균 반환 row 수가 큰 쿼리

배포 전 확인:

- 신규 코드에 `select('*')`가 추가되었는지
- 목록 조회에 `limit/range`가 있는지
- 이미지 업로드 시 압축이 적용되는지
- Cron이 전체 테이블을 매일 읽지 않는지

장애 발생 시 1차 확인:

```text
exceed_egress_quota
exceed_cached_egress_quota
Service for this project is restricted
```

위 문구가 있으면 계정/비밀번호 문제가 아니라 Supabase 사용량 제한 문제로 분류합니다.

## 9. egress 알람 설정 가이드 (사전 감지)

Pro 플랜이라도 250GB는 사용량 증가 시 도달 가능. 다음을 설정해 둔다.

1. Supabase Dashboard → 좌측 메뉴 **Reports → Usage** 진입
2. 우측 상단 **Alerts** 클릭, **New alert** 생성
3. Metric: **Egress (Database + Storage + Auth + Realtime + Supavisor)**, Threshold: 일별 5~10GB (조직 규모에 맞춰), Notification channel: 이메일 또는 Slack webhook
4. 보조 메트릭으로 **Storage Egress**, **Database Egress** 개별 알람도 추가 권장 (어디서 새는지 즉시 식별 가능)
5. 매 분기마다 알람 임계치를 실제 사용량 추세에 맞춰 재조정

장애 발생 시 1차 확인 로그(반복):

```text
exceed_egress_quota
exceed_cached_egress_quota
Service for this project is restricted
```

## 10. 최종 판단

이번 장애는 Supabase Free 플랜 egress quota 초과로 인한 서비스 제한이 직접 원인입니다.

다만 egress 초과를 만든 단일 호출은 로컬 환경만으로 확정할 수 없습니다. 현재 코드와 데이터 상태를 기준으로 보면 다음 요인이 복합적으로 누적되었을 가능성이 높습니다.

1. Database API의 전체 행/전체 컬럼 조회 패턴
2. 알림/채팅/푸시잡 테이블의 row 증가
3. 전체 백업 Cron 설계
4. 대형 Storage 이미지 반복 조회
5. Realtime 구독 이벤트

Pro 플랜 업그레이드로 즉시 장애는 해소되었지만, 구조를 그대로 두면 사용량과 비용이 계속 증가할 수 있습니다. 다음 작업은 `select('*')` 제거, 이미지 압축, 백업 재설계, Supabase Dashboard 기반 egress 모니터링입니다.
