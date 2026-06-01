'use client';

/**
 * 증명서 — 증명서 발급 서브스크린.
 *   - 발급 가능 서류 섹션: 4종 서류 목록
 *   - 각 행: 아이콘 + 서류명 + 설명 + '발급' 뱃지
 *   - 최근 발급 섹션: 최근 발급 기록
 * JM: 단일 책임 (증명서 발급 화면)
 * JM4: any 금지
 * JM6: button 시맨틱, aria-label
 */

import { memo } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import { useMyRecentCerts } from './data-hooks';

type CertDoc = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
};

// 발급 가능 서류 카탈로그(정적 목록 — 실제 발급은 인사팀 승인 후 처리).
const CERT_DOCS: CertDoc[] = [
  { id: 'c1', icon: 'fileText', title: '재직증명서', subtitle: '현재 재직 상태를 증명하는 서류' },
  { id: 'c2', icon: 'badge', title: '경력증명서', subtitle: '재직 기간 및 경력을 증명하는 서류' },
  { id: 'c3', icon: 'receipt', title: '근로소득 원천징수영수증', subtitle: '연말정산용 소득 증빙 서류' },
  { id: 'c4', icon: 'list', title: '갑종근로소득 지급명세서', subtitle: '근로소득 지급 내역 증빙 서류' },
];

export type 증명서Props = {
  user: ErpUser;
  onBack: () => void;
};

function 증명서Base({ user, onBack }: 증명서Props) {
  const staffId = typeof user?.id === 'string' ? user.id : null;
  const { rows: recentCerts, loading } = useMyRecentCerts(staffId);
  return (
    <div className="m-screen">
      <MobileHeader title="증명서" back={onBack} />
      <div className="m-scroll" style={{ paddingBottom: 24 }}>
        {/* 발급 가능 서류 */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">발급 가능 서류</div>
          </div>
          <div className="m-card flush">
            {CERT_DOCS.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className="msm-row"
                aria-label={`${doc.title} 발급`}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--m-border)',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'var(--m-accent-soft)',
                    color: 'var(--m-accent)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <MIcon name={doc.icon} size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.012em' }}>
                    {doc.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 500, marginTop: 2 }}>
                    {doc.subtitle}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: 999,
                    background: 'var(--m-accent)',
                    color: '#fff',
                  }}
                >
                  발급
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 최근 발급 */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">최근 발급</div>
          </div>
          <div className="m-card flush">
            {!loading && recentCerts.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--z-400)', fontSize: 13, fontWeight: 600 }}>
                최근 발급한 증명서가 없습니다.
              </div>
            )}
            {recentCerts.map((cert) => (
              <div
                key={cert.id}
                className="msm-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--m-border)',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'var(--z-100)',
                    color: 'var(--z-600)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <MIcon name="fileText" size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.012em' }}>
                    {cert.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 500, marginTop: 2 }}>
                    {cert.date}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: 999,
                    background: 'var(--m-success-soft)',
                    color: 'var(--m-success)',
                  }}
                >
                  완료
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const 증명서 = memo(증명서Base);
export default 증명서;
