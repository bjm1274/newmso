'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { persistSupabaseAccessToken } from '@/lib/supabase-bridge';

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let ignore = false;

    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          localStorage.removeItem('erp_user');
          localStorage.removeItem('erp_login_at');
          persistSupabaseAccessToken(null);
          if (!ignore) setCheckingAuth(false);
          return;
        }

        const payload = await response.json();
        if (!payload?.authenticated || !payload.user) {
          localStorage.removeItem('erp_user');
          localStorage.removeItem('erp_login_at');
          persistSupabaseAccessToken(null);
          if (!ignore) setCheckingAuth(false);
          return;
        }

        localStorage.setItem('erp_user', JSON.stringify(payload.user));
        persistSupabaseAccessToken(payload.supabaseAccessToken ?? null);
        void supabase.realtime.setAuth(payload.supabaseAccessToken ?? null);
        router.replace('/main');
      } catch {
        localStorage.removeItem('erp_user');
        localStorage.removeItem('erp_login_at');
        persistSupabaseAccessToken(null);
        if (!ignore) setCheckingAuth(false);
      }
    };

    void checkSession();
    return () => {
      ignore = true;
    };
  }, [router]);

  const handleLogin = async () => {
    if (!loginId || !password) {
      setError("아이디와 비밀번호를 모두 입력해주세요.");
      return;
    }
    setLoading(true);
    setError('');

    try {
      const loginRes = await fetch('/api/auth/master-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });
      const payload = await loginRes.json();

      if (!loginRes.ok || !payload?.success || !payload?.user) {
        setError(payload?.error || '로그인에 실패했습니다.');
        setLoading(false);
        return;
      }

      localStorage.setItem('erp_user', JSON.stringify(payload.user));
      localStorage.setItem('erp_login_at', new Date().toISOString());
      persistSupabaseAccessToken(payload.supabaseAccessToken ?? null);
      void supabase.realtime.setAuth(payload.supabaseAccessToken ?? null);
      setLoading(false);
      if (payload.notice) {
        toast(payload.notice);
      }
      router.push('/main');
    } catch {
      setError('시스템 접속 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-[100dvh] bg-[var(--page-bg)] flex flex-col items-center justify-center gap-3">
        <div className="w-7 h-7 border-2 border-[var(--accent)] rounded-full border-t-transparent animate-spin" />
        <p className="text-xs text-[var(--toss-gray-3)]">로그인 상태 확인 중...</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] bg-[var(--page-bg)] flex flex-col justify-center py-10 px-4"
      data-testid="login-page"
    >
      <div className="mx-auto w-full max-w-[360px]">
        {/* 헤더 */}
        <div className="mb-7 text-center">
          <h1 className="text-[22px] font-bold text-[var(--foreground)] tracking-tight">
            SY INC. 통합 시스템
          </h1>
        </div>

        {/* 로그인 카드 */}
        <div
          className="bg-[var(--card)] rounded-[14px] border border-[var(--border)] shadow-[var(--shadow-sm)] px-6 py-7 animate-premium-fade"
          data-testid="login-form"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-4)] mb-1.5">아이디</label>
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                data-testid="login-id-input"
                className="w-full px-3.5 py-2.5 bg-[var(--tab-bg)] rounded-[8px] text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20 border border-transparent focus:border-[var(--accent)] transition-all text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)]"
                placeholder="사번 또는 이름"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-4)] mb-1.5">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password-input"
                className="w-full px-3.5 py-2.5 bg-[var(--tab-bg)] rounded-[8px] text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--accent)]/20 border border-transparent focus:border-[var(--accent)] transition-all text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)]"
                placeholder="비밀번호"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

            {error && (
              <div className="bg-[var(--danger-light)] px-3 py-2.5 rounded-[8px] border border-red-100">
                <p className="text-[var(--danger)] text-xs font-semibold">{error}</p>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              data-testid="login-submit-button"
              className="mt-1 w-full py-2.5 bg-[var(--accent)] text-white rounded-[8px] font-semibold text-sm hover:bg-[var(--accent-hover)] active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {loading ? '인증 중...' : '로그인'}
            </button>
          </div>

          <p className="mt-5 text-center text-[11px] text-[var(--toss-gray-3)]">
            Made by JM
          </p>
        </div>

        <p className="mt-8 text-center text-[10px] text-[var(--toss-gray-3)] leading-relaxed">
          © 2026 SY INC. 본 시스템은 인가된 사용자만 접근 가능합니다.
        </p>
      </div>
    </div>
  );
}
