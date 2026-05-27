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
    <div className="m-screen">
      <MobileHeader title="주차관제" sub="외부 시스템 연동" back={onBack} />
      <div className="m-scroll">
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div
            aria-hidden="true"
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              background: 'var(--m-accent-soft)',
              color: 'var(--m-accent)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 18px',
            }}
          >
            <MIcon name="box" size={36} strokeWidth={1.4} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.025em' }}>주차관제</div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--z-500)',
              fontWeight: 600,
              marginTop: 6,
              lineHeight: 1.55,
              padding: '0 12px',
            }}
          >
            주차장 입출차·차량 인식은 외부 시스템(Hi-Park)에서 운영됩니다.
            <br />
            데스크톱에서 통합 대시보드를 사용하세요.
          </div>
          <div style={{ marginTop: 18, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {enabled && PARKING_URL ? (
              <a
                href={PARKING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="m-btn primary block"
                aria-label="주차관제 외부 시스템 새 창으로 열기"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <MIcon name="send" size={16} />
                외부 시스템 열기
              </a>
            ) : (
              <MBtn variant="primary" icon="send" block disabled>
                외부 시스템 열기 (미설정)
              </MBtn>
            )}
            <MBtn icon="bell" block>
              모바일 알림만 받기
            </MBtn>
          </div>
          {!enabled && (
            <div
              style={{
                marginTop: 14,
                padding: '12px 14px',
                background: 'var(--m-bg-soft, var(--z-100))',
                border: '1px solid var(--m-border)',
                borderRadius: 12,
                fontSize: 12,
                lineHeight: 1.55,
                color: 'var(--z-700)',
                textAlign: 'left',
              }}
              role="status"
              aria-live="polite"
            >
              <div style={{ fontWeight: 800, color: 'var(--z-900)', marginBottom: 4 }}>
                외부 시스템 URL 미설정
              </div>
              {admin ? (
                <>
                  관리자 페이지에서 <code>NEXT_PUBLIC_PARKING_URL</code> 환경변수를 https URL로
                  설정한 뒤 재배포해 주세요. (데스크톱에서 안내)
                </>
              ) : (
                <>관리자에게 주차관제 외부 시스템 URL 설정을 요청해 주세요.</>
              )}
            </div>
          )}
        </div>

        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">최근 활동</div>
          </div>
          <div className="m-card flush" style={{ margin: '0 16px' }}>
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 12 }}>
              외부 시스템 연동 후 표시됩니다.
            </div>
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
