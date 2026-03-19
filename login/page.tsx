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
    } catch (_err) {
      setError("시스템 접속 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto h-20 w-20 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-2xl mb-8 animate-in zoom-in duration-500">
          <span className="text-white text-3xl font-black">SY</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tighter">
          SY INC. 통합 시스템
        </h2>
        <p className="mt-3 text-[11px] font-black text-blue-600 uppercase tracking-[0.2em]">
          통합 의료경영지원 시스템
        </p>
      </div>

      <div className="mt-12 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-10 px-8 md:px-12 shadow-2xl rounded-[3rem] border border-gray-100 animate-in slide-in-from-bottom-10 duration-700">
          <div className="space-y-8">
            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-3 ml-2 uppercase tracking-widest">
                사번 (아이디)
              </label>
              <input 
                type="text" 
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full p-5 bg-gray-50 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-blue-50 border-2 border-transparent focus:border-blue-100 transition-all text-gray-900"
                placeholder="사번 입력"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-3 ml-2 uppercase tracking-widest">
                보안 비밀번호
              </label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-5 bg-gray-50 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-blue-50 border-2 border-transparent focus:border-blue-100 transition-all text-gray-900"
                placeholder="비밀번호 입력"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

            {error && (
              <div className="bg-red-50 p-4 rounded-2xl border border-red-100 animate-in shake duration-300">
                <p className="text-red-500 text-[11px] font-black flex items-center gap-2">
                  <span>⚠️</span> {error}
                </p>
              </div>
            )}

            <button 
              onClick={handleLogin} 
              disabled={loading}
              className="w-full py-6 bg-[#1E293B] text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-100 hover:bg-black active:scale-95 transition-all mt-4 disabled:opacity-50"
            >
              {loading ? '인증 진행 중...' : '시스템 접속하기'}
            </button>
          </div>
        </div>
        
        <div className="mt-12 text-center">
          <p className="text-[10px] text-gray-300 font-bold leading-relaxed">
            © 2026 SY INC.
            <br />본 시스템은 인가된 사용자만 접근 가능합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
