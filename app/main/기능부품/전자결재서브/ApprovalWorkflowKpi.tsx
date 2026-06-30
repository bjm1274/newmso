'use client';

import { useMemo } from 'react';

type ApprovalRecord = Record<string, unknown>;

type ApprovalWorkflowKpiProps = {
  documents: ApprovalRecord[];
  myStaffId?: string | null;
  resolveCurrentApproverId: (item: ApprovalRecord) => string | null;
  /** 단위: 시간 (선택). 없으면 자동 계산 */
  averageHoursOverride?: number;
};

type StatTone = 'warn' | 'success' | 'danger' | 'accent';

const TONE_STYLE: Record<StatTone, { bg: string; border: string; label: string; value: string }> = {
  warn: {
    bg: 'var(--warning-light)',
    border: 'var(--warning)',
    label: 'var(--warning)',
    value: 'var(--foreground)' },
  success: {
    bg: 'var(--success-light)',
    border: 'var(--success)',
    label: 'var(--success)',
    value: 'var(--foreground)' },
  danger: {
    bg: 'var(--danger-light)',
    border: 'var(--danger)',
    label: 'var(--danger)',
    value: 'var(--foreground)' },
  accent: {
    bg: 'var(--accent-selected-subtle)',
    border: 'var(--accent)',
    label: 'var(--accent)',
    value: 'var(--foreground)' } };

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getApprovedAt(item: ApprovalRecord): Date | null {
  const candidates = [item.approved_at, item.updated_at, item.completed_at];
  for (const raw of candidates) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function calculateAverageHours(documents: ApprovalRecord[]): number {
  const intervals: number[] = [];
  for (const item of documents) {
    const status = String(item.status || '');
    if (!status.includes('승인') && !status.includes('완료')) continue;
    const created = new Date(String(item.created_at || ''));
    const finalized = getApprovedAt(item);
    if (!finalized || Number.isNaN(created.getTime())) continue;
    const diffMs = finalized.getTime() - created.getTime();
    if (diffMs <= 0) continue;
    intervals.push(diffMs / (1000 * 60 * 60));
  }
  if (intervals.length === 0) return 0;
  const sum = intervals.reduce((a, b) => a + b, 0);
  return Math.round(sum / intervals.length);
}

export default function ApprovalWorkflowKpi({
  documents,
  myStaffId,
  resolveCurrentApproverId,
  averageHoursOverride }: ApprovalWorkflowKpiProps) {
  const stats = useMemo(() => {
    const monthStart = startOfMonth();
    let myTurn = 0;
    let approvedThisMonth = 0;
    let rejected = 0;
    for (const item of documents) {
      const status = String(item.status || '').trim();
      const createdAt = new Date(String(item.created_at || ''));
      const inThisMonth = !Number.isNaN(createdAt.getTime()) && createdAt >= monthStart;

      if (status.includes('대기') && myStaffId) {
        const currentApproverId = resolveCurrentApproverId(item);
        if (currentApproverId && String(currentApproverId) === String(myStaffId)) {
          myTurn += 1;
        }
      }
      if (inThisMonth && (status.includes('승인') || status.includes('완료'))) {
        approvedThisMonth += 1;
      }
      if (status.includes('반려')) rejected += 1;
    }
    const avgHours =
      typeof averageHoursOverride === 'number' && averageHoursOverride >= 0
        ? averageHoursOverride
        : calculateAverageHours(documents);
    return { myTurn, approvedThisMonth, rejected, avgHours };
  }, [documents, myStaffId, resolveCurrentApproverId, averageHoursOverride]);

  const cards: Array<{ tone: StatTone; label: string; value: number; unit: string }> = [
    { tone: 'warn', label: '내 차례 (대기)', value: stats.myTurn, unit: '건' },
    { tone: 'success', label: '이번 달 승인', value: stats.approvedThisMonth, unit: '건' },
    { tone: 'danger', label: '반려', value: stats.rejected, unit: '건' },
    { tone: 'accent', label: '평균 결재 소요', value: stats.avgHours, unit: '시간' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {cards.map((card) => {
        const tone = TONE_STYLE[card.tone];
        return (
          <div
            key={card.label}
            className="rounded-[var(--radius-md)] border bg-[var(--card)] px-3 py-2.5"
            style={{ borderColor: 'var(--border)', boxShadow: `inset 3px 0 0 ${tone.border}` }}
          >
            <p className="text-[11px] font-bold" style={{ color: tone.label }}>
              {card.label}
            </p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="text-[20px] font-black text-[var(--foreground)]">{card.value}</span>
              <span className="text-[11px] font-bold text-[var(--muted-foreground)]">{card.unit}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
