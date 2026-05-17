# D1 컷오버 진행 상태 + 남은 작업 (2026-05-18)

## 한눈에 보기

| 단계 | 진행 | 결과 |
|---|---|---|
| Phase 1 (스키마/함수/정책 이식) | ✅ 완료 | 136 테이블 + 177 인덱스 production D1 적용 |
| Phase 2 (테이블별 dual-write 18개) | ✅ 완료 | notifications/messages/payroll_records 등 |
| Phase 3 (backfill + dual-write 컷오버 + 배포) | ✅ 완료 | 21 테이블 backfill, production live |
| Phase 4 (RLS 72개 → 14 패턴 + 30 테이블 POLICY_REGISTRY) | ✅ 완료 | POLICY_REGISTRY 등록 |
| Phase 5 (Realtime → polling 전환) | ✅ 완료 | polling-bus + 8 채널 교체 |
| Phase 6 (Generic D1 query/mutate API + d1-supabase-compat) | ✅ 완료 | /api/d1/query, /api/d1/mutate + supabase 호환 클라이언트 |
| Phase 7 (DATA_BACKEND='d1' 활성화) | ⚠️ **롤백됨** | 회귀 발견 (아래 §회귀 원인 참조) |
| Phase 8-A (인앱 알림 7가지 서버 cron) | ✅ 완료 | `lib/inapp-notification-jobs.ts` + `/api/cron/inapp-notifications` |
| Phase 8-B (서버 supabase 제거 인벤토리 + notification-utils.ts) | ✅ 완료 | 인벤토리 보고서 + 시범 변환 |
| Phase 8-C (high priority 4파일) | ✅ 완료 | audit/payroll/approval-processing/roster 변환 |
| Phase 8-D (medium write-only 10파일) | ✅ 완료 | annual-leave/data/official-docs/etc |
| Phase 8-E (read+write 혼재 4파일) | ✅ 완료 | auto-report/board-broadcast/chat-rooms/push-subscription |
| Phase 8-F (admin/reset-staff + board-broadcast 잔재) | ✅ 완료 | 24 의존 테이블 모두 D1 변환 |
| Phase 8-G (cron 전용 6파일) | ✅ 완료 | leave-notice/license-expiry/notification-repush/todo-reminder/etc |
| Phase 8-H (read-only 3파일) | ✅ 완료 | chat-push-health/admin/push-health/virtual-account-deposits |

총 **31 commit ahead of origin/main**. tsc 0 errors.

## 회귀 원인 (Phase 7 활성화 직후)

배포 후 사용자가 로그인 단계부터 "시스템 접속 중 오류가 발생했습니다" + 게시판/채팅/결재 모든 자료 안 보임.

### 원인 1 — d1-supabase-compat이 supabase 내장 API 미호환

`lib/d1-supabase-compat.ts`는 `.from().select/insert/update/delete`만 호환합니다. 하지만 코드 곳곳에서 사용되는 다음 API는 미구현:

| supabase API | 사용 위치 (예시) | d1Client 동작 |
|---|---|---|
| `supabase.realtime.setAuth()` | `app/login/page.tsx:46, 87` | `undefined.setAuth()` → runtime error |
| `supabase.auth.*` | (없음 — auth는 자체 HMAC 세션이라 사실상 미사용) | undefined |
| `supabase.storage.*` | 일부 첨부 업로드 화면 | undefined |
| `supabase.rpc()` | `inventory-utils.ts`, `useStockModal.ts` 등 (이미 별도 라우트로 옮긴 곳도 있음) | `{ error: 'rpc() not supported' }` |

→ **login page 자체 로딩 실패** = 어떤 화면도 못 들어감.

### 원인 2 — POLICY_REGISTRY 미등록 테이블 다수

`/api/d1/query`는 `ALLOWED_TABLES`로 whitelist 적용. 현재 30개만 등록.
실제 클라이언트가 호출하는 미등록 테이블:

- `suppliers`
- `inventory_logs`
- `inventory_items` (별도 — `inventory`와 다름)
- `surgery_templates`
- `handover_notes`
- `chat_room_prefs`
- `board_post_likes`
- `board_post_comments`
- `room_read_cursors`
- `message_reactions`
- `message_bookmarks`
- `pinned_messages`
- `polls`
- `poll_votes`
- `staff_certifications`
- `staff_licenses`
- ... (대략 30~50개 추가)

각각 read 시 `Table not allowed: X` 403.

### 원인 3 — D1 schema에 없는 테이블

D1 schema는 136 테이블이지만 운영 중 일부 신규 테이블이 Supabase에만 추가됐을 수 있습니다 (예: `chat_room_prefs`, `surgery_templates`, `inventory_items`). 이런 테이블은 D1으로 변환 시 `no such table` 에러.

## 현재 상태 (롤백 직후)

작업한 변경:
- `lib/supabase.ts`: `ENABLE_D1_CLIENT = false` (롤백)
- `wrangler.toml`: `DATA_BACKEND = "dual-write"` (롤백)

사용자가 빌드 + 배포하면 운영 정상화. **이 변경은 아직 commit 안 했으니 사용자 결정 후 commit/배포.**

## 남은 작업 (재시도 위한 보강)

### Phase 8-J — d1-supabase-compat에 supabase 내장 API stub

`lib/d1-supabase-compat.ts`의 `D1ClientImpl`에 다음 stub 메소드 추가:

```ts
class D1ClientImpl {
  // 기존: from(), rpc(), channel(), removeChannel()
  // 추가:
  realtime = {
    setAuth: (_token: string | null) => Promise.resolve(),
    channel: () => ({ on: () => ({}), subscribe: () => {}, unsubscribe: () => {} }),
  };
  auth = {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  };
  storage = {
    from: (_bucket: string) => ({ 
      upload: () => Promise.resolve({ data: null, error: { message: 'storage not supported' } }),
      download: () => Promise.resolve({ data: null, error: { message: 'storage not supported' } }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      list: () => Promise.resolve({ data: [], error: null }),
      remove: () => Promise.resolve({ data: null, error: null }),
    }),
  };
}
```

또는 **더 안전한 hybrid 패턴** — Proxy로 `.from()`만 d1Client, 나머지는 realSupabase fallback:

```ts
// lib/supabase.ts
export const supabase = new Proxy(realSupabase, {
  get(target, prop) {
    if (isClientD1 && prop === 'from') {
      return d1Client.from.bind(d1Client);
    }
    return Reflect.get(target, prop);
  },
});
```

이게 가장 호환성 좋음. realtime/auth/storage는 realSupabase 그대로 사용.

### Phase 8-K — POLICY_REGISTRY 확장

미등록 테이블 식별 + 등록 필요:

1. **빠른 식별 방법**:
   ```powershell
   # 클라이언트가 호출하는 테이블 vs POLICY_REGISTRY 등록 테이블 diff
   grep -roh "supabase\.from(['\"]\w\+['\"]\)" app/main lib --include="*.ts" --include="*.tsx" | sort -u
   ```
   
2. **각 미등록 테이블에 패턴 할당** (Phase 4 패턴 14개 중 선택)
   - 단순한 경우 `PUBLIC` (인증 사용자 누구나)
   - 본인 데이터 `SELF_ONLY` (`user_id` field)
   - 회사 단위 `MANAGE_COMPANY_OR_NULL` 등

3. **D1 schema에 테이블 없는 경우**:
   - 마이그레이션 추가: `lib/db/migrations/0003_extra_tables.sql`
   - Supabase에서 backfill

### Phase 8-Z — 대형 파일 변환 (admin/system-master 1302줄)

`app/api/admin/system-master/route.ts`는 30개+ supabase 호출 + RPC. 별도 작업 필요:
- 헬퍼 분리 (관리자 대시보드, 채팅 모니터링, 사용자 관리 등 도메인별)
- chat_room_cleanup_via_rpc 등 RPC를 D1 TS 포트로

### Phase 9 — Phase 8-J/K 적용 후 재시도

1. `lib/supabase.ts`의 hybrid Proxy 패턴 적용
2. POLICY_REGISTRY 확장
3. D1 schema 누락 테이블 마이그레이션 추가
4. `ENABLE_D1_CLIENT = true` 다시 활성화
5. 빌드 + 배포 + 24시간 모니터링

### Phase 10 — Supabase Pro 해지 결정

Phase 9 운영 검증 끝나면:
- Supabase Dashboard에서 7일 egress / DB size 추이 확인
- Free tier(5GB egress, 500MB DB) 진입 가능하면 Pro 해지
- 또는 dual-write 영구 유지하면서 Pro 유지

## 즉시 사용자 조치 (지금)

1. **현재 롤백 변경 사항을 빌드 + 배포** — 운영 정상화:
   ```powershell
   npm run build:cloudflare
   npm run deploy:cloudflare
   ```

2. 배포 후 https://erp.pchos.kr 정상 동작 확인 (로그인 + 게시판/채팅/결재).

3. 다음 세션에서 "Phase 8-J/K 진행"이라고 말씀하시면 재시도 작업 시작.

## 학습 요약

- d1-supabase-compat의 호환 범위 검증을 사전에 더 면밀히 했어야 함 (`supabase.realtime` 같은 client-side 호출)
- POLICY_REGISTRY 등록 테이블 vs 실제 호출 테이블 cross-check 필요
- Phase 7 활성화 전에 staging 또는 `?d1=1` URL 파라미터로 부분 활성화 테스트 권장
- 대규모 변경은 한 번에 활성화하지 말고 화면 단위 점진 적용 권장 (예: 채팅만 먼저)

## 운영 상 영향

- Phase 7 활성화는 약 X분간 운영 영향 (사용자 경험: 로그인 안 됨)
- 롤백 후 dual-write 모드로 정상 동작
- Phase 8 작업(서버 supabase 제거)은 운영 영향 없음 — D1 binding이 binding 없을 때 throw하지만 dual-write 모드에선 D1 binding 항상 존재
- 또한 Phase 7 + Phase 8 commit은 모두 main에 있고 운영은 dual-write 모드 — 다음 활성화 시 보강만 추가
