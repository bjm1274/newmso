'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CERTIFICATE_TYPES } from '@/lib/certificate-types';

export default function FormRequest({ user, staffs }: any) {
  const [selectedForm, setSelectedForm] = useState('재직증명서');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [purpose, setPurpose] = useState('');
  const [urgency, setUrgency] = useState('일반');
  const [submitting, setSubmitting] = useState(false);

  const forms = CERTIFICATE_TYPES;

  const handleSubmit = async () => {
    if (!selectedStaff || !purpose) return alert('필수 항목을 입력해주세요.');
    
    setSubmitting(true);

    try {
      // 1. 결재 신청 생성
      const targetStaffName = staffs?.find((s: any) => s.id === selectedStaff)?.name || selectedStaff;
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
          target_staff: selectedStaff,
          purpose: purpose,
          urgency: urgency,
          auto_issue: true
        },
        status: '대기'
      }]).select().single();

      if (approvalError) throw approvalError;

      alert('양식 신청이 완료되었습니다. 결재자의 승인을 기다려주세요.');
      setSelectedStaff('');
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
    <div className="bg-white border border-gray-100 shadow-sm p-8 space-y-8 rounded-3xl animate-in fade-in duration-500">
      <header className="border-b pb-4">
        <h3 className="text-lg font-black text-gray-800 tracking-tighter italic">양식 신청 시스템</h3>
        <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mt-1">최종 승인 시 자동 발급</p>
      </header>

      <div className="space-y-6">
        {/* 양식 선택 */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">1. 신청 양식 선택</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {forms.map(form => (
              <button
                key={form.id}
                onClick={() => setSelectedForm(form.id)}
                className={`p-4 rounded-2xl border-2 transition-all text-left ${
                  selectedForm === form.id 
                    ? 'border-blue-600 bg-blue-50' 
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <p className="text-xs font-black text-gray-800">{form.label}</p>
                <p className="text-[9px] text-gray-400 font-bold mt-1">{form.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 신청 대상 */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">2. 신청 대상 직원</label>
          <select
            value={selectedStaff}
            onChange={e => setSelectedStaff(e.target.value)}
            className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-100"
          >
            <option value="">직원 선택...</option>
            {staffs?.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name} ({s.position})</option>
            ))}
          </select>
        </div>

        {/* 신청 용도 */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">3. 신청 용도</label>
          <textarea
            value={purpose}
            onChange={e => setPurpose(e.target.value)}
            placeholder="신청 용도를 입력해주세요. (예: 금융기관 제출용, 이직 준비 등)"
            className="w-full h-24 p-4 bg-gray-50 rounded-2xl border-none outline-none text-sm leading-relaxed focus:ring-2 focus:ring-blue-100 resize-none"
          />
        </div>

        {/* 긴급도 */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">4. 긴급도</label>
          <div className="flex gap-3">
            {['일반', '긴급', '매우긴급'].map(level => (
              <button
                key={level}
                onClick={() => setUrgency(level)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  urgency === level
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
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
          className="w-full py-5 bg-black text-white rounded-[2rem] font-black text-sm shadow-2xl hover:scale-[0.98] transition-all disabled:opacity-50"
        >
          {submitting ? '신청 중...' : '양식 신청 (결재 상신)'}
        </button>
      </div>

      {/* 안내 문구 */}
      <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 space-y-2">
        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">📌 자동 발급 안내</p>
        <p className="text-xs text-blue-700 font-bold leading-relaxed">
          최종 결재자가 승인하면, 시스템이 자동으로 해당 양식을 생성하여 행정팀에 발급됩니다. 
          긴급도에 따라 우선 처리됩니다.
        </p>
      </div>
    </div>
  );
}
