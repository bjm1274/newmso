'use client';

/**
 * Step3Approval.tsx — 퇴원심사 스텝 3: 결재
 * mockup: step-3
 * JM3: 체크리스트 미완료 시 결재 차단, aria-live 에러
 * JM6: label, aria-describedby
 */

import type { Approver, DischargeReview } from '../dummy-data';
import { APPROVER_STATUS_LABELS } from '../dummy-data';

interface Step3Props {
  review: DischargeReview;
  checkedCount: number;
  totalItems: number;
  finalOpinion: string;
  onOpinionChange: (v: string) => void;
  submitError: string;
}

export default function Step3Approval({
  review,
  checkedCount,
  totalItems,
  finalOpinion,
  onOpinionChange,
  submitError,
}: Step3Props) {
  const allChecked = checkedCount === totalItems;

  return (
    <div className="space-y-4">
      {/* 결재 요약 */}
      <div className="app-card p-5">
        <h3 className="section-title mb-4">
          <span aria-hidden="true">📝</span> 결재 요약
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <SummaryField label="환자명" value={`${review.patientName} (${review.age}세, ${review.sex})`} />
          <SummaryField label="퇴원 예정일" value={review.dischargeDate} />
          <SummaryField
            label="체크리스트"
            value={`${checkedCount} / ${totalItems} 완료`}
            valueClass={allChecked ? 'text-green-600' : 'text-amber-600'}
          />
          <SummaryField
            label="심사 상태"
            value={review.status === 'done' ? '완료' : '진행 중'}
          />
        </div>

        {/* 최종 의견 */}
        <div className="mt-4 flex flex-col gap-1">
          <label
            htmlFor="final-opinion"
            className="text-xs font-semibold text-[var(--toss-gray-3)]"
          >
            최종 의견
          </label>
          <textarea
            id="final-opinion"
            className="form-textarea w-full"
            value={finalOpinion}
            onChange={(e) => onOpinionChange(e.target.value)}
            placeholder="결재자 의견을 입력하세요 (선택 사항)"
            rows={3}
          />
        </div>
      </div>

      {/* 결재선 */}
      <div className="app-card p-5">
        <h3 className="section-title mb-4">
          <span aria-hidden="true">✍️</span> 결재선
        </h3>
        <div className="flex gap-3">
          {review.approvers.map((approver, idx) => (
            <ApproverCard key={idx} approver={approver} />
          ))}
        </div>
      </div>

      {/* 미완료 에러 */}
      {submitError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-[var(--radius-md)] bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {submitError}
        </div>
      )}

      {/* 체크리스트 미완료 안내 */}
      {!allChecked && !submitError && (
        <p
          aria-live="polite"
          className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700"
        >
          체크리스트 미완료 항목이 있습니다. 모든 항목을 확인 후 제출하세요.
          ({totalItems - checkedCount}개 남음)
        </p>
      )}
    </div>
  );
}

// ── 요약 필드 ─────────────────────────────────────────────────────────────────

function SummaryField({
  label,
  value,
  valueClass = '',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-[var(--toss-gray-3)]">{label}</p>
      <p className={`text-sm font-medium text-[var(--foreground)] ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

// ── 결재자 카드 ───────────────────────────────────────────────────────────────

const APPROVER_BADGE_CLASS: Record<string, string> = {
  pending: 'badge-blue',
  signed: 'badge-green',
  rejected: 'badge-red',
  unreached: 'badge-gray',
};

function ApproverCard({ approver }: { approver: Approver }) {
  const badgeClass = APPROVER_BADGE_CLASS[approver.status] ?? 'badge-gray';
  const statusLabel = APPROVER_STATUS_LABELS[approver.status];

  return (
    <article className="flex flex-1 flex-col items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-3 text-center">
      <p className="text-xs font-semibold text-[var(--toss-gray-3)]">
        {approver.role}
      </p>
      <p className="text-sm font-semibold text-[var(--foreground)]">
        {approver.name}
      </p>
      <span className={`badge ${badgeClass}`} aria-label={`결재 상태: ${statusLabel}`}>
        {statusLabel}
      </span>
    </article>
  );
}
