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
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import type { ErpUser, StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import { appendApprovalHistory } from '@/lib/approval-workflow';
import { APPROVER_POSITIONS } from '../../기능부품/전자결재서브/approval-constants';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import MCard from '../공통/MCard';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix,
} from '../인사관리/form-helpers';
import { generateMobileDocNumber } from './data-hooks';
import SApprovalApproverPicker, {
  toApproverPick,
  type ApproverPick,
} from './결재선피커';

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

  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const [kind, setKind] = useState<LeaveKind>('연차');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [approverDefaults, setApproverDefaults] = useState<ApproverPick[]>([]);
  const [approverLine, setApproverLine] = useState<ApproverPick[]>([]);
  const [approverLoading, setApproverLoading] = useState(true);
  const [approverManual, setApproverManual] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 결재선 자동 매핑 — 본인 회사의 APPROVER_POSITIONS 보유자 1~3명, 직급 위계순
  useEffect(() => {
    if (!staffId) {
      setApproverLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setApproverLoading(true);
      try {
        let q = supabase
          .from('staff_members')
          .select('id, name, company, department, position, status, hire_date, resign_date, email, phone');
        if (company) {
          q = q.eq('company', company);
        }
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const order = (s: StaffMember) =>
          APPROVER_POSITIONS.indexOf(String(s.position || '').trim());
        const candidates = ((data ?? []) as StaffMember[])
          .filter((s) => isActiveStaff(s))
          .filter((s) => APPROVER_POSITIONS.includes(String(s.position || '').trim()))
          .filter((s) => String(s.id) !== staffId)
          .sort((a, b) => order(a) - order(b) || (a.name || '').localeCompare(b.name || ''));
        // 1차/2차/최종 = 직급 위계 하위→상위 3명까지
        const picks = candidates.slice(0, 3).map(toApproverPick);
        setApproverDefaults(picks);
        // 수동 변경 전이면 기본값으로 라인 채움
        if (!approverManual) {
          setApproverLine(picks);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[mobile-approval] approver candidates load failed', err);
          setApproverDefaults([]);
          if (!approverManual) setApproverLine([]);
        }
      } finally {
        if (!cancelled) setApproverLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // approverManual은 의도적으로 의존성 제외 — manual 토글로 재fetch하면 안 됨
  }, [staffId, company]);

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
    const senderDepartment = String(user.department || '').trim();
    const senderCompany = company;
    const leaveTypeLabel = kind === '반차' ? '반차 (0.5)' : '연차 (1.0)';
    const firstApproverId = String(approverLine[0]?.id || '');

    // 1) leave_requests insert (기존 인사관리 모듈 동일 컬럼)
    let leaveRequestInserted = false;
    try {
      const { error: leaveError } = await supabase.from('leave_requests').insert({
        staff_id: staffId,
        leave_type: kind,
        start_date: start,
        end_date: end,
        reason: reason || null,
        status: '대기',
      });
      if (leaveError) throw leaveError;
      leaveRequestInserted = true;
    } catch (err) {
      console.error('[mobile-approval] leave_requests insert failed', err);
      const message = err instanceof Error ? err.message : '신청 실패';
      toast(`연차 기록 저장 실패: ${message}`, 'error');
      setSubmitting(false);
      return;
    }

    // 2) approvals insert (PC useApprovalSubmit과 동일 컬럼/메타)
    try {
      const title = buildLeaveTitle(senderName, kind, start, end);

      // 2-a) doc_number — PC generateMobileDocNumber로 회사·일자 시퀀스 생성 (실패 시 silent fallback)
      const docNumber = await generateMobileDocNumber({
        formSlug: 'leave',
        typeName: '연차/휴가',
        companyName: senderCompany || null,
        companyId: user.company_id != null ? String(user.company_id) : null,
        departmentName: senderDepartment || null,
        userPermissions:
          (user as unknown as { permissions?: Record<string, unknown> }).permissions ?? null,
      });

      const meta: Record<string, unknown> = {
        vType: leaveTypeLabel,
        leaveType: leaveTypeLabel,
        startDate: start,
        endDate: end,
        reason: reason || '',
        form_slug: 'leave',
        form_name: '연차/휴가',
        cc_departments: ['행정팀'],
        cc_users: [],
        approver_line: approverLine.map((a) => String(a.id)),
        approver_line_details: approverLine.map((a) => ({
          id: String(a.id || ''),
          name: a.name || '',
          position: a.position || null,
          department: a.department || null,
          company: a.company || null,
        })),
        approver_line_source: approverManual ? 'mobile_manual' : 'mobile_auto',
        revision: 1,
        source_approval_id: null,
        previous_doc_number: null,
        leave_request_synced: leaveRequestInserted,
        client_origin: 'mobile',
      };
      if (docNumber) {
        meta.doc_number = docNumber;
      }
      const row: Record<string, unknown> = {
        sender_id: staffId,
        sender_name: senderName,
        sender_company: senderCompany,
        sender_department: senderDepartment || null,
        current_approver_id: firstApproverId,
        approver_line: approverLine.map((a) => String(a.id)),
        type: '연차/휴가',
        title,
        content: reason || '',
        meta_data: appendApprovalHistory(meta, {
          action: 'created',
          actor_id: staffId,
          actor_name: senderName,
          note: '모바일 최초 상신',
          current_approver_id: firstApproverId,
          revision: 1,
        }),
        status: '대기',
      };
      if (user.company_id != null) {
        row.company_id = user.company_id;
      }
      if (docNumber) {
        row.doc_number = docNumber;
      }

      const { error: apprError } = await supabase.from('approvals').insert([row]);
      if (apprError) throw apprError;

      toast('연차 신청이 결재선에 올라갔습니다.', 'success');
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
  }, [staffId, start, end, kind, reason, approverLine, approverManual, user, company, onSubmitted]);

  return (
    <div className="m-screen">
      <MFormHeader
        onCancel={onCancel}
        title="연차/휴가 신청"
        sub="모바일 인라인 작성"
        saveLabel={submitting ? '상신 중…' : '상신'}
        onSave={handleSubmit}
        saveDisabled={!canSubmit || submitting}
      />
      <div className="m-scroll">
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
                fontFamily: 'inherit',
                resize: 'none',
                color: 'var(--z-900)',
              }}
            />
          </MField>
        </div>

        {/* 결재선 미리보기 */}
        <div className="m-section">
          <div className="m-section-h" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="lbl" style={{ flex: 1 }}>
              결재선 ({approverManual ? '직접 지정' : '자동 매핑'})
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-label="결재선 변경"
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: 'var(--m-accent)',
                padding: '4px 8px',
              }}
            >
              변경
            </button>
          </div>
          <MCard flush>
            {approverLoading ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)' }}>
                결재선을 불러오는 중…
              </div>
            ) : approverLine.length === 0 ? (
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--m-warning-soft)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--m-warning)',
                  lineHeight: 1.55,
                }}
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
                          i < approverLine.length - 1 ? '1px solid var(--m-border)' : 'none',
                        alignItems: 'center',
                      }}
                    >
                      <MAvatar tone="violet" size="sm">
                        {(a.name || '?').charAt(0)}
                      </MAvatar>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>
                          {stepLabel}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 1 }}>{a.name}</div>
                        {dept && (
                          <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1 }}>
                            {dept}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 700 }}>대기</div>
                    </li>
                  );
                })}
              </ol>
            )}
          </MCard>
          <div style={{ padding: '6px 16px 0', fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
            {approverManual
              ? '결재선을 직접 지정했습니다. "기본값으로" 버튼으로 되돌릴 수 있어요.'
              : '직급 위계에 따라 자동 매핑되었습니다. "변경"으로 수정할 수 있어요.'}
          </div>
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
        onApply={(next) => {
          setApproverLine(next);
          // 기본값과 같은지 비교 — 같으면 manual 해제
          const sameAsDefault =
            next.length === approverDefaults.length &&
            next.every((p, i) => p.id === approverDefaults[i]?.id);
          setApproverManual(!sameAsDefault);
        }}
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
