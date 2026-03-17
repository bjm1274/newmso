'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CERTIFICATE_TYPES } from '@/lib/certificate-types';

const URGENCY_LEVELS = ['일반', '긴급', '매우긴급'] as const;

export default function FormRequest({ user, staffs }: any) {
  const forms = CERTIFICATE_TYPES;
  const [selectedForm, setSelectedForm] = useState<string>(forms[0]?.id ?? '');
  const [purpose, setPurpose] = useState('');
  const [urgency, setUrgency] = useState<(typeof URGENCY_LEVELS)[number]>('일반');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user?.id) {
      alert('로그인 정보가 올바르지 않습니다. 다시 로그인 후 이용해주세요.');
      return;
    }

    if (!selectedForm) {
      alert('신청할 양식을 선택해주세요.');
      return;
    }

    if (!purpose.trim()) {
      alert('신청 용도를 입력해주세요.');
      return;
    }

    setSubmitting(true);

    try {
      const approver =
        staffs?.find((staff: any) => staff.position === '팀장' || staff.position === '부장') ?? null;

      const { error } = await supabase
        .from('approvals')
        .insert([
          {
            sender_id: user.id,
            sender_name: user.name,
            sender_company: user.company,
            current_approver_id: approver?.id ?? null,
            approver_line: approver?.id ? [approver.id] : [],
            type: '양식신청',
            title: `${selectedForm} 신청`,
            content: `신청자: ${user.name}\n대상자: ${user.name}\n용도: ${purpose}\n긴급도: ${urgency}`,
            meta_data: {
              form_type: selectedForm,
              target_staff: user.id,
              purpose,
              urgency,
              auto_issue: true,
              cc_departments: ['행정팀'],
            },
            status: '대기',
          },
        ])
        .select()
        .single();

      if (error) throw error;

      alert('양식 신청이 완료되었습니다. 결재자의 확인을 기다려주세요.');
      setPurpose('');
      setUrgency('일반');
    } catch (error) {
      console.error('양식 신청 실패:', error);
      alert('양식 신청 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="form-request-view"
      className="bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm p-8 space-y-8 rounded-3xl animate-in fade-in duration-500"
    >
      <header className="border-b pb-4">
        <h3 className="text-lg font-semibold text-[var(--foreground)] tracking-tight">양식 신청</h3>
        <p className="text-[11px] text-[var(--toss-blue)] font-bold uppercase tracking-widest mt-1">
          최종 승인 후 자동 발급
        </p>
      </header>

      <div className="space-y-6">
        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest">
            1. 신청 양식 선택
          </label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {forms.map((form, index) => (
              <button
                key={form.id}
                type="button"
                data-testid={`form-request-type-${index}`}
                onClick={() => setSelectedForm(form.id)}
                className={`rounded-[12px] border-2 p-4 text-left transition-all ${
                  selectedForm === form.id
                    ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]'
                    : 'border-[var(--toss-border)] hover:border-[var(--toss-gray-3)]'
                }`}
              >
                <p className="text-xs font-semibold text-[var(--foreground)]">{form.label}</p>
                <p className="mt-1 text-[11px] font-bold text-[var(--toss-gray-3)]">{form.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest">
            2. 신청 대상 직원
          </label>
          <div className="w-full rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-gray-1)] p-4 text-sm font-bold text-[var(--foreground)]">
            {user?.name} ({user?.position || '직원'}) - 본인 계정으로만 증명서를 신청할 수 있습니다.
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest">
            3. 신청 용도
          </label>
          <textarea
            data-testid="form-request-purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="신청 용도를 입력해주세요. 예: 금융기관 제출용, 재직 확인용"
            className="h-24 w-full resize-none rounded-[12px] bg-[var(--toss-gray-1)] p-4 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
          />
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest">
            4. 긴급도
          </label>
          <div className="flex gap-3">
            {URGENCY_LEVELS.map((level, index) => (
              <button
                key={level}
                type="button"
                data-testid={`form-request-urgency-${index}`}
                onClick={() => setUrgency(level)}
                className={`rounded-[16px] px-4 py-2 text-xs font-semibold transition-all ${
                  urgency === level
                    ? 'bg-[var(--toss-blue)] text-white shadow-lg'
                    : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]/80'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          data-testid="form-request-submit"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-[16px] bg-black py-5 text-sm font-semibold text-white shadow-2xl transition-all hover:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? '신청 중...' : '양식 신청'}
        </button>
      </div>

      <div className="space-y-2 rounded-[12px] border border-[var(--toss-blue)]/30 bg-[var(--toss-blue-light)] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--toss-blue)]">
          자동 발급 안내
        </p>
        <p className="text-xs font-bold leading-relaxed text-[var(--toss-blue)]">
          최종 결재가 승인되면 선택한 양식이 자동으로 생성되어 행정팀에서 발급 처리합니다.
        </p>
      </div>
    </div>
  );
}
