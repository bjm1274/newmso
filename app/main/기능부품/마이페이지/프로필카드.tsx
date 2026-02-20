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
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    email: initialUser?.email || '',
    phone: initialUser?.phone || '',
    address: initialUser?.address || '',
    bank_name: initialUser?.bank_name || '',
    account_no: initialUser?.account_no || '',
  });
  // 다크모드 토글은 사용하지 않도록 제거 (항상 라이트 모드)

  // [핵심] 페이지 로드 시 ID가 없으면 '이름'으로 ID를 찾아내는 복구 로직
  useEffect(() => {
    if (initialUser?.name) {
      recoverUserIdentity(initialUser.name);
    } else {
      setDebugMsg("초기 사용자 이름조차 없습니다. 재로그인 필요.");
    }
  }, [initialUser]);

  // 편집 폼은 user 정보가 바뀔 때 동기화
  useEffect(() => {
    if (user) {
      setEditForm({
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
        bank_name: user.bank_name || '',
        account_no: user.account_no || '',
      });
    }
  }, [user]);

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

      // 3. 브라우저 저장소 동기화 (다른 탭·할일 등에서 동일 사용자 인식)
      localStorage.setItem('user_session', JSON.stringify(data));
      localStorage.setItem('erp_user', JSON.stringify(data));
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

  const verifyPasswordAndRun = async (onSuccess: () => void) => {
    try {
      let currentUser = user;
      if (!currentUser?.id && initialUser?.name) {
        await recoverUserIdentity(initialUser.name);
        try {
          const stored = localStorage.getItem('erp_user');
          if (stored) currentUser = JSON.parse(stored);
        } catch {
          // ignore
        }
      }
      if (!currentUser?.id) {
        alert('직원 계정으로 로그인한 상태에서만 사용할 수 있습니다.');
        return;
      }
      const input = window.prompt('본인 확인을 위해 현재 비밀번호를 입력해 주세요.');
      if (!input) return;
      const { data, error } = await supabase
        .from('staff_members')
        .select('id')
        .eq('id', currentUser.id)
        .eq('password', input)
        .single();
      if (error || !data) {
        alert('비밀번호가 일치하지 않습니다.');
        return;
      }
      onSuccess();
    } catch {
      alert('본인 확인 중 오류가 발생했습니다.');
    }
  };

  const uploadAvatar = async (event: any) => {
    try {
      setUploading(true);

      let currentUser = user;
      if (!currentUser?.id && initialUser?.name) {
        await recoverUserIdentity(initialUser.name);
        try {
          const stored = localStorage.getItem('erp_user');
          if (stored) currentUser = JSON.parse(stored);
        } catch (_) {}
      }
      if (!currentUser?.id) {
        alert('사진 등록은 직원 계정(이름으로 로그인)으로 이용해 주세요. MSO 관리자 계정에는 프로필 사진 기능을 사용할 수 없습니다.');
        setUploading(false);
        return;
      }

      if (!event.target.files || event.target.files.length === 0) {
        setUploading(false);
        return;
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 1. Storage 업로드
      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. 이미지 주소 획득
      const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
      const newUrl = `${data.publicUrl}?t=${new Date().getTime()}`;

      // 3. DB 업데이트 (복구된/저장소 사용자 ID)
      const { error: updateError } = await supabase
        .from('staff_members')
        .update({ avatar_url: newUrl })
        .eq('id', currentUser.id);

      if (updateError) throw updateError;

      // 4. 화면 반영
      setAvatarUrl(newUrl);
      
      // 5. 세션 강제 동기화 (새로고침 방어)
      const updatedUser = { ...currentUser, avatar_url: newUrl };
      setUser(updatedUser);
      localStorage.setItem('user_session', JSON.stringify(updatedUser));
      localStorage.setItem('erp_user', JSON.stringify(updatedUser));
      
      alert('사진이 정상적으로 등록되었습니다!');

    } catch (error: any) {
      console.error('프로필 사진 업로드 실패:', error);
      const msg: string = error?.message || '';
      if (msg.includes('The resource was not found') || msg.includes('bucket')) {
        alert('프로필 사진 업로드에 실패했습니다.\n\nSupabase 대시보드 → Storage에서 버킷 이름 "profiles"인 Public 버킷을 생성한 뒤, supabase_migrations 폴더의 storage_profiles_policies.sql 정책을 적용해 주세요.');
      } else {
        alert('프로필 사진 업로드에 실패했습니다.\n\n' + (msg || '잠시 후 다시 시도해 주세요.'));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      let currentUser = user;
      if (!currentUser?.id && initialUser?.name) {
        await recoverUserIdentity(initialUser.name);
        try {
          const stored = localStorage.getItem('erp_user');
          if (stored) currentUser = JSON.parse(stored);
        } catch (_) {}
      }
      if (!currentUser?.id) {
        alert('내 정보 수정은 직원 계정(이름으로 로그인)에서만 가능합니다.');
        return;
      }

      const { error } = await supabase
        .from('staff_members')
        .update({
          email: editForm.email || null,
          phone: editForm.phone || null,
          address: editForm.address || null,
          bank_name: editForm.bank_name || null,
          account_no: editForm.account_no || null,
        })
        .eq('id', currentUser.id);

      if (error) {
        console.error(error);
        alert('내 정보 저장 중 오류가 발생했습니다.');
        return;
      }

      const updatedUser = {
        ...currentUser,
        email: editForm.email,
        phone: editForm.phone,
        address: editForm.address,
        bank_name: editForm.bank_name,
        account_no: editForm.account_no,
      };
      setUser(updatedUser);
      localStorage.setItem('user_session', JSON.stringify(updatedUser));
      localStorage.setItem('erp_user', JSON.stringify(updatedUser));

      setIsEditing(false);
      alert('내 정보가 저장되었습니다.');
    } catch (err) {
      console.error(err);
      alert('내 정보 저장에 실패했습니다.');
    }
  };

  if (!user) return <div className="p-10">로딩 중...</div>;

  return (
    <div className="bg-white border border-[#E5E8EB] shadow-sm rounded-2xl sm:rounded-[2rem] lg:rounded-[2.5rem] p-4 sm:p-6 lg:p-10 flex flex-col h-full space-y-6 sm:space-y-8 lg:space-y-10">
      
      {/* 프로필 헤더 */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 lg:gap-10 pb-6 sm:pb-8 border-b border-gray-100">
        <div className="relative group shrink-0">
          <div className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-full bg-[#F2F4F6] flex items-center justify-center overflow-hidden border-2 sm:border-4 border-white shadow-sm">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl font-bold text-[#E5E8EB]">👤</span>
            )}
          </div>
          {user?.id ? (
            <>
              <label className="absolute bottom-1 right-1 w-10 h-10 bg-[var(--toss-blue)] text-white rounded-full flex items-center justify-center cursor-pointer hover:opacity-90 transition-all shadow-sm z-10" htmlFor="profiles-upload">
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
            </>
          ) : (
            <span className="absolute bottom-1 right-1 text-[9px] font-bold text-[#8B95A1] max-w-[100px] text-right">직원 계정 로그인 시 사진 등록 가능</span>
          )}
        </div>

        <div className="flex-1 w-full sm:w-auto text-center sm:text-left">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#191F28] tracking-tighter">{user.name} {user.position}</h2>
            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
              <button
                onClick={() => verifyPasswordAndRun(() => setShowSecret((v) => !v))}
                className="text-[10px] sm:text-[11px] font-bold px-3 py-1.5 sm:px-4 sm:py-2 bg-[#F2F4F6] rounded-full text-[#8B95A1] hover:text-[#3182F6] border border-transparent hover:border-[#E8F3FF]"
              >
                {showSecret ? '민감 정보 숨기기 🔒' : '보안 정보 보기 👁️'}
              </button>
              <button
                type="button"
                onClick={() => verifyPasswordAndRun(() => setIsEditing((v) => !v))}
                className={`text-[10px] sm:text-[11px] font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border transition-all ${
                  isEditing
                    ? 'bg-red-50 text-red-500 border-red-100 hover:bg-red-100'
                    : 'bg-[#E8F3FF] text-[#3182F6] border-[#D6EBFF] hover:bg-[#D6EBFF]'
                }`}
              >
                {isEditing ? '수정 취소' : '내 정보 수정'}
              </button>
            </div>
          </div>
          <p className="text-sm sm:text-base lg:text-lg font-bold text-[#3182F6] underline decoration-[#E8F3FF] underline-offset-4">{user.department} 소속</p>
          {/* 디버깅용 메시지 (작게 표시, 문제 해결 후 삭제 가능) */}
          {/* <p className="text-[10px] text-[#8B95A1] mt-2">시스템 상태: {debugMsg || '정상'}</p> */}
        </div>
      </div>

      {/* 상세 정보 + 나의 근태/연차 요약 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 sm:pr-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-10">
          <div className="space-y-5 sm:space-y-6 lg:col-span-2">
            <h3 className="text-[10px] sm:text-[11px] font-bold text-[#8B95A1] uppercase tracking-widest border-l-2 border-[#3182F6] pl-3">
              인사 관리 정보
            </h3>
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-4 sm:gap-5">
              <InfoItem label="사번" value={user.employee_no} />
              <InfoItem label="입사일" value={user.join_date} />
            </div>
            {isEditing ? (
              <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-4 sm:gap-5">
                <EditableItem
                  label="이메일"
                  value={editForm.email}
                  onChange={(v: string) => setEditForm((f) => ({ ...f, email: v }))}
                  placeholder="이메일 주소를 입력하세요"
                />
                <EditableItem
                  label="연락처"
                  value={editForm.phone}
                  onChange={(v: string) => setEditForm((f) => ({ ...f, phone: v }))}
                  placeholder="'-' 없이 숫자만 입력"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-4 sm:gap-5">
                <InfoItem label="이메일" value={user.email} />
                <InfoItem label="연락처" value={user.phone} />
              </div>
            )}
          </div>
          <div className="space-y-5 sm:space-y-6">
            <h3 className="text-[10px] sm:text-[11px] font-bold text-[#8B95A1] uppercase tracking-widest border-l-2 border-emerald-500 pl-3">
              나의 근태 · 연차
            </h3>
            <LeaveAndCommuteSummary user={user} />
          </div>
          <div className="space-y-5 sm:space-y-6 lg:col-span-3">
            <h3 className="text-[10px] sm:text-[11px] font-bold text-[#8B95A1] uppercase tracking-widest border-l-2 border-red-500 pl-3">
              보안 및 급여
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 lg:gap-x-12 gap-y-5">
              {isEditing ? (
                <>
                  <EditableItem
                    label="거주지"
                    value={editForm.address}
                    onChange={(v: string) => setEditForm((f) => ({ ...f, address: v }))}
                    placeholder="도로명 주소를 입력하세요"
                  />
                  <div className="space-y-3">
                    <span className="text-[12px] font-bold text-[#8B95A1]">계좌정보</span>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={editForm.bank_name}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, bank_name: e.target.value }))
                        }
                        placeholder="은행명"
                        className="w-full px-3 py-2.5 rounded-[12px] border border-[#E5E8EB] text-[13px] font-bold text-[#191F28] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/20 focus:border-[#3182F6]"
                      />
                      <input
                        type="text"
                        value={editForm.account_no}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, account_no: e.target.value }))
                        }
                        placeholder="계좌번호"
                        className="w-full px-3 py-2.5 rounded-[12px] border border-[#E5E8EB] text-[13px] font-bold text-[#191F28] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/20 focus:border-[#3182F6]"
                      />
                    </div>
                    <p className="text-[11px] text-[#8B95A1]">
                      급여 이체용 계좌 정보를 정확히 입력해 주세요.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <InfoItem label="거주지" value={user.address} />
                  <InfoItem
                    label="기본급"
                    value={
                      showSecret
                        ? `₩ ${(user.base_salary || 0).toLocaleString()}`
                        : '••••••••'
                    }
                    isMasked={!showSecret}
                  />
                  {showSecret && [
                    { key: 'meal_allowance', label: '식대 (비과세)' },
                    { key: 'vehicle_allowance', label: '자가운전 (비과세)' },
                    { key: 'childcare_allowance', label: '보육수당 (비과세)' },
                    { key: 'research_allowance', label: '연구활동비 (비과세)' },
                    { key: 'other_taxfree', label: '기타 비과세' },
                  ].filter(({ key }) => Number(user[key as keyof typeof user] ?? 0) > 0).map(({ key, label }) => (
                    <InfoItem
                      key={key}
                      label={label}
                      value={`₩ ${(Number(user[key as keyof typeof user]) || 0).toLocaleString()}`}
                    />
                  ))}
                  <InfoItem
                    label="계좌정보"
                    value={
                      showSecret
                        ? `${user.bank_name || ''} ${user.account_no || ''}`
                        : '••••••••'
                    }
                    isMasked={!showSecret}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 로그아웃 버튼 */}
      <div className="pt-4 sm:pt-6 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3 sm:items-center sm:justify-between">
        {isEditing && (
          <button
            type="button"
            onClick={handleSaveProfile}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-[11px] sm:text-[12px] font-semibold hover:bg-emerald-600 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span className="text-sm">💾</span>
            <span className="tracking-tight">내 정보 저장</span>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full sm:w-auto py-2.5 rounded-xl bg-[#3182F6] text-white text-[11px] sm:text-[12px] font-semibold hover:bg-[#1B64DA] transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <span className="text-sm">🚪</span>
          <span className="tracking-tight">시스템 안전 로그아웃</span>
        </button>
      </div>
    </div>
  );
}

function InfoItem({ label, value, isMasked }: any) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold text-[#8B95A1]">{label}</span>
      <span className={`text-[16px] font-bold ${isMasked ? 'text-[#E5E8EB] tracking-widest' : 'text-[#191F28]'}`}>
        {value || '-'}
      </span>
    </div>
  );
}

function EditableItem({ label, value, onChange, placeholder }: any) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold text-[#8B95A1]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-[12px] border border-[#E5E8EB] text-[14px] font-bold text-[#191F28] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/20 focus:border-[#3182F6]"
      />
    </div>
  );
}

function LeaveAndCommuteSummary({ user }: any) {
  const [summary, setSummary] = useState<{
    total: number;
    used: number;
    remaining: number;
    lateDays: { date: string; status: string }[];
    overworkDays: { date: string; status: string }[];
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user?.id && !user?.name) return;

      let staff: { id?: string; annual_leave_total?: number; annual_leave_used?: number } | null = null;
      if (user?.id) {
        const res = await supabase
          .from('staff_members')
          .select('id, annual_leave_total, annual_leave_used')
          .eq('id', user.id)
          .maybeSingle();
        staff = res.data;
      }
      if (!staff && user?.name) {
        const res = await supabase
          .from('staff_members')
          .select('*')
          .eq('name', user.name)
          .maybeSingle();
        const row = res.data as any;
        if (row) staff = { id: row.id, annual_leave_total: row.annual_leave_total, annual_leave_used: row.annual_leave_used };
      }

      const total = Number(staff?.annual_leave_total ?? user?.annual_leave_total ?? 0);
      const used = Number(staff?.annual_leave_used ?? user?.annual_leave_used ?? 0);
      const remaining = Math.max(0, total - used);
      const staffId = staff?.id ?? user?.id;

      const { data: commute } = staffId
        ? await supabase
            .from('attendance')
            .select('date,status')
            .eq('staff_id', staffId)
            .order('date', { ascending: false })
            .limit(60)
        : { data: null as any };

      const lateDays =
        commute
          ?.filter((c: any) => c.status === '지각')
          .map((c: any) => ({
            date: c.date,
            status: c.status,
          })) ?? [];

      const overworkDays =
        commute
          ?.filter(
            (c: any) =>
              c.status === '추가근무' || c.status === '연장근로' || c.status === '야근'
          )
          .map((c: any) => ({
            date: c.date,
            status: c.status,
          })) ?? [];

      setSummary({ total, used, remaining, lateDays, overworkDays });
    };

    load();
  }, [user?.id, user?.name]);

  if (!summary) {
    return (
      <div className="bg-[#F2F4F6] border border-[#E5E8EB] rounded-xl sm:rounded-2xl p-3 sm:p-4 text-[11px] sm:text-[12px] text-[#8B95A1] font-bold">
        근태·연차 정보를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="bg-[#F2F4F6] border border-[#E5E8EB] rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-3 sm:space-y-4 text-[11px] sm:text-[12px]">
      <div className="flex justify-between items-end">
        <div>
          <p className="text-[10px] sm:text-[11px] font-bold text-[#8B95A1] uppercase tracking-widest">
            연차 현황
          </p>
          <p className="mt-1 text-[12px] sm:text-[13px] font-bold text-[#191F28]">
            잔여 연차{' '}
            <span className="text-emerald-600">
              {summary.remaining.toFixed(1)}일
            </span>
          </p>
          <p className="mt-0.5 text-[10px] sm:text-[11px] text-[#4E5968]">
            총 {summary.total.toFixed(1)}일 중 {summary.used.toFixed(1)}일 사용
          </p>
        </div>
      </div>

      <div className="mt-2 sm:mt-3 border-t border-[#E5E8EB] pt-2 sm:pt-3 space-y-1.5">
        <p className="text-[10px] sm:text-[11px] font-bold text-[#8B95A1] uppercase tracking-widest">
          최근 지각
        </p>
        {summary.lateDays.length === 0 ? (
          <p className="text-[10px] sm:text-[11px] text-[#4E5968]">
            최근 60일 이내 지각 기록이 없습니다.
          </p>
        ) : (
          <ul className="space-y-0.5 text-[10px] sm:text-[11px] text-[#4E5968]">
            {summary.lateDays.slice(0, 3).map((d) => (
              <li key={`${d.date}-${d.status}`}>
                {new Date(d.date).toLocaleDateString('ko-KR')} · {d.status}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2 border-t border-[#E5E8EB] pt-2 sm:pt-3 space-y-1.5">
        <p className="text-[10px] sm:text-[11px] font-bold text-[#8B95A1] uppercase tracking-widest">
          최근 추가근무
        </p>
        {summary.overworkDays.length === 0 ? (
          <p className="text-[10px] sm:text-[11px] text-[#4E5968]">
            최근 60일 이내 추가근무 기록이 없습니다.
          </p>
        ) : (
          <ul className="space-y-0.5 text-[10px] sm:text-[11px] text-[#4E5968]">
            {summary.overworkDays.slice(0, 3).map((d) => (
              <li key={`${d.date}-${d.status}`}>
                {new Date(d.date).toLocaleDateString('ko-KR')} · {d.status}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}