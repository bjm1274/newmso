'use client';

/**
 * SApprovalGenericForm — 모바일 결재 신규 기안: 연차 외 모든 양식 범용 인라인 폼.
 *
 * 제목 + 내용 + 결재선(자동 매핑 + 직접 지정) + 첨부 + 상신.
 * 연차신청폼(SApprovalLeaveForm)의 결재선/첨부/상신 패턴을 그대로 재사용해 정합성 유지.
 * "모바일에서도 모든 기능" 정책에 따라 PC 우회 없이 전 양식 작성 지원.
 *
 * JM(파일당 500줄, 단일 책임), JM2(staff fetch 1회), JM3(try/catch + toast),
 * JM4(any 금지, ApproverPick 유니온), JM5(staff_id 변조 불가 + RLS 의존),
 * JM6(label·input 연결, button aria-label)
 *
 * ※ 데이터 레이어는 현재 Supabase — 최종 D1 전환 배치에서 연차폼과 함께 이관.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import type { ErpUser, StaffMember } from '@/types';
import { isActiveStaff } from '@/lib/active-staff';
import { appendApprovalHistory } from '@/lib/approval-workflow';
import { APPROVER_POSITIONS } from '../../기능부품/전자결재서브/approval-constants';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import MCard from '../공통/MCard';
import { MFormHeader, MField, MInput, useFieldIdPrefix } from '../인사관리/form-helpers';
import { generateMobileDocNumber } from './data-hooks';
import SApprovalApproverPicker, { toApproverPick, type ApproverPick } from './결재선피커';
import AttachmentPicker, { type AttachmentEntry } from './AttachmentPicker';

export type SApprovalGenericFormProps = {
  user: ErpUser;
  formSlug: string;
  formName: string;
  onCancel: () => void;
  onSubmitted: () => void;
};

export default function SApprovalGenericForm({
  user,
  formSlug,
  formName,
  onCancel,
  onSubmitted,
}: SApprovalGenericFormProps) {
  const staffId = typeof user.id === 'string' && user.id.trim() !== '' ? user.id : null;
  const company = typeof user.company === 'string' ? user.company.trim() : '';
  const fieldId = useFieldIdPrefix('appr-generic');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);
  const [approverDefaults, setApproverDefaults] = useState<ApproverPick[]>([]);
  const [approverLine, setApproverLine] = useState<ApproverPick[]>([]);
  const [approverLoading, setApproverLoading] = useState(true);
  const [approverManual, setApproverManual] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 결재선 자동 매핑 — 본인 회사의 APPROVER_POSITIONS 보유자 1~3명, 직급 위계순 (연차폼과 동일)
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
        const order = (s: StaffMember) => APPROVER_POSITIONS.indexOf(String(s.position || '').trim());
        const candidates = ((data ?? []) as StaffMember[])
          .filter((s) => isActiveStaff(s))
          .filter((s) => APPROVER_POSITIONS.includes(String(s.position || '').trim()))
          .filter((s) => String(s.id) !== staffId)
          .sort((a, b) => order(a) - order(b) || (a.name || '').localeCompare(b.name || ''));
        const picks = candidates.slice(0, 3).map(toApproverPick);
        setApproverDefaults(picks);
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
  }, [staffId, company]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = Boolean(staffId) && title.trim() !== '' && approverLine.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!staffId) {
      toast('계정 정보를 확인할 수 없습니다.', 'error');
      return;
    }
    if (title.trim() === '') {
      toast('제목을 입력해 주세요.', 'warning');
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
    const firstApproverId = String(approverLine[0]?.id || '');

    try {
      // doc_number — 회사·일자 시퀀스 생성 (실패 시 silent fallback)
      const docNumber = await generateMobileDocNumber({
        formSlug,
        typeName: formName,
        companyName: senderCompany || null,
        companyId: user.company_id != null ? String(user.company_id) : null,
        departmentName: senderDepartment || null,
        userPermissions:
          (user as unknown as { permissions?: Record<string, unknown> }).permissions ?? null,
      });

      const meta: Record<string, unknown> = {
        form_slug: formSlug,
        form_name: formName,
        content,
        cc_departments: [],
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
        client_origin: 'mobile',
      };

      const uploadedAttachments = attachments
        .filter((a) => a.state === 'done' && a.fileUrl)
        .map((a) => ({
          name: a.file.name,
          url: a.fileUrl as string,
          mimeType: a.file.type || null,
          size: Number.isFinite(a.file.size) ? a.file.size : null,
          uploadedAt: new Date().toISOString(),
        }));
      if (uploadedAttachments.length > 0) {
        meta.attachments = uploadedAttachments;
      }
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
        type: formName,
        title: title.trim(),
        content,
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
      if (docNumber) {
        row.doc_number = docNumber;
      }
      if (user.company_id != null) {
        row.company_id = user.company_id;
      }

      const { queued, error } = await enqueueSupabaseMutation({
        kind: 'insert',
        table: 'approvals',
        payload: row,
      });
      if (error) throw new Error(error);

      const queuedAttachments = attachments.filter((a) => a.state === 'queued').length;
      if (queued) {
        toast('오프라인 — 기안이 동기화 대기 중입니다. 온라인 복귀 시 자동 전송됩니다.', 'warning');
      } else if (queuedAttachments > 0) {
        toast(`기안이 상신되었습니다. 첨부 ${queuedAttachments}개는 온라인 복귀 시 자동 업로드됩니다.`, 'warning');
      } else {
        toast('기안이 결재선에 올라갔습니다.', 'success');
      }
      onSubmitted();
    } catch (err) {
      console.error('[mobile-approval] generic approvals insert failed', err);
      const message = err instanceof Error ? err.message : '결재 상신 실패';
      toast(`결재 상신 실패: ${message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [
    staffId,
    title,
    content,
    attachments,
    approverLine,
    approverManual,
    user,
    company,
    formSlug,
    formName,
    onSubmitted,
  ]);

  return (
    <div className="m-screen">
      <MFormHeader
        onCancel={onCancel}
        title={formName}
        sub="모바일 인라인 작성"
        saveLabel={submitting ? '상신 중...' : '상신'}
        onSave={handleSubmit}
        saveDisabled={!canSubmit || submitting}
      />
      <div className="m-scroll">
        <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
          <MField label="제목" required htmlFor={fieldId('title')}>
            <MInput
              id={fieldId('title')}
              value={title}
              onChange={setTitle}
              placeholder="제목을 입력하세요"
              ariaLabel="제목"
              autoFocus
            />
          </MField>
          <MField label="내용" htmlFor={fieldId('content')} sub="결재자에게 전달됩니다.">
            <textarea
              id={fieldId('content')}
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="기안 내용을 입력하세요"
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
              style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-accent)', padding: '4px 8px' }}
            >
              변경
            </button>
          </div>
          <MCard flush>
            {approverLoading ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--z-500)' }}>
                결재선을 불러오는 중...
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
                회사 내 결재자(팀장·실장·원장 등)가 없어 자동 매핑할 수 없습니다. 우측 상단 "변경"으로 결재자를
                직접 지정해 주세요.
              </div>
            ) : (
              <ol style={{ listStyle: 'none' }} aria-label="결재 진행 순서">
                {approverLine.map((a, i) => {
                  const dept = [a.department, a.position].filter(Boolean).join(' / ');
                  const stepLabel =
                    i === approverLine.length - 1 ? '최종 결재' : i === 0 ? '1차 검토' : `${i + 1}차 검토`;
                  return (
                    <li
                      key={String(a.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr auto',
                        gap: 12,
                        padding: '12px 16px',
                        borderBottom: i < approverLine.length - 1 ? '1px solid var(--m-border)' : 'none',
                        alignItems: 'center',
                      }}
                    >
                      <MAvatar tone="violet" size="sm">
                        {(a.name || '?').charAt(0)}
                      </MAvatar>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>{stepLabel}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 1 }}>{a.name}</div>
                        {dept && (
                          <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 1 }}>{dept}</div>
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

        {/* 첨부 파일 */}
        <div className="m-section">
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
        onApply={(next) => {
          setApproverLine(next);
          const sameAsDefault =
            next.length === approverDefaults.length &&
            next.every((p, i) => p.id === approverDefaults[i]?.id);
          setApproverManual(!sameAsDefault);
        }}
      />
    </div>
  );
}
