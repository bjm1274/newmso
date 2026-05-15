'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useIsMobile } from '@/app/components/useIsMobile';
import { DesktopOnlyNotice } from '@/app/components/DesktopOnlyNotice';

export default function NotificationAutomation(props: Record<string, unknown>) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DesktopOnlyNotice feature="알림 자동화 설정" />;
  }
  return <NotificationAutomationDesktop {...props} />;
}

function NotificationAutomationDesktop({ user: userRaw }: Record<string, unknown>) {
  const user = userRaw as Record<string, unknown> | undefined;
  const [payrollDay, setPayrollDay] = useState(25);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const checkAndSend = async () => {
      if (!enabled || !user?.['id']) return;
      const today = new Date();
      const day = today.getDate();
      const todayYmd = today.toISOString().slice(0, 10);
      const currentYear = today.getFullYear();

      const { data: staffsData } = await supabase
        .from('staff_members')
        .select('id, name, company, annual_leave_total, annual_leave_used, hire_date, join_date, joined_at');
      const { data: admins } = await supabase
        .from('staff_members')
        .select('id')
        .eq('role', 'admin');

      // 1) 급여 정산일 안내 (매월 N일)
      if (day === payrollDay) {
        for (const a of admins || []) {
          await supabase.from('notifications').insert({
            user_id: a.id,
            type: '급여일알림',
            title: '급여 정산일',
            body: '오늘은 급여 정산일입니다. 정산 및 전송을 확인해주세요.',
            read_at: null,
          });
        }
      }

      // 2) 연차 촉진 자동 알림 (근로기준법 제61조)
      // 개인별 입사일 기반 연차 만료일에서 6개월 전(1차), 2개월 전(2차) 촉진
      const { getStaffPromotionSchedule } = await import('@/lib/annual-leave-promotion');
      const todayObj = new Date(`${todayYmd}T00:00:00`);

      // 이미 보낸 기록 조회 (올해 전체)
      const { data: logs } = await supabase
        .from('annual_leave_promotion_logs')
        .select('*')
        .eq('target_year', currentYear);

      const sentSet = new Set(
        (logs || []).map((l: any) => `${l.staff_id}_${l.step}`),
      );

      for (const s of staffsData || []) {
        const hireDate = s.hire_date || s.join_date || s.joined_at;
        const schedule = getStaffPromotionSchedule(hireDate, todayObj);
        if (!schedule) continue;

        const total = s.annual_leave_total ?? 0;
        const used = s.annual_leave_used ?? 0;
        const remain = total - used;
        if (remain <= 0) continue;

        // 1차 촉진: 만료 6개월 전
        const step1Key = schedule.step1Date.toISOString().slice(0, 10);
        // 2차 촉진: 만료 2개월 전
        const step2Key = schedule.step2Date.toISOString().slice(0, 10);

        let stepToday = 0;
        if (step1Key === todayYmd && !sentSet.has(`${s.id}_1`)) stepToday = 1;
        else if (step2Key === todayYmd && !sentSet.has(`${s.id}_2`)) stepToday = 2;

        if (stepToday === 0) continue;

        const title =
          stepToday === 1 ? '연차 사용 촉진 1차 안내' : '연차 사용 촉진 2차 안내';
        const expiryLabel = schedule.expiryDate.toLocaleDateString('ko-KR');
        const body =
          stepToday === 1
            ? `잔여 연차 ${remain}일이 남아 있습니다. 연차 만료일(${expiryLabel}) 전에 사용계획을 작성해 주세요. (근로기준법 제61조 1차 촉진)`
            : `잔여 연차 ${remain}일이 남아 있습니다. 연차 만료일(${expiryLabel}) 전에 사용하지 않으면 소멸될 수 있습니다. (근로기준법 제61조 2차 촉진)`;

        await supabase.from('notifications').insert({
          user_id: s.id,
          type: '연차촉진',
          title,
          body,
          read_at: null,
        });

        await supabase.from('annual_leave_promotion_logs').insert({
          staff_id: s.id,
          company_name: s.company || null,
          target_year: schedule.targetYear,
          step: stepToday,
          remain_days: remain,
          meta: { sent_by: user?.['id'] as string, today: todayYmd, expiry_date: expiryLabel },
        });
      }
    };

    // 데모 환경에서는 관리자 화면이 열려 있는 동안만 1일 간격으로 체크
    const t = setInterval(checkAndSend, 24 * 60 * 60 * 1000);
    checkAndSend();
    return () => clearInterval(t);
  }, [enabled, payrollDay, user?.['id']]);

  return (
    <div className="bg-[var(--card)] p-4 border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm max-w-xl space-y-3">
      <div>
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-2">알림 자동화</h3>
      </div>
      <div className="space-y-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="w-5 h-5 accent-blue-600"
          />
          <span className="font-bold text-sm">알림 자동화 활성화</span>
        </label>
        <div>
          <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">
            급여 정산 알림일 (매월)
          </label>
          <input
            type="number"
            min={1}
            max={28}
            value={payrollDay}
            onChange={e =>
              setPayrollDay(parseInt(e.target.value, 10) || 25)
            }
            className="w-full p-2 mt-1 rounded-[var(--radius-md)] border font-bold"
          />
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--page-bg)] border border-[var(--border)] p-4 text-[11px] text-[var(--toss-gray-4)] space-y-1">
          <p className="font-bold text-[var(--foreground)] mb-1">연차 촉진 법적 기준</p>
          <p>- 기준: 연차휴가가 속한 연도의 종료일(12월 31일) 기준</p>
          <p>- 1차 촉진: 종료 6개월 전 일괄 안내 (예: 6월 말 기준)</p>
          <p>- 2차 촉진: 종료 2개월 전 일괄 안내 (예: 10월 말 기준)</p>
          <p className="mt-1 text-[11px] text-[var(--toss-gray-3)]">
            각 단계별로 발송한 내역은 `annual_leave_promotion_logs` 테이블에
            직원·연도·단계별로 기록됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
