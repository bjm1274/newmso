export type ShiftRole = 'D' | 'E' | 'N' | 'OFF' | 'LEAVE' | 'TRAINING';
export type ScheduleMap = Record<string, Record<number, ShiftRole>>;

export interface AutoScheduleParams {
  yearMonth: string; // 'YYYY-MM'
  staffIds: string[];
  daysInMonth: number;
  minStaff: { D: number; E: number; N: number };
  existingSchedule?: ScheduleMap; // 수동으로 미리 채워둔 고정 스케줄 (예: 휴가 등)
}

/**
 * 휴리스틱 기반 근무표 자동 편성 알고리즘
 */
export function generateAutoSchedule(params: AutoScheduleParams): ScheduleMap {
  const { staffIds, daysInMonth, minStaff, existingSchedule } = params;
  const newSchedule: ScheduleMap = {};

  // 초기화 및 고정 스케줄 복사
  for (const sid of staffIds) {
    newSchedule[sid] = {};
    for (let d = 1; d <= daysInMonth; d++) {
      if (existingSchedule?.[sid]?.[d]) {
        newSchedule[sid][d] = existingSchedule[sid][d];
      }
    }
  }

  // 1. 필요한 근무조 역할 (D, E, N)
  const shiftTypes: ('D' | 'E' | 'N')[] = ['D', 'E', 'N'];
  
  for (let d = 1; d <= daysInMonth; d++) {
    // 1-1. 이미 배정된 인원 파악 (고정 휴가, 미리 배정된 사람 등)
    const currentCounts = { D: 0, E: 0, N: 0, OFF: 0, LEAVE: 0, TRAINING: 0 };
    const availableStaff = [];

    for (const sid of staffIds) {
      const existing = newSchedule[sid][d];
      if (existing) {
        currentCounts[existing]++;
      } else {
        // 전날이 Night면 오늘은 무조건 OFF (또는 이미 휴가면 위에서 걸러짐)
        const prev1 = d > 1 ? newSchedule[sid][d - 1] : 'OFF';
        const prev2 = d > 2 ? newSchedule[sid][d - 2] : 'OFF';
        const prev3 = d > 3 ? newSchedule[sid][d - 3] : 'OFF';
        
        if (prev1 === 'N') {
          newSchedule[sid][d] = 'OFF';
          currentCounts['OFF']++;
        } else if (prev1 === 'N' && prev2 === 'N' && prev3 === 'N') {
          // 최대 연속 나이트는 3일까지만 허용 (방어 코드)
          newSchedule[sid][d] = 'OFF';
          currentCounts['OFF']++;
        } else {
          availableStaff.push(sid);
        }
      }
    }

    // 1-2. 각 듀티(D, E, N)별로 부족한 인원만큼 배정
    // 단순 휴리스틱: 셔플 후 순서대로 배정하여 균등한 랜덤 분배
    availableStaff.sort(() => Math.random() - 0.5);

    for (const shift of shiftTypes) {
      const needed = Math.max(0, minStaff[shift] - currentCounts[shift]);
      for (let i = 0; i < needed; i++) {
        const sid = availableStaff.pop();
        if (sid) {
          newSchedule[sid][d] = shift;
        }
      }
    }

    // 1-3. 남은 인원들은 기본적으로 'OFF' 처리 또는 추가 배정
    while (availableStaff.length > 0) {
      const sid = availableStaff.pop();
      if (sid) {
        const currentOffs = Object.values(newSchedule[sid]).filter(v => v === 'OFF').length;
        if (currentOffs < 8) {
          newSchedule[sid][d] = 'OFF';
        } else {
          const extraShift = shiftTypes[Math.floor(Math.random() * shiftTypes.length)];
          newSchedule[sid][d] = extraShift;
        }
      }
    }
  }

  return newSchedule;
}
