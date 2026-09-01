# Cloudflare 잔존 의존 + Oracle VM 실시간 비용 — 최종 보고서

- 일자: 2026-08-31
- 대상: AllERP (`D:\newmso`), 운영 호스트 `erp.pchos.kr` → `161.33.162.195`
- 성격: 전수조사. **코드는 고치지 않았다.**
- 선행 확인: D1 → SQLite 행수 일치. R2 → Oracle 파일 복사는 미완. Oracle Docker는 조사 시점 미기동.

---

## 한 줄 결론

1. **런타임에서 Cloudflare를 꼭 타야 하는 기능은 없다.** Oracle `server.mjs`(SQLite + 같은 프로세스 WebSocket + node-cron)가 D1 / R2 바인딩 / Durable Object를 대체한다.
2. **아직 Cloudflare에 묶여 있는 것은 “파일 본체”와 “이름·배포 파이프”다.** 채팅·게시판 첨부 수천 건이 R2에 남아 있고, CI/`wrangler.toml`/`build:cloudflare`가 살아 있다.
3. **카카오톡급 실시간(포그라운드 즉시 + 백그라운드 푸시)을 Oracle VM에서 돌려도 Cloudflare Worker/DO/D1 과금은 생기지 않는다.** 같은 VM 안에서 WebSocket을 여는 비용은 별도 상품이 아니다. 병원 규모(재직 45 / 전체 staff 63)에서 FCM·Web Push도 과금 0이다. **남는 비용은 VM 자체(Always Free 2 OCPU/12GB에 맞으면 0원)와, R2에 파일을 남겨 두면 생기는 소액 R2 저장/요청뿐이다.**

---

## 조사 범위

| 층 | 본 것 | 안 한 것 |
|---|---|---|
| 런타임 코드 | `lib/`, `app/api/`, `server.mjs`, `cloudflare-worker.ts`, `wrangler.toml` | 코드 수정 |
| 스토리지 | `lib/object-storage.ts`, `lib/s3-storage.ts`, `app/api/storage/object` | R2 → Oracle 복사 실행 |
| 실시간 | `lib/polling-bus.ts`, `lib/realtime/server-signal.ts`, `app/api/realtime/*`, 채팅 훅, FCM/Web Push | 운영 VM에서 실시간 실측 (Docker 미기동) |
| 배포 | `package.json`, `Dockerfile`, `scripts/deploy-allerp.mjs`, `.github/workflows/deploy.yml` | OCI 인보이스 조회 |
| 데이터 | 선행 마이그레이션 점검 결과 (D1=SQLite, R2≠Oracle 디스크) | 시크릿 값 재출력 |

---

## 1. 의존 3분류

### A. 런타임에서 아직 Cloudflare를 탈 수 있는 것 (Oracle에선 게이트로 막힘)

`isCloudflareWorkerRuntime()` (`lib/cloudflare-runtime.ts`)이 `WebSocketPair` 또는 OpenNext 심볼이 있을 때만 true다. Oracle Docker / `node server.mjs` / `next start`는 **둘 다 없다.** 아래 호출은 워커가 아니면 실행되지 않는다.

| 파일 | 하는 일 | Oracle에서 실제 경로 |
|---|---|---|
| `lib/db/get-binding.ts` | `getCloudflareContext()` → `env.DB` (D1) | `SqliteD1Adapter` / `globalThis.__allerp_sqlite_adapter` |
| `lib/object-storage.ts` | `env.R2.put/delete` | S3 키가 있으면 S3(OCI 또는 R2 엔드포인트), 없으면 **로컬 디스크** |
| `lib/realtime/server-signal.ts` | Durable Object `REALTIME_HUB` | `server.mjs`의 `globalThis.__allerp_realtime_hub.broadcastChange` |
| `app/api/storage/object/route.ts` | `env.R2.get` 스트림 | 로컬 디스크 → (워커면 R2) → S3 → 실패 |
| `app/api/d1/mutate/route.ts` | Workers `waitUntil`로 푸시 디스패치 | `void dispatchInsertedPushes()` fire-and-forget |
| `next.config.ts` | `initOpenNextCloudflareForDev()` | `USE_CLOUDFLARE_DEV=1`일 때만. 기본 꺼짐 (Node 빌트인 패치 사고 방지) |

즉 **Oracle 프로세스 안에서는 D1 쿼리·DO 허브·R2 바인딩이 호출되지 않는다.** 이름만 `getD1Binding()` / `uploadToR2()` / `provider: 'r2'`로 남아 있다.

### B. 이름은 Cloudflare인데 이미 Node로 충분한 것

| 이름 | 실제 |
|---|---|
| `DATA_BACKEND=d1` | SQLite 호환 API. `resolveDataBackend()`는 `'d1'` 고정 (`lib/db/get-binding.ts`) |
| `uploadToR2` / `buildR2AccessUrl` | S3 또는 로컬 디스크. 반환 `provider`는 여전히 `'r2'` |
| `lib/web-push-cloudflare.ts` | 표준 Web Push (VAPID + RFC 8291). Cloudflare 전용 아님 |
| `lib/fcm-http.ts` | FCM HTTP v1 (`fetch` + Web Crypto). Workers 호환이지만 Node에서도 동일 |
| `/api/d1/query`, `/api/d1/mutate` | 테이블 게이트웨이. 백엔드는 SQLite |
| `R2_CHAT_BUCKET=pchos-files` | 버킷 **이름**만. Oracle에서 S3 키가 없으면 디스크 디렉터리로 쓰인다 |

### C. 배포·도구 leftover (실행하면 Cloudflare로 다시 나간다)

끊지 않으면 누군가 `npm run deploy` / GitHub Actions가 **워커로 재배포**한다.

| 경로 | 역할 |
|---|---|
| `wrangler.toml` | Worker 이름 `erp-pchos`, 커스텀 도메인 `erp.pchos.kr`, D1 `pchos-d1-v2`, R2 `pchos-files`, DO `REALTIME_HUB` |
| `cloudflare-worker.ts` | OpenNext 래퍼 + cron + `/api/realtime/ws` → Durable Object |
| `open-next.config.ts` | `@opennextjs/cloudflare` |
| `package.json` | `build:cloudflare`, `preview:cloudflare`, `deploy:cloudflare` |
| `auto-deploy.mjs`, `upload-secrets.mjs`, `scripts/deploy.mjs` | wrangler secret / OpenNext deploy |
| `.github/workflows/deploy.yml` | `build:cloudflare` → `deploy:cloudflare` + D1 migrations apply |
| `scripts/export-d1-to-sqlite.mjs`, `scripts/_lib/d1.mjs`, `scripts/backup-cloudflare.mjs` | 이관·백업 도구 (운영 런타임 아님) |
| `scripts/bind-erp-custom-domain.mjs` 등 DNS/Pages 스크립트 다수 | 예전 CF 계정 작업 |

**이미 Oracle용으로 갈아탄 파이프**

| 경로 | 역할 |
|---|---|
| `Dockerfile` `CMD ["node", "server.mjs"]` | SQLite + WS + cron |
| `scripts/deploy-allerp.mjs` | SSH/SCP → `/opt/allerp` (주석: 2 OCPU / 12GB) |
| `npm run build` / `npm run server:standalone` | OpenNext 없음 |

---

## 2. 기능별 — Cloudflare를 끊어도 되는지

| 기능 | Cloudflare 의존 | Oracle에서 대체 | 판정 |
|---|---|---|---|
| 로그인/세션/권한 | 없음 (쿠키 HMAC + SQLite) | 동일 | 이미 Node |
| 인사·재고·결재·재무 CRUD | D1 바인딩만. 어댑터로 SQLite | `getD1Binding()` → better-sqlite3 | 이미 Node |
| 채팅 본문 | SQLite `messages` 24,340행 이관 완료 | 동일 | 이미 Node |
| 채팅/게시 첨부 **신규 업로드** | 워커면 R2 바인딩, 아니면 S3 또는 로컬 | Oracle `.env`에 S3 키 없으면 로컬 디스크 | Node로 충분. **구파일은 안 열림** |
| 채팅/게시 첨부 **구파일** | R2 버킷 `pchos-files`에 실물 | Oracle 디스크 chat=8, board=0 | **끊기 전 복사 필요** |
| 공개 URL `https://r2.pchos.kr` | DNS NXDOMAIN | 메시지 `file_url` 1,858건이 이 호스트 | **죽은 기준. 프록시 URL로 읽어야 함** |
| 실시간 채팅/알림 (앱 켜진 상태) | Durable Object `REALTIME_HUB` | `server.mjs` WS `/api/realtime/ws` | 이미 Node |
| 실시간 폴백 | SSE `/api/realtime/stream`, poll `/api/realtime/tail` | 동일 라우트, SQLite | 이미 Node |
| 백그라운드 알림 (모바일) | 없음 | FCM HTTP v1, 무료 | Node + Google (과금 0) |
| 백그라운드 알림 (PC 브라우저) | 없음 | Web Push VAPID, 무료 | 이미 Node |
| 크론 (백업, 연차, 푸시 회수) | wrangler `[triggers]` | `server.mjs` `node-cron` TZ=`Asia/Seoul` | 이미 Node. 스케줄이 CF와 **다름** (아래) |
| 이미지 `next/image` remotePatterns | `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` | 설정돼 있으면 `r2.pchos.kr` 허용 | 이름 leftover. NXDOMAIN이라 실효 없음 |

---

## 3. 실제로 아직 Cloudflare에 있는 데이터

선행 이관 점검과 코드를 맞춘 결과.

| 자산 | Cloudflare | Oracle `/opt/allerp` | 상태 |
|---|---|---|---|
| DB | D1 `pchos-d1-v2` (~71MB, 154 테이블) | `data/allerp.sqlite` 65MB, 163 테이블, 핵심 COUNT 일치 | **이관 성공** |
| 채팅 파일 | R2 `pchos-files` `chat/…` wrangler `--remote` GET 성공 | uploads/chat **8개** (최근만) | **미이관** |
| 게시판 파일 | R2 샘플 PNG GET 성공 | board **0** | **미이관** |
| 백업 파일 | — | backup 3530 | Oracle 쪽에 많음 |
| 메시지 URL | `r2.pchos.kr` 1858 + `/api/storage/object?provider=r2…` 1151 | DB 행은 sqlite에 있음. **바이트는 R2** | 앱이 Oracle만 보면 첨부 깨짐 |
| 공개 도메인 | `r2.pchos.kr` NXDOMAIN | — | 브라우저 직접 GET 불가. 프록시 또는 복사 필요 |
| KV | 없음 | — | 의존 없음 |
| Pages | `allemr-client`, `allemr-homepage`, `pchweb` | AllERP와 별개 | ERP 런타임과 무관 |
| DNS `erp.pchos.kr` | wrangler routes에 custom_domain 선언 | A 레코드가 Oracle IP | **트래픽은 VM으로 감.** 워커 커스텀 도메인과 충돌 여지는 leftover |

Oracle 조사 시점: `docker ps` 비어 있음, 80/443/3000 미리스닝. **실시간 기능은 VM에서 아직 살아 있지 않다.** SQLite 파일만 디스크에 있다.

---

## 4. 실시간 구현 — 이미 있는 것과 카카오톡과의 차이

### 4.1 이미 있는 3단 파이프 (PC · 모바일 웹 · Electron 공통)

클라이언트 `lib/polling-bus.ts`:

1. **WebSocket** `wss://<같은 호스트>/api/realtime/ws` (1순위)
2. 실패 시 **SSE** `/api/realtime/stream`
3. 둘 다 실패 시 **폴링** `/api/realtime/tail`

WS가 붙으면 폴링 타이머를 **끈다** (`syncPollingIntervalsInternal`: `wsActive || sseActive`이면 interval clear). 채팅 메시지 폴백 간격은 `ROOM_MESSAGE_POLL_INTERVAL_MS = 2000` (`app/main/모바일/채팅/data-hooks.ts`).

서버 (Oracle):

- `server.mjs`가 같은 HTTP 서버에 `ws` 허브를 붙인다.
- 세션 쿠키 HMAC 검증, `chat_rooms.members` 멤버십, 타이핑은 방 멤버에게만.
- mutate/푸시 쪽에서 `emitRealtimeSignal()` → `__allerp_realtime_hub.broadcastChange`.

서버 (Cloudflare leftover):

- `cloudflare-worker.ts`가 같은 경로를 Durable Object로 포워드. Oracle 기동 시 이 코드는 프로세스에 없다.

### 4.2 앱이 꺼져 있을 때 (카카오톡의 “푸시”)

모바일 브라우저/PWA는 백그라운드 WebSocket을 유지하지 못한다. 카카오톡도 백그라운드는 자체 푸시(FCM/APNs)다.

AllERP:

| 단계 | 파일 | 지연 |
|---|---|---|
| 메시지 INSERT | `app/api/d1/mutate/route.ts` → `enqueueChatPushJob` + `dispatchChatPushForMessage` (응답 후 fire-and-forget) | 수초 안 |
| 클라이언트 즉시 트리거 | `lib/chat-push-client-trigger.ts` → `POST /api/notifications/chat-push?flush=rest` | 전송 직후 |
| 큐 회수 크론 | Oracle `*/1 * * * *` `/api/cron/chat-push-dispatch` (`server.mjs`) | 최대 ~1분 |
| 단말 전달 | FCM (`lib/fcm-http.ts`) 우선, 실패 시 Web Push (`lib/web-push-cloudflare.ts`) | Google/브라우저 인프라 |

PC Electron은 트레이에서도 폴링·WS를 유지한다 (`electron-app/main.js` 주석).

### 4.3 카카오톡급인가

| 카카오톡 체감 | AllERP 현재 | 비고 |
|---|---|---|
| 앱 켠 채팅 즉시 도착 | WS 브로드캐스트 | 같은 VM이면 RTT는 국내 왕복 수준. 추가 중계 서버 없음 |
| 타이핑 표시 | WS `typing:start/stop` | 있음 |
| 앱 꺼진 알림 | FCM + Web Push | 있음. 카카오톡과 같은 계층 |
| 사진/파일 즉시 | URL만 실시간. **바이트는 R2에 남음** | 파일 복사 전엔 알림만 오고 이미지가 깨질 수 있음 |
| 네이티브 소켓 유지 | 웹/PWA/Electron | 네이티브 앱이 아님. 백그라운드는 푸시가 정답 |
| 읽음/안읽음 | DB + 폴링/WS 채널 | 실시간 허브와 별개 테이블 |

**추가로 Pusher/Ably/Supabase Realtime/CF Durable Object를 살릴 필요는 없다.** 포그라운드 지연을 더 줄이려면 WS만 안정적으로 붙이면 되고, 그건 코드가 아니라 **Docker를 올리고 443에서 WSS 업그레이드를 통과**시키는 운영 문제다.

크론 불일치 (기능 차이, 비용 아님):

| 작업 | Cloudflare `wrangler.toml` / `cloudflare-worker.ts` | Oracle `server.mjs` |
|---|---|---|
| chat-push-dispatch | 5분 (`*/5`) | **1분** (`*/1`) |
| backup 등 | UTC 슬롯 | **KST 고정** `timezone: 'Asia/Seoul'` |
| 결근 자동생성 | UTC 17:00 묶음 | KST 00:00 |

---

## 5. 비용 — “Oracle VM을 통하면 돈이 안 나오나”

질문의 핵심: 알림·알람·채팅을 모바일/PC 실시간으로 구현해도, 오라클 VM만 쓰면 **추가 과금이 없나**.

### 5.1 답

**Cloudflare 쪽 추가 과금: 없다.** 트래픽이 VM의 `server.mjs`만 치면 Worker 요청, Durable Object 요청, D1 쿼리 과금은 0이다.

**VM 안에서 WebSocket을 여는 추가 상품 요금: 없다.** `ws` 패키지가 같은 Node 프로세스에서 업그레이드만 한다. 소켓 수만큼 RAM이 늘 뿐이고, 재직 45·기기 2대 가정 ≈ 100개 연결은 12GB에서 측정 오차 수준이다.

**FCM / Web Push 추가 요금: 없다.**

- FCM은 Firebase Spark·Blaze 모두 Cloud Messaging 과금 0, 메시지 수 한도 없음 (Google 공식, 2026).
- Web Push는 브라우저 제조사 엔드포인트(FCM/Mozilla/Apple)로 VAPID 요청. 병원 규모에서 과금 항목 없음.

### 5.2 VM 자체는 이미 있는 비용 (실시간과 무관)

`scripts/deploy-allerp.mjs` 주석: **2 OCPU / 12GB**.

2026-06 이후 Oracle Always Free Ampere A1 한도가 **2 OCPU / 12GB / 월 1,500 OCPU시간**으로 반토막 났다. 이 스펙은 그 한도에 **딱 맞다.**

| 조건 | 컴퓨트 요금 |
|---|---|
| Always Free 테넌시 + 홈 리전 A1 허용 + 이 VM만 2/12 | **$0** |
| Pay-as-you-go인데 한도 내 A1 | 보통 $0 (문서상 전 테넌시 첫 1,500 OCPU시간) |
| 춘천(South Korea North) **신규** Always Free A1 | 커뮤니티 공지상 **생성 불가** |
| AMD/Intel 유료 shape, 또는 2/12를 넘는 두 번째 A1 | 과금 |

이 조사는 **OCI 콘솔 인보이스를 열지 않았다.** IP `161.33.162.195`의 shape·리전·테넌시 타입은 미확인. “스펙이 무료 한도와 같다”이지 “청구서가 0원이다”가 아니다.

Always Free에 같이 붙는 한도 (실시간과 무관하지만 파일 이관 때 관련):

| 항목 | 한도 | AllERP 현실 |
|---|---|---|
| 아웃바운드 | 월 10TB | 채팅 텍스트는 MB. 이미지도 병원 규모로 GB 이하 |
| 블록 볼륨 | 200GB | sqlite 65MB + 로컬 업로드. R2 전량 복사해도 수 GB 예상 |
| Object Storage | 20GB | OCI S3 호환으로 옮겨도 여유 |

실시간 연결을 늘린다고 10TB를 뚫을 구조가 아니다. 비용을 키우는 쪽은 **대용량 첨부 다운로드를 VM 공인 IP로 직접 흘리는 것**인데, 그래도 10TB 안에 들어온다.

### 5.3 실시간 켜도 생기는 비용 / 안 생기는 비용

| 항목 | 실시간 WS+푸시 추가 시 | 비고 |
|---|---|---|
| Oracle vCPU/RAM | 증가량 무시 가능 | 이미 산 머신(또는 Always Free) |
| Oracle 아웃바운드 | 채팅 프레임은 수 KB | 파일 본문이 VM을 거치면 증가 |
| Cloudflare Worker/DO/D1 | **$0** (안 탐) | DNS가 VM을 가리키는 한 |
| Cloudflare R2 | 파일 안 옮기면 **소액 지속** | 저장 $0.015/GB·월, Class A/B 요청. 현재 용량은 사실상 $0에 가깝지만 계정·버킷이 살아 있음 |
| FCM | $0 | |
| Web Push | $0 | |
| Pusher/Ably 같은 외부 실시간 | **안 사도 됨** | 이미 `server.mjs` |
| Gemini 등 AI | 실시간과 무관 | `.env.production.example`에 키 슬롯만 |

### 5.4 비용을 다시 만들 수 있는 실수

1. GitHub `deploy.yml` 또는 `npm run deploy:cloudflare`로 워커를 다시 `erp.pchos.kr`에 붙인다 → Worker/DO/D1 과금 + DNS 충돌.
2. Oracle `.env`에 R2 액세스 키를 넣고 `S3_ENDPOINT`를 `*.r2.cloudflarestorage.com`으로 둔다 → 업로드가 다시 R2. 동작은 하지만 CF 청구가 남는다.
3. `r2.pchos.kr` DNS를 되살려 브라우저가 R2를 직접 치게 한다 → R2 Class B. 금액은 작아도 의존이 남는다.
4. 외부 실시간 SaaS를 “카카오톡급”이라며 추가한다 → **불필요 과금.**

---

## 6. 끊어야 할 것 / 이미 Node로 충분한 것

코드 수정은 이 보고서 범위 밖. 운영 순서만.

### 이미 Node로 충분 (손대지 않아도 기능 설계는 Oracle)

- DB 읽기/쓰기 (`getD1Binding` → sqlite)
- 채팅 WS / SSE / 폴링
- 알림 INSERT + FCM + Web Push
- 크론 (server.mjs)
- 신규 파일 업로드 (로컬 디스크 폴백)

### 끊기 전에 옮겨야 함 (안 옮기면 기능 결손)

- R2 `pchos-files` (및 chart/pacs 버킷이 쓰이면 그것) → Oracle 디스크 또는 OCI Object Storage
- DB `file_url`이 `https://r2.pchos.kr/...` 인 행 → `/api/storage/object?provider=r2&bucket=...&key=...` 또는 새 공개 URL
- `document_repository.file_url` 389건 공백은 R2와 별개 이슈 (선행 점검)

### 옮겨 놓고 끊을 것 (의존·오배포 방지)

- `.github/workflows/deploy.yml`의 `deploy:cloudflare`
- `wrangler.toml` custom_domain `erp.pchos.kr` (DNS는 이미 A 레코드)
- 운영 `.env`의 `CLOUDFLARE_API_TOKEN`, `R2_ACCOUNT_ID`, `R2_BUCKET` (S3/OCI를 쓸 게 아니면)
- `NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://r2.pchos.kr` (NXDOMAIN)

### 이름 leftover (동작에 무해, 정리하면 오해만 줄어듦)

- 함수명 `uploadToR2`, 반환 `provider: 'r2'`
- 경로 `/api/d1/*`
- `lib/web-push-cloudflare.ts` 파일명
- `package.json`의 `build:cloudflare` (로컬에서 실수로 실행하지 않는 한)

---

## 7. 권고 (실행은 별도 승인)

우선순위만. 이 문서는 구현하지 않는다.

1. Oracle Docker를 `server.mjs`로 기동하고 443에서 HTTP + **WSS 업그레이드** 확인. 지금 실시간 비용 논의는 코드 기준이지 운영 실측이 아니다.
2. R2 실물을 Oracle로 복사 (`scripts/copy-r2-files.mjs` 등 leftover 스크립트 존재). 복사 전에 CF를 지우면 채팅 이미지가 영구 손실.
3. 복사 검증 후 CI의 `deploy:cloudflare`를 끄고, wrangler 커스텀 도메인을 제거.
4. 실시간은 **있는 WS + FCM**을 쓰면 된다. 새 과금 상품을 넣지 않는다.

---

## 8. 근거 파일 (핵심만)

| 주제 | 파일 |
|---|---|
| 워커 게이트 | `lib/cloudflare-runtime.ts` |
| DB 분기 | `lib/db/get-binding.ts` |
| 파일 분기 | `lib/object-storage.ts`, `lib/s3-storage.ts`, `app/api/storage/object/route.ts` |
| 신호 분기 | `lib/realtime/server-signal.ts` |
| Oracle 서버 | `server.mjs`, `Dockerfile` |
| 클라 실시간 | `lib/polling-bus.ts` |
| 채팅 폴링 2초 | `app/main/모바일/채팅/data-hooks.ts` |
| 푸시 | `lib/chat-push-dispatch.ts`, `lib/chat-push-enqueue.ts`, `lib/chat-push-client-trigger.ts`, `lib/fcm-http.ts`, `lib/web-push-cloudflare.ts` |
| CF 배포 선언 | `wrangler.toml`, `cloudflare-worker.ts`, `open-next.config.ts` |
| CF CI | `.github/workflows/deploy.yml` |
| Oracle 배포 | `scripts/deploy-allerp.mjs`, `.env.production.example` |

---

## 9. 이 보고서가 단정하지 않는 것

- OCI 청구서 금액 (콘솔 미조회).
- Cloudflare 계정의 현재 월 청구 (R2 소액이 이미 찍히는지).
- 워커 `erp-pchos`가 workers.dev로 아직 살아 있는지 (커스텀 도메인 트래픽은 VM IP로 확인됨).
- R2 버킷 전체 객체 수 (wrangler 4.81.1에 `r2 object list` 없음. 샘플 GET만 성공).
- 춘천 리전 Always Free 기존 인스턴스 유지 여부.
