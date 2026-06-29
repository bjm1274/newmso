'use client';

/**
 * 외부 — 웹팩스 안내 화면.
 * 외부 시스템(WebFax+) 연결: NEXT_PUBLIC_WEBFAX_URL 환경변수로 활성화.
 * 핸드오프 m-screens-addon-modules §9 (SAddonExternal kind='webfax') 이식.
 * JM: 단일 책임, ~120줄.
 * JM5: 외부 URL은 환경변수 화이트리스트 + https 강제 + rel="noopener noreferrer".
 * JM6: 외부 열기는 anchor 시맨틱 사용.
 */

import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MBtn from '../공통/MBtn';

const WEBFAX_URL_RAW = process.env.NEXT_PUBLIC_WEBFAX_URL ?? '';

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

const WEBFAX_URL = safeExternalUrl(WEBFAX_URL_RAW);

function isAdmin(user: ErpUser): boolean {
  return user.permissions?.mso === true || user.role === '관리자';
}

export default function 외부웹팩스({ user, onBack }: { user: ErpUser; onBack: () => void }) {
  const enabled = Boolean(WEBFAX_URL);
  const admin = isAdmin(user);

  return (
    <div className="m-screen" style={{ background: 'linear-gradient(135deg, rgba(240, 244, 255, 0.6) 0%, rgba(228, 235, 250, 0.6) 50%, rgba(245, 240, 255, 0.6) 100%)' }}>
      <MobileHeader title="웹팩스" sub="외부 시스템 연동" back={onBack} />
      <div className="m-scroll" style={{ background: 'transparent', padding: '16px 16px 24px' }}>
        <div className="macos-glass macos-squircle" style={{ padding: '32px 20px', textAlign: 'center', marginBottom: 20 }}>
          <div
            aria-hidden="true"
            className="macos-squircle"
            style={{
              width: 72,
              height: 72,
              background: 'var(--m-accent-soft)',
              color: 'var(--m-accent)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 8px 20px rgba(0, 122, 255, 0.15)',
            }}
          >
            <MIcon name="send" size={32} strokeWidth={1.4} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--z-900)' }}>웹팩스</div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--z-600)',
              fontWeight: 500,
              marginTop: 8,
              lineHeight: 1.6,
              padding: '0 8px',
            }}
          >
            발수신 팩스 관리는 외부 시스템(WebFax+)에서 처리됩니다.
            <br />
            모바일에서는 알림만 받을 수 있습니다.
          </div>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {enabled && WEBFAX_URL ? (
              <a
                href={WEBFAX_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="m-btn primary block macos-squircle-sm"
                aria-label="웹팩스 외부 시스템 새 창으로 열기"
                style={{
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 44,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <MIcon name="send" size={16} />
                외부 시스템 열기
              </a>
            ) : (
              <MBtn variant="primary" className="macos-squircle-sm" icon="send" block disabled>
                외부 시스템 열기 (미설정)
              </MBtn>
            )}
            <MBtn icon="bell" className="macos-squircle-sm" block>
              모바일 알림만 받기
            </MBtn>
          </div>
          {!enabled && (
            <div
              className="macos-glass macos-squircle-sm"
              style={{
                marginTop: 18,
                padding: '12px 14px',
                border: '1px solid rgba(255, 149, 0, 0.3)',
                background: 'rgba(255, 149, 0, 0.08)',
                fontSize: 12,
                lineHeight: 1.55,
                color: 'var(--z-700)',
                textAlign: 'left',
              }}
              role="status"
              aria-live="polite"
            >
              <div style={{ fontWeight: 800, color: 'var(--z-900)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MIcon name="info" size={14} color="#FF9500" />
                외부 시스템 URL 미설정
              </div>
              {admin ? (
                <>
                  관리자 페이지에서 <code>NEXT_PUBLIC_WEBFAX_URL</code> 환경변수를 https URL로
                  설정한 뒤 재배포해 주세요. (데스크톱에서 안내)
                </>
              ) : (
                <>관리자에게 웹팩스 외부 시스템 URL 설정을 요청해 주세요.</>
              )}
            </div>
          )}
        </div>

        <div className="m-section">
          <div className="m-section-h" style={{ padding: '0 8px', marginBottom: 10 }}>
            <div className="lbl" style={{ fontSize: 14, fontWeight: 700 }}>최근 활동</div>
          </div>
          <div className="macos-glass macos-squircle" style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ color: 'var(--z-500)', fontSize: 12 }}>
              외부 시스템 연동 후 표시됩니다.
            </div>
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
