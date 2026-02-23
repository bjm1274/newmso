'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CERTIFICATE_TYPES } from '@/lib/certificate-types';

export default function FormRequest({ user, staffs }: any) {
  const [selectedForm, setSelectedForm] = useState('재직증명서');
  const [purpose, setPurpose] = useState('');
  const [urgency, setUrgency] = useState('일반');
  const [submitting, setSubmitting] = useState(false);

  const forms = CERTIFICATE_TYPES;

  const handleSubmit = async () => {
    if (!user?.id) {
      alert('로그인 정보가 올바르지 않습니다. 다시 로그인 후 이용해주세요.');
      return;
    }
    if (!purpose) return alert('신청 용도를 입력해주세요.');
    
    setSubmitting(true);

    try {
      // 1. 결재 신청 생성 (증명서 신청자는 항상 본인)
      const targetStaffId = user.id;
      const targetStaffName = user.name;
      const { data: approval, error: approvalError } = await supabase.from('approvals').insert([{
        sender_id: user.id,
        sender_name: user.name,
        sender_company: user.company,
        current_approver_id: staffs?.find((s: any) => s.position === '팀장' || s.position === '부장')?.id || null,
        type: '양식신청',
        title: `${selectedForm} 신청`,
        content: `신청자: ${targetStaffName}\n대상: ${targetStaffName}\n용도: ${purpose}\n긴급도: ${urgency}`,
        meta_data: {
          form_type: selectedForm,
          target_staff: targetStaffId,
          purpose: purpose,
          urgency: urgency,
          auto_issue: true,
          // 개인정보 보호: 증명서 발급은 행정팀만 참조
          cc_departments: ['행정팀'],
        },
        status: '대기'
      }]).select().single();

      if (approvalError) throw approvalError;

      alert('양식 신청이 완료되었습니다. 결재자의 승인을 기다려주세요.');
      setPurpose('');
      setUrgency('일반');
    } catch (error) {
      console.error('신청 실패:', error);
      alert('신청 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] shadow-sm p-8 space-y-8 rounded-3xl animate-in fade-in duration-500">
      <header className="border-b pb-4">
        <h3 className="text-lg font-semibold text-[var(--foreground)] tracking-tighter italic">양식 신청 시스템</h3>
        <p className="text-[11px] text-[var(--toss-blue)] font-bold uppercase tracking-widest mt-1">최종 승인 시 자동 발급</p>
      </header>

      <div className="space-y-6">
        {/* 양식 선택 */}
        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest">1. 신청 양식 선택</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {forms.map(form => (
              <button
                key={form.id}
                onClick={() => setSelectedForm(form.id)}
                className={`p-4 rounded-[12px] border-2 transition-all text-left ${
                  selectedForm === form.id 
                    ? 'border-[var(--toss-blue)] bg-[var(--toss-blue-light)]' 
                    : 'border-[var(--toss-border)] hover:border-[var(--toss-gray-3)]'
                }`}
              >
                <p className="text-xs font-semibold text-[var(--foreground)]">{form.label}</p>
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1">{form.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 신청 대상 - 본인만 가능 (개인정보 보호) */}
        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest">2. 신청 대상 직원</label>
          <div className="w-full p-4 bg-[var(--toss-gray-1)] rounded-[12px] border border-[var(--toss-border)] text-sm font-bold text-[var(--foreground)]">
            {user?.name} ({user?.position || '직원'}) – 본인 계정으로만 증명서를 신청할 수 있습니다.
          </div>
        </div>

        {/* 신청 용도 */}
        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest">3. 신청 용도</label>
          <textarea
            value={purpose}
            onChange={e => setPurpose(e.target.value)}
            placeholder="신청 용도를 입력해주세요. (예: 금융기관 제출용, 이직 준비 등)"
            className="w-full h-24 p-4 bg-[var(--toss-gray-1)] rounded-[12px] border-none outline-none text-sm leading-relaxed focus:ring-2 focus:ring-[var(--toss-blue)]/20 resize-none"
          />
        </div>

        {/* 긴급도 */}
        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest">4. 긴급도</label>
          <div className="flex gap-3">
            {['일반', '긴급', '매우긴급'].map(level => (
              <button
                key={level}
                onClick={() => setUrgency(level)}
                className={`px-4 py-2 rounded-[16px] text-xs font-semibold transition-all ${
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

        {/* 신청 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-5 bg-black text-white rounded-[16px] font-semibold text-sm shadow-2xl hover:scale-[0.98] transition-all disabled:opacity-50"
        >
          {submitting ? '신청 중...' : '양식 신청 (결재 상신)'}
        </button>
      </div>

      {/* 안내 문구 */}
      <div className="bg-[var(--toss-blue-light)] p-6 rounded-[12px] border border-[var(--toss-blue)]/30 space-y-2">
        <p className="text-[11px] font-semibold text-[var(--toss-blue)] uppercase tracking-widest">📌 자동 발급 안내</p>
        <p className="text-xs text-[var(--toss-blue)] font-bold leading-relaxed">
          최종 결재자가 승인하면, 시스템이 자동으로 해당 양식을 생성하여 행정팀에 발급됩니다. 
          긴급도에 따라 우선 처리됩니다.
        </p>
      </div>
    </div>
  );
}
