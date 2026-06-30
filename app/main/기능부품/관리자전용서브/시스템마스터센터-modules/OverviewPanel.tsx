import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
import type {
  SystemMasterOverviewPayload,
  SystemMasterSensitiveStaff } from './types';
import { formatCurrency, formatDateTime } from './utils';

type SummaryCard = { id: string; label: string; value: number | undefined };

type OverviewPanelProps = {
  overview: SystemMasterOverviewPayload;
  summaryCards: SummaryCard[];
  showSensitiveRaw: boolean;
  setShowSensitiveRaw: (value: boolean) => void;
  sensitiveStaffColumns: Column<SystemMasterSensitiveStaff>[];
};

export function OverviewPanel({
  overview,
  summaryCards,
  showSensitiveRaw,
  setShowSensitiveRaw,
  sensitiveStaffColumns }: OverviewPanelProps) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <article key={card.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-[var(--foreground)]">{Number(card.value || 0).toLocaleString('ko-KR')}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[var(--foreground)]">최근 변경 이력</h3>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {(overview.recentAudits || []).slice(0, 8).map((log) => (
              <div key={log.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2.5 py-1 text-[10px] font-bold text-[var(--accent)]">{log.action}</span>
                  <span className="text-xs font-semibold text-[var(--foreground)]">{log.target_label}</span>
                  <span className="text-[11px] text-[var(--toss-gray-3)]">{log.actor_label || '-'}</span>
                  <span className="text-[11px] text-[var(--toss-gray-3)]">{formatDateTime(log.created_at)}</span>
                </div>
                {(log.changed_fields?.length ?? 0) > 0 && (
                  <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">
                    변경 필드: {log.changed_fields?.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h3 className="text-base font-bold text-[var(--foreground)]">최근 급여 반영</h3>
          <div className="mt-4 space-y-3">
            {(overview.recentPayrolls || []).slice(0, 8).map((record) => (
              <div key={record.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--page-bg)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">{record.staff_name} #{record.employee_no || '-'}</p>
                    <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">{record.year_month} · {record.company || '-'} · {record.department || '-'}</p>
                  </div>
                  <p className="text-sm font-black text-[var(--accent)]">{formatCurrency(record.net_pay)}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">직원 민감정보 현황</h3>
          </div>
          <label className="inline-flex items-center gap-2 text-[11px] font-bold text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={showSensitiveRaw}
              onChange={(event) => setShowSensitiveRaw(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)]"
            />
            민감정보 원문 보기
          </label>
        </div>
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)]">
          <ResponsiveTable<SystemMasterSensitiveStaff>
            columns={sensitiveStaffColumns}
            rows={overview.sensitiveStaffs || []}
            keyField="id"
            emptyMessage="민감정보 대상 직원이 없습니다."
          />
        </div>
      </section>
    </>
  );
}
