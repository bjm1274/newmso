import { isApprovedLeaveStatus } from './annual-leave-ledger';
import { isKoreanPublicHoliday } from './korean-public-holidays';
import type { LeavePolicySettings } from './leave-policy-settings';

export type AttendanceAnomalySeverity = 'critical' | 'warning' | 'review';

export type AttendanceAnomaly = {
  id: string;
  severity: AttendanceAnomalySeverity;
  type:
    | 'missing_checkout'
    | 'scheduled_absence'
    | 'late'
    | 'early_leave'
    | 'leave_overlap'
    | 'holiday_work';
  date: string;
  staffId: string;
  staffName: string;
  department?: string;
  summary: string;
  detail: string;
};

export type AttendanceAnomalyStaff = {
  id: string;
  name: string;
  department?: string;
  company?: string;
};

export type AttendanceAnomalyAttendance = {
  staff_id: string;
  work_date: string;
  status?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  late_minutes?: number | null;
  early_leave_minutes?: number | null;
};

export type AttendanceAnomalyShift = {
  staff_id: string;
  work_date: string;
  shift_id?: string | null;
};

export type AttendanceAnomalyLeave = {
  staff_id: string;
  start_date: string;
  end_date: string;
  status?: string | null;
  leave_type?: string | null;
};

function toDateOnly(dateValue: string) {
  return String(dateValue || '').slice(0, 10);
}

function enumerateDateRange(startDate: string, endDate: string) {
  const start = new Date(`${toDateOnly(startDate)}T00:00:00`);
  const end = new Date(`${toDateOnly(endDate || startDate)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [] as string[];
  }

  const result: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function isHoliday(dateKey: string, policy: LeavePolicySettings) {
  const weekday = new Date(`${dateKey}T00:00:00`).getDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const isPublicHoliday = policy.respectPublicHolidays && isKoreanPublicHoliday(dateKey);
  return isWeekend || isPublicHoliday;
}

function isPresentStatus(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['정상', 'present', 'late', 'early_leave', '지각', '조퇴'].includes(normalized);
}

export function detectAttendanceAnomalies(params: {
  staffs: AttendanceAnomalyStaff[];
  attendances: AttendanceAnomalyAttendance[];
  shiftAssignments: AttendanceAnomalyShift[];
  approvedLeaves: AttendanceAnomalyLeave[];
  policy: LeavePolicySettings;
}) {
  const { staffs, attendances, shiftAssignments, approvedLeaves, policy } = params;
  const staffMap = new Map(staffs.map((staff) => [String(staff.id), staff]));
  const attendanceMap = new Map(
    attendances.map((row) => [`${row.staff_id}_${toDateOnly(row.work_date)}`, row])
  );
  const shiftMap = new Map(
    shiftAssignments
      .filter((row) => row.shift_id)
      .map((row) => [`${row.staff_id}_${toDateOnly(row.work_date)}`, row])
  );

  const leaveDateKeys = new Set<string>();
  approvedLeaves.forEach((leave) => {
    if (!isApprovedLeaveStatus(leave.status)) return;
    enumerateDateRange(leave.start_date, leave.end_date).forEach((dateKey) => {
      leaveDateKeys.add(`${leave.staff_id}_${dateKey}`);
    });
  });

  const anomalies: AttendanceAnomaly[] = [];
  const seenIds = new Set<string>();

  function pushAnomaly(anomaly: AttendanceAnomaly) {
    if (seenIds.has(anomaly.id)) return;
    seenIds.add(anomaly.id);
    anomalies.push(anomaly);
  }

  shiftMap.forEach((shift, key) => {
    const [staffId, date] = key.split('_');
    const staff = staffMap.get(staffId);
    const attendance = attendanceMap.get(key);
    const onLeave = leaveDateKeys.has(key);

    if (!attendance && !onLeave) {
      pushAnomaly({
        id: `scheduled_absence:${key}`,
        severity: 'critical',
        type: 'scheduled_absence',
        date,
        staffId,
        staffName: staff?.name || '미지정 직원',
        department: staff?.department,
        summary: '배정 근무일인데 출근 기록이 없습니다.',
        detail: `${staff?.name || '직원'} 님은 ${date} 근무표에 배정되어 있지만 출근/휴가 기록이 없습니다.`,
      });
    }

    if (attendance && onLeave) {
      pushAnomaly({
        id: `leave_overlap:${key}`,
        severity: 'warning',
        type: 'leave_overlap',
        date,
        staffId,
        staffName: staff?.name || '미지정 직원',
        department: staff?.department,
        summary: '승인 휴가와 실제 출근 기록이 동시에 존재합니다.',
        detail: `${date} 승인 휴가와 출근 기록이 함께 존재합니다. 승인 취소 또는 근태 정정이 필요한지 확인하세요.`,
      });
    }
  });

  attendances.forEach((attendance) => {
    const date = toDateOnly(attendance.work_date);
    const key = `${attendance.staff_id}_${date}`;
    const staff = staffMap.get(String(attendance.staff_id));
    const lateMinutes = Number(attendance.late_minutes || 0);
    const earlyLeaveMinutes = Number(attendance.early_leave_minutes || 0);

    if (isPresentStatus(attendance.status) && attendance.check_in_time && !attendance.check_out_time) {
      const checkIn = new Date(attendance.check_in_time);
      if (!Number.isNaN(checkIn.getTime())) {
        const hoursSinceCheckIn = (Date.now() - checkIn.getTime()) / (1000 * 60 * 60);
        if (hoursSinceCheckIn >= policy.missingCheckoutGraceHours) {
          pushAnomaly({
            id: `missing_checkout:${key}`,
            severity: 'warning',
            type: 'missing_checkout',
            date,
            staffId: String(attendance.staff_id),
            staffName: staff?.name || '미지정 직원',
            department: staff?.department,
            summary: '출근 기록은 있지만 퇴근 기록이 없습니다.',
            detail: `${staff?.name || '직원'} 님의 ${date} 퇴근 기록이 ${policy.missingCheckoutGraceHours}시간 이상 비어 있습니다.`,
          });
        }
      }
    }

    if (lateMinutes >= policy.lateAnomalyMinutes) {
      pushAnomaly({
        id: `late:${key}`,
        severity: 'warning',
        type: 'late',
        date,
        staffId: String(attendance.staff_id),
        staffName: staff?.name || '미지정 직원',
        department: staff?.department,
        summary: `지각 ${lateMinutes}분`,
        detail: `${staff?.name || '직원'} 님의 지각 시간이 기준 ${policy.lateAnomalyMinutes}분을 넘었습니다.`,
      });
    }

    if (earlyLeaveMinutes >= policy.earlyLeaveAnomalyMinutes) {
      pushAnomaly({
        id: `early_leave:${key}`,
        severity: 'warning',
        type: 'early_leave',
        date,
        staffId: String(attendance.staff_id),
        staffName: staff?.name || '미지정 직원',
        department: staff?.department,
        summary: `조퇴 ${earlyLeaveMinutes}분`,
        detail: `${staff?.name || '직원'} 님의 조퇴 시간이 기준 ${policy.earlyLeaveAnomalyMinutes}분을 넘었습니다.`,
      });
    }

    if (policy.grantCompDayForHolidayWork && isHoliday(date, policy) && attendance.check_in_time) {
      pushAnomaly({
        id: `holiday_work:${key}`,
        severity: 'review',
        type: 'holiday_work',
        date,
        staffId: String(attendance.staff_id),
        staffName: staff?.name || '미지정 직원',
        department: staff?.department,
        summary: '휴일/공휴일 근무가 감지되었습니다.',
        detail: `${date} 근무는 대체휴무 또는 보상휴가 대상인지 확인하세요.`,
      });
    }
  });

  return anomalies.sort((a, b) => {
    const severityOrder: Record<AttendanceAnomalySeverity, number> = {
      critical: 0,
      warning: 1,
      review: 2,
    };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return a.date < b.date ? 1 : -1;
  });
}
