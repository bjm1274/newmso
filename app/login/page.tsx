'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState(''); 
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!loginId || !password) {
      setError("아이디와 비밀번호를 모두 입력해주세요.");
      return;
    }
    setLoading(true);
    setError('');

    if ((loginId === '100' || loginId === 'MSO관리자') && password === 'syinc!!') {
      const msoUser = {
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
      const { data: user, error: dbError } = await supabase
        .from('staff_members')
        .select('*')
        .eq('employee_no', loginId.trim())
        .single();

      if (dbError || !user) {
        setError("등록된 사번(아이디)이 없습니다. 확인 후 다시 시도하세요.");
        setLoading(false);
        return;
      }

      if (!user.password || user.password.toString().trim() === '') {
        setError("비밀번호가 설정되지 않았습니다. 관리자에게 문의하세요.");
        setLoading(false);
        return;
      }

      if (user.password !== password) {
        setError("비밀번호가 일치하지 않습니다.");
        setLoading(false);
        return;
      }

      const toStore = { ...user, company_id: user.company_id ?? null };
      localStorage.setItem('erp_user', JSON.stringify(toStore));
      setLoading(false);
      router.push('/main');
    } catch (err) {
      setError("시스템 접속 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#F5F6F8] flex flex-col justify-center py-8 px-4 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm text-center">
        <div className="mx-auto h-16 w-16 bg-[#FEE500] rounded-2xl flex items-center justify-center shadow-sm mb-6 animate-in zoom-in duration-500">
          <span className="text-[#191919] text-2xl font-black">SY</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-black text-[#191919] tracking-tight">
          SY INC. 통합 시스템
        </h2>
        <p className="mt-2 text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">
          통합 의료경영지원 시스템
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-sm">
        <div className="bg-white py-8 px-6 rounded-2xl shadow-sm border border-[#EBEBEB] animate-in slide-in-from-bottom-10 duration-500">
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-semibold text-[#8E8E93] mb-2 ml-1">사번 (아이디)</label>
              <input 
                type="text" 
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full p-4 bg-[#F5F5F5] rounded-xl text-sm font-medium outline-none focus:ring-2 ring-[#FEE500]/30 border border-transparent focus:border-[#FEE500] transition-all text-[#191919]"
                placeholder="사번 입력"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#8E8E93] mb-2 ml-1">비밀번호</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 bg-[#F5F5F5] rounded-xl text-sm font-medium outline-none focus:ring-2 ring-[#FEE500]/30 border border-transparent focus:border-[#FEE500] transition-all text-[#191919]"
                placeholder="비밀번호 입력"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            {error && (
              <div className="bg-red-50 p-3 rounded-xl border border-red-100">
                <p className="text-red-500 text-[11px] font-semibold flex items-center gap-2"><span>⚠️</span> {error}</p>
              </div>
            )}
            <button 
              onClick={handleLogin} 
              disabled={loading}
              className="w-full py-4 bg-[#FEE500] text-[#191919] rounded-xl font-bold text-sm hover:bg-[#F5DC00] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? '인증 진행 중...' : '로그인'}
            </button>
          </div>
        </div>
        
        <div className="mt-12 text-center">
          <p className="text-[10px] text-gray-300 font-bold leading-relaxed">
            © 2026 SY INC. Management Service Organization.
            <br />본 시스템은 인가된 사용자만 접근 가능합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
