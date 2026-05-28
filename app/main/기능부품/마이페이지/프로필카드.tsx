'use client';
import ProfilePhotoThumbnail from '@/app/components/ProfilePhotoThumbnail';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { performClientLogout } from '@/lib/client-logout';
import { buildAuditDiff } from '@/lib/audit';
import {
  getProfilePhotoUrl,
  normalizeProfileUser,
} from '@/lib/profile-photo';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import { useActionDialog } from '@/app/components/useActionDialog';
import type { ProfileCardUser, ProfileCardProps } from './프로필카드/types';
import { toSafeText } from './프로필카드/format-utils';
import { InfoItem, EditableItem } from './프로필카드/InfoItems';
import { ProfileChangeRequestHistory } from './프로필카드/ProfileChangeRequestHistory';
import { LeaveAndCommuteSummary } from './프로필카드/LeaveAndCommuteSummary';

export default function MyProfileCard({
  user: initialUser,
  onOpenApproval,
  hideHeader = false,
  hideActionBar = false,
  showSecret: controlledShowSecret,
  setShowSecret: setControlledShowSecret,
  isEditing: controlledIsEditing,
  setIsEditing: setControlledIsEditing,
}: ProfileCardProps) {
  const { dialog, openConfirm, openPrompt } = useActionDialog();
  const MASKED_TEXT = '********';
  const _iu = normalizeStaffLike((initialUser ?? {}) as ProfileCardUser);
  const [user, setUser] = useState<ProfileCardUser>(normalizeProfileUser(_iu as ProfileCardUser));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(getProfilePhotoUrl((_iu)));
  const [internalShowSecret, setInternalShowSecret] = useState(true);
  const [internalIsEditing, setInternalIsEditing] = useState(false);
  const effectiveUserId = getStaffLikeId(user);
  const [editForm, setEditForm] = useState<{ email: string; phone: string; extension: string; address: string; bank_name: string; bank_account: string }>({
    email: ((_iu)?.email as string) || '',
    phone: ((_iu)?.phone as string) || '',
    extension: toSafeText((_iu)?.extension) || toSafeText((_iu.permissions as Record<string, unknown>)?.extension) || '',
    address: ((_iu)?.address as string) || '',
    bank_name: toSafeText((_iu)?.bank_name) || toSafeText((_iu.permissions as Record<string, unknown>)?.bank_name) || '',
    bank_account: toSafeText((_iu)?.bank_account) || toSafeText((_iu.permissions as Record<string, unknown>)?.bank_account) || '',
  });

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

  const broadcastProfileUpdate = (nextUser: ProfileCardUser) => {
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
      return;
    }
    if ((_iu)?.name || (_iu)?.employee_no || (_iu)?.auth_user_id) {
      void recoverUserIdentity(_iu);
    }
  }, [_iu?.id, _iu?.name, _iu?.employee_no, _iu?.auth_user_id]);

  // 편집 폼은 user 정보가 바뀔 때 동기화
  useEffect(() => {
    if (user) {
      setEditForm({
        email: (user.email as string) || '',
        phone: (user.phone as string) || '',
        extension: toSafeText(user.extension) || toSafeText((user.permissions as Record<string, unknown>)?.extension) || '',
        address: (user.address as string) || '',
        bank_name: toSafeText(user.bank_name) || toSafeText((user.permissions as Record<string, unknown>)?.bank_name) || '',
        bank_account: toSafeText(user.bank_account) || toSafeText((user.permissions as Record<string, unknown>)?.bank_account) || '',
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

      const normalizedUser = normalizeProfileUser(resolvedUser);
      setUser(normalizedUser);
      setAvatarUrl(getProfilePhotoUrl(normalizedUser));

      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(normalizedUser));
      broadcastProfileUpdate(normalizedUser);
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

    await performClientLogout();
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
      await response.json().catch(() => null);

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

  const buildRequestedProfileChanges = (currentUser: ProfileCardUser) => {
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

  const submitProfileChangeRequest = async (currentUser: ProfileCardUser) => {
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
        bank_name: toSafeText(currentUser.bank_name) || toSafeText(currentUser?.permissions?.bank_name) || null,
        extension: toSafeText(currentUser.extension) || toSafeText(currentUser?.permissions?.extension) || null,
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
          const stored = localStorage.getItem(STORAGE_KEYS.USER);
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
        onClick={() => { if (isEditing) applyIsEditing(false); else verifyPasswordAndRun(() => applyIsEditing(true)); }}
        data-testid="mypage-profile-edit-toggle"
        className={`rounded-[var(--radius-md)] border px-3 py-1.5 text-[11px] font-bold transition-all ${isEditing
          ? 'bg-red-500/10 text-red-500 border-red-100 hover:bg-red-500/20'
          : 'bg-[var(--toss-blue-light)] text-[var(--accent)] border-[var(--toss-blue-light)] hover:bg-[var(--toss-blue-light)]'
          }`}
      >
        {isEditing ? '수정 취소' : '정보 수정'}
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
                <ProfilePhotoThumbnail
                  src={avatarUrl}
                  name={toSafeText(user.name)}
                  alt="Profile"
                  className="w-full h-full"
                />
              ) : (
                <span className="text-5xl font-bold text-[var(--toss-gray-3)]">👤</span>
              )}
            </div>
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
          </div>
        </div>
      ) : (
        <>
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
          <span className="tracking-tight">로그아웃</span>
        </button>
      </div>
    </div>
  );
}
