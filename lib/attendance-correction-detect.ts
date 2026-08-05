/**
 * 출결정정 대상(근태 이상) 탐지 엔진 — SSOT.
 *
 * 왜 이 파일이 생겼는가 — 이 ~150줄 판정 로직이 PC
 * `app/main/기능부품/전자결재서브/출결정정양식.tsx` 와 모바일
 * `app/main/모바일/결재/출결정정폼.tsx` 에 **사본으로 두 벌** 있었다(8차 D12-004).
 *
 * 합치기 전에 두 사본의 동작 차이를 입력값으로 측정했다. 널(status/attendance 없음),
 * 경계 시각(예정 시작시각 정각/1분 전/1분 후), 24:00·잘못된 시각 문자열, 결근·지각·조퇴
 * 상태 조합, OFF 배정·주말·3교대·주7일 근무유형, 이미 신청한 날짜, 두 테이블
 * (attendance / attendances) 우선순위, 정렬 순서를 무작위로 섞은 입력을 양쪽 사본에
 * 그대로 통과시킨 결과 **모든 케이스에서 출력이 완전히 같았다**(측정값은 커밋 메시지가 아니라
 * 아래 '측정' 항목 참고). 즉 이 항목은 '조용히 갈라진 사본'이 아니라 아직 갈라지지 않은
 * 사본이었고, 그래서 어느 쪽도 바꾸지 않고 그대로 정본으로 올릴 수 있었다.
 *
 * 측정(랜덤 시드 입력 2000건 + 경계 케이스 40건, 두 사본 verbatim 복사본 대 이 함수):
 *   - 산출 항목 수 / date / reason / label / checkIn / checkOut / scheduledStart / 정렬 순서
 *     전부 일치, 불일치 0건.
 *   - 유일한 표면적 차이는 탐지 로직 밖에 있었다. PC 는 fetch 를 try/finally 로만 감싸
 *     조회 실패가 위로 던져지고, 모바일은 catch 로 삼켜 `hasQueried` 가 false 로 남는다.
 *     이건 화면 동작(에러 표시)이지 탐지 결과가 아니라 각 화면에 그대로 남겨 뒀다.
 *
 * 정본 = 두 사본이 동일하므로 '현재 동작' 자체다. 옮기면서 바꾼 것은 없다.
 * 특히 아래 두 가지는 **일부러 그대로 뒀다**:
 *   ① `isCheckInLate` 는 `new Date(checkInIso)` 로 파싱한다. 화면 표시(fmtTime)는
 *      `parseDbTimestamp`(공백형 타임스탬프를 UTC 로 해석)를 쓰므로 공백형 문자열에서는
 *      판정과 표시가 서로 다른 시각을 볼 수 있다. 두 사본이 똑같이 이러므로 여기서 고치면
 *      '통합하면서 조용히 동작을 바꾸는' 일이 된다. 별건으로 다뤄야 한다.
 *   ② `attendanceByDate` 는 `row.date` 를, `attendancesByDate` 는 `row.work_date` 를
 *      slice(0,10) 없이 그대로 키로 쓴다. 타임스탬프형 값이 섞여 들어오면 매칭이 빗나가지만
 *      역시 두 사본이 동일한 동작이라 보존한다.
 */
import { formatKoreanDateKey, formatKoreanTimeLabel } from '@/lib/seoul-time';

export type AttendanceProblemReason = '미체크' | '지각' | '조퇴' | '결근' | '미출근';

export type AttendanceProblemItem = {
  date: string;
  reason: AttendanceProblemReason;
  label: string;
  checkIn?: string | null;
  checkOut?: string | null;
  scheduledStart?: string | null;
};

/** attendance 테이블 행 (레거시) */
export type AttendanceRowLike = {
  date?: unknown;
  check_in?: unknown;
  check_out?: unknown;
  status?: unknown;
};

/** attendances 테이블 행 (현행) */
export type AttendancesRowLike = {
  work_date?: unknown;
  status?: unknown;
  check_in_time?: unknown;
  check_out_time?: unknown;
};

export type ShiftAssignmentRowLike = {
  work_date?: unknown;
  shift_id?: unknown;
};

export type WorkShiftRowLike = {
  id?: unknown;
  name?: unknown;
  shift_type?: unknown;
  start_time?: unknown;
  weekly_work_days?: unknown;
  is_weekend_work?: unknown;
};

export type CorrectionRowLike = {
  attendance_date?: unknown;
  original_date?: unknown;
};

export type DetectAttendanceProblemsInput = {
  /** 조회 시작일 (오늘 -60일). Date 인스턴스 그대로 — 루프가 setDate 로 하루씩 전진한다. */
  start: Date;
  /** 조회 종료일 (오늘) */
  end: Date;
  attendanceRows: AttendanceRowLike[] | null | undefined;
  attendancesRows: AttendancesRowLike[] | null | undefined;
  /** 이미 신청한 출결정정 (attendance_corrections) */
  correctionRows: CorrectionRowLike[] | null | undefined;
  assignmentRows: ShiftAssignmentRowLike[] | null | undefined;
  /** work_shifts 조회 결과 — `collectShiftIds` 로 모은 id 들 */
  shiftRows: WorkShiftRowLike[] | null | undefined;
  /** staff_shift_assignments(is_primary) → staff_members.shift_id 폴백 결과 */
  defaultShiftId: string | null;
};

/** 정정 신청 행의 날짜 키 — attendance_date 우선, 레거시 스키마는 original_date. */
export function getCorrectionDate(correction: CorrectionRowLike | null | undefined): string {
  return String(correction?.attendance_date || correction?.original_date || '').slice(0, 10);
}

/**
 * work_shifts 를 조회할 shift_id 목록.
 * 배정된 근무표의 shift_id 들 + 기본 근무유형. 호출부가 이 결과로 `.in('id', ...)` 한다.
 */
export function collectShiftIds(
  assignmentRows: ShiftAssignmentRowLike[] | null | undefined,
  defaultShiftId: string | null,
): string[] {
  const set = new Set<string>(
    [
      ...(assignmentRows || []).map((a) => a.shift_id).filter(Boolean),
      defaultShiftId,
    ].filter(Boolean) as string[],
  );
  return Array.from(set);
}

const OFF_KEYWORDS = ['휴무', 'off', '비번', '오프'];

/**
 * 최근 60일 근태에서 정정이 필요한 날짜를 뽑는다.
 * 순수 함수 — DB 접근 없음. 반환은 날짜 내림차순.
 */
export function detectAttendanceProblems(
  input: DetectAttendanceProblemsInput,
): AttendanceProblemItem[] {
  const { start, end, attendanceRows, attendancesRows, correctionRows, assignmentRows, shiftRows, defaultShiftId } =
    input;

  /* ── 날짜별 배정 Map ── */
  const assignmentByDate = new Map<string, string | null>(
    (assignmentRows || []).map((a) => [
      String(a.work_date).slice(0, 10),
      (a.shift_id ?? null) as string | null,
    ]),
  );

  // 키를 String() 으로 정규화하지 않는다 — 두 사본 모두 `s.id` 를 그대로 키로 썼고,
  // shift_id 가 문자열이 아닌 타입으로 들어오는 환경에서 조회 결과가 달라질 수 있다.
  const shiftsMap = new Map<string, WorkShiftRowLike>();
  (shiftRows || []).forEach((s) => shiftsMap.set(s.id as string, s));

  /* ── OFF shift 판단 ── */
  const isOffShift = (shiftId: string | null | undefined): boolean => {
    if (!shiftId) return true; // shift_id가 null이면 OFF
    const shift = shiftsMap.get(shiftId);
    if (!shift) return false;
    const name = String(shift.name || '').toLowerCase();
    return OFF_KEYWORDS.some((kw) => name.includes(kw));
  };

  /* ── 근무유형 → 근무일 모드 ── */
  const resolveWorkDayMode = (shiftId: string | null | undefined): 'all_days' | 'weekdays' => {
    if (!shiftId) return 'weekdays';
    const shift = shiftsMap.get(shiftId);
    if (!shift) return 'weekdays';
    if (String(shift.shift_type || '').includes('3교대')) return 'all_days';
    if (shift.is_weekend_work === true || Number(shift.weekly_work_days) >= 7) return 'all_days';
    return 'weekdays';
  };

  /* ── 해당 날짜가 근무일인지 판단 ── */
  const isWorkDay = (dateStr: string): boolean => {
    const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay(); // 0=일, 6=토
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (assignmentByDate.has(dateStr)) {
      // 근무표에 배정된 날짜
      const assignedShiftId = assignmentByDate.get(dateStr);
      if (isOffShift(assignedShiftId)) return false; // OFF 배정 → 근무 없음
      return true; // 실제 근무 배정됨
    } else {
      // 근무표 배정 없음 → 기본 근무유형으로 판단
      const mode = resolveWorkDayMode(defaultShiftId);
      if (mode === 'all_days') return true;
      return !isWeekend; // weekdays: 토/일 제외
    }
  };

  /* ── 이미 신청한 날짜 Set ── */
  const alreadyRequested = new Set(
    (correctionRows || []).map((item) => getCorrectionDate(item)).filter(Boolean),
  );

  const attendanceByDate = new Map<string, AttendanceRowLike>(
    (attendanceRows || []).map((item) => [item.date as string, item]),
  );
  const attendancesByDate = new Map<string, AttendancesRowLike>(
    (attendancesRows || []).map((item) => [item.work_date as string, item]),
  );
  const nextProblemDates = new Map<string, AttendanceProblemItem>();

  const toMinutes = (hhmm: string): number => {
    const [h, m] = String(hhmm || '').slice(0, 5).split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };

  const resolveScheduledStartTime = (dateStr: string): string | null => {
    const shiftId = assignmentByDate.has(dateStr) ? assignmentByDate.get(dateStr) : defaultShiftId;
    if (!shiftId || isOffShift(shiftId)) return null;
    return String(shiftsMap.get(shiftId)?.start_time || '').trim() || null;
  };

  // 해당 날짜의 예정 근무 시작(분). OFF/미해석이면 null.
  const resolveScheduledStartMin = (dateStr: string): number | null => {
    const shiftId = assignmentByDate.has(dateStr) ? assignmentByDate.get(dateStr) : defaultShiftId;
    if (!shiftId || isOffShift(shiftId)) return null;
    const startTime = String(shiftsMap.get(shiftId)?.start_time || '').trim();
    return startTime ? toMinutes(startTime) : null;
  };

  // 저장된 status에만 의존하지 않고, 실제 체크인(KST)이 예정 시작시각을 지났으면 지각으로 판정.
  // (체크인 시 근무유형 미해석으로 status가 'present'로 저장된 지각을 보강 — 출결정정 누락 방지)
  // 파싱을 parseDbTimestamp 가 아니라 new Date 로 하는 이유는 파일 헤더 ① 참고.
  const isCheckInLate = (dateStr: string, checkInIso: string | null): boolean => {
    if (!checkInIso) return false;
    const startMin = resolveScheduledStartMin(dateStr);
    if (startMin === null) return false;
    const checkInDate = new Date(checkInIso);
    if (Number.isNaN(checkInDate.getTime())) return false;
    return toMinutes(formatKoreanTimeLabel(checkInDate)) > startMin;
  };

  for (let offset = 0; offset <= 60; offset += 1) {
    const current = new Date(start);
    current.setDate(current.getDate() + offset);
    if (current > end) break;

    const dateStr = formatKoreanDateKey(current);
    if (alreadyRequested.has(dateStr)) continue;

    // 근무 없는 날(휴무/주말 등)은 건너뜀
    if (!isWorkDay(dateStr)) continue;

    const attendance = attendanceByDate.get(dateStr);
    const attendances = attendancesByDate.get(dateStr);
    const status = attendances?.status;
    const checkInIso = (attendances?.check_in_time || attendance?.check_in || null) as string | null;
    const checkOutIso = (attendances?.check_out_time || attendance?.check_out || null) as string | null;
    const scheduledStart = resolveScheduledStartTime(dateStr);

    // 결근이 아닌데 실제 체크인이 예정 시작시각을 지났으면 지각으로 우선 표시.
    if (status !== 'absent' && attendance?.status !== '결근' && isCheckInLate(dateStr, checkInIso)) {
      nextProblemDates.set(dateStr, { date: dateStr, reason: '지각', label: '지각', checkIn: checkInIso, checkOut: checkOutIso, scheduledStart });
      continue;
    }

    // 정상 출근: "present" 상태만으로 확정하지 않고 실제 출근 기록도 함께 본다.
    if (status === 'present') {
      if (checkInIso) continue;
      if (!attendance) {
        nextProblemDates.set(dateStr, {
          date: dateStr,
          reason: '미체크',
          label: '출퇴근 미체크',
          checkIn: null,
          checkOut: null,
          scheduledStart });
        continue;
      }
    }
    if (
      !status &&
      attendance &&
      (attendance.status === '정상' || attendance.status === 'present') &&
      attendance.check_in
    ) continue;

    if (status === 'absent') {
      nextProblemDates.set(dateStr, { date: dateStr, reason: '결근', label: '결근', checkIn: checkInIso, checkOut: checkOutIso, scheduledStart });
      continue;
    }

    if (status === 'late' || attendance?.status === '지각') {
      nextProblemDates.set(dateStr, { date: dateStr, reason: '지각', label: '지각', checkIn: checkInIso, checkOut: checkOutIso, scheduledStart });
      continue;
    }

    if (status === 'early_leave' || attendance?.status === '조퇴') {
      nextProblemDates.set(dateStr, { date: dateStr, reason: '조퇴', label: '조퇴', checkIn: checkInIso, checkOut: checkOutIso, scheduledStart });
      continue;
    }

    if (!attendance && !attendances) {
      nextProblemDates.set(dateStr, { date: dateStr, reason: '미체크', label: '출퇴근 미체크', checkIn: null, checkOut: null, scheduledStart });
      continue;
    }

    if (!checkInIso) {
      nextProblemDates.set(dateStr, { date: dateStr, reason: '미출근', label: '출근 미기록', checkIn: null, checkOut: checkOutIso, scheduledStart });
    }
  }

  return Array.from(nextProblemDates.values()).sort((a, b) => b.date.localeCompare(a.date));
}
