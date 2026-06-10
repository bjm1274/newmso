'use client';

/**
 * SFormLeave — 모바일 인사관리: 연차 신청 폼
 *
 * 핸드오프 §FM5 (m-screens-forms.jsx :449~516) 1:1 이식.
 *  - 잔여 연차 hero
 *  - 휴가 종류 segment (연차/반차/경조사/병가)
 *  - 시작일 / 종료일 / 사유 / 결재선
 *  - 결재선: useApproverLine 자동 매핑 + ApproverLineSection 변경(SApprovalApproverPicker 바텀시트)
 *
 * insert: leave_requests (staff_id, leave_type, start_date, end_date, days, reason, status='대기')
 *         + approvals 상신(submitApprovalDraft) — 선택된 결재선이 실제 효력을 갖도록.
 *         (연차신청폼.tsx와 동일한 이중 기록: leave_requests는 인사 잔여 집계, approvals는 결재 흐름)
 *
 * JM3: try/catch + toast. 실패 시 상세 메시지 표시.
 * JM5: staff_id를 props 외 다른 값으로 변조 불가.
 */

import { useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import { toast } from '@/lib/toast';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import MIcon from '../공통/MIcon';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix,
} from './form-helpers';
import { useMyLeaveBalance } from './data-hooks';
import { useApproverLine } from '../결재/useApproverLine';
import ApproverLineSection from '../결재/ApproverLineSection';
import { submitApprovalDraft } from '../결재/기안상신';

export type SFormLeaveProps = {
  staffId: string | null;
  staffName?: string;
  /** 결재선 자동 매핑·상신에 필요한 로그인 사용자 컨텍스트 */
  user: ErpUser;
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
  user,
  onBack,
}: SFormLeaveProps) {
  const { data, reload } = useMyLeaveBalance(staffId);
  const fieldId = useFieldIdPrefix('form-leave');
  const company = typeof user.company === 'string' ? user.company.trim() : '';

  const today = useMemo(() => new Date(), []);
  const [kind, setKind] = useState<LeaveKind>('연차');
  const [start, setStart] = useState(today.toLocaleDateString('en-CA'));
  const [end, setEnd] = useState(today.toLocaleDateString('en-CA'));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const approver = useApproverLine(staffId, company);

  const days = useMemo(() => calcDays(start, end, kind), [start, end, kind]);
  const remainingAfter = Math.max(0, data.remaining - days);

  const canSubmit =
    Boolean(staffId) &&
    Boolean(start) &&
    Boolean(end) &&
    start <= end &&
    days > 0 &&
    approver.approverLine.length > 0;

  const handleSubmit = async () => {
    if (!staffId) {
      toast('계정 정보를 확인할 수 없습니다.', 'error');
      return;
    }
    if (!start || !end || start > end || days <= 0) {
      toast('시작일과 종료일을 확인해주세요.', 'warning');
      return;
    }
    if (approver.approverLine.length === 0) {
      toast('결재자를 한 명 이상 지정해 주세요. (결재선 "변경")', 'error');
      return;
    }
    setSubmitting(true);

    // 1) leave_requests insert — 인사 잔여 집계용 기록 (연차신청폼.tsx와 동일 컬럼)
    let leaveRequestInserted = false;
    let leaveQueued = false;
    try {
      const { queued, error } = await enqueueSupabaseMutation({
        kind: 'insert',
        table: 'leave_requests',
        payload: {
          staff_id: staffId,
          leave_type: kind,
          start_date: start,
          end_date: end,
          days,
          reason: reason || null,
          status: '대기',
        },
      });
      if (error) throw new Error(error);
      leaveRequestInserted = true;
      leaveQueued = queued;
    } catch (err) {
      console.error('[mobile-hr] leave_requests insert failed', err);
      const message = err instanceof Error ? err.message : '신청 실패';
      toast(`연차 기록 저장 실패: ${message}`, 'error');
      setSubmitting(false);
      return;
    }

    // 2) approvals 상신 — 선택된 결재선이 실제 효력을 갖도록 (연차신청폼.tsx와 동일)
    try {
      const senderName = String(user.name || '').trim() || staffName || '이름 없음';
      const leaveTypeLabel = kind === '반차' ? '반차 (0.5)' : `${kind} (1.0)`;
      const range = start === end ? start : `${start} ~ ${end}`;
      const title = `${senderName} ${kind} 신청 (${range})`;

      const { queued: apprQueued } = await submitApprovalDraft({
        user,
        staffId,
        company,
        formSlug: 'leave',
        formName: '연차/휴가',
        title,
        content: reason || '',
        approverLine: approver.approverLine,
        approverManual: approver.approverManual,
        extraMeta: {
          vType: leaveTypeLabel,
          leaveType: leaveTypeLabel,
          startDate: start,
          endDate: end,
          reason: reason || '',
          leave_request_synced: leaveRequestInserted,
        },
      });

      if (leaveQueued || apprQueued) {
        toast('오프라인 — 연차 신청이 동기화 대기 중입니다. 온라인 복귀 시 자동 전송됩니다.', 'warning');
      } else {
        toast('연차 신청이 결재선에 올라갔습니다.', 'success');
      }
      await reload();
      onBack();
    } catch (err) {
      console.error('[mobile-hr] approvals insert failed', err);
      const message = err instanceof Error ? err.message : '결재 상신 실패';
      toast(
        `결재 상신 실패: ${message}\n연차 기록은 저장되었습니다. PC에서 결재선을 지정해 재상신해 주세요.`,
        'error',
      );
      // leave_requests는 이미 저장됨 — 폼 상태 유지(사용자가 재시도/닫기 선택)
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
        </div>

        <ApproverLineSection approver={approver} staffId={staffId} company={company} />

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
