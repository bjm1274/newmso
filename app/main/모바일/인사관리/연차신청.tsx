'use client';

/**
 * SFormLeave — 모바일 인사관리: 연차 신청 폼
 *
 * 핸드오프 §FM5 (m-screens-forms.jsx :449~516) 1:1 이식.
 *  - 잔여 연차 hero
 *  - 휴가 종류 segment (연차/반차/경조사/병가)
 *  - 시작일 / 종료일 / 사유 / 결재자
 *  - 결재자는 자동 매핑(원장) — 변경은 PC 안내
 *
 * insert: leave_requests (staff_id, leave_type, start_date, end_date, reason, status='대기')
 *
 * JM3: try/catch + toast. 실패 시 상세 메시지 표시.
 * JM5: staff_id를 props 외 다른 값으로 변조 불가.
 */

import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix,
} from './form-helpers';
import { useMyLeaveBalance } from './data-hooks';

export type SFormLeaveProps = {
  staffId: string | null;
  staffName?: string;
  approverName?: string;
  onBack: () => void;
};

type LeaveKind = '연차' | '반차' | '경조사' | '병가';

const KIND_OPTIONS: ReadonlyArray<{ id: LeaveKind; label: string }> = [
  { id: '연차', label: '연차' },
  { id: '반차', label: '반차' },
  { id: '경조사', label: '경조사' },
  { id: '병가', label: '병가' },
];

export default function 연차신청({
  staffId,
  staffName,
  approverName = '원장',
  onBack,
}: SFormLeaveProps) {
  const { data, reload } = useMyLeaveBalance(staffId);
  const fieldId = useFieldIdPrefix('form-leave');

  const today = useMemo(() => new Date(), []);
  const [kind, setKind] = useState<LeaveKind>('연차');
  const [start, setStart] = useState(today.toLocaleDateString('en-CA'));
  const [end, setEnd] = useState(today.toLocaleDateString('en-CA'));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const days = useMemo(() => calcDays(start, end, kind), [start, end, kind]);
  const remainingAfter = Math.max(0, data.remaining - days);

  const canSubmit = Boolean(staffId) && start && end && start <= end && days > 0;

  const handleSubmit = async () => {
    if (!staffId) {
      toast('계정 정보를 확인할 수 없습니다.', 'error');
      return;
    }
    if (!canSubmit) {
      toast('시작일과 종료일을 확인해주세요.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('leave_requests').insert({
        staff_id: staffId,
        leave_type: kind,
        start_date: start,
        end_date: end,
        reason: reason || null,
        status: '대기',
      });
      if (error) throw error;
      toast('연차 신청이 결재 라인에 올라갔습니다.', 'success');
      await reload();
      onBack();
    } catch (err) {
      console.error('[mobile-hr] leave request insert failed', err);
      const message = err instanceof Error ? err.message : '신청 실패';
      toast(`연차 신청 실패: ${message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="m-screen">
      <MFormHeader
        onCancel={onBack}
        title="연차 신청"
        saveLabel={submitting ? '제출 중...' : '결재 올림'}
        onSave={handleSubmit}
        saveDisabled={!canSubmit || submitting}
      />
      <div className="m-scroll">
        {/* 잔여 hero */}
        <div
          style={{
            padding: '18px 16px 8px',
            background: 'var(--m-card)',
            borderBottom: '1px solid var(--m-border)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--z-500)',
              fontWeight: 800,
              letterSpacing: '0.04em',
            }}
          >
            잔여 연차
          </div>
          <div
            className="m-tnum"
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: 'var(--m-accent)',
              letterSpacing: '-0.03em',
              marginTop: 4,
            }}
          >
            {data.remaining}
            <span
              style={{
                fontSize: 14,
                color: 'var(--z-500)',
                fontWeight: 700,
                marginLeft: 3,
              }}
            >
              일
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 4 }}>
            신청 후 잔여{' '}
            <b style={{ color: 'var(--z-900)' }}>{remainingAfter}일</b>
          </div>
        </div>

        <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
          <MField label="휴가 종류">
            <MSegRow
              value={kind}
              onPick={setKind}
              options={KIND_OPTIONS}
              ariaLabel="휴가 종류"
            />
          </MField>
          <MField label="시작일" required htmlFor={fieldId('start')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <MIcon name="calendar" size={16} color="var(--m-accent)" />
              <MInput
                id={fieldId('start')}
                value={start}
                onChange={setStart}
                kind="date"
                ariaLabel="시작일"
              />
            </div>
          </MField>
          <MField
            label="종료일"
            required
            htmlFor={fieldId('end')}
            sub={`총 ${days}일${kind === '반차' ? ' (반차)' : ''}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <MIcon name="calendar" size={16} color="var(--m-accent)" />
              <MInput
                id={fieldId('end')}
                value={end}
                onChange={setEnd}
                kind="date"
                ariaLabel="종료일"
              />
            </div>
          </MField>
          <MField label="사유 (선택)" htmlFor={fieldId('reason')}>
            <textarea
              id={fieldId('reason')}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 가족 여행"
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
          <MField label="결재자">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <MAvatar tone="violet" size="sm">
                {approverName.charAt(0)}
              </MAvatar>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{approverName}</div>
                <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                  결재자 · 자동 매핑
                </div>
              </div>
              <button
                type="button"
                style={{ color: 'var(--m-accent)', fontSize: 12, fontWeight: 700 }}
                onClick={() => toast('결재자 변경은 PC에서 지원됩니다.', 'info')}
              >
                변경
              </button>
            </div>
          </MField>
        </div>

        {staffName && data.remaining < days && (
          <div style={{ padding: '14px 16px 24px' }}>
            <div
              className="m-card"
              style={{
                padding: '12px 14px',
                background: 'var(--m-warning-soft)',
                borderColor: 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <MIcon name="alertTri" size={18} color="var(--m-warning)" />
              <div
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--m-warning)',
                }}
              >
                잔여 연차 {data.remaining}일을 초과합니다. 결재자 확인이 필요합니다.
              </div>
            </div>
          </div>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// 휴가 일수 계산 — 반차는 0.5, 그 외 inclusive 일수
function calcDays(start: string, end: string, kind: LeaveKind): number {
  if (kind === '반차') return 0.5;
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  if (e < s) return 0;
  const diff = Math.floor((e.getTime() - s.getTime()) / (24 * 3600 * 1000)) + 1;
  return diff;
}
