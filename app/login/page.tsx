'use client';
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
        alert(payload.notice);
      }
      router.push('/main');
    } catch {
      setError('시스템 접속 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[var(--background)] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--toss-blue)] rounded-full border-t-transparent animate-spin" />
        <p className="mt-4 text-xs font-medium text-[var(--toss-gray-3)]">로그인 상태 확인 중...</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen min-h-[100dvh] bg-[var(--background)] flex flex-col justify-center py-8 px-4 lg:px-8"
      data-testid="login-page"
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-sm text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-[var(--foreground)] tracking-tight">
          SY INC. 통합 시스템
        </h2>
        <p className="mt-2 text-[11px] font-medium text-[var(--toss-gray-3)] uppercase tracking-wider">
          통합 의료경영지원 시스템
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-sm">
        <div className="bg-[var(--toss-card)] py-8 px-6 rounded-[20px] shadow-sm border border-[var(--toss-border)] animate-in slide-in-from-bottom-10 duration-500">
          <div className="space-y-6" data-testid="login-form">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-2 ml-1">아이디 (사번 또는 이름)</label>
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                data-testid="login-id-input"
                className="w-full p-4 bg-[var(--input-bg)] rounded-[12px] text-sm font-medium outline-none focus:ring-2 ring-[var(--toss-blue)]/30 border border-transparent focus:border-[var(--toss-blue)] transition-all text-[var(--foreground)]"
                placeholder="사번 또는 이름 (동명이인은 사번 입력)"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-2 ml-1">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password-input"
                className="w-full p-4 bg-[var(--input-bg)] rounded-[12px] text-sm font-medium outline-none focus:ring-2 ring-[var(--toss-blue)]/30 border border-transparent focus:border-[var(--toss-blue)] transition-all text-[var(--foreground)]"
                placeholder="비밀번호 입력"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            {error && (
              <div className="bg-red-50 p-3 rounded-[12px] border border-red-100">
                <p className="text-red-500 text-[11px] font-semibold flex items-center gap-2"><span>⚠️</span> {error}</p>
              </div>
            )}
            <button
              onClick={handleLogin}
              disabled={loading}
              data-testid="login-submit-button"
              className="w-full py-4 bg-[var(--toss-blue)] text-white rounded-[12px] font-semibold text-[15px] hover:bg-[var(--toss-blue)] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? '인증 진행 중...' : '로그인'}
            </button>
            <p className="mt-4 text-[16px] text-[var(--toss-gray-4)] text-center font-bold tracking-wide">
              Made by JM
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-[10px] text-[var(--toss-gray-3)] font-bold leading-relaxed">
            © 2026 SY INC. Management Service Organization.
            <br />본 시스템은 인가된 사용자만 접근 가능합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
