'use client';

/**
 * SAdminCompany — 회사 관리 (7 segment, read-only)
 *
 * 기본정보 / 근무형태 / 법인카드 / 계약 템플릿 / 휴가·공휴일 / 급여기준 / 문서 보관
 *  - 데이터: PC CompanyWorkcenter/fallback-data 재사용 (정적 fallback)
 *  - 모바일은 조회만; 편집은 데스크톱
 *
 * JM: 본체 400줄 이내
 * JM4: CompanyTab union (PC types.ts 재사용)
 * JM5: 본인 회사 컨텍스트 (user.company)
 * JM6: 칩바 role=tablist
 */

import { memo, useState } from 'react';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MListRow from '../공통/MListRow';
import { DesktopHint } from './공용UI';
import {
  FALLBACK_COMPANY,
  FALLBACK_SHIFTS,
  FALLBACK_CARDS,
  FALLBACK_TEMPLATES,
  FALLBACK_HOLIDAYS,
  FALLBACK_LEAVE_RULES,
  FALLBACK_PAY_RULES,
  FALLBACK_DOCS,
} from '../../기능부품/관리자워크센터/CompanyWorkcenter/fallback-data';
import type {
  CompanyTabId,
  CorpCardRow,
} from '../../기능부품/관리자워크센터/CompanyWorkcenter/types';

const TABS: { id: CompanyTabId; label: string }[] = [
  { id: 'info', label: '기본정보' },
  { id: 'shift', label: '근무형태' },
  { id: 'card', label: '법인카드' },
  { id: 'ctpl', label: '계약 템플릿' },
  { id: 'hol', label: '휴가/공휴일' },
  { id: 'pay', label: '급여기준' },
  { id: 'docs', label: '문서 보관' },
];

export interface 회사관리Props {
  user: ErpUser;
  onBack: () => void;
}

export default function 회사관리({ user, onBack }: 회사관리Props) {
  const [tab, setTab] = useState<CompanyTabId>('info');
  const company = typeof user.company === 'string' ? user.company : '';
  return (
    <div className="m-screen">
      <MobileHeader title="회사 관리" sub={company || '회사 정보'} back={onBack} />
      <div className="m-chip-bar" role="tablist" aria-label="회사 관리 탭">
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
          </button>
        ))}
      </div>
      <DesktopHint>회사 정보 편집은 데스크톱에서 — 모바일은 조회만</DesktopHint>
      <div className="m-scroll">
        {tab === 'info' && <InfoTab company={company} />}
        {tab === 'shift' && <ShiftTab />}
        {tab === 'card' && <CardTab />}
        {tab === 'ctpl' && <CtplTab />}
        {tab === 'hol' && <HolidayTab />}
        {tab === 'pay' && <PayTab />}
        {tab === 'docs' && <DocsTab />}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 기본정보
// ─────────────────────────────────────────────────────────────

const InfoTab = memo(function InfoTab({ company }: { company: string }) {
  const rows: { label: string; value: string }[] = [
    { label: '회사명', value: company || '박철홍정형외과의원' },
    { label: '사업자번호', value: FALLBACK_COMPANY.bizNo },
    { label: '대표자', value: FALLBACK_COMPANY.ceo },
    { label: '법인 구분', value: FALLBACK_COMPANY.corpType },
    { label: '주소', value: FALLBACK_COMPANY.address },
    { label: '대표 연락처', value: FALLBACK_COMPANY.phone },
    { label: 'FAX', value: FALLBACK_COMPANY.fax },
    { label: '요양기관코드', value: FALLBACK_COMPANY.hospitalCode },
  ];
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card flush">
        {rows.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '108px 1fr',
              padding: '12px 16px',
              borderBottom: i < rows.length - 1 ? '1px solid var(--m-border)' : 'none',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
              {r.label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--z-900)' }}>
              {r.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 근무형태
// ─────────────────────────────────────────────────────────────

const ShiftTab = memo(function ShiftTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card flush">
        {FALLBACK_SHIFTS.map((s) => (
          <MListRow
            key={s.name}
            icon="clock"
            iconTone={s.active ? 'accent' : ''}
            label={s.name}
            sub={`${s.start} – ${s.end} · 휴게 ${s.breakMin}`}
            rightSlot={
              <MChip tone={s.active ? 'success' : ''}>
                {s.active ? '활성' : '비활성'}
              </MChip>
            }
          />
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 법인카드
// ─────────────────────────────────────────────────────────────

function cardTone(card: CorpCardRow): '' | 'success' | 'warning' {
  if (card.status === '한도 임박' || card.pct >= 90) return 'warning';
  if (card.status === '정상') return 'success';
  return '';
}

const CardTab = memo(function CardTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card flush">
        {FALLBACK_CARDS.map((c) => {
          const tone = cardTone(c);
          return (
            <div key={c.card} className="m-list-row">
              <div className={'ico-tile tone-' + tone}>
                <MIcon name="won" size={18} />
              </div>
              <div>
                <div className="lbl">{c.card}</div>
                <div className="sub">
                  {c.user} · 한도 {c.limitM.toFixed(1)}M
                </div>
              </div>
              <div
                className="val m-tnum"
                style={{ color: tone === 'warning' ? 'var(--m-warning)' : 'var(--z-900)' }}
              >
                {c.usedM.toFixed(1)}M
                <span className="u">/ {c.pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 계약 템플릿
// ─────────────────────────────────────────────────────────────

const CtplTab = memo(function CtplTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card flush">
        {FALLBACK_TEMPLATES.map((t, i) => (
          <MListRow
            key={t.name}
            icon="fileText"
            iconTone={i === 0 ? 'accent' : ''}
            label={t.name}
            sub={`${t.version} · 최종 ${t.lastDate}`}
            val={t.used}
            valUnit="회"
          />
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 휴가·공휴일
// ─────────────────────────────────────────────────────────────

const HolidayTab = memo(function HolidayTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card flush">
        {FALLBACK_HOLIDAYS.map((h) => {
          const tone =
            h.kind === '법정' ? 'danger' : h.kind === '회사' ? 'accent' : 'success';
          return (
            <MListRow
              key={h.date + h.name}
              icon="calendar"
              iconTone={tone}
              label={h.name}
              sub={h.date}
              rightSlot={<MChip tone={tone}>{h.kind}</MChip>}
            />
          );
        })}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 급여기준
// ─────────────────────────────────────────────────────────────

const PayTab = memo(function PayTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card flush">
        {FALLBACK_PAY_RULES.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '128px 1fr',
              padding: '12px 16px',
              borderBottom: i < FALLBACK_PAY_RULES.length - 1 ? '1px solid var(--m-border)' : 'none',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700 }}>
              {r.label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--z-900)' }}>
              {r.value}
            </div>
          </div>
        ))}
      </div>
      <div className="m-section-h" style={{ padding: '18px 0 8px' }}>
        <div className="lbl">연차 규정</div>
      </div>
      <div className="m-card flush">
        {FALLBACK_LEAVE_RULES.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '128px 1fr',
              padding: '12px 16px',
              borderBottom: i < FALLBACK_LEAVE_RULES.length - 1 ? '1px solid var(--m-border)' : 'none',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700 }}>
              {r.label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--z-900)' }}>
              {r.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 문서 보관
// ─────────────────────────────────────────────────────────────

const DocsTab = memo(function DocsTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card" style={{ padding: '14px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
          총 보관 문서
        </div>
        <div
          className="m-tnum"
          style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginTop: 4 }}
        >
          {FALLBACK_DOCS.length}
          <span style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700, marginLeft: 6 }}>
            건 등록
          </span>
        </div>
      </div>
      <div className="m-card flush">
        {FALLBACK_DOCS.map((d) => {
          const tone =
            d.access === '경영진' ? 'danger' : d.access === '관리자' ? 'warning' : 'success';
          return (
            <MListRow
              key={d.name}
              icon="fileText"
              iconTone={tone}
              label={d.name}
              sub={`${d.category} · ${d.date} · ${d.size}`}
              rightSlot={<MChip tone={tone}>{d.access}</MChip>}
            />
          );
        })}
      </div>
    </div>
  );
});
