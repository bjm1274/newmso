'use client';

// ─── 수술상담 서브 컴포넌트 ────────────────────────────────────────────────────
import type { ConsultationResult, KpiData } from './수술상담-types';
import { SECTIONS, COLOR_MAP, BADGE_MAP } from './수술상담-types';
import { buildPlainText } from './수술상담-utils';
import { toast } from '@/lib/toast';

// ─── KPI 카드 ─────────────────────────────────────────────────────────────────
type KpiTone = 'default' | 'success' | 'warning' | 'danger';

const KPI_TONE_CLASS: Record<KpiTone, string> = {
  default: 'bg-[var(--card)] border-[var(--border)]',
  success: 'bg-[var(--success-light,#f0fdf4)] border-[var(--success,#16a34a)]/20',
  warning: 'bg-[var(--warning-light,#fffbeb)] border-[var(--warning,#d97706)]/20',
  danger:  'bg-[var(--danger-light,#fff1f2)] border-[var(--danger,#e11d48)]/20',
};

const KPI_VALUE_CLASS: Record<KpiTone, string> = {
  default: 'text-[var(--foreground)]',
  success: 'text-[var(--success,#16a34a)]',
  warning: 'text-[var(--warning,#d97706)]',
  danger:  'text-[var(--danger,#e11d48)]',
};

export function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: KpiTone;
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border p-3.5 flex flex-col gap-1 ${KPI_TONE_CLASS[tone]}`}
      data-testid={`kpi-${tone}`}
    >
      <span className="text-[10px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-black tabular-nums ${KPI_VALUE_CLASS[tone]}`}>{value}</span>
      <span className="text-[10px] text-[var(--toss-gray-3)]">{sub}</span>
    </div>
  );
}

export function KpiGrid({ kpi }: { kpi: KpiData }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="kpi-grid">
      <KpiCard label="오늘 상담"    value={kpi.todayCount}          sub="건 (오늘)"        tone="default" />
      <KpiCard label="동의 완료"    value={kpi.consentDoneThisMonth} sub="건 (이번달)"      tone="success" />
      <KpiCard label="동의 미완료"  value={kpi.consentMissing}       sub="건 (전체 미확인)" tone="warning" />
      <KpiCard label="재상담 요청"  value={kpi.reconsultRequest}     sub="건 (키워드 감지)" tone="danger" />
    </div>
  );
}

// ─── 동의서 충족 패널 ─────────────────────────────────────────────────────────
export function ConsentSummaryPanel({ result }: { result: ConsultationResult }) {
  const items = result.consent_required ?? [];
  if (items.length === 0) return null;

  return (
    <div
      className="rounded-[var(--radius-lg)] border border-pink-500/20 bg-pink-500/5 p-3.5"
      data-testid="consent-summary-panel"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-sm">✍️</span>
        <span className="text-[11px] font-black text-[var(--foreground)]">
          동의서 항목 확인 ({items.length}/{items.length} 식별됨)
        </span>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-700 dark:text-pink-300 font-bold">
          AI 추출
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[11.5px]">
            <span className="text-[var(--success,#16a34a)] font-black shrink-0 mt-px">✓</span>
            <span className="text-[var(--foreground)]">{item}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-[var(--toss-gray-3)]">
        * AI가 상담 내용에서 식별한 동의 필요 항목입니다. 실제 서명 여부는 별도 확인이 필요합니다.
      </p>
    </div>
  );
}

// ─── 분석 결과 패널 ────────────────────────────────────────────────────────────
export function ResultPanel({ res, label }: { res: ConsultationResult; label: string }) {
  const copyResult = (r: ConsultationResult) => {
    navigator.clipboard.writeText(buildPlainText(r))
      .then(() => toast('클립보드에 복사되었습니다.', 'success'))
      .catch(() => toast('복사 실패', 'error'));
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-green-500 text-lg">✅</span>
          <span className="text-[13px] font-bold text-[var(--foreground)]">분석 완료</span>
          <span className="text-[11px] text-[var(--toss-gray-3)] font-medium truncate max-w-[200px]">{label}</span>
        </div>
        <button
          type="button"
          onClick={() => copyResult(res)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)] text-[11px] font-bold text-[var(--toss-gray-4)] hover:bg-[var(--accent)] hover:text-white transition-colors"
        >
          📋 전체 복사
        </button>
      </div>

      <ConsentSummaryPanel result={res} />

      <div className="grid gap-3 md:grid-cols-2">
        {SECTIONS.map((sec) => {
          const val = res[sec.key];
          const hasValue = val && (Array.isArray(val) ? val.length > 0 : String(val).trim());
          if (!hasValue) return null;
          const colorCls = COLOR_MAP[sec.color] || COLOR_MAP.slate;
          const badgeCls = BADGE_MAP[sec.color] || BADGE_MAP.slate;
          const isFullWidth = !sec.isArray && (sec.key === 'transcript_summary' || sec.key === 'surgery_plan');
          return (
            <div
              key={sec.key}
              className={`rounded-xl border p-3.5 ${colorCls} ${isFullWidth ? 'md:col-span-2' : ''}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span>{sec.icon}</span>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${badgeCls}`}>{sec.label}</span>
              </div>
              {sec.isArray ? (
                <ul className="space-y-1.5">
                  {(val as string[]).map((item, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-relaxed">
                      <span className="shrink-0 font-bold opacity-50">{i + 1}.</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap">{val as string}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
