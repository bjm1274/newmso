'use client';

/**
 * SPayroll — 모바일 인사관리: 본인 급여명세서
 *
 * 핸드오프 §9 (m-screens-2.jsx :203~288) 1:1 이식.
 *   - 상단 월 navigator (prev / 지급일 / next)
 *   - hero: 실수령액 (지급 - 공제)
 *   - 지급 항목 / 공제 항목 리스트
 *   - sticky 푸터: PDF / 공유
 *
 * 데이터: usePayrollSlips (발송분만, payroll-records.ts 동일 기준).
 *
 * JM2: 슬립 인덱스만 state로 잡고 fetch는 1회.
 * JM3: 슬립 없으면 안내 화면 + 토스트로 에러 노출은 hook 내부.
 * JM5: 본인 외 staff_id 접근 차단 (props.staffId 강제).
 */

import { useEffect, useMemo, useState } from 'react';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MBtn from '../공통/MBtn';
import { toast } from '@/lib/toast';
import { usePayrollSlips, formatMoney, type PayrollSlipRow } from './data-hooks';

export type SPayrollProps = {
  staffId: string | null;
  company?: string;
  onBack: () => void;
};

export default function 급여명세서({ staffId, company, onBack }: SPayrollProps) {
  const { slips, loading } = usePayrollSlips(staffId);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= slips.length && slips.length > 0) setIndex(0);
  }, [slips.length, index]);

  const slip = slips[index] ?? null;
  const monthLabel = useMemo(() => formatMonth(slip?.year_month), [slip]);

  const totalPay = slip ? slip.total_taxable + slip.total_taxfree : 0;
  const totalDed = slip ? slip.total_deduction : 0;
  const netPay = slip ? slip.net_pay : 0;

  return (
    <div className="m-screen">
      <MobileHeader
        title="급여명세서"
        sub={`${company ?? ''}${company ? ' · ' : ''}${monthLabel}`}
        back={onBack}
        actions={
          <button
            type="button"
            aria-label="다운로드"
            onClick={() => toast('다운로드는 PC에서 지원됩니다.', 'info')}
          >
            <MIcon name="download" size={20} />
          </button>
        }
      />
      <div className="m-scroll">
        {loading ? (
          <div
            style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
          >
            불러오는 중...
          </div>
        ) : slips.length === 0 ? (
          <div
            style={{ padding: 32, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}
          >
            발송된 급여명세서가 없습니다.
          </div>
        ) : (
          <>
            <MonthNavigator
              count={slips.length}
              index={index}
              onPrev={() => setIndex((i) => Math.min(slips.length - 1, i + 1))}
              onNext={() => setIndex((i) => Math.max(0, i - 1))}
              yearMonth={slip?.year_month ?? ''}
            />

            <HeroSection totalPay={totalPay} totalDed={totalDed} netPay={netPay} />

            <PaySection slip={slip} totalPay={totalPay} />
            <DeductSection slip={slip} totalDed={totalDed} />

            <div style={{ height: 24 }} />
          </>
        )}
      </div>
      <div className="m-sticky-foot">
        <MBtn
          block
          icon="download"
          onClick={() => toast('PDF 다운로드는 PC에서 지원됩니다.', 'info')}
        >
          PDF 다운로드
        </MBtn>
        <MBtn block icon="share" variant="primary" onClick={() => handleShare(slip)}>
          공유
        </MBtn>
      </div>
    </div>
  );
}

function MonthNavigator({
  count,
  index,
  yearMonth,
  onPrev,
  onNext,
}: {
  count: number;
  index: number;
  yearMonth: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div style={{ padding: '12px 16px 0' }}>
      <div
        className="m-card"
        style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <button
          type="button"
          onClick={onPrev}
          aria-label="이전 달"
          disabled={index >= count - 1}
          style={{
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            color: index >= count - 1 ? 'var(--z-300)' : 'var(--z-600)',
          }}
        >
          <MIcon name="chevL" size={18} />
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
            지급분
          </div>
          <div
            className="m-tnum"
            style={{
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              marginTop: 1,
            }}
          >
            {formatMonth(yearMonth)}
          </div>
        </div>
        <button
          type="button"
          onClick={onNext}
          aria-label="다음 달"
          disabled={index <= 0}
          style={{
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            color: index <= 0 ? 'var(--z-300)' : 'var(--z-600)',
          }}
        >
          <MIcon name="chevR" size={18} />
        </button>
      </div>
    </div>
  );
}

function HeroSection({
  totalPay,
  totalDed,
  netPay,
}: {
  totalPay: number;
  totalDed: number;
  netPay: number;
}) {
  return (
    <div style={{ padding: '16px 16px 0', textAlign: 'center' }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--z-500)',
          fontWeight: 800,
          letterSpacing: '0.04em',
        }}
      >
        실수령액
      </div>
      <div
        className="m-tnum"
        style={{
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: '-0.035em',
          color: 'var(--m-accent)',
          marginTop: 4,
        }}
      >
        ₩ {formatMoney(netPay)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, marginTop: 4 }}>
        지급 ₩ {formatMoney(totalPay)} − 공제 ₩ {formatMoney(totalDed)}
      </div>
    </div>
  );
}

type AmountRow = { label: string; value: number; meta?: string };

function buildPayRows(slip: PayrollSlipRow): AmountRow[] {
  const rows: AmountRow[] = [
    { label: '기본급', value: slip.base_salary },
    { label: '연장근로수당', value: slip.overtime_pay },
    { label: '식대', value: slip.meal_allowance, meta: '비과세' },
    { label: '야간당직수당', value: slip.night_duty_allowance },
    { label: '차량유지비', value: slip.vehicle_allowance },
    { label: '보육수당', value: slip.childcare_allowance, meta: '비과세' },
    { label: '연구수당', value: slip.research_allowance },
    { label: '기타 비과세', value: slip.other_taxfree, meta: '비과세' },
    { label: '추가수당', value: slip.extra_allowance },
    { label: '상여금', value: slip.bonus },
  ];
  return rows.filter((r) => r.value > 0);
}

function buildDeductRows(slip: PayrollSlipRow): AmountRow[] {
  const rows: AmountRow[] = [
    { label: '국민연금', value: slip.national_pension },
    {
      label: '건강보험',
      value: slip.health_insurance + slip.long_term_care,
      meta: '장기요양 포함',
    },
    { label: '고용보험', value: slip.employment_insurance },
    { label: '소득세', value: slip.income_tax },
    { label: '주민세', value: slip.local_tax },
  ];
  return rows.filter((r) => r.value > 0);
}

function PaySection({ slip, totalPay }: { slip: PayrollSlipRow | null; totalPay: number }) {
  if (!slip) return null;
  const rows = buildPayRows(slip);
  return (
    <div className="m-section">
      <div className="m-section-h">
        <div className="lbl">지급 항목</div>
      </div>
      <div className="m-card flush">
        {rows.map((r) => (
          <div
            key={r.label}
            className="m-list-row"
            style={{ gridTemplateColumns: '1fr auto', padding: '13px 16px' }}
          >
            <div>
              <div className="lbl">{r.label}</div>
              {r.meta && <div className="sub">{r.meta}</div>}
            </div>
            <div className="val m-tnum">
              {formatMoney(r.value)}
              <span className="u">원</span>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '10px 16px 0',
          fontSize: 13,
          fontWeight: 800,
          color: 'var(--z-700)',
        }}
      >
        소계{' '}
        <span className="m-tnum" style={{ marginLeft: 6, color: 'var(--z-900)' }}>
          {formatMoney(totalPay)}원
        </span>
      </div>
    </div>
  );
}

function DeductSection({
  slip,
  totalDed,
}: {
  slip: PayrollSlipRow | null;
  totalDed: number;
}) {
  if (!slip) return null;
  const rows = buildDeductRows(slip);
  return (
    <div className="m-section">
      <div className="m-section-h">
        <div className="lbl">공제 항목</div>
      </div>
      <div className="m-card flush">
        {rows.map((r) => (
          <div
            key={r.label}
            className="m-list-row"
            style={{ gridTemplateColumns: '1fr auto', padding: '13px 16px' }}
          >
            <div>
              <div className="lbl">{r.label}</div>
              {r.meta && <div className="sub">{r.meta}</div>}
            </div>
            <div className="val m-tnum" style={{ color: 'var(--m-danger)' }}>
              −{formatMoney(r.value)}
              <span className="u">원</span>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '10px 16px 0',
          fontSize: 13,
          fontWeight: 800,
          color: 'var(--z-700)',
        }}
      >
        공제 합계{' '}
        <span className="m-tnum" style={{ marginLeft: 6, color: 'var(--m-danger)' }}>
          {formatMoney(totalDed)}원
        </span>
      </div>
    </div>
  );
}

function formatMonth(yearMonth: string | undefined | null): string {
  if (!yearMonth) return '-';
  const [y, m] = String(yearMonth).split('-');
  if (!y || !m) return String(yearMonth);
  return `${y}년 ${Number(m)}월`;
}

async function handleShare(slip: PayrollSlipRow | null): Promise<void> {
  if (!slip) {
    toast('공유할 명세서가 없습니다.', 'warning');
    return;
  }
  try {
    const text = `[${formatMonth(slip.year_month)} 급여명세서] 실수령액 ₩ ${formatMoney(slip.net_pay)}`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: '급여명세서', text });
    } else {
      await navigator.clipboard.writeText(text);
      toast('클립보드에 복사했습니다.', 'success');
    }
  } catch (err) {
    console.error('[mobile-hr] share failed', err);
    toast('공유에 실패했습니다.', 'error');
  }
}
