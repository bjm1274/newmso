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
      localStorage.removeItem('erp_user');
      router.push('/');
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

  return (
    <div className="bg-white border border-gray-100 shadow-sm rounded-[2.5rem] p-12 flex flex-col h-full space-y-12">
      
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-10 pb-10 border-b border-gray-50">
        <div className="relative group">
          <div className="w-32 h-32 rounded-full bg-gray-50 flex items-center justify-center overflow-hidden border-4 border-white shadow-2xl">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl font-black text-gray-200">👤</span>
            )}
          </div>
          <label className="absolute bottom-1 right-1 w-10 h-10 bg-gray-900 text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-600 transition-all shadow-lg z-10" htmlFor="profiles-upload">
            {uploading ? '⏳' : '📷'}
          </label>
          <input
            style={{ display: 'none' }}
            type="file"
            id="profiles-upload"
            accept="image/*"
            onChange={uploadAvatar}
            disabled={uploading}
          />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-4xl font-black text-gray-900 tracking-tighter">{user.name} {user.position}</h2>
            <button onClick={() => setShowSecret(!showSecret)} className="text-[11px] font-black px-4 py-2 bg-gray-50 rounded-full text-gray-400 hover:text-blue-600 border border-transparent hover:border-blue-100">
              {showSecret ? '민감 정보 숨기기 🔒' : '보안 정보 보기 👁️'}
            </button>
          </div>
          <p className="text-lg font-bold text-blue-600 underline decoration-blue-100 underline-offset-8">{user.department} 소속</p>
          {/* 디버깅용 메시지 (작게 표시, 문제 해결 후 삭제 가능) */}
          {/* <p className="text-[10px] text-gray-300 mt-2">시스템 상태: {debugMsg || '정상'}</p> */}
        </div>
      </div>

      {/* 상세 정보 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-10">
          <div className="space-y-7">
            <h3 className="text-[11px] font-black text-gray-300 uppercase tracking-widest border-l-2 border-blue-500 pl-3">인사 관리 정보</h3>
            <InfoItem label="사번" value={user.employee_no} />
            <InfoItem label="입사일" value={user.join_date} />
            <InfoItem label="이메일" value={user.email} />
            <InfoItem label="연락처" value={user.phone} />
          </div>
          <div className="space-y-7">
            <h3 className="text-[11px] font-black text-gray-300 uppercase tracking-widest border-l-2 border-red-500 pl-3">보안 및 급여</h3>
            <InfoItem label="거주지" value={user.address} />
            <InfoItem label="기본급" value={showSecret ? `₩ ${(user.base_salary || 0).toLocaleString()}` : '••••••••'} isMasked={!showSecret} />
            <InfoItem label="계좌정보" value={showSecret ? `${user.bank_name || ''} ${user.account_no || ''}` : '••••••••'} isMasked={!showSecret} />
          </div>
        </div>
      </div>

      {/* 로그아웃 버튼 */}
      <div className="pt-8 border-t border-gray-50">
        <button onClick={handleLogout} className="w-full py-8 rounded-[20px] bg-[#3182F6] text-white text-[17px] font-semibold hover:bg-[#1B64DA] transition-all shadow-sm flex items-center justify-center gap-5">
          <span className="text-3xl">🚪</span>
          <span className="tracking-tight">시스템 안전 로그아웃</span>
        </button>
      </div>
    </div>
  );
}

function InfoItem({ label, value, isMasked }: any) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-black text-gray-400">{label}</span>
      <span className={`text-[16px] font-black ${isMasked ? 'text-gray-200 tracking-widest' : 'text-gray-800'}`}>
        {value || '-'}
      </span>
    </div>
  );
}