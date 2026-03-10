'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

interface StaffStat {
  staff: any;
  lateCount: number;
  earlyLeaveCount: number;
  avgLateMin: number;
  grade: '정상' | '주의' | '경고';
}

const PERIOD_MONTHS: Record<'1개월' | '3개월' | '6개월', number> = {
  '1개월': 1,
  '3개월': 3,
  '6개월': 6,
};

export default function LatenessPatternAnalysis({ staffs, selectedCo }: Props) {
  const [period, setPeriod] = useState<'1개월' | '3개월' | '6개월'>('1개월');
  const [stats, setStats] = useState<StaffStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const filteredStaffs = useMemo(
    () => (selectedCo === '전체' ? staffs : staffs.filter((staff: any) => staff.company === selectedCo)),
    [selectedCo, staffs],
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        const since = new Date();
        since.setMonth(since.getMonth() - PERIOD_MONTHS[period]);

        const staffIds = filteredStaffs.map((staff: any) => staff.id);
        if (staffIds.length === 0) {
          setStats([]);
          return;
        }

        const { data } = await supabase
          .from('attendance_records')
          .select('staff_id, late_minutes, early_leave_minutes, work_date')
          .in('staff_id', staffIds)
          .gte('work_date', since.toISOString().slice(0, 10));

        const records = data || [];
        const result = filteredStaffs.map((staff: any) => {
          const staffRecords = records.filter((record: any) => String(record.staff_id) === String(staff.id));
          const lateRecords = staffRecords.filter((record: any) => Number(record.late_minutes || 0) > 0);
          const earlyLeaveRecords = staffRecords.filter((record: any) => Number(record.early_leave_minutes || 0) > 0);
          const lateCount = lateRecords.length;
          const avgLateMin = lateCount > 0
            ? Math.round(lateRecords.reduce((sum: number, record: any) => sum + Number(record.late_minutes || 0), 0) / lateCount)
            : 0;
          const monthlyLate = lateCount / PERIOD_MONTHS[period];
          const grade: StaffStat['grade'] =
            monthlyLate >= 5 ? '경고' : monthlyLate >= 3 ? '주의' : '정상';

          return {
            staff,
            lateCount,
            earlyLeaveCount: earlyLeaveRecords.length,
            avgLateMin,
            grade,
          };
        });

        setStats(result.sort((a, b) => b.lateCount - a.lateCount));
      } catch (error) {
        console.error('지각 분석 데이터 조회 실패:', error);
        setStats([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filteredStaffs, period]);

  const maxLateCount = Math.max(...stats.map((item) => item.lateCount), 1);

  const departmentStats = useMemo(() => {
    const map: Record<string, { late: number; total: number }> = {};

    stats.forEach((item) => {
      const department = item.staff.department || '기타';
      if (!map[department]) {
        map[department] = { late: 0, total: 0 };
      }

      map[department].total += 1;
      if (item.lateCount > 0) {
        map[department].late += 1;
      }
    });

    return Object.entries(map);
  }, [stats]);

  const gradeColor = (grade: StaffStat['grade']) => {
    if (grade === '경고') return 'text-red-600 bg-red-50';
    if (grade === '주의') return 'text-amber-600 bg-amber-50';
    return 'text-green-600 bg-green-50';
  };

  const handleSendAlert = async () => {
    const targets = stats.filter((item) => item.lateCount >= 3);
    if (targets.length === 0) {
      alert('3회 이상 지각한 직원이 없습니다.');
      return;
    }

    if (!confirm(`${targets.length}명에게 지각 경고 알림을 보낼까요?`)) return;
    setSending(true);

    try {
      await supabase.from('notifications').insert(
        targets.map((target) => ({
          user_id: target.staff.id,
          title: '지각 경고 알림',
          body: `최근 ${period} 동안 ${target.lateCount}회 지각이 확인되었습니다. 근태 기록을 확인해 주세요.`,
          type: 'attendance',
          read_at: null,
          created_at: new Date().toISOString(),
        })),
      );

      alert('알림을 발송했습니다.');
    } catch (error) {
      console.error('지각 경고 알림 발송 실패:', error);
      alert('알림 발송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6" data-testid="attendance-analysis-lateness">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">지각 / 조퇴 패턴 분석</h2>
          <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
            기간별 지각, 조퇴 통계를 집계하고 주의 직원을 빠르게 찾습니다.
          </p>
        </div>
        <div className="flex gap-2">
          {(Object.keys(PERIOD_MONTHS) as Array<keyof typeof PERIOD_MONTHS>).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              className={`rounded-[8px] px-3 py-1.5 text-xs font-bold ${
                period === item
                  ? 'bg-[var(--toss-blue)] text-white'
                  : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--foreground)]">부서별 지각률</h3>
          <button
            type="button"
            onClick={handleSendAlert}
            disabled={sending}
            className="rounded-[8px] bg-[var(--toss-blue)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? '발송 중...' : '경고 알림 발송'}
          </button>
        </div>

        <div className="space-y-2">
          {departmentStats.length === 0 ? (
            <p className="text-xs text-[var(--toss-gray-3)]">표시할 데이터가 없습니다.</p>
          ) : (
            departmentStats.map(([department, info]) => {
              const rate = info.total > 0 ? Math.round((info.late / info.total) * 100) : 0;
              return (
                <div key={department} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-xs font-bold text-[var(--toss-gray-4)]">
                    {department}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--toss-gray-1)]">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${rate}%` }} />
                  </div>
                  <span className="w-16 text-right text-xs font-bold text-[var(--toss-gray-4)]">
                    {rate}% ({info.late}/{info.total})
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--toss-gray-3)]">분석 중...</div>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-[var(--toss-border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--toss-gray-1)]">
                <th className="p-2 text-left font-bold text-[var(--toss-gray-4)]">직원명</th>
                <th className="p-2 text-center font-bold text-[var(--toss-gray-4)]">지각 횟수</th>
                <th className="p-2 text-center font-bold text-[var(--toss-gray-4)]">조퇴 횟수</th>
                <th className="p-2 text-center font-bold text-[var(--toss-gray-4)]">평균 지각분</th>
                <th className="p-2 text-center font-bold text-[var(--toss-gray-4)]">지각 비중</th>
                <th className="p-2 text-center font-bold text-[var(--toss-gray-4)]">등급</th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[var(--toss-gray-3)]">
                    표시할 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                stats.map((item) => (
                  <tr key={item.staff.id} className="border-t border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)]/50">
                    <td className="p-2 font-bold text-[var(--foreground)]">{item.staff.name}</td>
                    <td className="p-2 text-center font-bold">{item.lateCount}</td>
                    <td className="p-2 text-center">{item.earlyLeaveCount}</td>
                    <td className="p-2 text-center">{item.avgLateMin}분</td>
                    <td className="p-2">
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--toss-gray-1)]">
                        <div
                          className="h-full rounded-full bg-amber-400"
                          style={{ width: `${Math.min((item.lateCount / maxLateCount) * 100, 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${gradeColor(item.grade)}`}>
                        {item.grade}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
