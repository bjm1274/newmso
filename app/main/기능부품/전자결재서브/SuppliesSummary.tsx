'use client';

/**
 * 비품구매양식 — 요약 row + 기타 요청사항 + 사진 첨부
 *
 * - 4분할: 신청 품목 수 / 총 수량 / 재고 0 품목 / 예상 처리 소요(더미 시간).
 * - 기타 요청사항: textarea(rows=2), 최대 500자.
 * - 첨부: dashed 버튼, JPG/PNG 5MB.
 *
 * JM3: 파일 검증 실패는 inline error (콘솔 분리).
 * JM5: MIME + 크기 클라이언트 검증, textarea trim/길이 제한.
 * JM6: label 연결, aria-describedby로 도움말 연결.
 */

import { memo, useId, useState, useCallback } from 'react';

type SuppliesSummaryProps = {
  itemCount: number;
  totalQty: number;
  outOfStockCount: number;
  /** 예상 처리 소요 시간(시간). 백엔드 추정치 미정이면 더미. */
  estimatedHours?: number;
  note: string;
  onNoteChange: (next: string) => void;
  attachments: File[];
  onAttachmentsChange: (next: File[]) => void;
};

const MAX_NOTE_LENGTH = 500;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_MIME = ['image/jpeg', 'image/png'];

function pickValidFiles(files: FileList | null): { ok: File[]; error: string | null } {
  if (!files || files.length === 0) return { ok: [], error: null };
  const ok: File[] = [];
  const issues: string[] = [];
  Array.from(files).forEach((file) => {
    if (!ACCEPTED_MIME.includes(file.type)) {
      issues.push(`${file.name}: JPG/PNG만 허용`);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      issues.push(`${file.name}: 5MB 초과`);
      return;
    }
    ok.push(file);
  });
  return { ok, error: issues.length > 0 ? issues.join(' · ') : null };
}

function SuppliesSummaryImpl({
  itemCount,
  totalQty,
  outOfStockCount,
  estimatedHours = 14,
  note,
  onNoteChange,
  attachments,
  onAttachmentsChange,
}: SuppliesSummaryProps) {
  const noteId = useId();
  const noteHelpId = `${noteId}-help`;
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const { ok, error } = pickValidFiles(files);
      setFileError(error);
      if (ok.length > 0) {
        onAttachmentsChange([...attachments, ...ok]);
      }
    },
    [attachments, onAttachmentsChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onAttachmentsChange(attachments.filter((_, i) => i !== index));
    },
    [attachments, onAttachmentsChange],
  );

  const handleNote = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    // JM5: 최대 길이 + 양 끝 공백 제거는 저장 단계에서. 입력 단계는 길이만 제한.
    const next = event.target.value.slice(0, MAX_NOTE_LENGTH);
    onNoteChange(next);
  };

  return (
    <div className="space-y-3 border-t border-[var(--border)] bg-[var(--card)] px-3 py-3">
      <div
        data-testid="supplies-summary"
        className="grid grid-cols-2 gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)]/40 p-2 lg:grid-cols-4"
      >
        <SummaryCell label="신청 품목" value={itemCount} unit="개" testId="supplies-summary-items" />
        <SummaryCell label="총 수량" value={totalQty} unit="개" testId="supplies-summary-total" />
        <SummaryCell
          label="재고 0 품목"
          value={outOfStockCount}
          unit="건"
          tone={outOfStockCount > 0 ? 'danger' : 'muted'}
          testId="supplies-summary-out-of-stock"
        />
        <SummaryCell
          label="예상 처리 소요"
          value={estimatedHours}
          unit="시간"
          testId="supplies-summary-eta"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block space-y-1.5" htmlFor={noteId}>
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">
            기타 요청사항
          </span>
          <textarea
            id={noteId}
            data-testid="supplies-note"
            rows={2}
            value={note}
            onChange={handleNote}
            aria-describedby={noteHelpId}
            maxLength={MAX_NOTE_LENGTH}
            placeholder="상세한 요청사항이 있으면 적어주세요 (예: 긴급 발주 필요, 특정 그레이드 필요 등)"
            className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-semibold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
          <span id={noteHelpId} className="block text-right text-[10px] text-[var(--toss-gray-3)]">
            {note.length}/{MAX_NOTE_LENGTH}
          </span>
        </label>

        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">
            첨부 사진 · 파일
          </span>
          <label className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[11px] font-semibold text-[var(--toss-gray-4)] transition-colors hover:border-[var(--accent)]/60 hover:bg-[var(--accent-light)]/40 focus-within:border-[var(--accent)]">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[12px] leading-none">
              +
            </span>
            <span>사진을 드래그하거나 클릭하여 첨부</span>
            <span className="ml-auto text-[10px] text-[var(--toss-gray-3)]">JPG · PNG 5MB</span>
            <input
              type="file"
              accept={ACCEPTED_MIME.join(',')}
              multiple
              onChange={(event) => {
                handleFiles(event.target.files);
                // 같은 파일 재선택 허용
                event.target.value = '';
              }}
              data-testid="supplies-attach-input"
              className="sr-only"
            />
          </label>

          {fileError ? (
            <p
              role="alert"
              data-testid="supplies-attach-error"
              className="text-[10px] font-semibold text-red-600"
            >
              {fileError}
            </p>
          ) : null}

          {attachments.length > 0 ? (
            <ul className="space-y-1" data-testid="supplies-attach-list">
              {attachments.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-1 text-[10px] font-semibold text-[var(--foreground)]"
                >
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    aria-label={`${file.name} 첨부 제거`}
                    className="rounded-full px-2 text-[var(--toss-gray-4)] hover:text-red-600"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type SummaryCellProps = {
  label: string;
  value: number;
  unit: string;
  tone?: 'muted' | 'danger';
  testId: string;
};

function SummaryCell({ label, value, unit, tone = 'muted', testId }: SummaryCellProps) {
  const valueClass = tone === 'danger' ? 'text-red-600' : 'text-[var(--foreground)]';
  return (
    <div
      data-testid={testId}
      className="rounded-[var(--radius-md)] bg-[var(--card)] px-3 py-2 shadow-sm"
    >
      <div className="text-[10px] font-bold text-[var(--toss-gray-4)]">{label}</div>
      <div className={`mt-1 text-[18px] font-black tabular-nums ${valueClass}`}>
        {value}
        <span className="ml-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">{unit}</span>
      </div>
    </div>
  );
}

const SuppliesSummary = memo(SuppliesSummaryImpl);
export default SuppliesSummary;
