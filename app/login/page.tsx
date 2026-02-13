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

    if ((loginId === '100' || loginId === 'MSO관리자') && password === 'syinc!!') {
      const { data: msoRow } = await supabase.from('staff_members').select('*').eq('name', 'MSO관리자').maybeSingle();
      const msoUser = msoRow ? {
        ...msoRow,
        role: 'admin',
        permissions: { inventory: true, hr: true, approval: true, admin: true, mso: true }
      } : {
        id: null,
        employee_no: 100,
        name: 'MSO관리자',
        role: 'admin',
        department: '경영지원팀',
        company: 'SY INC.',
        company_id: null,
        permissions: { inventory: true, hr: true, approval: true, admin: true, mso: true }
      };
      localStorage.setItem('erp_user', JSON.stringify(msoUser));
      setLoading(false);
      router.push('/main');
      return;
    }

    try {
      const { data: rows, error: dbError } = await supabase
        .from('staff_members')
        .select('*')
        .eq('name', loginId.trim())
        .limit(1);
      let user = rows?.[0];

      if (dbError || !user) {
        setError("등록된 이름(아이디)이 없습니다. 확인 후 다시 시도하세요.");
        setLoading(false);
        return;
      }

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
      setLoading(false);
      if (isFirstLogin) {
        alert("비밀번호가 설정되었습니다. 다음 로그인부터 이 비밀번호를 사용해 주세요.");
      }
      router.push('/main');
    } catch (err) {
      setError("시스템 접속 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#F9FAFB] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#3182F6] rounded-full border-t-transparent animate-spin" />
        <p className="mt-4 text-xs font-medium text-[#8B95A1]">로그인 상태 확인 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#F9FAFB] flex flex-col justify-center py-8 px-4 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-[#191F28] tracking-tight">
          SY INC. 통합 시스템
        </h2>
        <p className="mt-2 text-[11px] font-medium text-[#8B95A1] uppercase tracking-wider">
          통합 의료경영지원 시스템
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-sm">
        <div className="bg-white py-8 px-6 rounded-[20px] shadow-sm border border-[#E5E8EB] animate-in slide-in-from-bottom-10 duration-500">
          <div className="space-y-6">
            <div>
              <label className="block text-[11px] font-semibold text-[#8B95A1] mb-2 ml-1">아이디 (이름)</label>
              <input 
                type="text" 
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full p-4 bg-[#F2F4F6] rounded-[12px] text-sm font-medium outline-none focus:ring-2 ring-[#3182F6]/30 border border-transparent focus:border-[#3182F6] transition-all text-[#191F28]"
                placeholder="이름 입력"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#8B95A1] mb-2 ml-1">비밀번호</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 bg-[#F2F4F6] rounded-[12px] text-sm font-medium outline-none focus:ring-2 ring-[#3182F6]/30 border border-transparent focus:border-[#3182F6] transition-all text-[#191F28]"
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
              className="w-full py-4 bg-[#3182F6] text-white rounded-[12px] font-semibold text-[15px] hover:bg-[#1B64DA] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? '인증 진행 중...' : '로그인'}
            </button>
            <p className="mt-4 text-[16px] text-[#4E5968] text-center font-bold tracking-wide">
              Made by JM
            </p>
          </div>
        </div>
        
        <div className="mt-12 text-center">
          <p className="text-[10px] text-[#8B95A1] font-bold leading-relaxed">
            © 2026 SY INC. Management Service Organization.
            <br />본 시스템은 인가된 사용자만 접근 가능합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
