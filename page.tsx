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

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!loginId || !password) {
      setError("아이디와 비밀번호를 입력해주세요.");
      return;
    }
    setLoading(true);
    setError('');

    // [긴급 패치] 관리자 프리패스 로직
    if ((loginId === '1' || loginId === '박철홍') && password === 'qkrcjfghd!!') {
      const adminUser = {
        employee_no: 1,
        name: '박철홍',
        role: 'admin',
        department: '행정팀',
        company: '박철홍정형외과',
        position: '병원장',
        permissions: { inventory: true, hr: true, approval: true, admin: true }
      };
      localStorage.setItem('erp_user', JSON.stringify(adminUser));
      window.location.href = '/main'; 
      return;
    }

    try {
      const isNumeric = /^\d+$/.test(loginId);

      const { data: user, error: dbError } = await supabase
        .from('staff_members') 
        .select('*')
        .eq(isNumeric ? 'employee_no' : 'name', loginId)
        .single();

      if (dbError || !user) { 
        setError("존재하지 않는 사용자입니다."); 
        setLoading(false); 
        return; 
      }

      // [핵심] 비밀번호 초기 설정 로직 (비번이 없거나 1234인 경우 현재 입력값으로 강제 설정)
      if (!user.password || user.password === '1234') {
        const { error: updateError } = await supabase
          .from('staff_members')
          .update({ password: password })
          .eq('id', user.id);
        
        if (updateError) {
          setError("비밀번호 초기 설정 중 오류가 발생했습니다.");
          setLoading(false);
          return;
        }
        alert("입력하신 비밀번호로 초기 설정되었습니다.");
      } 
      else if (user.password !== password) {
        setError("비밀번호가 일치하지 않습니다.");
        setLoading(false);
        return;
      }

      localStorage.setItem('erp_user', JSON.stringify(user));
      router.push('/main');

    } catch (_err) {
      setError("시스템 접속 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center items-center py-12 px-6 font-sans">
      <div className="text-center mb-8">
        {/* 로고 아이콘 영역 */}
        <div className="mx-auto h-20 w-20 mb-6 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100 shadow-sm">
           <img src="/logo.png" alt="병원로고" className="w-12 h-12 object-contain opacity-80" />
        </div>
        
        {/* PCH ORTHOPEDICS 제거 후 한글 타이틀 강조 */}
        <h2 className="text-2xl font-black text-gray-900 tracking-tighter">
          박철홍정형외과
        </h2>
        <p className="mt-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          통합 행정 관리 시스템
        </p>
      </div>

      <div className="w-full max-w-sm">
        <form className="space-y-5" onSubmit={handleLogin}>
          <div>
            <label className="block text-[10px] font-black text-gray-400 mb-2 ml-2 uppercase tracking-widest">
              아이디 (사번 또는 성함)
            </label>
            <input 
              type="text" 
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="appearance-none rounded-xl relative block w-full px-4 py-3 border-none bg-gray-50 placeholder-gray-300 text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition-all text-sm"
              placeholder="사번 1번 또는 성함 입력"
            />
          </div>
          
          <div>
            <div className="flex justify-between items-center mb-2 ml-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                비밀번호
              </label>
              <span className="text-[9px] font-bold text-blue-500">
                * 처음 입력한 값이 설정됩니다
              </span>
            </div>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="appearance-none rounded-xl relative block w-full px-4 py-3 border-none bg-gray-50 placeholder-gray-300 text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition-all text-sm"
              placeholder="비밀번호 입력"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-xs font-black border border-red-100 animate-pulse text-center">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group relative w-full flex justify-center py-4 bg-[#1D1E21] hover:bg-black text-white rounded-xl font-black text-sm shadow-lg transition-all transform hover:scale-[0.98] disabled:opacity-50"
          >
            {loading ? '인증 진행 중...' : '로그인'}
          </button>
        </form>
        
        <div className="mt-10 text-center">
          {/* 문의처 수정 완료 */}
          <p className="text-[10px] text-gray-300 font-bold tracking-tight">
            문의: 행정팀 (긴급 총무부장)
          </p>
        </div>
      </div>
    </div>
  );
}