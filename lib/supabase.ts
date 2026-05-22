import type { SupabaseClient } from '@supabase/supabase-js';
import { d1Client } from './d1-supabase-compat';

// Phase 9 — Supabase 런타임 의존 제거(Cloudflare D1 컷오버 완료).
//
// 과거: `supabase`는 Supabase 클라이언트를 감싼 Proxy 였다. 브라우저에서
// `.from()`·`.rpc()`만 d1Client로 가로채고 나머지(.auth/.storage/.realtime/
// .channel/.functions)는 실제 Supabase 클라이언트로 흘려보냈다.
//
// 현재: Realtime은 polling으로, Storage는 R2로, Auth는 자체 세션으로
// 전환 완료되어 Supabase 내장 API 호출이 코드베이스에 남아 있지 않다.
// 따라서 런타임 객체는 d1Client 그 자체다 — `.from()`·`.rpc()`는 D1
// (/api/d1/query·/api/d1/mutate·/api/d1/rpc/*)로 라우팅되고, `.channel()`·
// `.removeChannel()`는 legacy 호환용 no-op 이다. `createClient`·`realSupabase`·
// Proxy 하이브리드는 모두 제거됐다(실제 Supabase 클라이언트 미생성).
//
// 타입: 호출부 200여 개 파일이 `supabase`를 `SupabaseClient` 형태로
// 사용하므로(느슨한 빌더 체이닝) 공개 타입은 `SupabaseClient`로 유지한다.
// `@supabase/supabase-js` import는 타입 전용(`import type`)이며 런타임
// 코드를 일절 포함하지 않는다 — 빌드 산출물에 Supabase 런타임은 없다.
//
// 서버(Node.js)·클라이언트(브라우저) 모두 동일하게 d1Client 를 사용한다.
export const supabase = d1Client as unknown as SupabaseClient;
