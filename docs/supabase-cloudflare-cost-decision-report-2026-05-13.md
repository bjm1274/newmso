# Supabase Pro 비용 절감 및 Cloudflare 전환 비교 보고서

작성일: 2026-05-13  
대상 프로젝트: `newmso`, `erp-pchos` Cloudflare Worker

## 1. 결론

현재 코드베이스 기준 추천안은 **Supabase를 즉시 완전 대체하지 말고, Supabase는 Free 전환을 목표로 유지하되 Storage/백업/대용량 파일 트래픽은 R2로 계속 분리하는 하이브리드 방식**입니다.

이유는 단순합니다.

- 이 프로젝트는 Supabase를 파일 저장소만으로 쓰는 구조가 아닙니다. `staff_members`, `notifications`, `inventory`, `approvals`, `messages`, `chat_rooms`, `payroll_records` 등 핵심 업무 데이터가 Supabase Postgres에 강하게 결합돼 있습니다.
- SQL 자산 기준으로 `122`개 SQL 파일, `119`개 테이블, `175`개 정책, `37`개 함수가 확인됩니다. 이를 Cloudflare D1로 옮기면 Postgres SQL, RLS, RPC, Realtime을 모두 재설계해야 합니다.
- 반면 파일 업로드는 이미 R2 우선 구조가 들어가 있습니다. `chat`, `board`, `approval` 업로드는 R2 설정이 있으면 R2로 가고, 없으면 Supabase Storage로 fallback합니다.
- 최근 장애 원인은 Supabase egress 초과였고, 이 비용과 제한은 DB 전체 이전보다 **R2 분리, `select('*')` 제거, Realtime full refetch 축소, 오래된 로그/알림 정리**로 먼저 줄이는 편이 훨씬 빠르고 위험이 낮습니다.

따라서 운영 판단은 다음이 적절합니다.

| 선택지 | 추천도 | 월 고정비 | 판단 |
|---|---:|---:|---|
| Supabase Pro 유지 | 중 | 약 $25부터 | 안정성은 좋지만 비용 절감 목표와 맞지 않음 |
| Supabase Free + Cloudflare R2 | 높음 | $0 또는 Workers Paid 사용 시 약 $5부터 | 현재 코드베이스에 가장 현실적 |
| Supabase 완전 제거 + Cloudflare D1/R2/Workers/DO | 낮음, 장기 과제 | $0 가능하지만 운영은 보통 $5+ | 개발 리스크가 $25 절감보다 큼 |

## 2. 공식 요금 및 제한 요약

### Supabase Free와 Pro

Supabase 공식 문서 기준 주요 차이는 다음과 같습니다.

| 항목 | Free | Pro |
|---|---:|---:|
| 프로젝트 | 활성 무료 프로젝트 2개 | 조직 단위 유료 플랜 |
| DB 크기 | 500 MB per project | 8 GB disk per project 포함 |
| Storage | 1 GB | 100 GB 포함 |
| Egress | 5 GB | 250 GB 포함 |
| MAU | 50,000 | 100,000 포함 |
| Edge Function | 500,000 invocations | 2,000,000 포함 |
| Realtime 메시지 | 2,000,000 | 5,000,000 포함 |
| Realtime peak connections | 200 | 500 포함 |
| 백업/운영 | Free는 유휴 시 pause 가능, DB 백업 다운로드 불가 | 비활성 pause 없음, 일일 백업, 이메일 지원 |

Supabase Pro는 한 프로젝트 Micro 기준으로 `Pro $25 + Micro compute $10 - compute credit $10 = $25/month` 구조입니다. 유료 조직은 프로젝트가 늘면 compute가 추가됩니다.

중요한 결제 포인트:

- Pro를 취소하면 남은 기간은 현금 환불이 아니라 크레딧으로 처리될 수 있습니다.
- Supabase FAQ에는 unused credits 환불은 제공하지 않는다고 안내되어 있습니다.
- Free quota를 계속 넘기면 프로젝트 pause, read-only, API 402 같은 제한이 걸릴 수 있습니다.

### Cloudflare R2

Cloudflare R2는 파일 저장소입니다. DB 대체재가 아닙니다.

| 항목 | Free tier | 초과 시 |
|---|---:|---:|
| Storage | 10 GB-month/month | Standard $0.015/GB-month |
| Class A operations | 1M/month | $4.50/million |
| Class B operations | 10M/month | $0.36/million |
| Egress | 무료 | 무료 |

현재 프로젝트처럼 이미지, 게시판 첨부, 채팅 첨부, 백업 파일 때문에 egress가 커지는 앱에는 R2가 비용 절감 효과가 큽니다.

### Cloudflare Workers, D1, Durable Objects

Supabase를 완전히 대체하려면 R2만으로는 부족하고 다음 조합이 필요합니다.

| Supabase 역할 | Cloudflare 대체 |
|---|---|
| Postgres DB | D1, 단 SQLite 기반 |
| Storage | R2 |
| Realtime | Durable Objects + WebSocket, 또는 polling/SSE |
| Auth/session | Workers API + KV/D1/custom auth |
| Edge Functions/Cron | Workers Cron, Queues, Workflows |
| RLS | API 서버 권한 검사 코드로 재작성 |

Cloudflare Workers Free는 100,000 requests/day, Workers Paid는 월 $5부터 시작하며 10M requests/month 및 CPU allowance가 포함됩니다. D1 Free는 rows read 5M/day, rows written 100k/day, storage 5 GB total 기준이고, D1 개별 DB 크기는 Free 500 MB, Paid 10 GB입니다. D1은 SQLite semantics라서 Postgres와 완전 호환되지 않습니다.

## 3. 현재 코드베이스 사용 현황

### Supabase 결합도

`node scripts/audit-supabase-hotspots.mjs` 실행 결과 상위 테이블 참조는 다음과 같습니다.

| 순위 | 테이블 | 참조 수 |
|---:|---|---:|
| 1 | `staff_members` | 131 |
| 2 | `notifications` | 79 |
| 3 | `inventory` | 76 |
| 4 | `approvals` | 56 |
| 5 | `messages` | 41 |
| 6 | `chat_rooms` | 39 |
| 7 | `payroll_records` | 34 |
| 8 | `push_subscriptions` | 30 |
| 9 | `audit_logs` | 29 |
| 10 | `work_shifts` | 29 |

이 결과는 Supabase가 단순 파일 저장소가 아니라 ERP의 메인 데이터 계층이라는 뜻입니다.

### Auth 구조

로그인은 Supabase Auth를 깊게 쓰는 구조가 아니라 `staff_members`를 조회하고 자체 HMAC 세션 쿠키를 발급합니다.

- `app/api/auth/master-login/route.ts`: service role로 `staff_members` 조회
- `lib/server-session.ts`: `erp_session` HMAC 세션 생성 및 검증
- `lib/server-supabase-bridge.ts`: 클라이언트 Supabase 접근 토큰 브리지

즉 Auth만 놓고 보면 Cloudflare 이전 가능성은 있습니다. 하지만 실제 권한 데이터, 직원 정보, 메뉴 권한, 세션 최신화가 Supabase DB에 묶여 있어 DB 이전 없이는 완전 분리가 아닙니다.

### Storage와 R2 현황

이미 R2 전환 기반은 꽤 들어가 있습니다.

- `lib/object-storage.ts`: R2 presigned PUT/GET URL 생성
- `app/api/chat/upload/route.ts`: R2 설정 시 채팅 첨부 R2 업로드
- `app/api/board/upload/route.ts`: R2 설정 시 게시판 첨부 R2 업로드
- `app/api/approvals/upload/route.ts`: 결재 첨부 R2 업로드 지원
- `app/api/storage/object/route.ts`: R2 object proxy/download
- `scripts/migrate-chat-storage-to-r2.mjs`: 기존 채팅 파일 R2 이전 스크립트
- `scripts/cleanup-supabase-chat-storage.mjs`: R2 이관 확인 후 Supabase 원본 정리 스크립트
- `wrangler.toml`: `NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://r2.pchos.kr"`

다만 아직 Supabase Storage 직접 사용이 남아 있습니다.

- 프로필 사진: `profiles`
- 팝업 이미지: `popups`
- 직인/회사 도장: `company-seals`
- 직원 서류 제출/교육 자료: `board-attachments`
- 일부 계약/결재/문서 업로드 경로

Free 전환을 하려면 이 잔여 Storage 경로도 R2 공통 업로드 유틸로 통일해야 합니다.

### Realtime과 과다 호출

감사 결과 Realtime hook이 많습니다.

| 파일 | Realtime hook 수 |
|---|---:|
| `app/main/기능부품/알림시스템.tsx` | 18 |
| `app/main/기능부품/메신저구독훅.ts` | 8 |
| `lib/realtime-bus.ts` | 5 |
| `app/main/기능부품/게시판.tsx` | 4 |

기존 문서 `docs/supabase-duplicate-calls-analysis.md`에도 채팅 관련 중복 호출과 full refetch 문제가 기록돼 있습니다. Supabase Free로 낮출 때 가장 위험한 부분은 DB 크기보다 **egress와 Realtime/message 호출량**입니다.

## 4. 선택지 비교

### 선택지 A. Supabase Pro 유지

장점:

- 지금 가장 안전합니다.
- 250 GB egress, 100 GB Storage, 8 GB disk, 일일 백업, 지원이 있습니다.
- Postgres, RLS, Realtime, Storage를 그대로 유지하므로 개발 리스크가 없습니다.

단점:

- 최소 약 $25/month 고정비가 계속 나갑니다.
- egress 구조가 그대로라면 Pro에서도 spend cap/초과요금 문제가 반복될 수 있습니다.
- 비용 절감 목표와 맞지 않습니다.

추천 상황:

- 병원/업무 운영에 이미 매일 쓰이고, 장애 비용이 월 $25보다 크다.
- DB size가 500 MB에 근접했거나 Supabase egress가 월 5 GB를 계속 넘는다.
- Free의 유휴 pause, 백업 제한, 낮은 realtime limit를 감수하기 어렵다.

### 선택지 B. Supabase Free + R2 하이브리드

장점:

- 현재 코드 변경량 대비 비용 절감 효과가 가장 큽니다.
- R2는 egress 무료라 첨부/이미지/백업 파일 트래픽에 강합니다.
- Supabase DB, RLS, Realtime 코드는 유지하므로 전면 재작성보다 안전합니다.
- 이미 R2 업로드 코드가 있으므로 남은 Storage 경로만 정리하면 됩니다.

단점:

- Supabase Free의 500 MB DB, 5 GB egress, 1 GB Storage, Realtime 제한을 넘으면 제한이 걸립니다.
- Free 프로젝트는 낮은 활동 시 pause될 수 있고, DB 백업 다운로드가 제공되지 않습니다.
- egress 초과 이력이 있으므로 바로 downgrade하면 같은 장애가 재발할 수 있습니다.

추천 상황:

- DB 실제 크기가 350 MB 이하, 정리 후 500 MB까지 여유가 있다.
- Supabase Storage를 거의 R2로 옮길 수 있다.
- 월 Supabase egress를 3 GB 이하로 낮출 수 있다.
- Realtime 동시 접속이 200명 미만이고 채팅/알림 트래픽이 낮다.

### 선택지 C. Cloudflare로 완전 이전

장점:

- Supabase 고정비를 제거할 수 있습니다.
- R2/D1은 egress 비용이 없거나 매우 낮습니다.
- 앱이 이미 OpenNext Cloudflare Worker로 배포되는 구조라 런타임 이전 기반은 있습니다.
- 장기적으로 Cloudflare 한 곳에서 배포, 파일, API, DB, Cron을 운영할 수 있습니다.

단점:

- R2는 DB가 아니므로 D1 또는 외부 DB가 필요합니다.
- D1은 SQLite 기반이라 Postgres 기능, RLS, 함수, JSONB/array/operator, trigger 일부를 재설계해야 합니다.
- Supabase RLS `175`개 정책은 Cloudflare API 권한 검사 코드로 바꿔야 합니다.
- Supabase Realtime은 Durable Objects/WebSocket 또는 polling으로 다시 만들어야 합니다.
- 클라이언트 곳곳의 `supabase.from()` 호출을 API layer 또는 D1 DAO로 바꿔야 합니다.
- D1 개별 DB는 Paid에서도 10 GB 제한이 있고, 동시성은 단일 DB가 순차 처리됩니다.

추천 상황:

- 월 $25 절감보다 장기 인프라 독립성이 더 중요하다.
- 3주에서 6주 이상 마이그레이션 시간을 감수할 수 있다.
- Postgres 고급 기능 의존도를 줄일 준비가 됐다.
- Realtime/권한/백업을 직접 운영할 역량이 있다.

## 5. 비용 관점 시뮬레이션

### 현재 Pro 유지

대략:

- Supabase Pro 1개 프로젝트 Micro: 약 $25/month
- R2 사용량이 free tier 이내면 추가 $0
- Worker Paid를 이미 쓰고 있다면 별도 $5/month 가능

실질 장점은 장애 확률 감소입니다. 순수 비용만 보면 가장 비쌉니다.

### Free + R2 하이브리드

대략:

- Supabase Free: $0
- R2 10 GB-month, Class A 1M, Class B 10M 이내: $0
- Workers Free 한도 이내: $0
- 운영 안정성을 위해 Workers Paid를 쓰면: $5/month부터

현실적으로는 **$0에서 $5/month** 범위가 목표입니다. 단, Supabase egress가 다시 5 GB를 넘으면 비용이 아니라 서비스 제한으로 맞습니다.

### Cloudflare 완전 이전

대략:

- Workers Paid 권장: $5/month부터
- D1 Paid 포함분 이내: $0 추가
- R2 free tier 이내: $0 추가
- Durable Objects를 채팅/알림 realtime에 쓰면 사용량에 따라 추가

인프라 비용은 낮을 수 있지만, 개발비/시간/장애 리스크가 큽니다. 현재 상태에서는 월 $25를 줄이려고 전면 이전하는 것은 투자 대비 손익이 좋지 않습니다.

## 6. 권장 실행안

### 1단계: Pro 유지 상태에서 7일 안정화

목표는 Pro를 오래 쓰는 것이 아니라, Free로 낮춰도 터지지 않을 상태를 만드는 것입니다.

체크:

- Supabase Dashboard > Usage에서 `Database size`, `Storage size`, `Total egress`, `Cached egress`, `Realtime messages` 확인
- Observability에서 Database API top paths, Storage egress top paths 확인
- DB size가 450 MB 이상이면 먼저 로그/알림/임시 데이터 정리
- Supabase egress가 최근 7일 기준 1 GB 이상이면 Free 전환 보류

코드/운영 작업:

- 남은 Supabase Storage 직접 업로드 경로를 R2 공통 유틸로 전환
- 기존 Supabase Storage의 채팅/게시판/결재 첨부를 R2로 이전
- `select('*')` 제거, 목록 화면 select column 축소
- Realtime 이벤트에서 full refetch 대신 incremental update 적용
- `notifications`, `chat_push_jobs`, `audit_logs` retention 적용
- 일일 전체 DB 백업 Cron은 계속 비활성 유지하고, 필요한 테이블만 주 1회 압축 백업

### 2단계: Free 전환 판정

아래 조건을 모두 만족하면 downgrade 후보입니다.

| 기준 | 목표 |
|---|---:|
| DB size | 350 MB 이하 권장, 최대 450 MB 이하 |
| Supabase Storage | 500 MB 이하, 신규 업로드는 R2 |
| Supabase egress | 월 환산 3 GB 이하 |
| Realtime peak | 200 connections 이하 |
| Realtime messages | 월 2M 이하 |
| 백업 | R2로 주기 백업 또는 수동 SQL dump 확보 |

만족하지 못하면 Pro를 바로 끊지 말고 한 달만 더 두는 편이 안전합니다.

### 3단계: Supabase Free + R2 운영

운영 규칙:

- 첨부/이미지/백업은 전부 R2
- Supabase에는 업무 DB만 저장
- 파일 URL은 가능한 `https://r2.pchos.kr/...` 직접 제공
- 대용량 이미지 업로드 시 클라이언트 리사이즈 또는 서버 변환
- 관리자 대시보드, 백업, 전체 검색에서 full table scan 금지
- Supabase usage 주간 점검

### 4단계: 전면 Cloudflare 이전은 별도 프로젝트로 분리

전면 이전을 한다면 한 번에 바꾸지 말고 다음 순서가 안전합니다.

1. 모든 파일 업로드를 R2로 완전 전환
2. 읽기 전용/로그성 테이블부터 D1로 복제 테스트
3. D1 스키마 변환 규칙 작성: UUID, timestamptz, jsonb, array, enum, function, trigger
4. `supabase.from()` 직접 호출을 domain API layer로 감싸기
5. RLS 정책을 서버 권한 검사로 이식
6. chat/notification realtime을 Durable Objects 또는 polling으로 교체
7. 모듈별 shadow traffic 검증
8. Supabase read-only 기간 후 최종 cutover

예상 작업량은 보수적으로 3주에서 6주 이상입니다. 급여, 근태, 결재, 채팅, 재고가 모두 실제 운영 데이터라면 더 길게 잡는 것이 맞습니다.

## 7. 최종 추천

지금 당장 가장 좋은 의사결정은 다음입니다.

1. **Supabase Pro는 바로 끊지 말고 7일만 비용 절감 작업의 안전망으로 둡니다.**
2. **R2 전환을 완성하고 Supabase egress를 낮춥니다.**
3. **DB size와 egress가 Free 기준 안에 들어온 것이 확인되면 Free로 downgrade합니다.**
4. **Cloudflare 완전 이전은 장기 리팩터링 과제로만 유지합니다.**

현재 코드베이스에서는 “Cloudflare로 전부 이전”이 기술적으로 가능하긴 하지만, 비용 절감 목적만 놓고 보면 과합니다. 반대로 “Supabase Free + R2”는 이미 코드 기반이 있고, 최근 egress 장애 원인에도 직접 대응하므로 가장 현실적인 절감안입니다.

## 8. 참고 공식 문서

- Supabase billing quotas: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase compute billing: https://supabase.com/docs/guides/platform/manage-your-usage/compute
- Supabase egress billing: https://supabase.com/docs/guides/platform/manage-your-usage/egress
- Supabase database size: https://supabase.com/docs/guides/platform/database-size
- Supabase production checklist: https://supabase.com/docs/guides/deployment/going-into-prod
- Supabase Pro project pause/transfer: https://supabase.com/docs/guides/troubleshooting/pausing-pro-projects-vNL-2a
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
