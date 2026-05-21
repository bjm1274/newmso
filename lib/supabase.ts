import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getStoredSupabaseAccessToken } from './supabase-bridge';
import { d1Client } from './d1-supabase-compat';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

function getSupabaseConfig(): { url: string; key: string } {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl : PLACEHOLDER_URL;
  const key = typeof rawKey === 'string' && rawKey.trim() ? rawKey : PLACEHOLDER_KEY;
  return { url, key };
}

const { url, key } = getSupabaseConfig();

const shouldWarnMissingSupabaseConfig =
  (url === PLACEHOLDER_URL || key === PLACEHOLDER_KEY) &&
  typeof window !== 'undefined' &&
  process.env.NODE_ENV !== 'test' &&
  !(typeof navigator !== 'undefined' && navigator.webdriver);

if (shouldWarnMissingSupabaseConfig) {
  console.warn(
    '[SY INC. ERP] Supabase URL 또는 Anon Key가 설정되지 않았습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 추가하세요.'
  );
}

const realSupabase: SupabaseClient = createClient(url, key, {
  accessToken: async () => getStoredSupabaseAccessToken(),
});

// Phase 7 — Cloudflare D1 cutover.
// ENABLE_D1_CLIENT=true 면 클라이언트(브라우저)의 `supabase.from()` 호출만
// d1Client로 라우팅(/api/d1/query·/api/d1/mutate). 나머지 supabase 내장 API
// (.realtime, .auth, .storage, .channel, .rpc 등)는 realSupabase로 그대로 흘러감.
//
// Phase 8-J — 이전 cutover 시도(전체 d1Client cast)는 login page의
// `supabase.realtime.setAuth()` 호출이 undefined.setAuth → runtime error로
// 로그인 자체가 불가능했음. Proxy hybrid로 .from()만 D1, 나머지는 realSupabase.
//
// 서버(Node.js)에서는 항상 realSupabase 사용 — self-call 무한 루프 방지.
//
// 운영 영향 발생 시 이 플래그를 false로 되돌리고 재배포로 즉시 롤백.
const ENABLE_D1_CLIENT = true;
const isClientD1 = typeof window !== 'undefined' && ENABLE_D1_CLIENT;

function createHybridSupabase(): SupabaseClient {
  // .from()만 d1Client로 가로채고, 나머지 prop은 realSupabase 그대로 사용.
  return new Proxy(realSupabase, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        // 클라이언트가 supabase.from(table)을 호출하면 d1Client.from()이 처리
        return d1Client.from.bind(d1Client);
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
}

export const supabase: SupabaseClient = isClientD1
  ? createHybridSupabase()
  : realSupabase;
