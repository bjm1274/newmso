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
// 8차 D12-005: 일수 계산·제목·참조부서·meta 구성이 진입점 3곳에서 갈려 있었다 — 정본 사용.
import {
  LEAVE_APPROVAL_CC_DEPARTMENTS,
  buildLeaveApprovalMeta,
  buildLeaveApprovalTitle,
  calcLeaveDays } from '@/lib/leave-submit';
import { enqueueD1Mutation } from '@/lib/offline-queue-d1';
import type { ErpUser, StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import MIcon from '../공통/MIcon';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix } from '../인사관리/form-helpers';
import SApprovalApproverPicker from './결재선피커';
import SApprovalCcPicker, { type CcPick } from './참조피커';
import AttachmentPicker from './AttachmentPicker';
import { ApproverLinePreviewSection, CcSection } from './ApproverLineCcSections';
import { useApprovalFormBase } from './useApprovalFormBase';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';
import { normalizeLeaveType } from '@/lib/leave-type';

/** UI segment id — leave_type 저장값은 normalizeLeaveType 정규 키 */
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
  const staffId = useResolvedStaffId(user as Record<string, unknown>);
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

  // 업무대행자 후보는 **전 회사** 직원이다.
  //
  // MSO 구조상 모회사가 자회사 직원까지 관리하고 회사 간 대체근무가 성립하므로,
  // 대행자를 자기 회사로 좁히면 안 된다. 예전에는 `.eq('company', company)` 로
  // SQL 단계에서 잘라내 타 회사 직원이 아예 목록에 뜨지 않았고,
  // 회사 정보가 없는 사용자는 `if (!company) return` 때문에 목록이 통째로 비었다.
  // PC(근태신청양식.tsx)는 이미 전 회사를 대상으로 하고 있어 동작이 갈렸다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStaffsLoading(true);
      try {
        const { data, error } = await db
          .from('staff_members')
          .select('id, name, status, company, department, team, position, hire_date, resign_date');
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
  }, []);

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
        // 전 회사 직원이 섞이므로 회사 → 부서 → 이름 순으로 정렬한다.
        // 본인 회사를 맨 앞에 둬서 평소 자주 고르는 대상이 위로 오게 한다.
        const myCompany = String(company || '').trim();
        const leftCompany = String(left?.company || '').trim();
        const rightCompany = String(right?.company || '').trim();
        const leftMine = myCompany && leftCompany === myCompany ? 0 : 1;
        const rightMine = myCompany && rightCompany === myCompany ? 0 : 1;
        if (leftMine !== rightMine) return leftMine - rightMine;

        const leftDepartment = String(left?.department || left?.team || '').trim();
        const rightDepartment = String(right?.department || right?.team || '').trim();
        return (
          leftCompany.localeCompare(rightCompany, 'ko-KR') ||
          leftDepartment.localeCompare(rightDepartment, 'ko-KR') ||
          String(left?.name || '').localeCompare(String(right?.name || ''), 'ko-KR')
        );
      });
  }, [staffId, staffs, company]);

  const base = useApprovalFormBase({ user, staffId, company });
  const {
    submitting, setSubmitting,
    attachments, setAttachments,
    approverDefaults, approverLine, approverLoading, approverManual,
    pickerOpen, setPickerOpen,
    handleApproverApply, submitApproval, queuedAttachmentCount } = base;

  const days = useMemo(() => calcLeaveDays(start, end, normalizeLeaveType(kind)), [start, end, kind]);
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
    // leave_type / meta.leaveType / meta.vType 동일 정규 키 (leave-type SSOT)
    // — 서버 ensureApproved 가 leave_type 완전일치로 대기 row 를 승격
    const leaveTypeKey = normalizeLeaveType(kind);

    // 1) leave_requests insert (기존 인사관리 모듈 동일 컬럼)
    let leaveRequestInserted = false;
    let leaveQueued = false;
    try {
      const { queued, error: leaveError } = await enqueueD1Mutation({
        kind: 'insert',
        table: 'leave_requests',
        payload: {
          staff_id: staffId,
          leave_type: leaveTypeKey,
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
      const title = buildLeaveApprovalTitle(senderName, leaveTypeKey, start, end);

      // PC 패리티: 전사 자동 CC 금지 — 수동 지정 참조자만
      const ccUsers: Array<{ id: string; name: string }> = manualCcUsers
        .filter((c) => c.id)
        .map((c) => ({ id: c.id, name: c.name || '이름 없음' }));

      const delegate = leaveDelegateOptions.find((staff) => String(staff.id) === delegateId);

      const { queued: apprQueued } = await submitApproval({
        typeName: '연차/휴가',
        title,
        content: reason || '',
        formSlug: 'leave',
        formDisplayName: '연차/휴가',
        ccDepartments: [...LEAVE_APPROVAL_CC_DEPARTMENTS],
        ccUsers,
        extraMeta: buildLeaveApprovalMeta({
          leaveTypeKey,
          start,
          end,
          days,
          reason,
          leaveRequestSynced: leaveRequestInserted,
          delegate: {
            id: delegateId || null,
            name: delegate?.name || '',
            department: String(delegate?.department || delegate?.team || '').trim(),
            position: String(delegate?.position || '').trim() } }) });

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
        `결재 상신 실패: ${message}\n연차 기록은 저장되었습니다. 전자결재 > 기안함에서 결재선을 확인한 뒤 다시 상신해 주세요.`,
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
                  // 타 회사 직원이 함께 나오므로 회사명을 표시해 동명이인·소속을 구분한다.
                  const co = String(staff.company || '').trim();
                  const dept = String(staff.department || staff.team || '').trim();
                  const pos = String(staff.position || '').trim();
                  const details = [co, dept, pos].filter(Boolean).join(' / ');
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

        {/* 결재선 미리보기 · 참조 — 8차 D12-015: 3개 폼에 verbatim 이던 JSX 를 공용 컴포넌트로 */}
        <ApproverLinePreviewSection
          approverLine={approverLine}
          approverLoading={approverLoading}
          approverManual={approverManual}
          onOpenPicker={() => setPickerOpen(true)}
        />

        <CcSection
          ccUsers={manualCcUsers}
          label="참조 추가"
          emptyText="연차 신청은 행정팀에 기본 참조됩니다. 필요 시 참조 직원을 추가로 지정할 수 있어요."
          onOpenPicker={() => setCcPickerOpen(true)}
        />

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

// 헬퍼(calcDays·buildLeaveTitle)는 lib/leave-submit 정본으로 이관했다(8차 D12-005).
// 인사관리탭 연차신청.tsx 에 글자 단위로 같은 calcDays 사본이 있었고,
// 제목 규칙은 여기 사본만 병가·경조사까지 전부 '연차' 라고 적고 있었다.

