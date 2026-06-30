/**
 * 직원 본인 정보(ESS) 변경 요청 공통 로직.
 *
 * PC 마이페이지(기능부품/마이페이지/프로필카드.tsx)와 동일하게, 본인이 수정 가능한
 * 연락/계좌 정보는 staff_members 를 직접 수정하지 않고 audit_logs 에
 * target_type='ESS_PROFILE_UPDATE_PENDING' 변경 요청을 남겨 인사관리 승인 후 반영한다.
 *
 * PC/모바일이 같은 동작을 갖도록(= 모바일이 승인 절차를 우회하지 않도록) 이 모듈로 추출했다.
 */
import { db } from '@/lib/db-client';
import { buildAuditDiff } from '@/lib/audit';

export type ProfileEditableFields = {
  email: string;
  phone: string;
  extension: string;
  address: string;
  bank_name: string;
  bank_account: string;
};

export type ProfileChangeUser = {
  id?: string | number | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  bank_account?: string | null;
  bank_name?: string | null;
  extension?: string | null;
  permissions?: Record<string, unknown> | null;
};

export type ProfileChangeResult =
  | { ok: true; status: 'submitted' }
  | { ok: true; status: 'no-change' }
  | { ok: false; error: string };

function toSafeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export async function submitProfileChangeRequest(
  currentUser: ProfileChangeUser,
  form: ProfileEditableFields,
): Promise<ProfileChangeResult> {
  const userId = currentUser?.id;
  if (userId === null || userId === undefined || String(userId).trim() === '') {
    return { ok: false, error: '직원 정보를 확인할 수 없습니다.' };
  }

  // mypage_수정 권한 방어 (명시 false일 때만 차단, undefined/true는 허용)
  const perms = currentUser?.permissions;
  if (perms && typeof perms === 'object' && perms.mypage_수정 === false) {
    return { ok: false, error: '정보 수정 권한이 없습니다.' };
  }

  const currentPermissions =
    currentUser?.permissions && typeof currentUser.permissions === 'object' && !Array.isArray(currentUser.permissions)
      ? (currentUser.permissions as Record<string, unknown>)
      : {};

  const requestedChanges = {
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    address: form.address.trim() || null,
    bank_account: form.bank_account.trim() || null,
    bank_name: form.bank_name.trim() || null,
    permissions: {
      ...currentPermissions,
      extension: form.extension.trim() || null,
      bank_name: form.bank_name.trim() || null } };

  const beforeUser = {
    email: currentUser.email ?? null,
    phone: currentUser.phone ?? null,
    address: currentUser.address ?? null,
    bank_account: currentUser.bank_account ?? null,
    bank_name: toSafeText(currentUser.bank_name) || toSafeText(currentPermissions.bank_name) || null,
    extension: toSafeText(currentUser.extension) || toSafeText(currentPermissions.extension) || null,
    permissions: currentPermissions };
  const nextUser = {
    email: requestedChanges.email,
    phone: requestedChanges.phone,
    address: requestedChanges.address,
    bank_account: requestedChanges.bank_account,
    bank_name: requestedChanges.bank_name,
    extension: (requestedChanges.permissions as Record<string, unknown>).extension ?? null,
    permissions: requestedChanges.permissions };

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
    return { ok: true, status: 'no-change' };
  }

  const details = {
    requested_changes: requestedChanges,
    original_data: {
      email: currentUser.email || null,
      phone: currentUser.phone || null,
      address: currentUser.address || null,
      bank_account: currentUser.bank_account || null,
      bank_name: toSafeText(currentUser.bank_name) || toSafeText(currentPermissions.bank_name) || null,
      extension: toSafeText(currentUser.extension) || toSafeText(currentPermissions.extension) || null,
      permissions: currentPermissions } };

  try {
    const existing = await db
      .from('audit_logs')
      .select('id')
      .eq('target_type', 'ESS_PROFILE_UPDATE_PENDING')
      .eq('target_id', String(userId))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.error) throw existing.error;

    if (existing.data?.id) {
      const { error } = await db
        .from('audit_logs')
        .update({
          user_name: currentUser.name ?? null,
          action: '인사변경',
          details,
          created_at: new Date().toISOString() })
        .eq('id', existing.data.id);
      if (error) throw error;
    } else {
      const { error } = await db.from('audit_logs').insert([
        {
          user_id: userId,
          user_name: currentUser.name ?? null,
          action: '인사변경',
          target_type: 'ESS_PROFILE_UPDATE_PENDING',
          target_id: String(userId),
          details,
          created_at: new Date().toISOString() },
      ]);
      if (error) throw error;
    }
    return { ok: true, status: 'submitted' };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : (err as { message?: string } | null)?.message || '변경 요청 전송에 실패했습니다.';
    return { ok: false, error: message };
  }
}
