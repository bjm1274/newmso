import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getStoredSupabaseAccessToken } from './supabase-bridge';

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

export const supabase: SupabaseClient = createClient(url, key, {
  accessToken: async () => getStoredSupabaseAccessToken(),
});
