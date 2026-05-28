'use client';

/**
 * SHrWelfare — 모바일 인사관리: 복지
 *
 * 핸드오프 §5 (m-screens-hr.jsx :473~593) 1:1 이식.
 *  - 4 chip-bar (경조사 / 건강검진 / 면허·자격 / 의료기기)
 *  - 만료 임감 D-day chip 강조.
 *
 * 데이터: useWelfareBundle (congratulations_condolences / health_checkups / licenses / medical_devices).
 *
 * JM6: chip-bar 버튼은 aria-pressed 사용.
 */

import { useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import {
  useWelfareBundle,
  daysUntil,
  expiryTone,
  pickAvatarTone,
  formatMoney,
  type FamilyEventRow,
  type HealthCheckupRow,
  type LicenseRow,
  type MedicalDeviceRow,
  type ToneKind,
} from './data-hooks';

export type SHrWelfareTab = 'family' | 'health' | 'cert' | 'dev';

export type SHrWelfareProps = {
  company?: string;
  onBack: () => void;
};

export default function 복지({ company, onBack }: SHrWelfareProps) {
  const [tab, setTab] = useState<SHrWelfareTab>('family');
  const { data, loading } = useWelfareBundle(company);

  return (
    <div className="m-screen">
      <MobileHeader title="복지" sub={company ?? '복지·교육'} back={onBack} />

      <div className="m-chip-bar" role="tablist" aria-label="복지 탭">
        {(
          [
            { id: 'family', label: '경조사' },
            { id: 'health', label: '건강검진' },
            { id: 'cert', label: '면허·자격' },
            { id: 'dev', label: '의료기기 점검' },
          ] as ReadonlyArray<{ id: SHrWelfareTab; label: string }>
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={tab === opt.id ? 'on' : ''}
            onClick={() => setTab(opt.id)}
            role="tab"
            aria-selected={tab === opt.id}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="m-scroll">
        {loading ? (
          <div
            style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
          >
            불러오는 중...
          </div>
        ) : (
          <>
            {tab === 'family' && <FamilyTab rows={data.family} />}
            {tab === 'health' && <HealthTab rows={data.checkup} />}
            {tab === 'cert' && <CertTab rows={data.license} />}
            {tab === 'dev' && <DeviceTab rows={data.device} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── 경조사 ────────────────────────────────────────────────────
function FamilyTab({ rows }: { rows: FamilyEventRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
      >
        최근 경조사 내역이 없습니다.
      </div>
    );
  }
  const totalAmount = rows.reduce((a, b) => a + (b.amount ?? 0), 0);

  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div
        className="m-card"
        style={{
          padding: '14px 16px',
          marginBottom: 12,
          background: 'var(--m-accent-soft)',
          borderColor: 'transparent',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: 'var(--m-accent)',
            letterSpacing: '0.04em',
          }}
        >
          최근 경조사 지원
        </div>
        <div
          className="m-tnum"
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: 'var(--m-accent)',
            marginTop: 4,
          }}
        >
          ₩ {formatMoney(totalAmount)}
          <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 6, color: 'var(--z-600)' }}>
            · {rows.length}건
          </span>
        </div>
      </div>
      <div className="m-card flush">
        {rows.map((r) => (
          <div key={r.id} className="m-list-row">
            <MAvatar tone={pickAvatarTone(r.staff_name ?? '')}>
              {(r.staff_name ?? '?').charAt(0)}
            </MAvatar>
            <div>
              <div className="lbl">
                {r.staff_name ?? '직원'}{' '}
                <MChip tone="accent">{r.event_type ?? '경조사'}</MChip>
              </div>
              <div className="sub">
                {r.relation ?? '본인'} · {formatDate(r.event_date)}
              </div>
            </div>
            <div className="val m-tnum">
              {formatMoney(r.amount ?? 0)}
              <span className="u">원</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── 건강검진 ──────────────────────────────────────────────────
function HealthTab({ rows }: { rows: HealthCheckupRow[] }) {
  const upcoming = rows
    .filter((r) => {
      const left = daysUntil(r.checkup_date);
      return left !== null && left >= 0;
    })
    .sort((a, b) => {
      const al = daysUntil(a.checkup_date) ?? 99999;
      const bl = daysUntil(b.checkup_date) ?? 99999;
      return al - bl;
    });
  const next = upcoming[0];
  const others = upcoming.slice(1, 8);

  return (
    <div style={{ padding: '14px 16px 0' }}>
      {next && (
        <div className="m-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700 }}>
            다음 건강검진
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              marginTop: 4,
              letterSpacing: '-0.02em',
            }}
          >
            {formatDate(next.checkup_date)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
            {next.vendor ?? '검진센터 미지정'} · {next.status ?? '예정'}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <>
          <div className="m-section-h" style={{ padding: '18px 0 8px' }}>
            <div className="lbl">예정 검진</div>
          </div>
          <div className="m-card flush">
            {others.map((r) => {
              const left = daysUntil(r.checkup_date);
              const tone: ToneKind =
                left === null
                  ? ''
                  : left <= 7
                    ? 'danger'
                    : left <= 30
                      ? 'warning'
                      : 'accent';
              return (
                <div key={r.id} className="m-list-row">
                  <MAvatar tone={pickAvatarTone(r.staff_name ?? '')}>
                    {(r.staff_name ?? '?').charAt(0)}
                  </MAvatar>
                  <div>
                    <div className="lbl">{r.staff_name ?? '직원'}</div>
                    <div className="sub">{formatDate(r.checkup_date)}</div>
                  </div>
                  <MChip tone={tone}>{left === null ? '-' : `D-${left}`}</MChip>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!next && others.length === 0 && (
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            color: 'var(--z-500)',
            fontSize: 13,
          }}
        >
          예정된 건강검진이 없습니다.
        </div>
      )}
      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── 면허·자격 ────────────────────────────────────────────────
function CertTab({ rows }: { rows: LicenseRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
      >
        등록된 면허·자격이 없습니다.
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card flush">
        {rows.map((r) => {
          const left = daysUntil(r.expiry_date);
          const tone = expiryTone(left);
          const dLabel =
            left === null
              ? '정보 부족'
              : left < 0
                ? `${-left}일 지남`
                : left <= 30
                  ? '만료 임박'
                  : left <= 90
                    ? '3개월 내 만료'
                    : '정상';
          return (
            <div key={r.id} className="m-list-row">
              <div className={'ico-tile tone-' + (tone || 'success')}>
                <MIcon name="badge" size={18} />
              </div>
              <div>
                <div className="lbl">
                  {r.staff_name ?? '직원'}{' '}
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                    · {r.license_name ?? '면허'}
                  </span>
                </div>
                <div className="sub">만료일 {formatDate(r.expiry_date)}</div>
              </div>
              <MChip tone={tone}>{dLabel}</MChip>
            </div>
          );
        })}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── 의료기기 점검 ─────────────────────────────────────────────
function DeviceTab({ rows }: { rows: MedicalDeviceRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
      >
        등록된 의료기기가 없습니다.
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card flush">
        {rows.map((r) => {
          const left = daysUntil(r.next_check_date);
          const tone =
            left === null
              ? ''
              : left < 0
                ? 'danger'
                : left <= 14
                  ? 'warning'
                  : 'success';
          const dLabel =
            left === null
              ? '미정'
              : left < 0
                ? `${-left}일 지연`
                : `${left}일 후`;
          return (
            <div key={r.id} className="m-list-row">
              <div className={'ico-tile tone-' + (tone || '')}>
                <MIcon name="settings" size={18} />
              </div>
              <div>
                <div className="lbl">{r.device_name ?? '기기'}</div>
                <div className="sub">
                  {(r.cycle ?? '주기 미정')} 점검 · {formatDate(r.next_check_date)}
                </div>
              </div>
              <MChip tone={tone}>{dLabel}</MChip>
            </div>
          );
        })}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return String(dateStr).slice(0, 10);
  return `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, '0')}.${String(parsed.getDate()).padStart(2, '0')}`;
}
