'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function PayrollEmailSender({ staffs, yearMonth }: any) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(0);

  const handleSendAll = async () => {
    if (!confirm(`${staffs.length}명에게 급여명세서 발송을 시도합니다. (이메일 API 연동 필요)`)) return;
    setLoading(true);
    try {
      for (const s of staffs) {
        await supabase.from('notifications').insert({
          user_id: s.id,
          type: '급여명세',
          title: `[${yearMonth}] 급여명세서`,
          body: `급여명세서가 발송되었습니다. 마이페이지에서 확인하세요.`,
          is_read: false
        });
      }
      setSent(staffs.length);
      alert('알림 발송 완료. (실제 이메일 발송은 Resend/SendGrid 등 API 연동 필요)');
    } catch (e) {
      alert('발송 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--toss-card)] p-5 border border-[var(--toss-border)] rounded-[12px] shadow-sm">
      <div className="pb-2 border-b border-[var(--toss-border)] mb-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">급여명세서 발송</h3>
        <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">정산 완료 후 직원 알림/이메일</p>
      </div>
      <button onClick={handleSendAll} disabled={loading || !staffs?.length} className="w-full py-3 bg-[var(--toss-blue)] text-white text-sm font-medium rounded-[12px] hover:opacity-90 disabled:opacity-50">
        {loading ? '발송 중...' : `전체 알림 발송 (${staffs?.length || 0}명)`}
      </button>
      {sent > 0 && <p className="text-xs text-emerald-600 mt-2 font-medium">{sent}건 발송 완료</p>}
    </div>
  );
}
