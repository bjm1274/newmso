'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function MyProfileCard({ user: initialUser }: any) {
  const router = useRouter();
  const [user, setUser] = useState<any>(initialUser || {});
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [debugMsg, setDebugMsg] = useState(''); // 디버깅용 메시지

  // [핵심] 페이지 로드 시 ID가 없으면 '이름'으로 ID를 찾아내는 복구 로직
  useEffect(() => {
    if (initialUser?.name) {
      recoverUserIdentity(initialUser.name);
    } else {
      setDebugMsg("초기 사용자 이름조차 없습니다. 재로그인 필요.");
    }
  }, [initialUser]);

  const recoverUserIdentity = async (name: string) => {
    try {
      // 1. 이름으로 DB 조회
      const { data, error } = await supabase
        .from('staff_members')
        .select('*')
        .eq('name', name)
        .single();

      if (error || !data) {
        setDebugMsg(`ID 복구 실패: ${name}을 찾을 수 없음.`);
        return;
      }

      // 2. 찾아낸 진짜 정보로 상태 업데이트
      console.log("ID 복구 성공:", data.id);
      setUser(data);
      setAvatarUrl(data.avatar_url);

      // 3. 브라우저 저장소(세션)도 진짜 정보로 덮어쓰기 (영구 수정)
      localStorage.setItem('user_session', JSON.stringify(data));
      setDebugMsg(`ID 복구 완료: ${data.id}`);

    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem('user_session');
      router.push('/login');
    }
  };

  const uploadAvatar = async (event: any) => {
    try {
      setUploading(true);

      // [최종 안전장치] ID가 복구되었는지 확인
      if (!user || !user.id) {
        // 혹시 모르니 한 번 더 시도
        await recoverUserIdentity(user.name);
        if (!user.id) {
          alert(`오류: 사용자 ID를 찾을 수 없습니다. (디버그: ${debugMsg})`);
          return;
        }
      }

      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      // 파일명에 ID를 확실히 박아넣음
      const fileName = `${user.id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 1. Storage 업로드
      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. 이미지 주소 획득
      const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
      const newUrl = `${data.publicUrl}?t=${new Date().getTime()}`;

      // 3. DB 업데이트
      const { error: updateError } = await supabase
        .from('staff_members')
        .update({ avatar_url: newUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // 4. 화면 반영
      setAvatarUrl(newUrl);

      // 5. 세션 강제 동기화 (새로고침 방어)
      const updatedUser = { ...user, avatar_url: newUrl };
      setUser(updatedUser);
      localStorage.setItem('user_session', JSON.stringify(updatedUser));

      alert('사진이 정상적으로 등록되었습니다!');

    } catch (error: any) {
      alert('업로드 실패: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  if (!user) return <div className="p-10">로딩 중...</div>;

  // 근태 통계 상태 추가
  const [stats, setStats] = useState({ late: 0, normal: 0, overtime: 0 });

  useEffect(() => {
    if (user?.id) fetchStats();
  }, [user]);

  const fetchStats = async () => {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const { data } = await supabase.from('attendance').select('*').eq('staff_id', user.id).gte('date', startOfMonth);
    if (data) {
      setStats({
        late: data.filter(l => l.status === '지각').length,
        normal: data.filter(l => l.status === '정상').length,
        overtime: data.reduce((acc, l) => acc + (l.overtime_hours || 0), 0)
      });
    }
  };

  return (
    <div className="bg-white border border-gray-100 shadow-sm rounded-[2.5rem] p-10 h-full flex flex-col space-y-10 relative overflow-hidden group">
      {/* 장식 요소 */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-primary/10 transition-colors"></div>

      <div className="flex items-start gap-10">
        <div className="relative">
          <div className="w-32 h-32 bg-slate-100 rounded-[2.5rem] flex items-center justify-center text-4xl shadow-inner relative overflow-hidden ring-8 ring-slate-50">
            {avatarUrl ? <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" /> : user.name?.[0]}
            {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><span className="animate-spin text-white">⏳</span></div>}
          </div>
          <button onClick={() => document.getElementById('avatar-upload')?.click()} className="absolute -bottom-2 -right-2 bg-white w-10 h-10 rounded-2xl shadow-lg border border-slate-100 flex items-center justify-center hover:scale-110 active:scale-95 transition-all text-lg">📸</button>
          <input id="avatar-upload" type="file" className="hidden" onChange={uploadAvatar} />
        </div>

        <div className="flex-1 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{user.name || '사용자'}</h2>
              <span className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest">{user.position || '직급'}</span>
            </div>
            <p className="text-sm font-bold text-slate-400">{user.department || '부서'} · 사번 {user.employee_no || '-'}</p>
          </div>

          <div className="flex gap-4">
            <div className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100/50">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Remaining Annual Leave</p>
              <p className="text-xl font-black text-blue-600">{user.annual_leave || 0} <span className="text-xs text-slate-400 ml-1">Days</span></p>
            </div>
            <div className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100/50">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Company</p>
              <p className="text-sm font-bold text-slate-700">{user.company || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Private Information</h4>
          <div className="space-y-3">
            <InfoRow label="생년월일" value={user.birth_date || '-'} />
            <InfoRow label="연락처" value={user.phone || '-'} isSecret={!showSecret} />
            <InfoRow label="비밀번호" value="••••••••" isSecret={!showSecret} />
            <button onClick={() => setShowSecret(!showSecret)} className="text-[10px] font-black text-blue-600 hover:underline mt-2 ml-1">{showSecret ? '비공개 정보 숨기기' : '비공개 정보 보기'}</button>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Monthly Work Stats</h4>
          <div className="bg-slate-50/50 border border-slate-100 p-6 rounded-[2rem] grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Late</p>
              <p className="text-lg font-black text-red-500">{stats.late}</p>
            </div>
            <div className="text-center border-x border-slate-100">
              <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Normal</p>
              <p className="text-lg font-black text-blue-600">{stats.normal}</p>
            </div>
            <div className="text-center">
              <p className="text-[8px] font-black text-slate-400 uppercase mb-1">OT(h)</p>
              <p className="text-lg font-black text-emerald-500">{stats.overtime}</p>
            </div>
          </div>
          <button onClick={fetchStats} className="w-full py-3 bg-white border border-slate-200 rounded-xl text-[9px] font-black text-slate-400 hover:text-blue-600 hover:border-blue-600 transition-all uppercase tracking-widest">Refresh Statistics</button>
        </div>
      </div>

      {/* 로그아웃 버튼 */}
      <div className="pt-8 border-t border-gray-50">
        <button onClick={handleLogout} className="w-full py-8 rounded-[2.5rem] bg-[#1D1E21] text-white text-xl font-black hover:bg-black transition-all shadow-2xl flex items-center justify-center gap-5">
          <span className="text-3xl">🚪</span>
          <span className="tracking-tight">시스템 안전 로그아웃</span>
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value, isSecret }: any) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      <span className={`text-sm font-bold ${isSecret ? 'text-slate-200 tracking-widest' : 'text-slate-800'}`}>
        {value || '-'}
      </span>
    </div>
  );
}