export const SUPABASE_ACCESS_TOKEN_STORAGE_KEY = 'erp_supabase_access_token';

export function getStoredSupabaseAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(SUPABASE_ACCESS_TOKEN_STORAGE_KEY);
}

export function persistSupabaseAccessToken(token?: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(SUPABASE_ACCESS_TOKEN_STORAGE_KEY, token);
    return;
  }
  window.localStorage.removeItem(SUPABASE_ACCESS_TOKEN_STORAGE_KEY);
}

