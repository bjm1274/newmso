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

import { memo, useState, useCallback } from 'react';
import type { ErpUser } from '@/types';
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
  const name = (user.name || '직원') as string;
  const position = (user.position || '') as string;
  const department = (user.department || '') as string;
  const initial = getInitial(name);

  const [phone, setPhone] = useState('010-1234-5678');
  const [email, setEmail] = useState('user@company.com');
  const [emergency, setEmergency] = useState('010-9876-5432');

  const handleSave = useCallback(() => {
    // 저장 로직 (추후 연동)
  }, []);

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

          {/* 비상연락처 */}
          <div className="msm-field">
            <label style={labelStyle} htmlFor="edit-emergency">비상연락처</label>
            <input
              id="edit-emergency"
              type="tel"
              value={emergency}
              onChange={(e) => setEmergency(e.target.value)}
              style={fieldStyle}
              placeholder="010-0000-0000"
            />
          </div>
        </div>

        {/* 저장 버튼 */}
        <div style={{ padding: '24px 20px 4px' }}>
          <button
            type="button"
            className="msm-btn-lg accent"
            onClick={handleSave}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            변경사항 저장
          </button>
        </div>
      </div>
    </div>
  );
}

const 정보수정 = memo(정보수정Base);
export default 정보수정;
