'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { useActionDialog } from '@/app/components/useActionDialog';
import { supabase } from '@/lib/supabase';
import { calculateHourlyRateFromMonthlySalary, resolveWeeklyWorkingHours } from '@/lib/payroll-working-hours';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

interface AlertItem {
  staff: any;
  type: string;
  hours: number;
  estimatedPay: number;
  severity: '높음' | '중간' | '낮음';
}

// 야간 근로 시간 (22:00 ~ 익일 06:00 사이) 계산 유틸리티
function calculateNightHours(checkInStr: string | null, checkOutStr: string | null): number {
  if (!checkInStr || !checkOutStr) return 0;
  const checkIn = new Date(checkInStr);
  const checkOut = new Date(checkOutStr);
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) return 0;
  if (checkOut <= checkIn) return 0;

  let nightMinutes = 0;
  let current = new Date(checkIn.getTime());
  while (current < checkOut) {
    const hour = current.getHours();
    if (hour >= 22 || hour < 6) {
      nightMinutes++;
    }
    current.setTime(current.getTime() + 60000); // 1분 단위
  }
  return Math.round((nightMinutes / 60) * 10) / 10;
}

export default function UnpaidAllowanceAlert({ staffs, selectedCo, user }: Props) {
  const { dialog, openConfirm } = useActionDialog();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const staffIds = filtered.map((s: any) => s.id);
        if (staffIds.length === 0) { setAlerts([]); setLoading(false); return; }

        // 최근 3개월 날짜 계산
        const now = new Date();
        const months: string[] = [];
        for (let i = 2; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }

        const ruleCompany = selectedCo === '전체' ? '전체' : selectedCo;

        const [payrollRes, attendRes, holidayRes] = await Promise.all([
          supabase.from('payroll_records').select('*').in('year_month', months).in('staff_id', staffIds),
          supabase.from('attendances').select('*').in('staff_id', staffIds).gte('work_date', months[0] + '-01'),
          supabase.from('company_holidays').select('*').gte('holiday_date', months[0] + '-01'),
        ]);

        const payrolls = payrollRes.data || [];
        const attendance = attendRes.data || [];
        const holidays = holidayRes.data || [];

        const holidaysSet = new Set(
          holidays
            .filter((h: any) => h.company_name === '전체' || h.company_name === ruleCompany)
            .map((h: any) => String(h.holiday_date).slice(0, 10))
        );

        const newAlerts: AlertItem[] = [];

        for (const staff of filtered) {
          const staffPayrolls = payrolls.filter((p: any) => String(p.staff_id) === String(staff.id));
          const staffAttend = attendance.filter((a: any) => String(a.staff_id) === String(staff.id));

          // 1. 연장 근무 시간 집계 (하루 실근로시간 8시간 초과분을 누적)
          const totalOT = staffAttend.reduce((s: number, a: any) => {
            const workMins = a.work_hours_minutes || 0;
            const otMins = workMins > 480 ? workMins - 480 : 0;
            return s + (otMins / 60);
          }, 0);

          // 2. 야간 근무 시간 집계
          const totalNight = staffAttend.reduce((s: number, a: any) => {
            const nightH = calculateNightHours(a.check_in_time, a.check_out_time);
            return s + nightH;
          }, 0);

          // 3. 휴일 근무 시간 집계
          const totalHoliday = staffAttend.reduce((s: number, a: any) => {
            const d = new Date(a.work_date);
            const dayOfWeek = d.getDay();
            const isSunday = dayOfWeek === 0;
            const isSaturday = dayOfWeek === 6;
            const isHoliday = isSunday || isSaturday || holidaysSet.has(a.work_date);

            if (isHoliday) {
              const workHours = (a.work_hours_minutes || 0) / 60;
              return s + workHours;
            }
            return s;
          }, 0);

          // 급여대장에서 연장수당(overtime_pay) 및 야간당직수당(night_duty_allowance) 지급 여부 확인
          const paidOT = staffPayrolls.reduce((s: number, p: any) => s + ((p.overtime_pay || 0) > 0 ? 1 : 0), 0);
          const paidNight = staffPayrolls.reduce((s: number, p: any) => s + ((p.night_duty_allowance || 0) > 0 ? 1 : 0), 0);

          const baseSalary = staff.base_salary || staff.base || 2000000;
          const hourlyWage = calculateHourlyRateFromMonthlySalary(
            baseSalary,
            resolveWeeklyWorkingHours(staff, 40),
          );

          if (totalOT > 0 && paidOT === 0) {
            const roundedOT = Math.round(totalOT * 10) / 10;
            if (roundedOT > 0) {
              const pay = Math.round(hourlyWage * 1.5 * roundedOT);
              newAlerts.push({
                staff,
                type: 'OT 수당',
                hours: roundedOT,
                estimatedPay: pay,
                severity: roundedOT >= 20 ? '높음' : roundedOT >= 10 ? '중간' : '낮음',
              });
            }
          }

          if (totalNight > 0 && paidNight === 0) {
            const roundedNight = Math.round(totalNight * 10) / 10;
            if (roundedNight > 0) {
              const pay = Math.round(hourlyWage * 0.5 * roundedNight);
              newAlerts.push({
                staff,
                type: '야간 수당',
                hours: roundedNight,
                estimatedPay: pay,
                severity: roundedNight >= 20 ? '높음' : '낮음',
              });
            }
          }

          if (totalHoliday > 0 && paidOT === 0) {
            // 휴일수당은 실무상 overtime_pay에 합산되거나 별도로 취급되므로, paidOT가 0일 때 감지
            const roundedHoliday = Math.round(totalHoliday * 10) / 10;
            if (roundedHoliday > 0) {
              const pay = Math.round(hourlyWage * 1.5 * roundedHoliday);
              newAlerts.push({
                staff,
                type: '휴일 수당',
                hours: roundedHoliday,
                estimatedPay: pay,
                severity: roundedHoliday >= 10 ? '중간' : '낮음',
              });
            }
          }
        }
        setAlerts(newAlerts);
      } catch (error) {
        console.error('fetchData error in UnpaidAllowanceAlert:', error);
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedCo, filtered]);

  const handleApply = async (item: AlertItem) => {
    const confirmed = await openConfirm({
      title: '미지급 수당 결재 상신',
      description: `${item.staff.name}의 ${item.type} 미지급 건을 결재 상신합니다.\n추정 금액 ${item.estimatedPay.toLocaleString('ko-KR')}원이 포함됩니다.`,
      confirmText: '상신',
      tone: 'accent',
    });
    if (!confirmed) return;
    setSubmitting(`${item.staff.id}_${item.type}`);
    try {
      await supabase.from('approvals').insert({
        type: '수당지급신청',
        title: `[미지급수당] ${item.staff.name} - ${item.type} ${item.hours}시간`,
        content: `미지급 ${item.type}: ${item.hours}시간, 추정 금액: ${item.estimatedPay.toLocaleString('ko-KR')}원`,
        sender_id: user?.id,
        sender_name: user?.name || user?.email,
        status: '대기',
        company: item.staff.company,
      });
      toast('결재 상신이 완료되었습니다.', 'success');
    } catch {
      toast('결재 상신에 실패했습니다.', 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const severityColor = (s: string) =>
    s === '높음' ? 'bg-red-500/20 text-red-700 border-red-500/20' :
    s === '중간' ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-blue-500/10 text-blue-700 border-blue-500/20';

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  return (
    <div className="p-4 md:p-4 space-y-5 max-w-4xl mx-auto">
      {dialog}
      <div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">장기 미지급 수당 알림</h2>
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-[var(--toss-gray-3)]">분석 중...</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-8 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)]">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-sm font-bold text-[var(--toss-gray-4)]">미지급 수당이 감지되지 않았습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((item, i) => (
            <div key={i} className={`p-4 rounded-[var(--radius-md)] border ${severityColor(item.severity)} flex flex-col sm:flex-row sm:items-center gap-3`}>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold">{item.staff.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${severityColor(item.severity)}`}>{item.severity}</span>
                </div>
                <p className="text-xs font-bold">{item.type} · {item.hours}시간</p>
                <p className="text-xs mt-0.5">추정 미지급액: <strong>{fmt(item.estimatedPay)}원</strong></p>
              </div>
              <button type="button"
                onClick={() => handleApply(item)}
                disabled={submitting === `${item.staff.id}_${item.type}`}
                className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50 shrink-0"
              >
                {submitting === `${item.staff.id}_${item.type}` ? '처리중...' : '결재 상신'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
