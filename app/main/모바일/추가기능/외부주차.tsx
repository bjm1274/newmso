'use client';

/**
 * 외부 — 주차관제 안내 화면.
 * 외부 시스템(Hi-Park) 연결: NEXT_PUBLIC_PARKING_URL 환경변수로 활성화.
 * 핸드오프 m-screens-addon-modules §9 (SAddonExternal kind='parking') 이식.
 * JM: 단일 책임, ~120줄.
 * JM5: 외부 URL은 환경변수 화이트리스트 + https 강제 + rel="noopener noreferrer".
 * JM6: 외부 열기는 anchor 시맨틱 사용 (링크 동작 + 키보드 접근 자동).
 */

import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MBtn from '../공통/MBtn';

const PARKING_URL_RAW = process.env.NEXT_PUBLIC_PARKING_URL ?? '';

// JM5: https만 허용. 빈 문자열·http는 비활성으로 처리.
function safeExternalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

const PARKING_URL = safeExternalUrl(PARKING_URL_RAW);

function isAdmin(user: ErpUser): boolean {
  return user.permissions?.mso === true || user.role === '관리자';
}

export default function 외부주차({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const enabled = Boolean(PARKING_URL);
  const admin = isAdmin(user);

  return (
    <div
      className="m-screen"
      style={{
        background:
          'linear-gradient(135deg, rgba(235, 244, 255, 0.7) 0%, rgba(243, 231, 255, 0.7) 50%, rgba(255, 230, 240, 0.7) 100%)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
      }}
    >
      <MobileHeader title="주차관제" sub="외부 시스템 연동" back={onBack} />
      <div className="m-scroll" style={{ background: 'transparent' }}>
        <div style={{ padding: '24px 16px' }}>
          <div
            className="macos-glass macos-squircle"
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              background: 'rgba(255, 255, 255, 0.55)',
              backdropFilter: 'blur(30px)',
              WebkitBackdropFilter: 'blur(30px)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.04)',
            }}
          >
            <div
              aria-hidden="true"
              className="macos-squircle"
              style={{
                width: 72,
                height: 72,
                background: 'rgba(0, 122, 255, 0.12)',
                color: '#007aff',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 18px',
                boxShadow: '0 4px 12px rgba(0, 122, 255, 0.1)',
              }}
            >
              <MIcon name="box" size={32} strokeWidth={1.4} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em', color: '#1d1d1f' }}>
              주차관제
            </div>
            <div
              style={{
                fontSize: 13,
                color: '#6e6e73',
                fontWeight: 500,
                marginTop: 8,
                lineHeight: 1.6,
                padding: '0 12px',
              }}
            >
              주차장 입출차·차량 인식은 외부 시스템(Hi-Park)에서 운영됩니다.
              <br />
              데스크톱에서 통합 대시보드를 사용하세요.
            </div>
            <div style={{ marginTop: 24, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {enabled && PARKING_URL ? (
                <a
                  href={PARKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="m-btn primary block macos-squircle-sm"
                  aria-label="주차관제 외부 시스템 새 창으로 열기"
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    height: '44px',
                    borderRadius: '12px',
                    background: '#007aff',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '14px',
                  }}
                >
                  <MIcon name="send" size={16} />
                  외부 시스템 열기
                </a>
              ) : (
                <MBtn variant="primary" icon="send" block disabled className="macos-squircle-sm">
                  외부 시스템 열기 (미설정)
                </MBtn>
              )}
              <MBtn icon="bell" block className="macos-squircle-sm">
                모바일 알림만 받기
              </MBtn>
            </div>
            {!enabled && (
              <div
                className="macos-glass macos-squircle-sm"
                style={{
                  marginTop: 18,
                  padding: '14px 16px',
                  background: 'rgba(255, 59, 48, 0.05)',
                  border: '1px solid rgba(255, 59, 48, 0.15)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: '#d32f2f',
                  textAlign: 'left',
                }}
                role="status"
                aria-live="polite"
              >
                <div style={{ fontWeight: 700, color: '#ff3b30', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MIcon name="info" size={14} color="#ff3b30" />
                  외부 시스템 URL 미설정
                </div>
                {admin ? (
                  <div style={{ color: 'var(--z-700)', fontSize: 12 }}>
                    관리자 페이지에서 <code>NEXT_PUBLIC_PARKING_URL</code> 환경변수를 https URL로
                    설정한 뒤 재배포해 주세요. (데스크톱에서 안내)
                  </div>
                ) : (
                  <div style={{ color: 'var(--z-700)', fontSize: 12 }}>
                    관리자에게 주차관제 외부 시스템 URL 설정을 요청해 주세요.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="m-section" style={{ marginTop: 24 }}>
          <div className="m-section-h" style={{ padding: '0 20px 8px' }}>
            <div className="lbl" style={{ fontSize: 14, fontWeight: 700, color: '#1d1d1f' }}>최근 활동</div>
          </div>
          <div
            className="macos-glass macos-squircle"
            style={{
              margin: '0 16px',
              padding: '24px 20px',
              textAlign: 'center',
              background: 'rgba(255, 255, 255, 0.55)',
              backdropFilter: 'blur(30px)',
              WebkitBackdropFilter: 'blur(30px)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.04)',
              color: 'var(--z-500)',
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            외부 시스템 연동 후 표시됩니다.
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
