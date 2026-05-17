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

// Phase 6-B-3 — 클라이언트(브라우저)에서 DATA_BACKEND='d1'일 때 d1-supabase-compat
// 으로 자동 라우팅. 서버(Node.js)에서는 항상 realSupabase 사용.
// 서버는 fetch('/api/d1/...')로 self-call이 무한 루프라 d1Client 사용 금지.
//
// 100+ 클라이언트 파일이 import 라인 그대로 두고도 D1 백엔드로 동작.
// 미호환 호출(rpc, channel 등)은 d1Client 안의 fallback이 처리.
const isClientD1 =
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_DATA_BACKEND === 'd1';

export const supabase = (isClientD1
  ? (d1Client as unknown as SupabaseClient)
  : realSupabase);
