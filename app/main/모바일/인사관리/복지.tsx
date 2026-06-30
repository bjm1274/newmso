'use client';
/* eslint-disable react-hooks/rules-of-hooks */

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

import { useState, useRef, useMemo } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MAvatar from '../공통/MAvatar';
import MBtn from '../공통/MBtn';
import type { ErpUser } from '@/types';
import { uploadMyDocument } from '../내정보/doc-submit';
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
  useStaffList,
  canMutateTeamAbnormal } from './data-hooks';
import 복지관리자 from './복지관리자';

export type SHrWelfareTab = 'family' | 'health' | 'cert' | 'dev';

export type SHrWelfareProps = {
  company?: string;
  user: ErpUser;
  onBack: () => void;
};

export default function 복지({ company, user, onBack }: SHrWelfareProps) {
  const [tab, setTab] = useState<SHrWelfareTab>('family');
  const [reloadKey, setReloadKey] = useState(0);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [selectedWelfareItem, setSelectedWelfareItem] = useState<any>(null);

  const { data, loading } = useWelfareBundle(company, reloadKey);
  const { staffs } = useStaffList({ company, includeResigned: false });

  const isHrAdmin = useMemo(() => canMutateTeamAbnormal(user), [user]);

  const handleOpenCreate = () => {
    setSelectedWelfareItem(null);
    setShowAdminModal(true);
  };

  const handleOpenEdit = (item: any) => {
    if (!isHrAdmin) return;
    // data-hooks가 가공한 컬럼명을 매핑 보완해준다
    setSelectedWelfareItem(item);
    setShowAdminModal(true);
  };

  return (
    <div className="m-screen">
      <MobileHeader
        title="복지"
        sub={company ?? '복지·교육'}
        back={onBack}
        actions={
          isHrAdmin ? (
            <button
              type="button"
              onClick={handleOpenCreate}
              style={{ fontSize: 13, fontWeight: 700, color: 'var(--m-accent)' }}
            >
              등록
            </button>
          ) : undefined
        }
      />

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
            {tab === 'family' && <FamilyTab rows={data.family} onRowClick={handleOpenEdit} />}
            {tab === 'health' && <HealthTab rows={data.checkup} onRowClick={handleOpenEdit} />}
            {tab === 'cert' && <CertTab user={user} rows={data.license} onRowClick={handleOpenEdit} />}
            {tab === 'dev' && <DeviceTab rows={data.device} onRowClick={handleOpenEdit} />}
          </>
        )}
      </div>

      {showAdminModal && (
        <복지관리자
          staffs={staffs}
          type={tab}
          initialData={selectedWelfareItem}
          onClose={() => setShowAdminModal(false)}
          onSuccess={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

// ─── 경조사 ────────────────────────────────────────────────────
function FamilyTab({ rows, onRowClick }: { rows: FamilyEventRow[]; onRowClick?: (item: any) => void }) {
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
        className="m-card macos-glass macos-squircle-sm"
        style={{
          padding: '14px 16px',
          marginBottom: 12,
          background: 'var(--m-accent-soft)',
          borderColor: 'transparent' }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: 'var(--m-accent)',
            letterSpacing: '0.04em' }}
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
            marginTop: 4 }}
        >
          ₩ {formatMoney(totalAmount)}
          <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 6, color: 'var(--z-600)' }}>
            · {rows.length}건
          </span>
        </div>
      </div>
      <div className="m-card flush macos-glass macos-squircle">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            className="m-list-row"
            onClick={() => onRowClick?.(r)}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: onRowClick ? 'pointer' : 'default' }}
          >
            <MAvatar tone={pickAvatarTone(r.staff_name ?? '')}>
              {(r.staff_name ?? '?').charAt(0)}
            </MAvatar>
            <div style={{ flex: 1 }}>
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
          </button>
        ))}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── 건강검진 ──────────────────────────────────────────────────
function HealthTab({ rows, onRowClick }: { rows: HealthCheckupRow[]; onRowClick?: (item: any) => void }) {
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
        <button
          type="button"
          className="m-card macos-glass macos-squircle-sm"
          onClick={() => onRowClick?.(next)}
          style={{ width: '100%', textAlign: 'left', padding: '16px 18px', display: 'block', cursor: onRowClick ? 'pointer' : 'default' }}
        >
          <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700 }}>
            다음 건강검진
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              marginTop: 4,
              letterSpacing: '-0.02em' }}
          >
            {formatDate(next.checkup_date)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
            {next.vendor ?? '검진센터 미지정'} · {next.status ?? '예정'}
          </div>
        </button>
      )}

      {others.length > 0 && (
        <>
          <div className="m-section-h" style={{ padding: '18px 0 8px' }}>
            <div className="lbl">예정 검진</div>
          </div>
          <div className="m-card flush macos-glass macos-squircle">
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
                <button
                  key={r.id}
                  type="button"
                  className="m-list-row"
                  onClick={() => onRowClick?.(r)}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  <MAvatar tone={pickAvatarTone(r.staff_name ?? '')}>
                    {(r.staff_name ?? '?').charAt(0)}
                  </MAvatar>
                  <div style={{ flex: 1 }}>
                    <div className="lbl">{r.staff_name ?? '직원'}</div>
                    <div className="sub">{formatDate(r.checkup_date)}</div>
                  </div>
                  <MChip tone={tone}>{left === null ? '-' : `D-${left}`}</MChip>
                </button>
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
            fontSize: 13 }}
        >
          예정된 건강검진이 없습니다.
        </div>
      )}
      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── 면허·자격 ────────────────────────────────────────────────
function CertTab({ user, rows, onRowClick }: { user: ErpUser; rows: LicenseRow[]; onRowClick?: (item: any) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const staffId = typeof user?.id === 'string' ? user.id : null;
      const staffName = typeof user?.name === 'string' ? user.name : null;
      const companyName = typeof user?.company === 'string' ? user.company : null;
      await uploadMyDocument({
        staffId,
        staffName,
        company: companyName,
        file,
        category: '면허자격' });
    } finally {
      setUploading(false);
    }
  };

  if (rows.length === 0) {
    return (
      <div style={{ padding: '14px 16px 0' }}>
        <div className="m-card macos-glass macos-squircle-sm" style={{ padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>면허·자격 갱신 증빙 서류 제출</div>
          <MBtn
            variant="primary"
            icon="upload"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            ariaLabel="갱신 증빙 서류 첨부 후 업로드"
            block
          >
            {uploading ? '업로드 중…' : '갱신 증빙 서류 첨부'}
          </MBtn>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            style={{ display: 'none' }}
            onChange={(e) => void handleFileChange(e)}
          />
        </div>
        <div
          style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
        >
          등록된 면허·자격이 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card macos-glass macos-squircle-sm" style={{ padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>면허·자격 갱신 증빙 서류 제출</div>
        <MBtn
          variant="primary"
          icon="upload"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          ariaLabel="갱신 증빙 서류 첨부 후 업로드"
          block
        >
          {uploading ? '업로드 중…' : '갱신 증빙 서류 첨부'}
        </MBtn>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => void handleFileChange(e)}
        />
      </div>
      <div className="m-card flush macos-glass macos-squircle">
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
            <button
              key={r.id}
              type="button"
              className="m-list-row"
              onClick={() => onRowClick?.(r)}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: onRowClick ? 'pointer' : 'default' }}
            >
              <div className={'ico-tile tone-' + (tone || 'success')}>
                <MIcon name="badge" size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="lbl">
                  {r.staff_name ?? '직원'}{' '}
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                    · {r.license_name ?? '면허'}
                  </span>
                </div>
                <div className="sub">만료일 {formatDate(r.expiry_date)}</div>
              </div>
              <MChip tone={tone}>{dLabel}</MChip>
            </button>
          );
        })}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── 의료기기 점검 ─────────────────────────────────────────────
function DeviceTab({ rows, onRowClick }: { rows: MedicalDeviceRow[]; onRowClick?: (item: any) => void }) {
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
      <div className="m-card flush macos-glass macos-squircle">
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
            <button
              key={r.id}
              type="button"
              className="m-list-row"
              onClick={() => onRowClick?.(r)}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: onRowClick ? 'pointer' : 'default' }}
            >
              <div className={'ico-tile tone-' + (tone || '')}>
                <MIcon name="settings" size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="lbl">{r.device_name ?? '기기'}</div>
                <div className="sub">
                  {(r.cycle ?? '주기 미정')} 점검 · {formatDate(r.next_check_date)}
                </div>
              </div>
              <MChip tone={tone}>{dLabel}</MChip>
            </button>
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
