'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function NotificationAutomation({ user }: any) {
  const [payrollDay, setPayrollDay] = useState(25);
  const [leaveReminderDays, setLeaveReminderDays] = useState(30);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const checkAndSend = async () => {
      if (!enabled || !user?.id) return;
      const today = new Date();
      const day = today.getDate();
      const { data: staffsData } = await supabase.from('staff_members').select('id, name, annual_leave_total, annual_leave_used');
      const { data: admins } = await supabase.from('staff_members').select('id').eq('role', 'admin');

      if (day === payrollDay) {
        for (const a of admins || []) {
          await supabase.from('notifications').insert({ user_id: a.id, type: '급여일알림', title: '급여 정산일', body: `오늘은 급여 정산일입니다.`, is_read: false });
        }
      }

      for (const s of staffsData || []) {
        const remain = (s.annual_leave_total || 15) - (s.annual_leave_used || 0);
        if (remain >= leaveReminderDays) {
          await supabase.from('notifications').insert({
            user_id: s.id, type: '연차촉진', title: '연차 사용 권고',
            body: `잔여 연차 ${remain}일. 근로기준법 제61조에 따라 사용을 권고드립니다.`, is_read: false
          });
        }
      }
    };

    const t = setInterval(checkAndSend, 24 * 60 * 60 * 1000);
    checkAndSend();
    return () => clearInterval(t);
  }, [enabled, payrollDay, leaveReminderDays, user?.id]);

  return (
    <div className="bg-white p-8 border border-gray-100 rounded-2xl shadow-xl max-w-lg">
      <h3 className="text-xl font-black text-gray-900 mb-2">알림 자동화</h3>
      <p className="text-xs text-gray-500 font-bold mb-6">급여일·연차촉진 등 예약 알림 (매일 자정 체크)</p>
      <div className="space-y-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-5 h-5 accent-blue-600" />
          <span className="font-bold text-sm">알림 자동화 활성화</span>
        </label>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase">급여 정산 알림일 (매월)</label>
          <input type="number" min={1} max={28} value={payrollDay} onChange={e => setPayrollDay(parseInt(e.target.value, 10) || 25)} className="w-full p-4 mt-1 rounded-xl border font-bold" />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase">연차 촉진 기준 (잔여 N일 이상 시)</label>
          <input type="number" min={1} max={365} value={leaveReminderDays} onChange={e => setLeaveReminderDays(parseInt(e.target.value, 10) || 30)} className="w-full p-4 mt-1 rounded-xl border font-bold" />
        </div>
      </div>
    </div>
  );
}
