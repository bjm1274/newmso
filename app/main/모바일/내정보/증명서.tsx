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

import { memo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import { useMyRecentCerts } from './data-hooks';
import { issueAndPrintMyCert } from './cert-issue';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';

type CertDoc = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  /** certificate_types id (certificate_issuances.cert_type 로 저장) */
  certType: string;
};

// 발급 가능 서류 카탈로그(옵션A 셀프서비스 — 본인 1건 발급).
// certType 은 lib/certificate-types.ts 의 id 와 일치시킨다.
const CERT_DOCS: CertDoc[] = [
  { id: 'c1', icon: 'fileText', title: '재직증명서', subtitle: '현재 재직 상태를 증명하는 서류', certType: '재직증명서' },
  { id: 'c2', icon: 'badge', title: '경력증명서', subtitle: '재직 기간 및 경력을 증명하는 서류', certType: '경력증명서' },
  { id: 'c3', icon: 'receipt', title: '원천징수영수증', subtitle: '연말정산용 소득 증빙 서류', certType: '원천징수영수증' },
  { id: 'c4', icon: 'list', title: '보수지급명세서', subtitle: '급여 지급 내역 증빙 서류', certType: '보수지급명세서' },
];

export type 증명서Props = {
  user: ErpUser;
  onBack: () => void;
};

function MobileCertificateBase({ user, onBack }: 증명서Props) {
  const staffId = useResolvedStaffId(user as Record<string, unknown>);
  const [reloadToken, setReloadToken] = useState(0);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const { rows: recentCerts, loading } = useMyRecentCerts(staffId, reloadToken);

  const handleIssue = async (doc: CertDoc) => {
    if (issuingId) return;
    setIssuingId(doc.id);
    try {
      const ok = await issueAndPrintMyCert(staffId, doc.certType);
      if (ok) setReloadToken((t) => t + 1);
    } finally {
      setIssuingId(null);
    }
  };
  return (
    <div className="m-screen">
      <MobileHeader title="증명서" back={onBack} />
      <div className="m-scroll">
        {/* 발급 가능 서류 */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">발급 가능 서류</div>
          </div>
          <div className="m-card flush">
            {CERT_DOCS.map((doc) => {
              const busy = issuingId === doc.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  className="msm-row"
                  aria-label={`${doc.title} 발급`}
                  disabled={Boolean(issuingId)}
                  onClick={() => void handleIssue(doc)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr auto',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border)',
                    opacity: issuingId && !busy ? 0.5 : 1,
                    cursor: issuingId ? 'default' : 'pointer' }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      color: 'var(--m-accent)',
                      display: 'grid',
                      placeItems: 'center' }}
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
                      fontWeight: 800,
                      padding: '4.5px 12px',
                      borderRadius: 999,
                      background: 'rgba(29, 78, 216, 0.05)',
                      color: 'var(--m-accent)',
                      border: '1px solid rgba(29, 78, 216, 0.1)' }}
                  >
                    {busy ? '발급 중…' : '발급'}
                  </span>
                </button>
              );
            })}
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
                  borderBottom: '1px solid var(--border)' }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    color: 'var(--m-accent)',
                    display: 'grid',
                    placeItems: 'center' }}
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
                    color: 'var(--m-success)' }}
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

const 증명서 = memo(MobileCertificateBase);
export default 증명서;
