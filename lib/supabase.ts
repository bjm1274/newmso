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
// ENABLE_D1_CLIENT=true 면 클라이언트(브라우저)의 모든 supabase.from() 호출이
// /api/d1/query (SELECT) 또는 /api/d1/mutate (INSERT/UPDATE/DELETE)로 라우팅됨.
// 서버(Node.js)에서는 항상 realSupabase 사용 — self-call 무한 루프 방지 + 서버
// dual-write 헬퍼는 D1 binding을 직접 사용하므로 무관.
//
// 100+ 클라이언트 파일이 import 라인 그대로 두고도 D1 백엔드로 동작.
// 미호환 호출(rpc, channel 등)은 d1Client 안의 fallback이 처리.
//
// 운영 영향 발생 시 (예: 화면 깨짐, 'rpc() not supported' 다발) 이 플래그를
// false로 되돌리고 재배포로 즉시 롤백.
const ENABLE_D1_CLIENT = true;
const isClientD1 = typeof window !== 'undefined' && ENABLE_D1_CLIENT;

export const supabase = (isClientD1
  ? (d1Client as unknown as SupabaseClient)
  : realSupabase);
