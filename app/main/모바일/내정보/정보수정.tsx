'use client';

/**
 * 정보수정 — 프로필 정보 수정 서브스크린.
 *   - 중앙 아바타 (80px, accent, 이니셜) + 수정 오버레이
 *   - 폼 필드(PC 마이페이지와 동일): 이름·직책/부서(읽기전용), 휴대전화, 이메일,
 *     내선번호, 거주지(주소), 은행명, 계좌번호
 *   - '변경사항 저장' → PC와 동일하게 인사변경 요청(ESS_PROFILE_UPDATE_PENDING) 전송 → 인사관리 승인 후 반영
 * JM: 단일 책임 (정보 수정 UI)
 * JM4: any 금지
 * JM6: label 연결, button 시맨틱
 */

import { memo, useState, useCallback, useEffect } from 'react';
import type { ErpUser } from '@/types';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import {
  submitProfileChangeRequest,
  type ProfileEditableFields,
  type ProfileChangeUser } from '@/lib/profile-change-request';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import { hasPermission } from '@/lib/access-control';
import { useActionDialog } from '@/app/components/useActionDialog';

function getInitial(name?: string | null) {
  return String(name || '').trim().slice(0, 1) || '나';
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function parsePermissions(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* 무시 — 빈 객체 */
    }
  }
  return {};
}

const EMPTY_FORM: ProfileEditableFields = {
  email: '',
  phone: '',
  extension: '',
  address: '',
  bank_name: '',
  bank_account: '' };

export type 정보수정Props = {
  user: ErpUser;
  onBack: () => void;
};

function MobileProfileEditBase({ user, onBack }: 정보수정Props) {
  const staffId = typeof user?.id === 'string' ? user.id : null;
  const name = (user.name || '직원') as string;
  const position = (user.position || '') as string;
  const department = (user.department || '') as string;
  const initial = getInitial(name);

  const [form, setForm] = useState<ProfileEditableFields>(() => ({
    ...EMPTY_FORM,
    phone: typeof user.phone === 'string' ? user.phone : '',
    email: typeof user.email === 'string' ? user.email : '' }));
  const [currentUser, setCurrentUser] = useState<ProfileChangeUser>(() => ({
    id: staffId,
    name,
    email: typeof user.email === 'string' ? user.email : null,
    phone: typeof user.phone === 'string' ? user.phone : null }));
  const [saving, setSaving] = useState(false);

  const { dialog, openPrompt } = useActionDialog();

  const handleChangePassword = useCallback(async () => {
    const currentPassword = await openPrompt({
      title: '비밀번호 변경',
      description: '현재 비밀번호를 먼저 입력해 주세요.',
      confirmText: '다음',
      cancelText: '취소',
      inputType: 'password',
      required: true,
      placeholder: '현재 비밀번호' });
    if (!currentPassword) return;

    const nextPassword = await openPrompt({
      title: '새 비밀번호',
      description: '앞으로 로그인할 때 사용할 새 비밀번호를 입력해 주세요.',
      confirmText: '다음',
      cancelText: '취소',
      inputType: 'password',
      required: true,
      placeholder: '새 비밀번호',
      helperText: '4자 이상 입력해 주세요.' });
    if (!nextPassword) return;
    if (nextPassword.trim().length < 4) {
      toast('새 비밀번호는 4자 이상 입력해 주세요.', 'warning');
      return;
    }

    const nextPasswordConfirm = await openPrompt({
      title: '새 비밀번호 확인',
      description: '새 비밀번호를 한 번 더 입력해 주세요.',
      confirmText: '변경',
      cancelText: '취소',
      inputType: 'password',
      required: true,
      placeholder: '새 비밀번호 확인' });
    if (!nextPasswordConfirm) return;

    if (nextPassword !== nextPasswordConfirm) {
      toast('새 비밀번호가 서로 일치하지 않습니다.', 'warning');
      return;
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword: nextPassword }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        toast(payload?.error || '비밀번호 변경에 실패했습니다.', 'error');
        return;
      }
      toast('비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용해 주세요.', 'success');
    } catch {
      toast('비밀번호 변경 중 오류가 발생했습니다.', 'error');
    }
  }, [openPrompt]);

  // 최신 정보를 staff_members에서 로드(세션 user가 stale일 수 있음).
  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await db
          .from('staff_members')
          .select('phone, email, address, extension, bank_name, bank_account, permissions, name')
          .eq('id', staffId)
          .maybeSingle();
        if (cancelled || !data) return;
        const row = data as Record<string, unknown>;
        const permissions = parsePermissions(row.permissions);
        const bankName = toText(row.bank_name) || toText(permissions.bank_name);
        const extension = toText(row.extension) || toText(permissions.extension);

        setForm({
          email: toText(row.email),
          phone: toText(row.phone),
          extension,
          address: toText(row.address),
          bank_name: bankName,
          bank_account: toText(row.bank_account) });
        setCurrentUser({
          id: staffId,
          name: toText(row.name) || name,
          email: toText(row.email) || null,
          phone: toText(row.phone) || null,
          address: toText(row.address) || null,
          bank_account: toText(row.bank_account) || null,
          bank_name: bankName || null,
          extension: extension || null,
          permissions });
      } catch {
        /* 세션 값 유지 */
      }
    })();
    return () => { cancelled = true; };
  }, [staffId, name]);

  const handleSave = useCallback(async () => {
    if (!staffId) { toast('직원 정보를 확인할 수 없습니다.', 'warning'); return; }
    if (!hasPermission(currentUser, 'mypage_수정')) {
      toast('정보 수정 권한이 없습니다. 관리자에게 문의하세요.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const result = await submitProfileChangeRequest(currentUser, form);
      if (!result.ok) {
        toast(`저장 실패: ${result.error}`, 'error');
        return;
      }
      if (result.status === 'no-change') {
        toast('변경된 내용이 없습니다.', 'warning');
        return;
      }
      toast('내정보 변경 요청을 전송했습니다. 인사관리 승인 후 반영됩니다.', 'success');
      onBack();
    } finally {
      setSaving(false);
    }
  }, [staffId, currentUser, form, onBack]);

  const updateField = useCallback(
    (key: keyof ProfileEditableFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    height: 48,
    padding: '0 16px',
    borderRadius: 12,
    border: '1px solid var(--m-border)',
    background: 'var(--m-card)',
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--z-900)' };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--z-500)',
    marginBottom: 6 };

  const readOnlyFieldStyle: React.CSSProperties = {
    ...fieldStyle,
    background: 'var(--z-50)',
    color: 'var(--z-500)' };

  return (
    <div className="m-screen">
      <MobileHeader title="정보 수정" back={onBack} />
      <div className="m-scroll">
        {/* 아바타 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '28px 0 8px' }}
        >
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 24,
                background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                color: '#fff',
                fontSize: 28,
                fontWeight: 800,
                display: 'grid',
                placeItems: 'center' }}
            >
              {initial}
            </div>
            <button
              type="button"
              aria-label="프로필 사진 변경"
              style={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--m-accent)',
                color: '#fff',
                border: '2px solid var(--m-card)',
                display: 'grid',
                placeItems: 'center' }}
            >
              <MIcon name="camera" size={14} />
            </button>
          </div>
        </div>

        {/* 폼 필드 */}
        <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* 이름 (읽기 전용) */}
          <div className="msm-field">
            <div style={labelStyle}>이름</div>
            <div style={readOnlyFieldStyle}>
              <div style={{ lineHeight: '48px' }}>{name}</div>
            </div>
          </div>

          {/* 직책/부서 (읽기 전용) */}
          <div className="msm-field">
            <div style={labelStyle}>직책 / 부서</div>
            <div style={readOnlyFieldStyle}>
              <div style={{ lineHeight: '48px' }}>
                {position || '—'} / {department || '—'}
              </div>
            </div>
          </div>

          {/* 휴대전화 */}
          <div className="msm-field">
            <label style={labelStyle} htmlFor="edit-phone">휴대전화</label>
            <input
              id="edit-phone"
              type="tel"
              value={form.phone}
              onChange={updateField('phone')}
              style={fieldStyle}
              placeholder="010-0000-0000"
            />
          </div>

          {/* 이메일 */}
          <div className="msm-field">
            <label style={labelStyle} htmlFor="edit-email">이메일</label>
            <input
              id="edit-email"
              type="email"
              value={form.email}
              onChange={updateField('email')}
              style={fieldStyle}
              placeholder="example@company.com"
            />
          </div>

          {/* 내선번호 */}
          <div className="msm-field">
            <label style={labelStyle} htmlFor="edit-extension">내선번호</label>
            <input
              id="edit-extension"
              type="text"
              value={form.extension}
              onChange={updateField('extension')}
              style={fieldStyle}
              placeholder="내선번호 입력"
            />
          </div>

          {/* 거주지 (주소) */}
          <div className="msm-field">
            <label style={labelStyle} htmlFor="edit-address">거주지 (주소)</label>
            <input
              id="edit-address"
              type="text"
              value={form.address}
              onChange={updateField('address')}
              style={fieldStyle}
              placeholder="도로명 주소를 입력하세요"
            />
          </div>

          {/* 계좌정보 */}
          <div className="msm-field">
            <div style={labelStyle}>계좌정보</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                aria-label="은행명"
                value={form.bank_name}
                onChange={updateField('bank_name')}
                style={fieldStyle}
                placeholder="은행명"
              />
              <input
                type="text"
                aria-label="계좌번호"
                value={form.bank_account}
                onChange={updateField('bank_account')}
                style={fieldStyle}
                placeholder="계좌번호"
              />
            </div>
          </div>

          {/* 비밀번호 변경 영역 */}
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
            <div style={labelStyle}>로그인 보안</div>
            <button
              type="button"
              onClick={handleChangePassword}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 12,
                background: 'var(--page-bg)',
                color: 'var(--m-accent)',
                border: '1px solid var(--border)',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                width: '100%',
                justifyContent: 'center' }}
            >
              <MIcon name="shield" size={16} />
              비밀번호 변경하기
            </button>
          </div>
        </div>

        {/* 안내 + 저장 버튼 */}
        <div style={{ padding: '16px 20px 4px' }}>
          <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, lineHeight: 1.5, marginBottom: 12 }}>
            변경 요청은 인사관리 승인 후 반영됩니다.
          </div>
          <button
            type="button"
            className="msm-btn-lg accent"
            onClick={handleSave}
            disabled={saving}
            aria-label="변경사항 저장"
            style={{
              width: '100%',
              height: 52,
              borderRadius: 14,
              background: 'var(--m-accent)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              border: 0,
              opacity: saving ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8 }}
          >
            {saving ? '전송 중…' : '변경사항 저장'}
          </button>
        </div>
      </div>
      {dialog}
    </div>
  );
}

const 정보수정 = memo(MobileProfileEditBase);
export default 정보수정;
