'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import SmartMonthPicker from '../../공통/SmartMonthPicker';
import {
  detectAttendanceAnomalies,
  type AttendanceAnomaly,
  type AttendanceAnomalyAttendance,
  type AttendanceAnomalyLeave,
  type AttendanceAnomalyShift,
  type AttendanceAnomalyStaff,
} from '@/lib/attendance-anomalies';
import { loadLeavePolicySettings, type LeavePolicySettings } from '@/lib/leave-policy-settings';

type StaffLite = AttendanceAnomalyStaff & {
  status?: string;
};

type AttendanceAnomalyPanelProps = {
  staffs: StaffLite[];
  selectedCo: string;
};

function getTone(severity: AttendanceAnomaly['severity']) {
  switch (severity) {
    case 'critical':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'warning':
      return 'border-orange-200 bg-orange-50 text-orange-700';
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700';
  }
}

export default function AttendanceAnomalyPanel({ staffs, selectedCo }: AttendanceAnomalyPanelProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [policy, setPolicy] = useState<LeavePolicySettings | null>(null);
  const [anomalies, setAnomalies] = useState<AttendanceAnomaly[]>([]);
  const [loading, setLoading] = useState(false);

  const filteredStaffs = useMemo(
    () =>
      staffs.filter((staff) => {
        if (selectedCo !== '전체' && staff.company !== selectedCo) return false;
        return staff.status !== '퇴사';
      }),
    [selectedCo, staffs]
  );

  useEffect(() => {
    let active = true;

    const fetchPolicy = async () => {
      const loaded = await loadLeavePolicySettings(selectedCo || '전체');
      if (active) setPolicy(loaded);
    };

    void fetchPolicy();
    return () => {
      active = false;
    };
  }, [selectedCo]);

  useEffect(() => {
    let active = true;

    const fetchAnomalies = async () => {
      if (!policy) return;
      setLoading(true);
      try {
        const staffIds = filteredStaffs.map((staff) => staff.id);
        if (staffIds.length === 0) {
          if (active) setAnomalies([]);
          return;
        }

        const [year, month] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const startDate = `${selectedMonth}-01`;
        const endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

        const [
          { data: attendanceRows, error: attendanceError },
          { data: shiftRows, error: shiftError },
          { data: leaveRows, error: leaveError },
        ] = await Promise.all([
          supabase
            .from('attendances')
            .select('staff_id, work_date, status, check_in_time, check_out_time, late_minutes, early_leave_minutes')
            .in('staff_id', staffIds)
            .gte('work_date', startDate)
            .lte('work_date', endDate),
          supabase
            .from('shift_assignments')
            .select('staff_id, work_date, shift_id')
            .in('staff_id', staffIds)
            .gte('work_date', startDate)
            .lte('work_date', endDate),
          supabase
            .from('leave_requests')
            .select('staff_id, start_date, end_date, status, leave_type')
            .in('staff_id', staffIds)
            .lte('start_date', endDate)
            .gte('end_date', startDate),
        ]);

        if (attendanceError) throw attendanceError;
        if (shiftError) throw shiftError;
        if (leaveError) throw leaveError;

        const detected = detectAttendanceAnomalies({
          staffs: filteredStaffs as AttendanceAnomalyStaff[],
          attendances: (attendanceRows || []) as AttendanceAnomalyAttendance[],
          shiftAssignments: (shiftRows || []) as AttendanceAnomalyShift[],
          approvedLeaves: (leaveRows || []) as AttendanceAnomalyLeave[],
          policy,
        });

        if (active) setAnomalies(detected);
      } catch (error) {
        console.error('근태 이상 탐지 조회 실패:', error);
        if (active) setAnomalies([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchAnomalies();
    return () => {
      active = false;
    };
  }, [filteredStaffs, policy, selectedMonth]);

  const summary = useMemo(
    () => ({
      critical: anomalies.filter((item) => item.severity === 'critical').length,
      warning: anomalies.filter((item) => item.severity === 'warning').length,
      review: anomalies.filter((item) => item.severity === 'review').length,
    }),
    [anomalies]
  );

  return (
    <div className="space-y-4" data-testid="attendance-anomaly-panel-view">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">근태 이상 탐지</h3>
            <p className="mt-1 text-xs font-medium text-[var(--toss-gray-4)]">
              무단 결근, 미퇴근, 과도한 지각/조퇴, 휴가 중 출근 같은 이상 징후를 자동으로 찾습니다.
            </p>
          </div>
          <SmartMonthPicker
            value={selectedMonth}
            onChange={setSelectedMonth}
            className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <p className="text-[11px] font-bold text-red-600">Critical</p>
          <p className="mt-2 text-2xl font-bold text-red-700">{summary.critical}</p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
          <p className="text-[11px] font-bold text-orange-600">Warning</p>
          <p className="mt-2 text-2xl font-bold text-orange-700">{summary.warning}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <p className="text-[11px] font-bold text-blue-600">Review</p>
          <p className="mt-2 text-2xl font-bold text-blue-700">{summary.review}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h4 className="text-sm font-bold text-[var(--foreground)]">이상 징후 목록</h4>
        </div>
        <div className="space-y-3 p-4">
          {anomalies.map((anomaly) => (
            <div key={anomaly.id} className={`rounded-xl border p-4 ${getTone(anomaly.severity)}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">{anomaly.summary}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--toss-gray-4)]">
                    {anomaly.staffName} · {anomaly.department || '부서 미지정'} · {anomaly.date}
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase">{anomaly.severity}</span>
              </div>
              <p className="mt-2 text-xs font-medium leading-relaxed">{anomaly.detail}</p>
            </div>
          ))}

          {!loading && anomalies.length === 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center text-sm font-semibold text-green-700">
              선택 월 기준으로 감지된 근태 이상 징후가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
