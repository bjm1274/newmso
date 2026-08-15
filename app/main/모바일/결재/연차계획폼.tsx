'use client';

/**
 * SApprovalLeavePlanForm — 연차계획서 / 연차촉진통보서 (모바일 인라인).
 *
 * 잔여 연차(useMyLeaveBalance)를 기준으로, 달력에서 남은 연차 일수만큼만 날짜를 선택.
 * 선택 날짜를 기준으로 기안 상신. annual_plan / leave_promotion_notice 공용.
 *
 * 데이터: @/lib/db = D1 shim. JM: 단일 책임, JM3(try/catch+toast), JM4(any 금지)
 */

import { useCallback, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import type { ErpUser } from '@/types';
import MCard from '../공통/MCard';
import { MFormHeader, MField } from '../인사관리/form-helpers';
import { useMyLeaveBalance } from '../인사관리/data-hooks';
import { useApproverLine } from './useApproverLine';
import ApproverLineSection from './ApproverLineSection';
import MultiDateCalendar from './달력선택';
import { submitApprovalDraft } from './기안상신';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';

export default function SApprovalLeavePlanForm({
  user,
  formSlug,
  formName,
  onCancel,
  onSubmitted }: {
  user: ErpUser;
  formSlug: string;
  formName: string;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const staffId = useResolvedStaffId(user as Record<string, unknown>);
  const company = typeof user.company === 'string' ? user.company.trim() : '';

  const leaveBalance = useMyLeaveBalance(staffId);
  const balLoading = leaveBalance.loading;
  const remaining = leaveBalance.data?.remaining ?? 0;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const approver = useApproverLine(staffId, company);

  const toggle = useCallback(
    (date: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(date)) {
          next.delete(date);
        } else {
          if (next.size >= remaining) {
            toast(`남은 연차(${remaining}일)를 초과할 수 없습니다.`, 'warning');
            return prev;
          }
          next.add(date);
        }
        return next;
      });
    },
    [remaining],
  );

  const sortedDates = useMemo(() => Array.from(selected).sort(), [selected]);
  const canSubmit =
    Boolean(staffId) && sortedDates.length > 0 && approver.approverLine.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!staffId) return;
    if (sortedDates.length === 0) {
      toast('연차 사용 예정일을 선택해 주세요.', 'warning');
      return;
    }
    if (sortedDates.length > remaining) {
      toast(`남은 연차(${remaining}일)를 초과했습니다.`, 'error');
      return;
    }
    if (approver.approverLine.length === 0) {
      toast('결재자를 한 명 이상 지정해 주세요. (상단 "변경")', 'error');
      return;
    }
    setSubmitting(true);
    const title = `${formName} (${sortedDates.length}일)`;
    const content = [
      `사용 예정 ${sortedDates.length}일 / 남은 연차 ${remaining}일`,
      ...sortedDates.map((d) => `· ${d}`),
      reason.trim() ? `\n사유: ${reason.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const { queued } = await submitApprovalDraft({
        user,
        staffId,
        company,
        formSlug,
        formName,
        title,
        content,
        approverLine: approver.approverLine,
        approverManual: approver.approverManual,
        extraMeta: {
          plan_dates: sortedDates,
          plan_days: sortedDates.length,
          leave_remaining_at_draft: remaining,
          reason: reason.trim() || null } });
      toast(
        queued ? '오프라인 — 기안이 동기화 대기 중입니다.' : `${formName}이(가) 결재선에 올라갔습니다.`,
        queued ? 'warning' : 'success',
      );
      onSubmitted();
    } catch (err) {
      console.error('[mobile-approval] leave-plan submit failed', err);
      toast(`결재 상신 실패: ${err instanceof Error ? err.message : '오류'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [staffId, sortedDates, remaining, reason, approver, user, company, formSlug, formName, onSubmitted]);

  return (
    <div className="m-screen" style={{ background: 'transparent' }}>
      <MFormHeader
        onCancel={onCancel}
        title={formName}
        sub="잔여 연차 기준 날짜 선택"
        saveLabel={submitting ? '상신 중...' : '상신'}
        onSave={handleSubmit}
        saveDisabled={!canSubmit || submitting}
      />
      <div className="m-scroll" style={{ background: 'transparent' }}>
        {/* 잔여 연차 요약 배너 */}
        <div
          className="macos-glass macos-squircle"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            margin: '16px 16px 0' }}
        >
          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--z-700)' }}>
            {balLoading ? '잔여 연차 확인 중...' : `남은 연차 ${remaining}일`}
          </div>
          <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--m-accent)' }}>
            선택 {sortedDates.length} / {remaining}일
          </div>
        </div>

        {/* 달력 */}
        <div className="m-section" style={{ background: 'transparent' }}>
          <div className="m-section-h" style={{ background: 'transparent', padding: '8px 16px 4px' }}>
            <div className="lbl" style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-700)' }}>사용 예정일 선택</div>
          </div>
          <MCard
            className="macos-glass macos-squircle"
            style={{
              padding: '12px 12px',
              margin: '0 16px' }}
          >
            <MultiDateCalendar selected={selected} onToggle={toggle} max={remaining} months={3} />
          </MCard>
        </div>

        {/* 사유 */}
        <div className="m-section" style={{ background: 'transparent' }}>
          <MCard
            className="macos-glass macos-squircle"
            style={{
              overflow: 'hidden',
              margin: '0 16px',
              padding: 0 }}
          >
            <MField label="사유" htmlFor="leaveplan-reason" sub="결재자에게 전달됩니다.">
              <textarea
                id="leaveplan-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 하계 휴가 계획 / 가족 일정 등"
                style={{
                  width: '100%',
                  padding: '8px 0',
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  resize: 'none',
                  color: 'var(--z-900)',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none' }}
              />
            </MField>
          </MCard>
        </div>

        <ApproverLineSection approver={approver} staffId={staffId} company={company} />

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}
