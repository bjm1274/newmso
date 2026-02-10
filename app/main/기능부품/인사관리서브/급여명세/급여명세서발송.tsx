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
    <div className="bg-white p-6 border border-gray-100 rounded-2xl shadow-xl">
      <h3 className="text-lg font-black text-gray-900 mb-2">급여명세서 발송</h3>
      <p className="text-xs text-gray-500 font-bold mb-4">정산 완료 후 직원에게 알림/이메일 발송</p>
      <button onClick={handleSendAll} disabled={loading || !staffs?.length} className="w-full py-4 bg-blue-600 text-white font-black rounded-xl disabled:opacity-50">
        {loading ? '발송 중...' : `전체 알림 발송 (${staffs?.length || 0}명)`}
      </button>
      {sent > 0 && <p className="text-[10px] text-green-600 mt-2 font-bold">{sent}건 발송 완료</p>}
    </div>
  );
}
