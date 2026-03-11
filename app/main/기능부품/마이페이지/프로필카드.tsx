'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { persistSupabaseAccessToken } from '@/lib/supabase-bridge';
import { isMissingColumnError } from '@/lib/supabase-compat';
import {
  buildProfilePhotoUrlFromPath,
  getProfilePhotoUrl,
  normalizeProfileUser,
  withProfilePhotoMetadata,
} from '@/lib/profile-photo';

export default function MyProfileCard({
  user: initialUser,
  onOpenApproval,
  hideHeader = false,
  hideActionBar = false,
  showSecret: controlledShowSecret,
  setShowSecret: setControlledShowSecret,
  isEditing: controlledIsEditing,
  setIsEditing: setControlledIsEditing,
}: any) {
  const MASKED_TEXT = '••••••••';
  const [user, setUser] = useState<any>(normalizeProfileUser(initialUser || {}));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(getProfilePhotoUrl(initialUser));
  const [uploading, setUploading] = useState(false);
  const [internalShowSecret, setInternalShowSecret] = useState(false);
  const [debugMsg, setDebugMsg] = useState(''); // 디버깅용 메시지
  const [internalIsEditing, setInternalIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    email: initialUser?.email || '',
    phone: initialUser?.phone || '',
    extension: initialUser?.extension || initialUser?.permissions?.extension || '',
    address: initialUser?.address || '',
    bank_name: initialUser?.bank_name || '',
    bank_account: initialUser?.bank_account || '',
  });
  // 다크모드 토글은 사용하지 않도록 제거 (항상 라이트 모드)

  const showSecret = typeof controlledShowSecret === 'boolean' ? controlledShowSecret : internalShowSecret;
  const isEditing = typeof controlledIsEditing === 'boolean' ? controlledIsEditing : internalIsEditing;
  const applyShowSecret = (nextValue: boolean) => {
    if (typeof setControlledShowSecret === 'function') {
      setControlledShowSecret(nextValue);
      return;
    }
    setInternalShowSecret(nextValue);
  };
  const applyIsEditing = (nextValue: boolean) => {
    if (typeof setControlledIsEditing === 'function') {
      setControlledIsEditing(nextValue);
      return;
    }
    setInternalIsEditing(nextValue);
  };

  const broadcastProfileUpdate = (nextUser: any) => {
    if (typeof window === 'undefined') return;
    const normalizedUser = normalizeProfileUser(nextUser);
    window.dispatchEvent(
      new CustomEvent('erp-profile-updated', {
        detail: {
          user: normalizedUser,
          avatarUrl: getProfilePhotoUrl(normalizedUser),
        },
      })
    );
  };

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
        extension: user.extension || user.permissions?.extension || '',
        address: user.address || '',
        bank_name: user.bank_name || '',
        bank_account: user.bank_account || '',
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
        // setDebugMsg(`ID 복구 실패: ${name}을 찾을 수 없음.`);
        return;
      }

      // 2. 찾아낸 진짜 정보로 상태 업데이트
      const normalizedUser = normalizeProfileUser(data);
      setUser(normalizedUser);
      setAvatarUrl(getProfilePhotoUrl(normalizedUser));

      // 3. 브라우저 저장소 동기화 (다른 탭·할일 등에서 동일 사용자 인식)
      localStorage.setItem('user_session', JSON.stringify(normalizedUser));
      localStorage.setItem('erp_user', JSON.stringify(normalizedUser));
      broadcastProfileUpdate(normalizedUser);
      // setDebugMsg(`ID 복구 완료: ${data.id}`);

    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    if (!confirm('로그아웃 하시겠습니까?')) return;

    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      // ignore
    }

    try {
      localStorage.removeItem('user_session');
      localStorage.removeItem('erp_user');
      localStorage.removeItem('erp_login_at');
      persistSupabaseAccessToken(null);
      void supabase.realtime.setAuth(null);
    } catch {
      // ignore
    }

    window.location.replace('/');
  };

  const verifyPassword = async () => {
    try {
      const input = window.prompt('본인 확인을 위해 현재 비밀번호를 입력해 주세요.');
      if (!input) return false;

      const response = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: input,
          userId: user?.id || initialUser?.id,
          name: user?.name || initialUser?.name,
          employeeNo: user?.employee_no || initialUser?.employee_no,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        alert('비밀번호가 일치하지 않습니다.');
        return false;
      }

      return true;
    } catch {
      alert('본인 확인 중 오류가 발생했습니다.');
      return false;
    }
  };

  const verifyPasswordAndRun = async (onSuccess: () => void) => {
    const verified = await verifyPassword();
    if (verified) {
      onSuccess();
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
        } catch (_) { }
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
      const filePath = `${currentUser.id}/avatar`;
      const uploadedAt = new Date().toISOString();
      const currentPermissions =
        currentUser?.permissions && typeof currentUser.permissions === 'object' && !Array.isArray(currentUser.permissions)
          ? currentUser.permissions
          : {};
      const nextPermissions = {
        ...currentPermissions,
        profile_photo_path: filePath,
        profile_photo_updated_at: uploadedAt,
      };

      // 1. Storage 업로드
      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file, { upsert: true, contentType: file.type || undefined });

      if (uploadError) throw uploadError;

      // 2. 이미지 주소 획득
      const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
      const newUrl =
        buildProfilePhotoUrlFromPath(filePath, uploadedAt) ||
        `${data.publicUrl}?v=${encodeURIComponent(uploadedAt)}`;

      // 3. DB 업데이트 (복구된/저장소 사용자 ID)
      let persistedToLegacyColumn = false;
      let legacyUploadError: any = null;
      try {
        const avatarUpdate = await supabase
        .from('staff_members')
        .update({ avatar_url: newUrl })
        .eq('id', currentUser.id);

      if (!avatarUpdate.error) {
        persistedToLegacyColumn = true;
      } else {
        if (!isMissingColumnError(avatarUpdate.error, 'avatar_url')) throw avatarUpdate.error;

        const photoUpdate = await supabase
          .from('staff_members')
          .update({ photo_url: newUrl })
          .eq('id', currentUser.id);

        if (photoUpdate.error) {
          if (isMissingColumnError(photoUpdate.error, 'photo_url')) {
            throw new Error('staff_members 테이블에 avatar_url 또는 photo_url 컬럼이 없습니다.');
          }
          throw photoUpdate.error;
        }
        persistedToLegacyColumn = true;
      }

      // 4. 화면 반영
      } catch (error: any) {
        legacyUploadError = error;
      }
      persistedToLegacyColumn = persistedToLegacyColumn || !legacyUploadError;

      const permissionsUpdate = await supabase
        .from('staff_members')
        .update({ permissions: nextPermissions })
        .eq('id', currentUser.id);

      if (permissionsUpdate.error && !persistedToLegacyColumn) {
        throw permissionsUpdate.error;
      }
      if (legacyUploadError && !persistedToLegacyColumn) {
        throw legacyUploadError;
      }

      setAvatarUrl(newUrl);

      // 5. 세션 강제 동기화 (새로고침 방어)
      const updatedUser = withProfilePhotoMetadata(
        {
          ...currentUser,
          permissions: nextPermissions,
          avatar_url: newUrl,
          photo_url: newUrl,
        },
        filePath,
        uploadedAt
      );
      setUser(updatedUser);
      localStorage.setItem('user_session', JSON.stringify(updatedUser));
      localStorage.setItem('erp_user', JSON.stringify(updatedUser));
      broadcastProfileUpdate(updatedUser);

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
        } catch (_) { }
      }
      if (!currentUser?.id) {
        alert('내 정보 수정은 직원 계정(이름으로 로그인)에서만 가능합니다.');
        return;
      }

      const { extension, ...otherForm } = editForm;
      const updatedPermissions = {
        ...(currentUser.permissions || {}),
        extension: extension || null
      };

      // 내 정보를 즉시 수정하지 않고, 인사팀 승인을 받기 위한 요청(ESS) 데이터 전송
      const { error } = await supabase
        .from('audit_logs')
        .insert([{
          user_id: currentUser.id,
          user_name: currentUser.name,
          action: '인사변경', // 임시로 인사변경 액션 사용
          target_type: 'ESS_PROFILE_UPDATE_PENDING',
          target_id: String(currentUser.id),
          details: {
            requested_changes: { ...otherForm, permissions: updatedPermissions },
            original_data: currentUser
          },
          created_at: new Date().toISOString()
        }]);

      if (error) {
        console.error(error);
        alert(`정보 변경 요청 중 오류가 발생했습니다.\n상세: ${error.message || JSON.stringify(error)}`);
        return;
      }

      applyIsEditing(false);
      alert('인사팀으로 내 정보 변경 요청(결재 대기)이 전송되었습니다. 관리자 승인 후 반영됩니다.');
    } catch (err) {
      console.error(err);
      alert('요청 전송에 실패했습니다.');
    }
  };

  if (!user) return <div className="p-10">로딩 중...</div>;

  const actionButtons = (
    <>
      <button
        type="button"
        onClick={() => { if (showSecret) applyShowSecret(false); else verifyPasswordAndRun(() => applyShowSecret(true)); }}
        className="rounded-full border border-transparent bg-[var(--toss-gray-1)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-3)] transition-all hover:border-[var(--toss-blue-light)] hover:text-[var(--toss-blue)]"
      >
        {showSecret ? '민감 정보 숨기기' : '보안 정보 보기'}
      </button>
      <button
        type="button"
        onClick={() => { if (isEditing) applyIsEditing(false); else verifyPasswordAndRun(() => applyIsEditing(true)); }}
        className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${isEditing
          ? 'bg-red-50 text-red-500 border-red-100 hover:bg-red-100'
          : 'bg-[var(--toss-blue-light)] text-[var(--toss-blue)] border-[var(--toss-blue-light)] hover:bg-[var(--toss-blue-light)]'
          }`}
      >
        {isEditing ? '수정 취소' : '내 정보 수정'}
      </button>
    </>
  );

  return (
    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm rounded-[16px] p-3 sm:p-4 lg:p-5 flex flex-col">

      {/* 프로필 헤더 */}
      {!hideHeader ? (
        <div className="flex flex-row items-center sm:items-start gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-[var(--toss-border)] shrink-0">
          <div className="relative group shrink-0">
            <div className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-full bg-[var(--toss-gray-1)] flex items-center justify-center overflow-hidden border-2 sm:border-4 border-[var(--toss-card)] shadow-sm">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-5xl font-bold text-[var(--toss-gray-3)]">👤</span>
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
              <span className="absolute bottom-1 right-1 text-[11px] font-bold text-[var(--toss-gray-3)] max-w-[100px] text-right">직원 계정 로그인 시 사진 등록 가능</span>
            )}
          </div>

          <div className="flex-1 w-full sm:w-auto text-left">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col items-start gap-1">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[var(--foreground)] tracking-tight">
                  {user.name} {user.position}
                </h2>
                <p className="text-sm sm:text-base lg:text-lg font-bold text-[var(--toss-blue)] underline decoration-[var(--toss-blue-light)] underline-offset-4">
                  {user.department} 소속
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 lg:max-w-[56%] lg:justify-end">
                {actionButtons}
              </div>
            </div>
            {/* <p className="text-[11px] text-[var(--toss-gray-3)] mt-2">시스템 상태: {debugMsg || '정상'}</p> */}
          </div>
        </div>
      ) : (
        <>
          <input
            style={{ display: 'none' }}
            type="file"
            id="profiles-upload"
            accept="image/*"
            onChange={uploadAvatar}
            disabled={uploading}
          />
          {!hideActionBar ? (
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2 border-b border-[var(--toss-border)] pb-3">
              {actionButtons}
            </div>
          ) : null}
        </>
      )}

      {/* 상세 정보 + 나의 근태/연차 요약 */}
        <div className={hideHeader ? '' : 'pt-3 sm:pt-4'}>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 lg:gap-5">
          {/* 인사 관리 정보 */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest border-l-4 border-[var(--toss-blue)] pl-3 mb-1">
              인사 관리 정보
            </h3>
            <div className="grid grid-cols-1 min-[520px]:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-3">
              <InfoItem label="사번" value={user.employee_no} />
              <InfoItem label="입사일" value={user.join_date} />
              <InfoItem label="이메일" value={user.email} />
            </div>
            {isEditing ? (
              <>
                <div className="grid grid-cols-1 min-[520px]:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-3">
                  <EditableItem
                    label="연락처"
                    value={editForm.phone}
                    onChange={(v: string) => setEditForm((f) => ({ ...f, phone: v }))}
                    placeholder="'-' 없이 숫자만 입력"
                  />
                  <EditableItem
                    label="내선번호"
                    value={editForm.extension}
                    onChange={(v: string) => setEditForm((f) => ({ ...f, extension: v }))}
                    placeholder="내선번호 입력"
                  />
                  <EditableItem
                    label="거주지"
                    value={editForm.address}
                    onChange={(v: string) => setEditForm((f) => ({ ...f, address: v }))}
                    placeholder="도로명 주소를 입력하세요"
                  />
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-x-4 gap-y-3 pt-1">
                  <div className="xl:col-span-2 space-y-3">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-wide block">계좌정보</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        value={editForm.bank_name}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, bank_name: e.target.value }))
                        }
                        placeholder="은행명"
                        className="w-full px-3 py-2.5 rounded-[16px] border border-[var(--toss-border)] text-[13px] font-semibold text-[var(--foreground)] bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 focus:border-[var(--toss-blue)]"
                      />
                      <input
                        type="text"
                        value={editForm.bank_account}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, bank_account: e.target.value }))
                        }
                        placeholder="계좌번호"
                        className="w-full px-3 py-2.5 rounded-[16px] border border-[var(--toss-border)] text-[13px] font-semibold text-[var(--foreground)] bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 focus:border-[var(--toss-blue)]"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 min-[520px]:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-3">
                <InfoItem label="연락처" value={showSecret ? user.phone : MASKED_TEXT} isMasked={!showSecret} />
                <InfoItem label="내선번호" value={user.extension || user.permissions?.extension} />
                <InfoItem label="거주지" value={showSecret ? user.address : MASKED_TEXT} isMasked={!showSecret} />
                <InfoItem
                  label="기본급"
                  value={
                    showSecret
                      ? `₩ ${(user.base_salary || 0).toLocaleString()}`
                      : MASKED_TEXT
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
                      ? `${user.bank_name || ''} ${user.bank_account || ''}`.trim()
                      : MASKED_TEXT
                  }
                  isMasked={!showSecret}
                />
              </div>
            )}
          </div>

          {/* 나의 근태 · 연차 */}
          <div className="space-y-2.5">
            <h3 className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest border-l-4 border-emerald-500 pl-3 mb-1">
              나의 근태 · 연차
            </h3>
            <LeaveAndCommuteSummary user={user} onOpenApproval={onOpenApproval} />
          </div>
        </div>

      </div>

      {/* 로그아웃 버튼 */}
      <div className="mt-3 flex shrink-0 flex-col-reverse gap-2.5 border-t border-[var(--toss-border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
        {isEditing && (
          <button
            type="button"
            onClick={handleSaveProfile}
            className="w-full sm:w-auto px-5 py-2.5 rounded-[16px] bg-emerald-500 text-white text-[11px] sm:text-[12px] font-semibold hover:bg-emerald-600 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span className="text-sm">💾</span>
            <span className="tracking-tight">내 정보 저장</span>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full sm:w-auto py-2.5 rounded-[16px] bg-[var(--toss-blue)] text-white text-[11px] sm:text-[12px] font-semibold hover:bg-[var(--toss-blue)] transition-all shadow-sm flex items-center justify-center gap-2"
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
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-wide">{label}</span>
      <span className={`text-[15px] font-bold leading-snug ${isMasked ? 'text-[var(--toss-gray-3)] tracking-widest' : 'text-[var(--foreground)]'}`}>
        {value || '-'}
      </span>
    </div>
  );
}

function EditableItem({ label, value, onChange, placeholder }: any) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-wide">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-[16px] border border-[var(--toss-border)] text-[14px] font-semibold text-[var(--foreground)] bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20 focus:border-[var(--toss-blue)]"
      />
    </div>
  );
}

function LeaveAndCommuteSummary({ user, onOpenApproval }: any) {
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
      <div className="bg-[var(--toss-gray-1)] border border-[var(--toss-border)] rounded-[16px] p-3.5 sm:p-4 text-[12px] text-[var(--toss-gray-3)] font-semibold">
        근태·연차 정보를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="bg-[var(--toss-gray-1)] border border-[var(--toss-border)] rounded-[16px] p-3.5 sm:p-4 space-y-3 text-[12px]">
      <div className="flex justify-between items-end">
        <div>
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1.5">
            연차 현황
          </p>
          <p className="text-[14px] font-bold text-[var(--foreground)] leading-snug">
            잔여 연차 <span className="text-emerald-600">{summary.remaining.toFixed(1)}일</span>
          </p>
          <p className="text-[11px] text-[var(--toss-gray-4)] mt-0.5">
            총 {summary.total.toFixed(1)}일 중 {summary.used.toFixed(1)}일 사용
          </p>
        </div>
        <button
          onClick={() => onOpenApproval?.({ type: '휴가신청' })}
          className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-[8px] text-[11px] font-bold hover:bg-emerald-100 transition-colors"
        >
          🏖️ 연차 신청
        </button>
      </div>

      <div className="border-t border-[var(--toss-border)] pt-3 space-y-1.5">
        <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">
          최근 지각
        </p>
        {summary.lateDays.length === 0 ? (
          <p className="text-[11px] text-[var(--toss-gray-4)]">최근 60일 이내 지각 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-[11px] text-[var(--toss-gray-4)]">
            {summary.lateDays.slice(0, 3).map((d) => (
              <li key={`${d.date}-${d.status}`}>
                {new Date(d.date).toLocaleDateString('ko-KR')} · {d.status}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-[var(--toss-border)] pt-3 space-y-1.5">
        <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">
          최근 추가근무
        </p>
        {summary.overworkDays.length === 0 ? (
          <p className="text-[11px] text-[var(--toss-gray-4)]">최근 60일 이내 추가근무 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-[11px] text-[var(--toss-gray-4)]">
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
