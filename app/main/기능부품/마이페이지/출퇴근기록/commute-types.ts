export interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  weatherLabel: string;
  weatherEmoji: string;
  pm25: number;
  pm10: number;
  pm25Grade: string;
  pm25GradeColor: string;
  pm10Grade: string;
  pm10GradeColor: string;
  aqi: string;
  aqiColor: string;
}

export type ShiftBoundary = {
  hour: number;
  minute: number;
  label: string;
  endHour: number | null;
  endMinute: number | null;
  shiftKnown: boolean;
  /** 근무유형 종류(예: '1일근무1일휴무'). 지각 판정 시 격일제 휴무일 처리에 사용 */
  shiftType?: string | null;
  /** 해당 일자에 근무표(shift_assignments) 배정이 있었는지 */
  rosterAssigned?: boolean;
};

export type CommuteLog = {
  id?: string | number;
  date?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  status?: string | null;
  displayStatus?: string;
  displayEarlyLeaveMinutes?: number | null;
  isVirtual?: boolean;
} & Record<string, unknown>;

export type MonthlyShiftAssignmentRow = {
  work_date?: string | null;
  shift_id?: string | null;
  shift_name?: string | null;
};

export const COMMUTE_STATUS_LABELS: Record<string, string> = {
  present: '정상',
  late: '지각',
  early_leave: '조퇴',
  annual_leave: '연차',
  half_day: '반차',
  half_leave: '반차',
  sick_leave: '병가',
  absent: '결근' };

export const NON_ABSENT_DISPLAY_STATUSES = new Set(['연차', '반차', '병가', '공가', '휴무']);
