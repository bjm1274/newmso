'use client';

/**
 * SAdminAudit — 감사·백업 (4 segment + 4 KPI 헤더)
 *
 * 감사 로그 / 이상감지 3 / 급여 이상치 / 백업·DR
 *  - KPI 4: 심각·경고·정보 + 백업 시간 (useAuditSummary 사용)
 *  - 이상감지: PC fallback FALLBACK_ANOMALIES 재사용
 *  - 급여 이상치: PC fallback FALLBACK_PAYROLL_OUTLIERS 재사용
 *  - 백업·DR: DR 카드 + 복구 이력 + "복구는 데스크톱+2FA" 안내
 *
 * JM:  본체 ~450줄
 * JM2: 데이터 훅은 진입 시 1회
 * JM3: try/catch + 폴백 (data-hooks 내부 처리)
 * JM4: AuditTab union, AnomalyCard/PayrollOutlier 재사용
 * JM5: 회사 컨텍스트 KPI 일부 (audit_logs)
 * JM6: 칩바 role=tablist
 */

import { memo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import { DesktopHint, MiniKpi } from './공용UI';
import {
  FALLBACK_ANOMALIES,
  FALLBACK_PAYROLL_OUTLIERS,
  FALLBACK_BACKUPS,
} from '../../기능부품/관리자워크센터/AuditWorkcenter/fallback';
import {
  useAuditSummary,
  useAuditLogs,
  pcToneToMobile,
  type MChipTone,
} from './data-hooks';

type AuditTab = 'log' | 'anomaly' | 'payroll' | 'backup';

const TABS: { id: AuditTab; label: string; count?: number }[] = [
  { id: 'log', label: '감사 로그' },
  { id: 'anomaly', label: '이상감지', count: 3 },
  { id: 'payroll', label: '급여 이상치', count: 2 },
  { id: 'backup', label: '백업·DR' },
];

export interface 감사백업Props {
  user: ErpUser;
  onBack: () => void;
}

export default function 감사백업({ user, onBack }: 감사백업Props) {
  const [tab, setTab] = useState<AuditTab>('log');
  const company = typeof user.company === 'string' ? user.company : '';
  const { summary } = useAuditSummary();
  return (
    <div className="m-screen">
      <MobileHeader title="감사·백업" sub={company || '감사 콘솔'} back={onBack} />
      <div className="m-chip-bar" role="tablist" aria-label="감사·백업 탭">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span className="cnt" style={{ marginLeft: 4 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {/* 항상 보이는 4 KPI 헤더 */}
      <KpiHeader
        todayLogs={summary.todayLogs}
        anomaly={summary.anomalyCount}
        payroll={summary.payrollOutlierCount}
        backupHours={summary.lastBackupHoursAgo}
      />
      <div className="m-scroll">
        {tab === 'log' && <LogTab company={company} />}
        {tab === 'anomaly' && <AnomalyTab />}
        {tab === 'payroll' && <PayrollTab />}
        {tab === 'backup' && <BackupTab />}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 4 KPI 헤더
// ─────────────────────────────────────────────────────────────

const KpiHeader = memo(function KpiHeader({
  todayLogs,
  anomaly,
  payroll,
  backupHours,
}: {
  todayLogs: number;
  anomaly: number;
  payroll: number;
  backupHours: number;
}) {
  return (
    <div
      style={{
        padding: '14px 16px 0',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gap: 6,
      }}
    >
      <MiniKpi label="오늘 로그" value={todayLogs.toLocaleString('ko-KR')} />
      <MiniKpi
        label="이상감지"
        value={String(anomaly)}
        tone={anomaly > 0 ? 'warning' : 'success'}
      />
      <MiniKpi
        label="급여 이상치"
        value={String(payroll)}
        tone={payroll > 0 ? 'danger' : 'success'}
      />
      <MiniKpi
        label="백업"
        value={String(backupHours)}
        unit="시간 전"
        tone={backupHours <= 24 ? 'success' : backupHours <= 48 ? 'warning' : 'danger'}
      />
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 감사 로그 탭
// ─────────────────────────────────────────────────────────────

const LogTab = memo(function LogTab({ company }: { company: string }) {
  const { logs, loading, source } = useAuditLogs(company || undefined, 30);
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 4px 8px',
          fontSize: 11,
          color: 'var(--z-500)',
          fontWeight: 700,
        }}
      >
        <span>최근 감사 로그</span>
        <span aria-live="polite">
          {loading ? '동기화 중…' : source === 'supabase' ? '실데이터' : '샘플 표시'}
        </span>
      </div>
      <div className="m-card flush">
        {logs.map((row) => (
          <div key={row.id} className="m-list-row">
            <MChip tone={pcToneToMobile(row.tone)}>{row.severity}</MChip>
            <div>
              <div className="lbl">{row.title}</div>
              <div className="sub">
                {row.actor}
                {row.target ? ` · ${row.target}` : ''}
                {row.at ? ` · ${row.at}` : ''}
              </div>
            </div>
            <MIcon name="chevR" size={18} color="var(--z-400)" />
          </div>
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 이상감지 탭 — PC fallback 재사용
// ─────────────────────────────────────────────────────────────

const AnomalyTab = memo(function AnomalyTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <DesktopHint>처리·차단 액션은 데스크톱에서</DesktopHint>
      <div className="m-card flush" style={{ marginTop: 12 }}>
        {FALLBACK_ANOMALIES.map((a, i) => {
          const tone: MChipTone = a.tone === 'danger' ? 'danger' : a.tone === 'warn' ? 'warning' : 'accent';
          return (
            <div key={i} className="m-list-row">
              <div className={'ico-tile tone-' + tone}>
                <MIcon name="alertTri" size={18} />
              </div>
              <div>
                <div className="lbl">{a.kind}</div>
                <div className="sub">
                  {a.who} · {a.when} · {a.reason}
                </div>
              </div>
              <MChip tone={tone}>{a.recommend}</MChip>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 급여 이상치 탭
// ─────────────────────────────────────────────────────────────

const PayrollTab = memo(function PayrollTab() {
  const passed = FALLBACK_PAYROLL_OUTLIERS.length === 0;
  return (
    <div style={{ padding: '14px 16px 0' }}>
      {passed ? (
        <div
          className="m-card"
          style={{
            padding: '14px 14px',
            marginBottom: 12,
            background: 'var(--m-success-soft)',
            borderColor: 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MIcon name="checkCircle" size={22} color="var(--m-success)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--m-success)' }}>
                급여 무결성 통과
              </div>
              <div
                style={{ fontSize: 11, color: 'var(--z-600)', fontWeight: 600, marginTop: 1 }}
              >
                이상치 0건 — 검증 16/16 항목
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="m-card"
          style={{
            padding: '14px 14px',
            marginBottom: 12,
            background: 'var(--m-warning-soft)',
            borderColor: 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MIcon name="alertTri" size={22} color="var(--m-warning)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--m-warning)' }}>
                이상치 {FALLBACK_PAYROLL_OUTLIERS.length}건 검토 필요
              </div>
              <div
                style={{ fontSize: 11, color: 'var(--z-600)', fontWeight: 600, marginTop: 1 }}
              >
                전월 대비 30%+ 차이 또는 누락 의심
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="m-card flush">
        {FALLBACK_PAYROLL_OUTLIERS.map((p, i) => {
          const tone: MChipTone = Math.abs(p.changePct) >= 40 ? 'danger' : 'warning';
          const sign = p.changePct > 0 ? '+' : '';
          return (
            <div key={i} className="m-list-row">
              <div className={'ico-tile tone-' + tone}>
                <MIcon name="won" size={18} />
              </div>
              <div>
                <div className="lbl">{p.name}</div>
                <div className="sub">{p.reason}</div>
              </div>
              <MChip tone={tone}>
                {sign}
                {p.changePct.toFixed(1)}%
              </MChip>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 백업·DR 탭
// ─────────────────────────────────────────────────────────────

const BackupTab = memo(function BackupTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div
        className="m-card"
        style={{
          padding: '16px 18px',
          background: 'linear-gradient(135deg, var(--m-accent), var(--m-accent-700))',
          borderColor: 'transparent',
          color: '#fff',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            opacity: 0.85,
            letterSpacing: '0.04em',
          }}
        >
          DR 가동률
        </div>
        <div
          className="m-tnum"
          style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 4 }}
        >
          99.97%
        </div>
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
          RPO 1시간 · RTO 4시간
        </div>
      </div>

      <div className="m-section-h" style={{ padding: '18px 0 8px' }}>
        <div className="lbl">최근 백업 (자동 5 · 수동 2)</div>
      </div>
      <div className="m-card flush">
        {FALLBACK_BACKUPS.slice(0, 5).map((b, i) => {
          const tone: MChipTone = pcToneToMobile(b.tone);
          return (
            <div key={i} className="m-list-row">
              <div className={'ico-tile tone-' + (tone || 'success')}>
                <MIcon name="download" size={18} />
              </div>
              <div>
                <div className="lbl">
                  {b.kind} · {b.size}
                </div>
                <div className="sub">
                  {b.createdAt} · {b.duration}
                </div>
              </div>
              <MChip tone={tone || 'success'}>완료</MChip>
            </div>
          );
        })}
      </div>

      <DesktopHint tone="warning">
        실제 복구·DR 전환은 데스크톱 + 2단계 인증
      </DesktopHint>
    </div>
  );
});
