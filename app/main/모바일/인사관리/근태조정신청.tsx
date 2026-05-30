'use client';

/**
 * SHrAttendAdjust — 모바일 근태 조정 신청 폼 (bottom-sheet 스타일).
 *
 * attendance_adjustments insert.
 *  - 직원이 본인 근태 보정 신청 (지각·조퇴·미체크 사유/정정 요청)
 *  - 오프라인 시 enqueueSupabaseMutation으로 큐잉
 *
 * JM: 단일 책임 (~120줄)
 * JM3: try/catch — validation 에러 vs 네트워크 에러 분리
 * JM4: payload Record<string, unknown>, any 금지
 * JM5: staff_id는 props로만 주입 (본인 데이터 보장)
 * JM6: label·button 시맨틱, aria-busy 갱신
 */

import { useState } from 'react';
import { toast } from '@/lib/toast';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import { MFormHeader, MField, MInput, MSegRow, useFieldIdPrefix } from './form-helpers';

export type AdjustKind = '지각' | '조퇴' | '미체크' | '기타';

const KIND_OPTIONS: ReadonlyArray<{ id: AdjustKind; label: string }> = [
  { id: '지각', label: '지각' },
  { id: '조퇴', label: '조퇴' },
  { id: '미체크', label: '미체크' },
  { id: '기타', label: '기타' },
];

export type SHrAttendAdjustProps = {
  staffId: string;
  targetDate: string; // 'YYYY-MM-DD'
  onBack: () => void;
};

export default function 근태조정신청({ staffId, targetDate, onBack }: SHrAttendAdjustProps) {
  const [kind, setKind] = useState<AdjustKind>('지각');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fieldId = useFieldIdPrefix('attend-adj');

  const canSubmit = reason.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast('사유를 입력해주세요.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      // 정본 테이블은 attendance_corrections (컬럼: attendance_date/original_date/correction_type/reason/status).
      // note 전용 컬럼이 없어 reason 에 합쳐 보관한다.
      const noteText = note.trim();
      const payload: Record<string, unknown> = {
        staff_id: staffId,
        attendance_date: targetDate,
        original_date: targetDate,
        correction_type: kind,
        reason: noteText ? `${reason.trim()} (${noteText})` : reason.trim(),
        status: '대기',
      };

      const { queued, error } = await enqueueSupabaseMutation({
        kind: 'insert',
        table: 'attendance_corrections',
        payload,
      });

      if (error) {
        toast(`근태 조정 신청 실패: ${error}`, 'error');
        return;
      }
      if (queued) {
        toast('오프라인 — 근태 조정 신청 대기 중', 'info');
        onBack();
        return;
      }
      toast('근태 조정 신청이 접수되었습니다.', 'success');
      onBack();
    } catch (err) {
      console.error('[mobile-hr] attendance adjust insert failed', err);
      const message = err instanceof Error ? err.message : '신청 실패';
      toast(`근태 조정 신청 실패: ${message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="m-screen">
      <MFormHeader
        onCancel={onBack}
        title="근태 조정 신청"
        sub={targetDate}
        saveLabel={submitting ? '제출 중...' : '신청'}
        onSave={() => void handleSubmit()}
        saveDisabled={!canSubmit}
      />
      <div className="m-scroll" aria-busy={submitting}>
        <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
          <MField label="조정 유형">
            <MSegRow
              value={kind}
              onPick={setKind}
              options={KIND_OPTIONS}
              ariaLabel="조정 유형"
            />
          </MField>
          <MField label="사유" required htmlFor={fieldId('reason')}>
            <MInput
              id={fieldId('reason')}
              value={reason}
              onChange={setReason}
              placeholder="예: 병원 진료로 인한 지각"
              autoFocus
            />
          </MField>
          <MField label="추가 메모 (선택)" htmlFor={fieldId('note')}>
            <textarea
              id={fieldId('note')}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="관리자에게 전달할 내용"
              style={{
                width: '100%',
                padding: '8px 0',
                fontSize: 14,
                fontFamily: 'inherit',
                resize: 'none',
                color: 'var(--z-900)',
              }}
            />
          </MField>
        </div>
        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}
