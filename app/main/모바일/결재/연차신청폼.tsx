'use client';

/**
 * SApprovalLeaveForm — 모바일 결재 신규 기안: 연차/휴가 인라인 폼.
 *
 * 14 양식 중 '연차/휴가'만 모바일에서 인라인 작성 가능.
 *   - 시작일 / 종료일 / 종일·반차 segment / 사유
 *   - 결재선 미리보기 (자동 매핑: APPROVER_POSITIONS 기준 본인 회사 상위자 1~3명)
 *   - submit 시 leave_requests insert + approvals insert(트랜잭션)
 *
 * JM(파일당 500줄, 단일 책임), JM2(staff fetch 1회 + useMemo), JM3(try/catch + toast 분리),
 * JM4(any 금지, LeaveKind 유니온), JM5(staff_id 변조 불가 + RLS 의존),
 * JM6(label·input 연결, segment aria-current)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { enqueueD1Mutation } from '@/lib/offline-queue-d1';
import type { ErpUser, StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import MCard from '../공통/MCard';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix } from '../인사관리/form-helpers';
import SApprovalApproverPicker from './결재선피커';
import SApprovalCcPicker, { type CcPick } from './참조피커';
import AttachmentPicker from './AttachmentPicker';
import { useApprovalFormBase } from './useApprovalFormBase';

type LeaveKind = '연차' | '반차';

const KIND_OPTIONS: ReadonlyArray<{ id: LeaveKind; label: string }> = [
  { id: '연차', label: '종일 (1.0)' },
  { id: '반차', label: '반차 (0.5)' },
];

export type SApprovalLeaveFormProps = {
  user: ErpUser;
  onCancel: () => void;
  onSubmitted: () => void;
};

export default function SApprovalLeaveForm({ user, onCancel, onSubmitted }: SApprovalLeaveFormProps) {
  const staffId = typeof user.id === 'string' && user.id.trim() !== '' ? user.id : null;
  const company = typeof user.company === 'string' ? user.company.trim() : '';
  const fieldId = useFieldIdPrefix('appr-leave');

  const today = useMemo(() => getKoreanTodayString(), []);
  const [kind, setKind] = useState<LeaveKind>('연차');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState('');
  const [delegateId, setDelegateId] = useState('');
  // 참조(CC) 수동 추가 — 자동 CC(회사 활성 직원 전체)에 더해 명시적으로 지정. 선택 사항.
  const [manualCcUsers, setManualCcUsers] = useState<CcPick[]>([]);
  const [ccPickerOpen, setCcPickerOpen] = useState(false);

  const [staffs, setStaffs] = useState<StaffMember[]>([]);
  const [staffsLoading, setStaffsLoading] = useState(false);

  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    (async () => {
      setStaffsLoading(true);
      try {
        const { data, error } = await db
          .from('staff_members')
          .select('id, name, status, company, department, team, position, hire_date, resign_date')
          .eq('company', company);
        if (error || cancelled || !data) return;
        setStaffs(data as StaffMember[]);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setStaffsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company]);

  const leaveDelegateOptions = useMemo(() => {
    const currentUserId = String(staffId || '').trim();

    return staffs
      .filter((staff) => {
        const sId = String(staff?.id || '').trim();
        if (!sId || sId === currentUserId) return false;
        if (!isActiveStaff(staff)) return false;
        return true;
      })
      .sort((left, right) => {
        const leftDepartment = String(left?.department || left?.team || '').trim();
        const rightDepartment = String(right?.department || right?.team || '').trim();
        return (
          leftDepartment.localeCompare(rightDepartment, 'ko-KR') ||
          String(left?.name || '').localeCompare(String(right?.name || ''), 'ko-KR')
        );
      });
  }, [staffId, staffs]);

  const base = useApprovalFormBase({ user, staffId, company });
  const {
    submitting, setSubmitting,
    attachments, setAttachments,
    approverDefaults, approverLine, approverLoading, approverManual,
    pickerOpen, setPickerOpen,
    handleApproverApply, submitApproval, queuedAttachmentCount } = base;

  const days = useMemo(() => calcDays(start, end, kind), [start, end, kind]);
  const canSubmit =
    Boolean(staffId) &&
    Boolean(start) &&
    Boolean(end) &&
    start <= end &&
    days > 0 &&
    approverLine.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!staffId) {
      toast('계정 정보를 확인할 수 없습니다.', 'error');
      return;
    }
    if (!start || !end) {
      toast('시작일과 종료일을 입력해 주세요.', 'warning');
      return;
    }
    if (start > end) {
      toast('종료일은 시작일 이후여야 합니다.', 'warning');
      return;
    }
    if (approverLine.length === 0) {
      toast('결재자를 한 명 이상 지정해 주세요. (상단 "변경" 버튼)', 'error');
      return;
    }

    setSubmitting(true);

    const senderName = String(user.name || '').trim() || '이름 없음';
    const senderCompany = company;
    const leaveTypeLabel = kind === '반차' ? '반차 (0.5)' : '연차 (1.0)';

    // 1) leave_requests insert (기존 인사관리 모듈 동일 컬럼)
    let leaveRequestInserted = false;
    let leaveQueued = false;
    try {
      const { queued, error: leaveError } = await enqueueD1Mutation({
        kind: 'insert',
        table: 'leave_requests',
        payload: {
          staff_id: staffId,
          leave_type: kind,
          start_date: start,
          end_date: end,
          days,
          reason: reason || null,
          status: '대기' } });
      if (leaveError) throw new Error(leaveError);
      leaveRequestInserted = true;
      leaveQueued = queued;
    } catch (err) {
      console.error('[mobile-approval] leave_requests insert failed', err);
      const message = err instanceof Error ? err.message : '신청 실패';
      toast(`연차 기록 저장 실패: ${message}`, 'error');
      setSubmitting(false);
      return;
    }

    // 2) approvals insert (PC useApprovalSubmit과 동일 컬럼/메타) — 공통 훅 사용
    try {
      const title = buildLeaveTitle(senderName, kind, start, end);

      // Fetch active staff in the company for cc_users
      let ccUsers: Array<{ id: string; name: string }> = [];
      try {
        const { data: staffData } = await db
          .from('staff_members')
          .select('id, name, status, company, hire_date, resign_date')
          .eq('company', senderCompany);
        if (staffData) {
          ccUsers = (staffData as StaffMember[])
            .filter((s: StaffMember) => isActiveStaff(s) && String(s.id) !== staffId)
            .map((s: StaffMember) => ({
              id: String(s.id),
              name: s.name || '이름 없음' }));
        }
      } catch (err) {
        console.error('[mobile-approval] failed to fetch cc_users candidates', err);
      }

      // 수동 지정 참조자를 자동 CC에 병합 (id 기준 dedup) — 자동 CC를 깨지 않음
      if (manualCcUsers.length > 0) {
        const byId = new Map<string, { id: string; name: string }>();
        for (const c of ccUsers) byId.set(c.id, c);
        for (const c of manualCcUsers) {
          if (c.id) byId.set(c.id, { id: c.id, name: c.name || '이름 없음' });
        }
        ccUsers = Array.from(byId.values());
      }

      const delegate = leaveDelegateOptions.find((staff) => String(staff.id) === delegateId);

      const { queued: apprQueued } = await submitApproval({
        typeName: '연차/휴가',
        title,
        content: reason || '',
        formSlug: 'leave',
        formDisplayName: '연차/휴가',
        ccDepartments: ['행정팀'],
        ccUsers,
        extraMeta: {
          vType: leaveTypeLabel,
          leaveType: leaveTypeLabel,
          startDate: start,
          endDate: end,
          reason: reason || '',
          leave_request_synced: leaveRequestInserted,
          delegateId: delegateId || null,
          delegateName: delegate?.name || '',
          delegateDepartment: String(delegate?.department || delegate?.team || '').trim(),
          delegatePosition: String(delegate?.position || '').trim() } });

      if (leaveQueued || apprQueued) {
        toast('오프라인 — 연차 신청이 동기화 대기 중입니다. 온라인 복귀 시 자동 전송됩니다.', 'warning');
      } else if (queuedAttachmentCount > 0) {
        toast(`연차 신청이 상신되었습니다. 첨부 ${queuedAttachmentCount}개는 온라인 복귀 시 자동 업로드됩니다.`, 'warning');
      } else {
        toast('연차 신청이 결재선에 올라갔습니다.', 'success');
      }
      onSubmitted();
    } catch (err) {
      console.error('[mobile-approval] approvals insert failed', err);
      const message = err instanceof Error ? err.message : '결재 상신 실패';
      toast(
        `결재 상신 실패: ${message}\n연차 기록은 저장되었습니다. PC에서 결재선을 지정해 재상신해 주세요.`,
        'error'
      );
      // leave_requests는 이미 저장됨 — 폼 상태 유지 (사용자가 PC 안내 후 닫기 선택)
    } finally {
      setSubmitting(false);
    }
  }, [staffId, start, end, kind, days, reason, delegateId, leaveDelegateOptions, manualCcUsers, approverLine, user, company, onSubmitted, submitApproval, setSubmitting, queuedAttachmentCount]);

  return (
    <div className="m-screen" style={{ background: 'transparent' }}>
      <MFormHeader
        onCancel={onCancel}
        title="연차/휴가 신청"
        sub="모바일 인라인 작성"
        saveLabel={submitting ? '상신 중…' : '상신'}
        onSave={handleSubmit}
        saveDisabled={!canSubmit || submitting}
      />
      <div className="m-scroll" style={{ background: 'transparent' }}>
        <div
          className="macos-glass macos-squircle"
          style={{
            margin: '16px',
            overflow: 'hidden' }}
        >
          <MField label="휴가 종류">
            <MSegRow
              value={kind}
              onPick={setKind}
              options={KIND_OPTIONS}
              ariaLabel="휴가 종류"
            />
          </MField>
          <MField label="업무 대행자" htmlFor={fieldId('delegate')}>
            <div style={{ padding: '6px 0' }}>
              <select
                id={fieldId('delegate')}
                value={delegateId}
                onChange={(e) => setDelegateId(e.target.value)}
                style={{
                  width: '100%',
                  height: 36,
                  padding: '0 8px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--z-900)',
                  backgroundColor: 'rgba(255, 255, 255, 0.45)',
                  border: '1px solid rgba(255, 255, 255, 0.35)',
                  outline: 'none' }}
              >
                <option value="">대행자 선택 안함</option>
                {leaveDelegateOptions.map((staff) => {
                  const dept = String(staff.department || staff.team || '').trim();
                  const pos = String(staff.position || '').trim();
                  const details = [dept, pos].filter(Boolean).join(' / ');
                  return (
                    <option key={staff.id} value={staff.id}>
                      {details ? `${staff.name} (${details})` : staff.name}
                    </option>
                  );
                })}
              </select>
            </div>
          </MField>
          <MField label="시작일" required htmlFor={fieldId('start')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <span style={{ display: 'inline-flex' }}><MIcon name="calendar" size={16} color="var(--m-accent)" /></span>
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
              <span style={{ display: 'inline-flex' }}><MIcon name="calendar" size={16} color="var(--m-accent)" /></span>
              <MInput
                id={fieldId('end')}
                value={end}
                onChange={setEnd}
                kind="date"
                ariaLabel="종료일"
              />
            </div>
          </MField>
          <MField label="사유" htmlFor={fieldId('reason')} sub="결재자에게 전달됩니다.">
            <textarea
              id={fieldId('reason')}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 가족 여행 / 개인 사유 등"
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
        </div>

        {/* 결재선 미리보기 */}
        <div className="m-section" style={{ background: 'transparent' }}>
          <div className="m-section-h" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', padding: '8px 16px 4px' }}>
            <div className="lbl" style={{ flex: 1, fontSize: 13, fontWeight: 900, color: 'var(--z-700)' }}>
              결재선 ({approverManual ? '직접 지정' : '자동 매핑'})
            </div>
            <button
              type="button"
              className="transition-all active:scale-95"
              onClick={() => setPickerOpen(true)}
              aria-label="결재선 변경"
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: 'var(--m-accent)',
                padding: '4px 8px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer' }}
            >
              변경
            </button>
          </div>
          <MCard
            className="macos-glass macos-squircle"
            style={{
              overflow: 'hidden',
              margin: '0 16px',
              padding: 0 }}
          >
            {approverLoading ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)', fontWeight: 800 }}>
                결재선을 불러오는 중…
              </div>
            ) : approverLine.length === 0 ? (
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--m-warning-soft)',
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'var(--m-warning)',
                  lineHeight: 1.55 }}
              >
                회사 내 결재자(팀장·실장·원장 등)가 없어 자동 매핑할 수 없습니다. 우측 상단 “변경”으로 결재자를 직접 지정해 주세요.
              </div>
            ) : (
              <ol style={{ listStyle: 'none' }} aria-label="결재 진행 순서">
                {approverLine.map((a, i) => {
                  const dept = [a.department, a.position].filter(Boolean).join(' / ');
                  const stepLabel =
                    i === approverLine.length - 1
                      ? '최종 결재'
                      : i === 0
                        ? '1차 검토'
                        : `${i + 1}차 검토`;
                  return (
                    <li
                      key={String(a.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr auto',
                        gap: 12,
                        padding: '12px 16px',
                        borderBottom:
                          i < approverLine.length - 1 ? '1px solid rgba(0, 0, 0, 0.04)' : 'none',
                        alignItems: 'center' }}
                    >
                      <MAvatar tone="violet" size="sm">
                        {(a.name || '?').charAt(0)}
                      </MAvatar>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 800 }}>
                          {stepLabel}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 1, color: 'var(--z-900)' }}>{a.name}</div>
                        {dept && (
                          <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1, fontWeight: 700 }}>
                            {dept}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 800 }}>대기</div>
                    </li>
                  );
                })}
              </ol>
            )}
          </MCard>
          <div style={{ padding: '6px 20px 0', fontSize: 11, color: 'var(--z-500)', fontWeight: 800 }}>
            {approverManual
              ? '결재선을 직접 지정했습니다. "기본값으로" 버튼으로 되돌릴 수 있어요.'
              : '직급 위계에 따라 자동 매핑되었습니다. "변경"으로 수정할 수 있어요.'}
          </div>
        </div>

        {/* 참조(CC) — 추가 지정 */}
        <div className="m-section" style={{ background: 'transparent' }}>
          <div className="m-section-h" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', padding: '8px 16px 4px' }}>
            <div className="lbl" style={{ flex: 1, fontSize: 13, fontWeight: 900, color: 'var(--z-700)' }}>참조 추가 ({manualCcUsers.length})</div>
            <button
              type="button"
              className="transition-all active:scale-95"
              onClick={() => setCcPickerOpen(true)}
              aria-label="참조자 추가 또는 변경"
              style={{ fontSize: 12, fontWeight: 900, color: 'var(--m-accent)', padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              {manualCcUsers.length > 0 ? '변경' : '추가'}
            </button>
          </div>
          <MCard
            className="macos-glass macos-squircle"
            style={{
              overflow: 'hidden',
              margin: '0 16px',
              padding: 0 }}
          >
            {manualCcUsers.length === 0 ? (
              <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--z-500)', fontWeight: 800, lineHeight: 1.55 }}>
                연차 신청은 행정팀과 회사 직원에게 기본 참조됩니다. 추가로 참조할 직원을 지정할 수 있어요.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px' }} aria-label="추가 참조자 목록">
                {manualCcUsers.map((c) => {
                  const dept = [c.department, c.position].filter(Boolean).join(' / ');
                  return (
                    <li
                      key={c.id}
                      className="macos-glass"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px 6px 6px',
                        borderRadius: 999 }}
                    >
                      <MAvatar tone="cyan" size="sm">{(c.name || '?').charAt(0)}</MAvatar>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--z-900)' }}>{c.name}</span>
                        {dept && <span style={{ fontSize: 11, color: 'var(--z-500)', marginLeft: 6, fontWeight: 800 }}>{dept}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </MCard>
        </div>

        {/* 첨부 파일 */}
        <div className="m-section" style={{ background: 'transparent', padding: '0 16px' }}>
          <AttachmentPicker onChange={setAttachments} />
        </div>

        <div style={{ height: 32 }} />
      </div>

      <SApprovalApproverPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selfId={staffId}
        company={company || null}
        current={approverLine}
        defaultLine={approverDefaults}
        onApply={handleApproverApply}
      />

      <SApprovalCcPicker
        open={ccPickerOpen}
        onClose={() => setCcPickerOpen(false)}
        selfId={staffId}
        company={company || null}
        current={manualCcUsers}
        onApply={setManualCcUsers}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

function calcDays(start: string, end: string, kind: LeaveKind): number {
  if (kind === '반차') return 0.5;
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / (24 * 3600 * 1000)) + 1;
}

function buildLeaveTitle(name: string, kind: LeaveKind, start: string, end: string): string {
  const range = start === end ? start : `${start} ~ ${end}`;
  const label = kind === '반차' ? '반차' : '연차';
  return `${name} ${label} 신청 (${range})`;
}
