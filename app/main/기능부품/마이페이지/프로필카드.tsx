'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { persistSupabaseAccessToken } from '@/lib/supabase-bridge';
import { isMissingColumnError } from '@/lib/supabase-compat';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';
import {
  buildProfilePhotoUrlFromPath,
  getProfilePhotoUrl,
  normalizeProfileUser,
  withProfilePhotoMetadata,
} from '@/lib/profile-photo';
import { calculateApprovedAnnualLeaveUsage } from '@/lib/annual-leave-ledger';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import { useActionDialog } from '@/app/components/useActionDialog';

export default function MyProfileCard({
  user: initialUser,
  onOpenApproval,
  hideHeader = false,
  hideActionBar = false,
  showSecret: controlledShowSecret,
  setShowSecret: setControlledShowSecret,
  isEditing: controlledIsEditing,
  setIsEditing: setControlledIsEditing,
}: Record<string, unknown>) {
  const { dialog, openConfirm, openPrompt } = useActionDialog();
  const MASKED_TEXT = '********';
  const _iu = normalizeStaffLike((initialUser ?? {}) as Record<string, unknown>);
  const [user, setUser] = useState<Record<string, unknown>>(normalizeProfileUser(_iu));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(getProfilePhotoUrl((_iu)));
  const [uploading, setUploading] = useState(false);
  const [internalShowSecret, setInternalShowSecret] = useState(false);
  const [debugMsg, setDebugMsg] = useState(''); // 디버깅용 메시지
  const [internalIsEditing, setInternalIsEditing] = useState(false);
  const effectiveUserId = getStaffLikeId(user);
  const [editForm, setEditForm] = useState<{ email: string; phone: string; extension: string; address: string; bank_name: string; bank_account: string }>({
    email: ((_iu)?.email as string) || '',
    phone: ((_iu)?.phone as string) || '',
    extension: ((_iu)?.extension as string) || ((_iu.permissions as Record<string, unknown>)?.extension as string) || '',
    address: ((_iu)?.address as string) || '',
    bank_name: ((_iu)?.bank_name as string) || ((_iu.permissions as Record<string, unknown>)?.bank_name as string) || '',
    bank_account: ((_iu)?.bank_account as string) || ((_iu.permissions as Record<string, unknown>)?.bank_account as string) || '',
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

  useEffect(() => {
    const normalizedUser = normalizeProfileUser(_iu);
    setUser(normalizedUser);
    setAvatarUrl(getProfilePhotoUrl(normalizedUser));
  }, [_iu?.id, _iu?.name, _iu?.photo_url, _iu?.avatar_url, _iu?.profile_photo_updated_at]);

  // [핵심] 페이지 로드 시 ID가 없으면 '이름'으로 ID를 찾아내는 복구 로직
  useEffect(() => {
    if (getStaffLikeId(_iu)) {
      setDebugMsg('');
      return;
    }
    if ((_iu)?.name || (_iu)?.employee_no || (_iu)?.auth_user_id) {
      void recoverUserIdentity(_iu);
    } else {
      setDebugMsg("초기 사용자 이름조차 없습니다. 재로그인 필요.");
    }
  }, [_iu?.id, _iu?.name, _iu?.employee_no, _iu?.auth_user_id]);

  // 편집 폼은 user 정보가 바뀔 때 동기화
  useEffect(() => {
    if (user) {
      setEditForm({
        email: (user.email as string) || '',
        phone: (user.phone as string) || '',
        extension: (user.extension as string) || ((user.permissions as Record<string, unknown>)?.extension as string) || '',
        address: (user.address as string) || '',
        bank_name: (user.bank_name as string) || ((user.permissions as Record<string, unknown>)?.bank_name as string) || '',
        bank_account: (user.bank_account as string) || ((user.permissions as Record<string, unknown>)?.bank_account as string) || '',
      });
    }
  }, [user]);

  const recoverUserIdentity = async (source: Record<string, unknown>) => {
    try {
      const resolvedUser = await resolveStaffLike(source);
      const resolvedUserId = getStaffLikeId(resolvedUser);
      if (!resolvedUserId) {
        return;
      }

      // 2. 찾아낸 진짜 정보로 상태 업데이트
      const normalizedUser = normalizeProfileUser(resolvedUser);
      setUser(normalizedUser);
      setAvatarUrl(getProfilePhotoUrl(normalizedUser));

      // 3. 브라우저 저장소 동기화 (다른 탭·할일 등에서 동일 사용자 인식)
      localStorage.setItem('erp_user', JSON.stringify(normalizedUser));
      broadcastProfileUpdate(normalizedUser);
      // setDebugMsg(`ID 복구 완료: ${data.id}`);

    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    const shouldLogout = await openConfirm({
      title: '로그아웃',
      description: '현재 계정에서 로그아웃합니다. 계속할까요?',
      confirmText: '로그아웃',
      cancelText: '취소',
      tone: 'danger',
    });
    if (!shouldLogout) return;

    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      // ignore
    }

    try {
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
      const input = await openPrompt({
        title: '본인 확인',
        description: '현재 비밀번호를 입력해 주세요.',
        confirmText: '확인',
        cancelText: '취소',
        inputType: 'password',
        required: true,
        placeholder: '현재 비밀번호',
      });
      if (!input) return false;

      const response = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: input,
          userId: effectiveUserId || getStaffLikeId(_iu) || undefined,
          name: user?.name || (_iu)?.name,
          employeeNo: user?.employee_no || (_iu)?.employee_no,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        toast('비밀번호가 일치하지 않습니다.');
        return false;
      }

      return true;
    } catch {
      toast('본인 확인 중 오류가 발생했습니다.', 'error');
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
      if (!getStaffLikeId(currentUser) && ((_iu)?.name || (_iu)?.employee_no || (_iu)?.auth_user_id)) {
        await recoverUserIdentity(_iu);
        try {
          const stored = localStorage.getItem('erp_user');
          if (stored) currentUser = JSON.parse(stored);
        } catch (_) { }
      }
      if (!getStaffLikeId(currentUser)) {
        toast('사진 등록은 직원 계정(이름으로 로그인)으로 이용해 주세요. MSO 관리자 계정에는 프로필 사진 기능을 사용할 수 없습니다.', 'success');
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
      } catch (error: unknown) {
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
      if (legacyUploadError && !permissionsUpdate.error) {
        console.warn('Legacy profile photo columns are unavailable; persisted metadata in permissions instead.', legacyUploadError);
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
      localStorage.setItem('erp_user', JSON.stringify(updatedUser));
      broadcastProfileUpdate(updatedUser);

      toast('사진이 정상적으로 등록되었습니다!', 'success');

    } catch (error: unknown) {
      console.error('프로필 사진 업로드 실패:', error);
      const msg: string = (error as Error)?.message || '';
      if (msg.includes('The resource was not found') || msg.includes('bucket')) {
        toast('프로필 사진 업로드에 실패했습니다.\n\nSupabase 대시보드 → Storage에서 버킷 이름 "profiles"인 Public 버킷을 생성한 뒤, supabase_migrations 폴더의 storage_profiles_policies.sql 정책을 적용해 주세요.', 'error');
      } else {
        toast('프로필 사진 업로드에 실패했습니다.\n\n' + (msg || '잠시 후 다시 시도해 주세요.'), 'error');
      }
    } finally {
      setUploading(false);
    }
  };

  const saveProfileDirectly = async (currentUser: any) => {
    const { extension, bank_name, ...otherForm } = editForm;
    const actor = readClientAuditActor();
    const beforeUser = normalizeProfileUser(currentUser);
    const updatedPermissions = {
      ...(currentUser.permissions || {}),
      extension: extension || null,
      bank_name: bank_name || null,
    };
    const baseUpdatePayload = {
      email: otherForm.email || null,
      phone: otherForm.phone || null,
      address: otherForm.address || null,
      bank_account: otherForm.bank_account || null,
      permissions: updatedPermissions,
    };

    let savedRow: any = null;
    const primaryUpdate = await supabase
      .from('staff_members')
      .update({
        ...baseUpdatePayload,
        bank_name: bank_name || null,
      })
      .eq('id', currentUser.id)
      .select('*')
      .single();

    if (primaryUpdate.error) {
      if (!isMissingColumnError(primaryUpdate.error, 'bank_name')) {
        throw primaryUpdate.error;
      }

      const fallbackUpdate = await supabase
        .from('staff_members')
        .update(baseUpdatePayload)
        .eq('id', currentUser.id)
        .select('*')
        .single();

      if (fallbackUpdate.error) {
        throw fallbackUpdate.error;
      }

      savedRow = fallbackUpdate.data;
    } else {
      savedRow = primaryUpdate.data;
    }

    const updatedUser = normalizeProfileUser({
      ...currentUser,
      ...savedRow,
      ...baseUpdatePayload,
      bank_name: bank_name || null,
      permissions: updatedPermissions,
    });

    setUser(updatedUser);
    setAvatarUrl(getProfilePhotoUrl(updatedUser));
    setEditForm({
      email: updatedUser.email || '',
      phone: updatedUser.phone || '',
      extension: updatedUser.extension || updatedUser.permissions?.extension || '',
      address: updatedUser.address || '',
      bank_name: updatedUser.bank_name || updatedUser.permissions?.bank_name || '',
      bank_account: updatedUser.bank_account || updatedUser.permissions?.bank_account || '',
    });
    localStorage.setItem('erp_user', JSON.stringify(updatedUser));
    broadcastProfileUpdate(updatedUser);

    await logAudit(
      '내정보수정',
      'staff_member',
      String(currentUser.id),
      {
        staff_name: updatedUser.name,
        ...buildAuditDiff(beforeUser, updatedUser, [
          'email',
          'phone',
          'address',
          'bank_account',
          'bank_name',
          'extension',
          'permissions',
        ]),
      },
      actor.userId,
      actor.userName
    );

    applyIsEditing(false);
    toast('내 정보가 바로 저장되었고 인사관리에도 즉시 반영되었습니다.', 'success');
    return;
    toast('내 정보가 바로 저장되었습니다. 인사관리에도 즉시 반영됩니다.', 'success');
  };

  const buildRequestedProfileChanges = (currentUser: any) => {
    const currentPermissions =
      currentUser?.permissions && typeof currentUser.permissions === 'object' && !Array.isArray(currentUser.permissions)
        ? currentUser.permissions
        : {};

    return {
      email: editForm.email || null,
      phone: editForm.phone || null,
      address: editForm.address || null,
      bank_account: editForm.bank_account || null,
      bank_name: editForm.bank_name || null,
      permissions: {
        ...currentPermissions,
        extension: editForm.extension || null,
        bank_name: editForm.bank_name || null,
      },
    };
  };

  const submitProfileChangeRequest = async (currentUser: any) => {
    const requestedChanges = buildRequestedProfileChanges(currentUser);
    const beforeUser = normalizeProfileUser(currentUser);
    const nextUser = normalizeProfileUser({
      ...currentUser,
      ...requestedChanges,
      permissions: requestedChanges.permissions,
      extension: (requestedChanges.permissions as Record<string, unknown>)?.extension ?? null,
      bank_name:
        (requestedChanges.bank_name as string | null | undefined) ??
        (requestedChanges.permissions as Record<string, unknown>)?.bank_name ??
        null,
    });

    const diff = buildAuditDiff(beforeUser, nextUser, [
      'email',
      'phone',
      'address',
      'bank_account',
      'bank_name',
      'extension',
      'permissions',
    ]);

    if (Object.keys(diff).length === 0) {
      toast('변경된 내용이 없습니다.', 'warning');
      return;
    }

    const existingPendingRequest = await supabase
      .from('audit_logs')
      .select('id')
      .eq('target_type', 'ESS_PROFILE_UPDATE_PENDING')
      .eq('target_id', String(currentUser.id))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPendingRequest.error) {
      throw existingPendingRequest.error;
    }

    const details = {
      requested_changes: requestedChanges,
      original_data: {
        email: currentUser.email || null,
        phone: currentUser.phone || null,
        address: currentUser.address || null,
        bank_account: currentUser.bank_account || null,
        bank_name: currentUser.bank_name || currentUser?.permissions?.bank_name || null,
        extension: currentUser.extension || currentUser?.permissions?.extension || null,
        permissions:
          currentUser?.permissions && typeof currentUser.permissions === 'object' && !Array.isArray(currentUser.permissions)
            ? currentUser.permissions
            : {},
      },
    };

    if (existingPendingRequest.data?.id) {
      const { error: updateError } = await supabase
        .from('audit_logs')
        .update({
          user_name: currentUser.name,
          action: '인사변경',
          details,
          created_at: new Date().toISOString(),
        })
        .eq('id', existingPendingRequest.data.id);

      if (updateError) {
        throw updateError;
      }
    } else {
      const { error: insertError } = await supabase.from('audit_logs').insert([
        {
          user_id: currentUser.id,
          user_name: currentUser.name,
          action: '인사변경',
          target_type: 'ESS_PROFILE_UPDATE_PENDING',
          target_id: String(currentUser.id),
          details,
          created_at: new Date().toISOString(),
        },
      ]);

      if (insertError) {
        throw insertError;
      }
    }

    applyIsEditing(false);
    toast('내정보 변경 요청을 전송했습니다. 인사관리 승인 후 반영됩니다.', 'success');
  };

  const handleSaveProfile = async () => {
    try {
      let currentUser = user;
      if (!getStaffLikeId(currentUser) && ((_iu)?.name || (_iu)?.employee_no || (_iu)?.auth_user_id)) {
        await recoverUserIdentity(_iu);
        try {
          const stored = localStorage.getItem('erp_user');
          if (stored) currentUser = JSON.parse(stored);
        } catch (_) { }
      }
      if (!getStaffLikeId(currentUser)) {
        toast('내 정보 수정은 직원 계정(이름으로 로그인)에서만 가능합니다.', 'warning');
        return;
      }

      await submitProfileChangeRequest(currentUser);
    } catch (err) {
      console.error(err);
      toast('요청 전송에 실패했습니다.', 'error');
    }
  };

  if (!user) return <div className="p-5">로딩 중...</div>;

  const actionButtons = (
    <>
      <button
        type="button"
        onClick={() => { if (showSecret) applyShowSecret(false); else verifyPasswordAndRun(() => applyShowSecret(true)); }}
        className="rounded-[var(--radius-md)] border border-transparent bg-[var(--muted)] px-3 py-1.5 text-[11px] font-bold text-[var(--toss-gray-3)] transition-all hover:border-[var(--toss-blue-light)] hover:text-[var(--accent)]"
      >
        {showSecret ? '민감 정보 숨기기' : '보안 정보 보기'}
      </button>
      <button
        type="button"
        onClick={() => { if (isEditing) applyIsEditing(false); else verifyPasswordAndRun(() => applyIsEditing(true)); }}
        data-testid="mypage-profile-edit-toggle"
        className={`rounded-[var(--radius-md)] border px-3 py-1.5 text-[11px] font-bold transition-all ${isEditing
          ? 'bg-red-50 text-red-500 border-red-100 hover:bg-red-100'
          : 'bg-[var(--toss-blue-light)] text-[var(--accent)] border-[var(--toss-blue-light)] hover:bg-[var(--toss-blue-light)]'
          }`}
      >
        {isEditing ? '수정 취소' : '내 정보 수정'}
      </button>
    </>
  );

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] p-3 sm:p-4 lg:p-5 flex flex-col">
      {dialog}

      {/* 프로필 헤더 */}
      {!hideHeader ? (
        <div className="flex flex-row items-center sm:items-start gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-[var(--border)] shrink-0">
          <div className="relative group shrink-0">
            <div className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-full bg-[var(--muted)] flex items-center justify-center overflow-hidden border-2 sm:border-4 border-[var(--card)] shadow-sm">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-5xl font-bold text-[var(--toss-gray-3)]">👤</span>
              )}
            </div>
            {user?.id ? (
              <>
                <label className="absolute bottom-1 right-1 w-10 h-10 bg-[var(--accent)] text-white rounded-full flex items-center justify-center cursor-pointer hover:opacity-90 transition-all shadow-sm z-10" htmlFor="profiles-upload">
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
                  {user.name as string} {user.position as string}
                </h2>
                <p className="text-sm sm:text-base lg:text-lg font-bold text-[var(--accent)] underline decoration-[var(--toss-blue-light)] underline-offset-4">
                  {user.department as string} 소속
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
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2 border-b border-[var(--border)] pb-3">
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
            <h3 className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest border-l-4 border-[var(--accent)] pl-3 mb-1">
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
                    testId="mypage-profile-phone-input"
                    placeholder="'-' 없이 숫자만 입력"
                  />
                  <EditableItem
                    label="내선번호"
                    value={editForm.extension}
                    onChange={(v: string) => setEditForm((f) => ({ ...f, extension: v }))}
                    testId="mypage-profile-extension-input"
                    placeholder="내선번호 입력"
                  />
                  <EditableItem
                    label="거주지"
                    value={editForm.address}
                    onChange={(v: string) => setEditForm((f) => ({ ...f, address: v }))}
                    testId="mypage-profile-address-input"
                    placeholder="도로명 주소를 입력하세요"
                  />
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-x-4 gap-y-3 pt-1">
                  <div className="xl:col-span-2 space-y-3">
                    <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-wide block">계좌정보</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        data-testid="mypage-profile-bank-name-input"
                        value={editForm.bank_name}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, bank_name: e.target.value }))
                        }
                        placeholder="은행명"
                        className="w-full px-3 py-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] text-[13px] font-semibold text-[var(--foreground)] bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
                      />
                      <input
                        type="text"
                        data-testid="mypage-profile-bank-account-input"
                        value={editForm.bank_account}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, bank_account: e.target.value }))
                        }
                        placeholder="계좌번호"
                        className="w-full px-3 py-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] text-[13px] font-semibold text-[var(--foreground)] bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 min-[520px]:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-3">
                <InfoItem label="연락처" value={showSecret ? user.phone : MASKED_TEXT} isMasked={!showSecret} />
                <InfoItem label="내선번호" value={user.extension || (user.permissions as Record<string, unknown>)?.extension} />
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
            <ProfileChangeRequestHistory user={user} />
          </div>
        </div>

      </div>

      {/* 로그아웃 버튼 */}
      <div className="mt-3 flex shrink-0 flex-col-reverse gap-2.5 border-t border-[var(--border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
        {isEditing && (
          <button
            type="button"
            onClick={handleSaveProfile}
            data-testid="mypage-profile-save"
            className="w-full sm:w-auto px-5 py-2.5 rounded-[var(--radius-lg)] bg-emerald-500 text-white text-[11px] sm:text-[12px] font-semibold hover:bg-emerald-600 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span className="text-sm">💾</span>
            <span className="tracking-tight">내 정보 저장</span>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full sm:w-auto py-2.5 rounded-[var(--radius-lg)] bg-[var(--accent)] text-white text-[11px] sm:text-[12px] font-semibold hover:bg-[var(--accent)] transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <span className="text-sm">🚪</span>
          <span className="tracking-tight">시스템 안전 로그아웃</span>
        </button>
      </div>
    </div>
  );
}

function InfoItem({ label, value, isMasked }: { label?: unknown; value?: unknown; isMasked?: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-wide">{label as string}</span>
      <span className={`text-[15px] font-bold leading-snug ${isMasked ? 'text-[var(--toss-gray-3)] tracking-widest' : 'text-[var(--foreground)]'}`}>
        {(value as string) || '-'}
      </span>
    </div>
  );
}

function EditableItem({ label, value, onChange, placeholder, testId }: { label?: unknown; value?: unknown; onChange?: unknown; placeholder?: unknown; testId?: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-wide">{label as string}</span>
      <input
        type="text"
        data-testid={testId as string}
        value={value as string}
        onChange={(e) => (onChange as (v: string) => void)(e.target.value)}
        placeholder={placeholder as string}
        className="w-full px-3 py-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] text-[14px] font-semibold text-[var(--foreground)] bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]"
      />
    </div>
  );
}

const PROFILE_REQUEST_TARGET_TYPES = [
  'ESS_PROFILE_UPDATE_PENDING',
  'ESS_PROFILE_UPDATE_APPROVED',
  'ESS_PROFILE_UPDATE_REJECTED',
] as const;

function formatProfileRequestDateTime(value: unknown) {
  if (!value) return '-';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getProfileRequestStatusMeta(targetType: unknown) {
  const normalized = String(targetType ?? '').trim();
  if (normalized === 'ESS_PROFILE_UPDATE_APPROVED') {
    return {
      label: '승인',
      className: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
    };
  }
  if (normalized === 'ESS_PROFILE_UPDATE_REJECTED') {
    return {
      label: '반려',
      className: 'bg-rose-50 text-rose-600 border border-rose-200',
    };
  }
  return {
    label: '대기',
    className: 'bg-amber-50 text-amber-600 border border-amber-200',
  };
}

function summarizeProfileRequestFields(details: unknown) {
  const detailObject =
    details && typeof details === 'object' && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : {};
  const requestedChanges =
    detailObject.requested_changes && typeof detailObject.requested_changes === 'object' && !Array.isArray(detailObject.requested_changes)
      ? (detailObject.requested_changes as Record<string, unknown>)
      : {};
  const originalData =
    detailObject.original_data && typeof detailObject.original_data === 'object' && !Array.isArray(detailObject.original_data)
      ? (detailObject.original_data as Record<string, unknown>)
      : {};
  const requestedPermissions =
    requestedChanges.permissions && typeof requestedChanges.permissions === 'object' && !Array.isArray(requestedChanges.permissions)
      ? (requestedChanges.permissions as Record<string, unknown>)
      : {};
  const originalPermissions =
    originalData.permissions && typeof originalData.permissions === 'object' && !Array.isArray(originalData.permissions)
      ? (originalData.permissions as Record<string, unknown>)
      : {};

  const labels = new Map<string, string>([
    ['email', '이메일'],
    ['phone', '연락처'],
    ['address', '거주지'],
    ['bank_account', '계좌번호'],
    ['bank_name', '은행명'],
    ['extension', '내선번호'],
  ]);

  const changed = new Set<string>();
  for (const [key, label] of labels.entries()) {
    const beforeValue =
      key === 'extension'
        ? originalData.extension ?? originalPermissions.extension ?? null
        : key === 'bank_name'
          ? originalData.bank_name ?? originalPermissions.bank_name ?? null
          : originalData[key] ?? null;
    const afterValue =
      key === 'extension'
        ? requestedChanges.extension ?? requestedPermissions.extension ?? null
        : key === 'bank_name'
          ? requestedChanges.bank_name ?? requestedPermissions.bank_name ?? null
          : requestedChanges[key] ?? null;
    if (String(beforeValue ?? '') !== String(afterValue ?? '')) {
      changed.add(label);
    }
  }

  return Array.from(changed);
}

function ProfileChangeRequestHistory({ user: rawUser }: { user: Record<string, unknown> }) {
  const [requests, setRequests] = useState<Record<string, unknown>[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const resolvedUser = await resolveStaffLike(rawUser);
      const staffId = getStaffLikeId(resolvedUser);
      if (!staffId) {
        if (!cancelled) setRequests([]);
        return;
      }

      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, target_type, created_at, details')
        .in('target_type', [...PROFILE_REQUEST_TARGET_TYPES])
        .eq('target_id', String(staffId))
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('프로필 변경 요청 이력 로드 실패:', error);
        if (!cancelled) setRequests([]);
        return;
      }

      if (!cancelled) {
        setRequests(Array.isArray(data) ? (data as Record<string, unknown>[]) : []);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [rawUser]);

  if (requests === null) {
    return (
      <div className="bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5 text-[12px] text-[var(--toss-gray-3)] font-semibold">
        변경 요청 이력을 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">
            내정보 변경 요청
          </p>
          <p className="text-[13px] font-bold text-[var(--foreground)] mt-1">
            최근 요청 상태를 확인할 수 있습니다.
          </p>
        </div>
        <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
          최근 {requests.length}건
        </span>
      </div>

      {requests.length === 0 ? (
        <p className="text-[12px] text-[var(--toss-gray-4)]">최근 내정보 변경 요청이 없습니다.</p>
      ) : (
        <div className="space-y-2.5">
          {requests.map((request) => {
            const statusMeta = getProfileRequestStatusMeta(request.target_type);
            const changedFields = summarizeProfileRequestFields(request.details);
            return (
              <div
                key={String(request.id)}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                  <span className="text-[11px] text-[var(--toss-gray-4)]">
                    {formatProfileRequestDateTime(request.created_at)}
                  </span>
                </div>
                <p className="text-[12px] font-semibold text-[var(--foreground)]">
                  {changedFields.length > 0 ? changedFields.join(', ') : '변경 항목 확인'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LegacyLeaveAndCommuteSummary({ user: _rawUser, onOpenApproval }: Record<string, unknown>) {
  const user = (_rawUser ?? {}) as Record<string, unknown>;
  const [summary, setSummary] = useState<{
    total: number;
    used: number;
    remaining: number;
    todayStatusLabel: string | null;
    lateDays: { date: string; status: string }[];
    overworkDays: { date: string; status: string }[];
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user?.id && !user?.name && !user?.employee_no && !user?.auth_user_id) return;

      const resolvedUser = await resolveStaffLike(user as Record<string, unknown>);
      const resolvedStaffId = getStaffLikeId(resolvedUser);

      let staff: { id?: string; annual_leave_total?: number; annual_leave_used?: number } | null = null;
      if (resolvedStaffId) {
        const res = await supabase
          .from('staff_members')
          .select('id, annual_leave_total, annual_leave_used')
          .eq('id', resolvedStaffId)
          .maybeSingle();
        staff = res.data;
      }
      if (!staff && resolvedUser?.name) {
        const res = await supabase
          .from('staff_members')
          .select('*')
          .eq('name', resolvedUser.name)
          .maybeSingle();
        const row = res.data as any;
        if (row) staff = { id: row.id, annual_leave_total: row.annual_leave_total, annual_leave_used: row.annual_leave_used };
      }

      const total = Number(staff?.annual_leave_total ?? resolvedUser?.annual_leave_total ?? user?.annual_leave_total ?? 0);
      const staffId = staff?.id ?? resolvedStaffId;
      const currentYear = new Date().getFullYear();
      const yearStart = `${currentYear}-01-01`;
      const yearEnd = `${currentYear}-12-31`;

      const { data: approvedLeaves } = staffId
        ? await supabase
          .from('leave_requests')
          .select('leave_type,start_date,end_date,status')
          .eq('staff_id', staffId)
          .lte('start_date', yearEnd)
          .gte('end_date', yearStart)
        : { data: null as any };

      const used = Math.max(
        Number(staff?.annual_leave_used ?? resolvedUser?.annual_leave_used ?? user?.annual_leave_used ?? 0),
        calculateApprovedAnnualLeaveUsage(
          Array.isArray(approvedLeaves) ? (approvedLeaves as Record<string, unknown>[]) : [],
          currentYear
        )
      );
      const remaining = Math.max(0, total - used);

      const { data: commute } = staffId
        ? await supabase
          .from('attendance')
          .select('date,status')
          .eq('staff_id', staffId)
          .order('date', { ascending: false })
          .limit(60)
        : { data: null as any };

      const today = new Date().toISOString().slice(0, 10);
      const { data: todayAttendance } = staffId
        ? await supabase
          .from('attendances')
          .select('status')
          .eq('staff_id', staffId)
          .eq('work_date', today)
          .maybeSingle()
        : { data: null as any };

      const normalizedTodayStatus = String(todayAttendance?.status ?? '').trim().toLowerCase();
      const todayStatusLabel =
        normalizedTodayStatus === 'annual_leave' || normalizedTodayStatus === '연차휴가'
          ? '오늘 연차 승인 반영'
          : normalizedTodayStatus === 'half_leave' || normalizedTodayStatus === '반차휴가'
            ? '오늘 반차 승인 반영'
            : normalizedTodayStatus === 'sick_leave' || normalizedTodayStatus === '병가'
              ? '오늘 병가 승인 반영'
              : null;

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

      setSummary({ total, used, remaining, todayStatusLabel, lateDays, overworkDays });
    };

    load();
  }, [user?.id, user?.name, user?.employee_no, user?.auth_user_id]);

  if (!summary) {
    return (
      <div className="bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5 sm:p-4 text-[12px] text-[var(--toss-gray-3)] font-semibold">
        근태·연차 정보를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5 sm:p-4 space-y-3 text-[12px]">
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
          onClick={() => (onOpenApproval as ((v: unknown) => void) | undefined)?.({ type: '휴가신청' })}
          className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-[var(--radius-md)] text-[11px] font-bold hover:bg-emerald-100 transition-colors"
        >
          🏖️ 연차 신청
        </button>
      </div>

      <div className="border-t border-[var(--border)] pt-3 space-y-1.5">
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

      <div className="border-t border-[var(--border)] pt-3 space-y-1.5">
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

function LeaveAndCommuteSummary({ user: _rawUser, onOpenApproval }: Record<string, unknown>) {
  const user = (_rawUser ?? {}) as Record<string, unknown>;
  const [summary, setSummary] = useState<{
    total: number;
    used: number;
    remaining: number;
    todayStatusLabel: string | null;
    lateDays: { date: string; status: string }[];
    overworkDays: { date: string; status: string }[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user?.id && !user?.name && !user?.employee_no && !user?.auth_user_id) return;

      const resolvedUser = await resolveStaffLike(user as Record<string, unknown>);
      const resolvedStaffId = getStaffLikeId(resolvedUser);

      let staff: { id?: string; annual_leave_total?: number; annual_leave_used?: number } | null = null;
      if (resolvedStaffId) {
        const res = await supabase
          .from('staff_members')
          .select('id, annual_leave_total, annual_leave_used')
          .eq('id', resolvedStaffId)
          .maybeSingle();
        staff = res.data;
      }

      if (!staff && resolvedUser?.name) {
        const res = await supabase
          .from('staff_members')
          .select('id, annual_leave_total, annual_leave_used')
          .eq('name', resolvedUser.name)
          .maybeSingle();
        staff = res.data;
      }

      const total = Number(staff?.annual_leave_total ?? resolvedUser?.annual_leave_total ?? user?.annual_leave_total ?? 0);
      const staffId = staff?.id ?? resolvedStaffId;
      const currentYear = new Date().getFullYear();
      const yearStart = `${currentYear}-01-01`;
      const yearEnd = `${currentYear}-12-31`;

      const { data: approvedLeaves } = staffId
        ? await supabase
            .from('leave_requests')
            .select('leave_type,start_date,end_date,status')
            .eq('staff_id', staffId)
            .lte('start_date', yearEnd)
            .gte('end_date', yearStart)
        : { data: null as any };

      const used = Math.max(
        Number(staff?.annual_leave_used ?? resolvedUser?.annual_leave_used ?? user?.annual_leave_used ?? 0),
        calculateApprovedAnnualLeaveUsage(
          Array.isArray(approvedLeaves) ? (approvedLeaves as Record<string, unknown>[]) : [],
          currentYear
        )
      );
      const remaining = Math.max(0, total - used);

      const { data: commute } = staffId
        ? await supabase
            .from('attendance')
            .select('date,status')
            .eq('staff_id', staffId)
            .order('date', { ascending: false })
            .limit(60)
        : { data: null as any };

      const today = new Date().toISOString().slice(0, 10);
      const { data: todayAttendance } = staffId
        ? await supabase
            .from('attendances')
            .select('status')
            .eq('staff_id', staffId)
            .eq('work_date', today)
            .maybeSingle()
        : { data: null as any };

      const normalizedTodayStatus = String(todayAttendance?.status ?? '').trim().toLowerCase();
      const todayStatusLabel =
        normalizedTodayStatus === 'annual_leave' || normalizedTodayStatus === '연차휴가'
          ? '오늘 연차 승인 반영'
          : normalizedTodayStatus === 'half_leave' || normalizedTodayStatus === '반차휴가'
            ? '오늘 반차 승인 반영'
            : normalizedTodayStatus === 'sick_leave' || normalizedTodayStatus === '병가'
              ? '오늘 병가 승인 반영'
              : null;

      const lateDays =
        commute
          ?.filter((entry: any) => entry.status === '지각')
          .map((entry: any) => ({
            date: entry.date,
            status: entry.status,
          })) ?? [];

      const overworkDays =
        commute
          ?.filter((entry: any) => ['추가근무', '연장근무', '특근'].includes(String(entry.status ?? '')))
          .map((entry: any) => ({
            date: entry.date,
            status: entry.status,
          })) ?? [];

      if (!cancelled) {
        setSummary({ total, used, remaining, todayStatusLabel, lateDays, overworkDays });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.name, user?.employee_no, user?.auth_user_id]);

  if (!summary) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-3.5 text-[12px] font-semibold text-[var(--toss-gray-3)] sm:p-4">
        근태와 연차 요약 정보를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-3.5 text-[12px] sm:p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">
            연차 현황
          </p>
          <p className="text-[14px] font-bold leading-snug text-[var(--foreground)]">
            잔여 연차 <span className="text-emerald-600">{summary.remaining.toFixed(1)}일</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--toss-gray-4)]">
            총 {summary.total.toFixed(1)}일 중 {summary.used.toFixed(1)}일 사용
          </p>
          {summary.todayStatusLabel ? (
            <p className="mt-1.5 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600">
              {summary.todayStatusLabel}
            </p>
          ) : null}
        </div>
        <button
          onClick={() => (onOpenApproval as ((v: unknown) => void) | undefined)?.({ type: '연차/휴가' })}
          className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-600 transition-colors hover:bg-emerald-100"
        >
          휴가 결재 열기
        </button>
      </div>

      <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">
          최근 지각
        </p>
        {summary.lateDays.length === 0 ? (
          <p className="text-[11px] text-[var(--toss-gray-4)]">최근 60일 내 지각 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-[11px] text-[var(--toss-gray-4)]">
            {summary.lateDays.slice(0, 3).map((entry) => (
              <li key={`${entry.date}-${entry.status}`}>
                {new Date(entry.date).toLocaleDateString('ko-KR')} · {entry.status}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">
          최근 추가 근무
        </p>
        {summary.overworkDays.length === 0 ? (
          <p className="text-[11px] text-[var(--toss-gray-4)]">최근 60일 내 추가 근무 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-[11px] text-[var(--toss-gray-4)]">
            {summary.overworkDays.slice(0, 3).map((entry) => (
              <li key={`${entry.date}-${entry.status}`}>
                {new Date(entry.date).toLocaleDateString('ko-KR')} · {entry.status}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
