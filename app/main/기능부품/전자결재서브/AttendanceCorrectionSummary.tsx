'use client';

import {
  formatAttendanceCorrectionDate,
  getCorrectionDate,
  REASON_BADGE,
  type ProblemDateItem,
} from './AttendanceCorrectionDateSection';

const DEFAULT_CORRECTION_STATUS = '대기';

function getCorrectionStatus(correction: any) {
  return correction?.approval_status || correction?.status || DEFAULT_CORRECTION_STATUS;
}

type AttendanceCorrectionSummaryProps = {
  selectedDates: string[];
  problemDates: ProblemDateItem[];
  correctionType: string;
  setCorrectionType: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  loading: boolean;
  toggleSelectedDate: (date: string) => void;
  handleSubmitCorrection: () => void;
};

export default function AttendanceCorrectionSummary({
  selectedDates,
  problemDates,
  correctionType,
  setCorrectionType,
  reason,
  setReason,
  loading,
  toggleSelectedDate,
  handleSubmitCorrection,
}: AttendanceCorrectionSummaryProps) {
  if (selectedDates.length === 0) return null;

  return (
    <div className="erp-panel space-y-4 border-[var(--accent)]/30 p-4">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
        <p className="text-sm font-bold text-[var(--foreground)]">
          선택한 날짜 <span className="text-[var(--accent)]">{selectedDates.length}건</span> 정정 신청
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[...selectedDates].sort().map((date) => {
          const { short, day } = formatAttendanceCorrectionDate(date);
          const problemItem = problemDates.find((problemDate) => problemDate.date === date);
          const badge = problemItem ? (REASON_BADGE[problemItem.reason] ?? REASON_BADGE['미체크']) : REASON_BADGE['미체크'];
          return (
            <button
              key={date}
              type="button"
              onClick={() => toggleSelectedDate(date)}
              className={`erp-chip border border-current/20 transition-all hover:opacity-70 ${badge.bg} ${badge.text}`}
              title="클릭하여 선택 해제"
            >
              {short}({day}) ×
            </button>
          );
        })}
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-4)]">
          정정 유형
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: '정상반영', label: '정상 반영', desc: '지각·조퇴·결근 아님' },
            { value: '지각처리', label: '지각 처리', desc: '지각 인정' },
            { value: '결근처리', label: '결근 처리', desc: '결근 인정' },
          ].map(({ value, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => setCorrectionType(value)}
              className={`flex flex-col items-start rounded-[var(--radius-md)] border px-3 py-2 text-left text-xs font-bold transition-all ${
                correctionType === value
                  ? 'border-[var(--accent)] bg-[var(--accent-selected-subtle)] text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--zinc-300)] hover:bg-[var(--surface-muted)]'
              }`}
            >
              {label}
              <span className={`text-[10px] font-medium mt-0.5 ${correctionType === value ? 'text-[var(--accent)]/70' : 'text-[var(--toss-gray-3)]'}`}>
                {desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-4)]">
          사유 <span className="text-red-500">*</span>
        </label>
        <textarea
          data-testid="attendance-correction-reason-input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="예: 외근으로 인해 출근 체크가 누락되었습니다."
          className="h-24 w-full resize-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 text-sm font-bold leading-relaxed outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
        />
      </div>

      <button
        type="button"
        data-testid="attendance-correction-submit"
        onClick={handleSubmitCorrection}
        disabled={loading || !reason.trim()}
        className="btn-premium-primary w-full !min-h-11 disabled:cursor-not-allowed"
      >
        {loading ? '신청 중...' : `${selectedDates.length}건 결재 상신`}
      </button>
    </div>
  );
}

type AttendanceCorrectionStatusListProps = {
  myCorrections: any[];
};

export function AttendanceCorrectionStatusList({ myCorrections }: AttendanceCorrectionStatusListProps) {
  return (
    <div className="space-y-3">
      {myCorrections.length === 0 ? (
        <div className="erp-panel p-6 text-center text-sm font-bold text-[var(--toss-gray-3)]">
          신청한 출결 정정 문서가 없습니다.
        </div>
      ) : (
        myCorrections.map((correction, index) => {
          const status = getCorrectionStatus(correction);
          const badge =
            status === '승인' ? 'erp-status-green' :
            status === '거절' ? 'erp-status-red' :
            'erp-status-yellow';
          return (
            <div
              key={correction.id || `${getCorrectionDate(correction)}-${index}`}
              className="erp-panel p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {getCorrectionDate(correction)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--toss-gray-3)]">{correction.reason}</p>
                </div>
                <span className={`erp-status shrink-0 ${badge}`}>
                  {status}
                </span>
              </div>
              <div className="border-t border-[var(--border)] pt-2 mt-2">
                <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">
                  정정 유형: {correction.correction_type}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
