'use client';

/**
 * 정보수정 — 프로필 정보 수정 서브스크린.
 *   - 중앙 아바타 (80px, accent, 이니셜) + 수정 오버레이
 *   - 폼 필드: 이름, 직책/부서, 휴대전화, 이메일, 비상연락처
 *   - '변경사항 저장' 버튼
 * JM: 단일 책임 (정보 수정 UI)
 * JM4: any 금지
 * JM6: label 연결, button 시맨틱
 */

import { memo, useState, useCallback, useEffect } from 'react';
import type { ErpUser } from '@/types';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';

function getInitial(name?: string | null) {
  return String(name || '').trim().slice(0, 1) || '나';
}

export type 정보수정Props = {
  user: ErpUser;
  onBack: () => void;
};

function 정보수정Base({ user, onBack }: 정보수정Props) {
  const staffId = typeof user?.id === 'string' ? user.id : null;
  const name = (user.name || '직원') as string;
  const position = (user.position || '') as string;
  const department = (user.department || '') as string;
  const initial = getInitial(name);

  const [phone, setPhone] = useState(typeof user.phone === 'string' ? user.phone : '');
  const [email, setEmail] = useState(typeof user.email === 'string' ? user.email : '');
  const [saving, setSaving] = useState(false);

  // 최신 연락처를 staff_members에서 로드(세션 user가 stale일 수 있음).
  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('staff_members')
          .select('phone, email')
          .eq('id', staffId)
          .maybeSingle();
        if (cancelled || !data) return;
        const row = data as { phone?: string | null; email?: string | null };
        if (typeof row.phone === 'string') setPhone(row.phone);
        if (typeof row.email === 'string') setEmail(row.email);
      } catch { /* 세션 값 유지 */ }
    })();
    return () => { cancelled = true; };
  }, [staffId]);

  const handleSave = useCallback(async () => {
    if (!staffId) { toast('직원 정보를 확인할 수 없습니다.', 'warning'); return; }
    setSaving(true);
    try {
      // 보안: 본인 연락처(phone/email)만 수정. role/permissions/password 등 권한 컬럼은 건드리지 않음.
      const { error } = await supabase
        .from('staff_members')
        .update({ phone: phone.trim(), email: email.trim() })
        .eq('id', staffId);
      if (error) throw new Error(typeof error === 'string' ? error : (error as { message?: string })?.message);
      toast('연락처가 저장되었습니다.', 'success');
      onBack();
    } catch (err) {
      toast(`저장 실패: ${(err as Error)?.message ?? '알 수 없는 오류'}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [staffId, phone, email, onBack]);

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    height: 48,
    padding: '0 16px',
    borderRadius: 12,
    border: '1px solid var(--m-border)',
    background: 'var(--m-card)',
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--z-900)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--z-500)',
    marginBottom: 6,
  };

  const readOnlyFieldStyle: React.CSSProperties = {
    ...fieldStyle,
    background: 'var(--z-50)',
    color: 'var(--z-500)',
  };

  return (
    <div className="m-screen">
      <MobileHeader title="정보 수정" back={onBack} />
      <div className="m-scroll" style={{ paddingBottom: 24 }}>
        {/* 아바타 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '28px 0 8px',
          }}
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
                placeItems: 'center',
              }}
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
                placeItems: 'center',
              }}
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
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={fieldStyle}
              placeholder="example@company.com"
            />
          </div>
        </div>

        {/* 저장 버튼 */}
        <div style={{ padding: '24px 20px 4px' }}>
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
              gap: 8,
            }}
          >
            {saving ? '저장 중…' : '변경사항 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

const 정보수정 = memo(정보수정Base);
export default 정보수정;
