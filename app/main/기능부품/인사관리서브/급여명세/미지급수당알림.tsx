'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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

export default function UnpaidAllowanceAlert({ staffs, selectedCo, user }: Props) {
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

        const [payrollRes, attendRes] = await Promise.all([
          supabase.from('payroll_records').select('*').in('year_month', months).in('staff_id', staffIds),
          supabase.from('attendance_records').select('*').in('staff_id', staffIds).gte('work_date', months[0] + '-01'),
        ]);

        const payrolls = payrollRes.data || [];
        const attendance = attendRes.data || [];

        const newAlerts: AlertItem[] = [];

        for (const staff of filtered) {
          const staffPayrolls = payrolls.filter((p: any) => String(p.staff_id) === String(staff.id));
          const staffAttend = attendance.filter((a: any) => String(a.staff_id) === String(staff.id));

          const totalOT = staffAttend.reduce((s: number, a: any) => s + (a.overtime_hours || a.ot_hours || 0), 0);
          const totalNight = staffAttend.reduce((s: number, a: any) => s + (a.night_hours || 0), 0);
          const totalHoliday = staffAttend.reduce((s: number, a: any) => s + (a.holiday_hours || 0), 0);

          const paidOT = staffPayrolls.reduce((s: number, p: any) => s + ((p.meta_data?.overtime_pay || p.overtime_pay || 0) > 0 ? 1 : 0), 0);

          const baseSalary = staff.base_salary || staff.base || 2000000;
          const hourlyWage = baseSalary / 209;

          if (totalOT > 0 && paidOT === 0) {
            const pay = Math.round(hourlyWage * 1.5 * totalOT);
            newAlerts.push({
              staff,
              type: 'OT 수당',
              hours: totalOT,
              estimatedPay: pay,
              severity: totalOT >= 20 ? '높음' : totalOT >= 10 ? '중간' : '낮음',
            });
          }
          if (totalNight > 0) {
            const pay = Math.round(hourlyWage * 0.5 * totalNight);
            newAlerts.push({
              staff,
              type: '야간 수당',
              hours: totalNight,
              estimatedPay: pay,
              severity: totalNight >= 20 ? '높음' : '낮음',
            });
          }
          if (totalHoliday > 0) {
            const pay = Math.round(hourlyWage * 1.5 * totalHoliday);
            newAlerts.push({
              staff,
              type: '휴일 수당',
              hours: totalHoliday,
              estimatedPay: pay,
              severity: totalHoliday >= 10 ? '중간' : '낮음',
            });
          }
        }
        setAlerts(newAlerts);
      } catch {
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedCo]);

  const handleApply = async (item: AlertItem) => {
    if (!confirm(`${item.staff.name}의 ${item.type} 미지급 건을 결재 상신하시겠습니까?`)) return;
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
    s === '높음' ? 'bg-red-100 text-red-700 border-red-200' :
    s === '중간' ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-blue-50 text-blue-700 border-blue-200';

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  return (
    <div className="p-4 md:p-4 space-y-5 max-w-4xl mx-auto">
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
              <button
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
