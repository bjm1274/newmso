'use client';
import { toast } from '@/lib/toast';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { syncApprovalToDocumentRepository } from '@/lib/approval-document-archive';
import { CERTIFICATE_TYPES } from '@/lib/certificate-types';

const URGENCY_LEVELS = ['일반', '긴급', '매우긴급'] as const;

type FormRequestReferenceUser = {
  id: string;
  name: string;
  position?: string | null;
};

type FormRequestProps = {
  user?: Record<string, unknown> | null;
  staffs?: Record<string, unknown>[];
  approverLine?: Record<string, unknown>[];
  ccLine?: FormRequestReferenceUser[];
};

function describeError(error: any) {
  return {
    message: error?.message ?? String(error),
    code: error?.code ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  };
}

export default function FormRequest({
  user: _user,
  staffs: _staffs,
  approverLine: _approverLine,
  ccLine: _ccLine,
}: FormRequestProps) {
  const user = (_user ?? {}) as Record<string, unknown>;
  const staffs = (_staffs ?? []) as Record<string, unknown>[];
  const approverLine = (Array.isArray(_approverLine) ? _approverLine : []) as Record<string, unknown>[];
  const ccLine = (Array.isArray(_ccLine) ? _ccLine : []) as FormRequestReferenceUser[];
  const forms = CERTIFICATE_TYPES;
  const [selectedForm, setSelectedForm] = useState<string>(forms[0]?.id ?? '');
  const [purpose, setPurpose] = useState('');
  const [urgency, setUrgency] = useState<(typeof URGENCY_LEVELS)[number]>('일반');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user?.id) {
      toast('로그인 정보가 올바르지 않습니다. 다시 로그인한 뒤 이용해 주세요.', 'warning');
      return;
    }

    if (!selectedForm) {
      toast('신청할 양식을 선택해 주세요.', 'warning');
      return;
    }

    if (approverLine.length === 0) {
      toast('결재권자를 먼저 선택해주세요.', 'warning');
      return;
    }

    if (!purpose.trim()) {
      toast('신청 용도를 입력해 주세요.', 'warning');
      return;
    }

    setSubmitting(true);

    try {
      const approver =
        staffs?.find((staff: any) => staff.position === '원장' || staff.position === '부장') ?? null;
      const selectedApproverIds = approverLine
        .map((staff) => String(staff?.id || '').trim())
        .filter(Boolean);
      const currentApproverId = selectedApproverIds[0] ?? null;
      const referenceUsers = ccLine
        .map((staff) => ({
          id: String(staff?.id || '').trim(),
          name: String(staff?.name || '').trim(),
          position: staff?.position ?? null,
        }))
        .filter((staff) => staff.id && staff.name);
      const selectedFormData = forms.find((form) => form.id === selectedForm);
      const formLabel = selectedFormData?.label ?? selectedForm;

      const payload = {
        sender_id: user.id,
        sender_name: user.name,
        sender_company: user.company,
        current_approver_id: currentApproverId,
        type: '양식신청',
        title: `${formLabel} 신청`,
        content: `신청자: ${user.name}\n대상자: ${user.name}\n용도: ${purpose}\n긴급도: ${urgency}`,
        meta_data: {
          form_id: selectedForm,
          form_type: formLabel,
          target_staff: user.id,
          purpose,
          urgency,
          auto_issue: true,
          approver_line: selectedApproverIds,
          cc_users: referenceUsers,
          cc_departments: ['행정팀'],
        },
        status: '대기',
      };

      const { data: insertedApproval, error } = await supabase
        .from('approvals')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      try {
        await syncApprovalToDocumentRepository((insertedApproval as Record<string, unknown> | null) ?? payload);
      } catch (archiveError) {
        console.error('양식신청 문서보관함 저장 실패:', describeError(archiveError));
        toast('양식 신청은 완료됐지만 문서보관함 저장에는 실패했습니다.', 'warning');
      }

      const excludedIds = new Set<string>([
        String(user.id || ''),
        ...((payload.meta_data?.approver_line as string[] | undefined) || []).map((id) => String(id)),
      ]);
      const notificationRows = referenceUsers
        .filter((staff) => staff.id && !excludedIds.has(String(staff.id)))
        .map((staff) => ({
          user_id: String(staff.id),
          type: 'approval',
          title: `📎 참조 문서 도착: ${payload.title}`,
          body: `${String(user.name || '기안자')}님 문서가 참조로 공유되었습니다.`,
          metadata: {
            id: insertedApproval?.id || null,
            approval_id: insertedApproval?.id || null,
            type: 'approval',
            approval_role: 'reference',
            approval_view: '참조 문서함',
            sender_name: user.name || null,
            document_type: payload.type,
          },
        }));

      if (notificationRows.length > 0) {
        const { error: notificationError } = await supabase.from('notifications').insert(notificationRows);
        if (notificationError) {
          console.error('양식 신청 참조자 알림 생성 실패:', describeError(notificationError));
        }
      }

      toast('양식 신청이 완료되었습니다. 결재자의 확인을 기다려 주세요.', 'success');
      setPurpose('');
      setUrgency('일반');
      setSelectedForm(forms[0]?.id ?? '');
    } catch (error) {
      console.error('양식 신청 실패:', describeError(error));
      toast('양식 신청 중 오류가 발생했습니다.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="form-request-view"
      className="animate-in fade-in duration-500 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
    >
      <header className="border-b pb-3">
        <h3 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">양식 신청</h3>
        <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">
          최종 승인 후 자동 발급
        </p>
      </header>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-4)]">
            1. 신청 양식 선택
          </label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {forms.map((form, index) => (
              <button
                key={form.id}
                type="button"
                data-testid={`form-request-type-${index}`}
                onClick={() => setSelectedForm(form.id)}
                className={`rounded-[var(--radius-md)] border-2 p-3 text-left transition-all ${
                  selectedForm === form.id
                    ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]'
                    : 'border-[var(--border)] hover:border-[var(--toss-gray-3)]'
                }`}
              >
                <p className="text-xs font-semibold text-[var(--foreground)]">{form.label}</p>
                <p className="mt-0.5 text-[11px] font-bold text-[var(--toss-gray-3)]">{form.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-4)]">
            2. 신청 대상 직원
          </label>
          <div className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3 text-sm font-bold text-[var(--foreground)]">
            {user?.name as string} ({(user?.position as string) || '직원'}) - 본인 계정으로만 증명서를 신청할 수 있습니다.
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-4)]">
            3. 신청 용도
          </label>
          <textarea
            data-testid="form-request-purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="신청 용도를 입력해 주세요. 예: 금융기관 제출용, 사직 확인용"
            className="h-20 w-full resize-none rounded-[var(--radius-md)] bg-[var(--muted)] p-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-gray-4)]">
            4. 긴급도
          </label>
          <div className="flex gap-2">
            {URGENCY_LEVELS.map((level, index) => (
              <button
                key={level}
                type="button"
                data-testid={`form-request-urgency-${index}`}
                onClick={() => setUrgency(level)}
                className={`rounded-[var(--radius-md)] px-4 py-2 text-xs font-semibold transition-all ${
                  urgency === level
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--muted)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]/80'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {approverLine.length === 0 && (
          <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600" data-testid="form-request-approver-required">
            결재권자를 먼저 선택해야 양식 신청을 올릴 수 있습니다.
          </div>
        )}

        <button
          type="button"
          data-testid="form-request-submit"
          onClick={handleSubmit}
          disabled={submitting || approverLine.length === 0}
          className="w-full rounded-[var(--radius-md)] bg-black py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? '신청 중...' : '양식 신청'}
        </button>
      </div>

      <div className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-[var(--toss-blue-light)] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--accent)]">자동 발급 안내</p>
        <p className="text-xs font-bold leading-relaxed text-[var(--accent)]">
          최종 결재가 승인되면 선택한 양식이 자동으로 생성되어 행정팀에서 발급 처리됩니다.
        </p>
      </div>
    </div>
  );
}
