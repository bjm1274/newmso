'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  // 이미 로그인된 상태면(erp_user 있음) 메인으로 이동 — 로그아웃 누르기 전까지 유지
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('erp_user');
    if (stored) {
      try {
        JSON.parse(stored);
        router.replace('/main');
        return;
      } catch {
        // 잘못된 저장값이면 무시
      }
    }
    setCheckingAuth(false);
  }, [router]);

  const handleLogin = async () => {
    if (!loginId || !password) {
      setError("아이디와 비밀번호를 모두 입력해주세요.");
      return;
    }
    setLoading(true);
    setError('');

    // 마스터 계정 체크 (서버에서 환경변수로 검증)
    let masterData: any = { success: false };
    try {
      const masterRes = await fetch('/api/auth/master-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });
      if (masterRes.ok) {
        masterData = await masterRes.json();
      }
    } catch {
      // 마스터 로그인 API 오류 시 일반 로그인으로 진행
    }
    if (masterData.success) {
      localStorage.setItem('erp_user', JSON.stringify(masterData.user));
      localStorage.setItem('erp_login_at', new Date().toISOString());
      setLoading(false);
      router.push('/main');
      return;
    }

    try {
      const idTrim = loginId.trim();
      // 1) 사번(employee_no)으로 조회 — 고유하므로 동명이인 구분 가능
      const { data: byNo } = await supabase
        .from('staff_members')
        .select('*')
        .eq('employee_no', idTrim)
        .maybeSingle();
      if (byNo) {
        const user = byNo;
        const savedPassword = (user.password ?? user.passwd ?? '').toString().trim();
        const isFirstLogin = !savedPassword;
        if (isFirstLogin) {
          const { error: pwErr } = await supabase.from('staff_members').update({ password }).eq('id', user.id);
          if (pwErr) {
            setError("비밀번호 설정 중 오류가 발생했습니다.");
            setLoading(false);
            return;
          }
        } else if (savedPassword !== password) {
          setError("비밀번호가 일치하지 않습니다.");
          setLoading(false);
          return;
        }
        const toStore = { ...user, password: isFirstLogin ? password : user.password, company_id: user.company_id ?? null };
        localStorage.setItem('erp_user', JSON.stringify(toStore));
        localStorage.setItem('erp_login_at', new Date().toISOString());
        setLoading(false);
        if (isFirstLogin) alert("비밀번호가 설정되었습니다. 다음 로그인부터 이 비밀번호를 사용해 주세요.");
        router.push('/main');
        return;
      }

      // 2) 이름으로 조회 — 동명이인 있으면 사번 입력 유도
      const { data: rows, error: dbError } = await supabase
        .from('staff_members')
        .select('*')
        .eq('name', idTrim);
      if (dbError) {
        setError("등록된 아이디가 없습니다. 확인 후 다시 시도하세요.");
        setLoading(false);
        return;
      }
      if (!rows?.length) {
        setError("등록된 사번 또는 이름이 없습니다. 확인 후 다시 시도하세요.");
        setLoading(false);
        return;
      }
      if (rows.length > 1) {
        setError("동명이인이 있습니다. 로그인 아이디에 사번을 입력해 주세요.");
        setLoading(false);
        return;
      }
      let user = rows[0];

      // 직원 생성 시 비밀번호 없이 등록되므로, 처음 로그인할 때 입력한 값이 비밀번호로 설정됨
      const savedPassword = (user.password ?? user.passwd ?? '').toString().trim();
      const isFirstLogin = !savedPassword;

      if (isFirstLogin) {
        const { error: pwErr } = await supabase
          .from('staff_members')
          .update({ password })
          .eq('id', user.id);
        if (pwErr) {
          console.error('password set error', pwErr);
          setError("비밀번호를 설정하는 중 오류가 발생했습니다. 다시 시도하거나 관리자에게 문의해주세요.");
          setLoading(false);
          return;
        }
        user = { ...user, password };
      } else if (savedPassword !== password) {
        setError("비밀번호가 일치하지 않습니다.");
        setLoading(false);
        return;
      }

      const toStore = { ...user, company_id: user.company_id ?? null };
      localStorage.setItem('erp_user', JSON.stringify(toStore));
      localStorage.setItem('erp_login_at', new Date().toISOString());
      setLoading(false);
      if (isFirstLogin) {
        alert("비밀번호가 설정되었습니다. 다음 로그인부터 이 비밀번호를 사용해 주세요.");
      }
      router.push('/main');
    } catch (_err) {
      setError("시스템 접속 중 오류가 발생했습니다.");
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
    <div className="min-h-screen min-h-[100dvh] bg-[var(--background)] flex flex-col justify-center py-8 px-4 lg:px-8">
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
          <div className="space-y-6">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-2 ml-1">아이디 (사번 또는 이름)</label>
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
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
